import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { pinecone } from "@/lib/pinecone";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { text } from "stream/consumers";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { fileId, fileUrl } = await req.json();
  console.log("--- PROCESSING PDF:", fileId, "---");

  try {
    console.log("--- DOWNLOADING PDF ---");
    const response = await fetch(fileUrl);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log("--- LOADING PDF TEXT ---");
    const loader = new PDFLoader(new Blob([buffer]));
    const pageLevelDocs = await loader.load();
    console.log("Pages found:", pageLevelDocs.length);

    console.log("--- SPLITTING TEXT ---");
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const chunkedDocs = await textSplitter.splitDocuments(pageLevelDocs);
    console.log("Chunks created:", chunkedDocs.length);

    console.log("--- GENERATING EMBEDDINGS ---");
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const aiModel = genAI.getGenerativeModel({ model: "models/text-embedding-004" });

    const embeddings = await Promise.all(
      chunkedDocs.map(async (doc, i) => {
        const result = await aiModel.embedContent(doc.pageContent);
        return {
          id: `${fileId}-${i}`,
          values: result.embedding.values,
          metadata: { text: doc.pageContent, fileId },
        };
      })
    );
    console.log("Embeddings generated:", embeddings.length);

    console.log("--- UPLOADING TO PINECONE ---");
    const index = pinecone.Index(process.env.PINECONE_INDEX!);
    const batchSize = 100;
    for (let i = 0; i < embeddings.length; i += batchSize) {
      await index.namespace(fileId).upsert(embeddings.slice(i, i + batchSize));
    }

    console.log("--- SUCCESS ---");
    await db.file.update({
      data: { uploadStatus: "SUCCESS" },
      where: { id: fileId },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("--- PROCESSING ERROR ---", err);
    await db.file.update({
      data: { uploadStatus: "FAILED" },
      where: { id: fileId },
    });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}