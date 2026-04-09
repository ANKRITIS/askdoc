import { createUploadthing, type FileRouter } from "uploadthing/next";
import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { pinecone } from "@/lib/pinecone";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const f = createUploadthing();

export const ourFileRouter = {
  freePlanUploader: f({ pdf: { maxFileSize: "4MB" } })
    .middleware(async () => {
      const { userId } = await auth();
      if (!userId) throw new Error("Unauthorized");
      return { userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("--- 1. UPLOAD COMPLETE, STARTING PROCESSING ---");
      console.log("File URL:", file.url);

      const createdFile = await db.file.create({
        data: {
          key: file.key,
          name: file.name,
          userId: metadata.userId,
          url: file.url,
          uploadStatus: "PROCESSING",
        },
      });
      console.log("--- 2. SAVED TO DB ---");

      try {
        console.log("--- 3. DOWNLOADING PDF ---");
        const response = await fetch(file.url);
        const blob = await response.blob();
        console.log("Blob size:", blob.size);

        console.log("--- 4. LOADING PDF TEXT ---");
        // Create a temporary buffer from blob for PDFLoader
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Save to temp file or use buffer directly
        const loader = new PDFLoader(new Blob([buffer]));
        const pageLevelDocs = await loader.load();
        console.log("Pages found:", pageLevelDocs.length);

        console.log("--- 5. SPLITTING TEXT ---");
        const textSplitter = new RecursiveCharacterTextSplitter({
          chunkSize: 1000,
          chunkOverlap: 200,
        });
        const chunkedDocs = await textSplitter.splitDocuments(pageLevelDocs);
        console.log("Chunks created:", chunkedDocs.length);

        console.log("--- 6. GENERATING EMBEDDINGS (GOOGLE) ---");
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
        
        // ✅ FIXED: Use the correct Gemini embedding model
        const aiModel = genAI.getGenerativeModel({ 
          model: "text-embedding-004"  // Correct Gemini embedding model
        });
        
        const embeddings = await Promise.all(
          chunkedDocs.map(async (doc, i) => {
            if (i < 3) console.log(`Embedding chunk ${i}...`);
            
            // ✅ FIXED: Correct way to generate embeddings - just pass the text string
            const result = await aiModel.embedContent(doc.pageContent);
            const vector = result.embedding.values;
            
            return {
              id: `${createdFile.id}-${i}`,  // Better ID generation
              values: vector,
              metadata: {
                text: doc.pageContent,
                fileId: createdFile.id,
              },
            };
          })
        );
        console.log("Embeddings generated:", embeddings.length);

        console.log("--- 7. UPLOADING TO PINECONE ---");
        const index = pinecone.Index("studdy-buddy");
        
        // Upload in batches to avoid rate limits
        const batchSize = 100;
        for (let i = 0; i < embeddings.length; i += batchSize) {
          const batch = embeddings.slice(i, i + batchSize);
          await index.namespace(createdFile.id).upsert(batch);
          console.log(`Uploaded batch ${i / batchSize + 1}`);
        }
        
        console.log("--- 8. SUCCESS! ---");
        await db.file.update({
          data: { uploadStatus: "SUCCESS" },
          where: { id: createdFile.id },
        });

      } catch (err: any) {
        console.error("!!!!! PROCESSING ERROR !!!!!");
        console.error(err);
        console.error("Error stack:", err.stack);
        
        await db.file.update({
          data: { uploadStatus: "FAILED" },
          where: { id: createdFile.id },
        });
        
        // Re-throw to see the error in logs
        throw err;
      }
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;