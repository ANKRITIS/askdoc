import { db } from "@/lib/db";
import { pinecone } from "@/lib/pinecone";
import { auth } from "@clerk/nextjs/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

export const POST = async (req: NextRequest) => {
  try {
    // 1. Validate User
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { fileId, message } = await req.json();

    if (!message || !fileId) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    const file = await db.file.findFirst({
      where: {
        id: fileId,
        userId,
      },
    });

    if (!file) return new NextResponse("File not found", { status: 404 });

    console.log("📨 Received message:", message);

    // 2. Save User Message to Database
    await db.message.create({
      data: {
        text: message,
        isUserMessage: true,
        userId,
        fileId,
      },
    });

    // 3. Create Embedding for the User's Question
    console.log("🔍 Creating embedding for query...");
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    
    // IMPORTANT: Use the same model as in your upload processing
    const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
    
    const embeddingResult = await embeddingModel.embedContent(message);
    const queryVector = embeddingResult.embedding.values;
    
    console.log("✅ Query embedding created");

    // 4. Search Pinecone for relevant PDF chunks
    console.log("🔎 Searching Pinecone...");
    const index = pinecone.Index("studdy-buddy");
    
    const searchResults = await index.namespace(fileId).query({
      vector: queryVector,
      topK: 5, // Get top 5 most relevant chunks
      includeMetadata: true,
    });

    console.log(`📚 Found ${searchResults.matches.length} relevant chunks`);

    // 5. Build the Context for the AI
    const contextChunks = searchResults.matches
      .filter((match) => match.metadata?.text) // Filter out any undefined
      .map((match, i) => `[Chunk ${i + 1}]:\n${match.metadata?.text}`)
      .join("\n\n---\n\n");

    if (!contextChunks) {
      console.log("⚠️ No context found in Pinecone");
    }

    const prompt = `You are a helpful AI assistant analyzing a PDF document. Use the following excerpts from the document to answer the user's question accurately and concisely.

If the information is not in the provided context, say "I couldn't find that information in the document."

DOCUMENT EXCERPTS:
${contextChunks || "No relevant content found."}

USER QUESTION: ${message}

ANSWER:`;

    // 6. Generate the Answer
    console.log("🤖 Generating AI response...");
    const chatModel = genAI.getGenerativeModel({ 
      model: process.env.GEMINI_MODEL || "gemini-1.5-flash"
    });
    
    const result = await chatModel.generateContent(prompt);
    const aiResponse = result.response.text();
    
    console.log("✅ AI response generated");

    // 7. Save AI Response to Database
    await db.message.create({
      data: {
        text: aiResponse,
        isUserMessage: false,
        userId,
        fileId,
      },
    });

    return NextResponse.json({ message: aiResponse });

  } catch (error: any) {
    console.error("❌ Error in message API:", error);
    return new NextResponse(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};