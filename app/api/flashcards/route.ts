import { db } from "@/lib/db";
import { pinecone } from "@/lib/pinecone";
import { auth } from "@clerk/nextjs/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { fileId } = await req.json();

    // Get file
    const file = await db.file.findFirst({
      where: { id: fileId, userId },
    });

    if (!file) return new NextResponse("File not found", { status: 404 });

    console.log("🎴 Generating flashcards for file:", file.name);

    // Get all chunks from Pinecone for this file
    const index = pinecone.Index("studdy-buddy");
    
    // Query with a dummy vector to get all chunks
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
    
    const dummyEmbedding = await embeddingModel.embedContent("sample");
    const dummyVector = dummyEmbedding.embedding.values;

    const results = await index.namespace(fileId).query({
      vector: dummyVector,
      topK: 100, // Get many chunks
      includeMetadata: true,
    });

    // Combine all text
    const fullText = results.matches
      .map((match) => match.metadata?.text)
      .filter(Boolean)
      .join("\n\n");

    // Generate flashcards using AI
    const chatModel = genAI.getGenerativeModel({ 
      model: process.env.GEMINI_MODEL || "gemini-1.5-flash" 
    });

    const prompt = `You are a helpful tutor creating study flashcards from document content.

Generate 10-15 high-quality flashcards from the following content. Each flashcard should:
- Have a clear, concise question on the front
- Have a detailed, accurate answer on the back
- Focus on key concepts, definitions, and important facts
- Be suitable for exam preparation

Return ONLY a JSON array in this exact format:
[
  {
    "front": "What is X?",
    "back": "X is..."
  },
  {
    "front": "Explain Y",
    "back": "Y refers to..."
  }
]

CONTENT:
${fullText.substring(0, 10000)} 

JSON FLASHCARDS:`;

    const result = await chatModel.generateContent(prompt);
    let response = result.response.text();

    // Clean up response - remove markdown code blocks if present
    response = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    const flashcards = JSON.parse(response);

    console.log(`✅ Generated ${flashcards.length} flashcards`);

    return NextResponse.json({ flashcards });

  } catch (error: any) {
    console.error("❌ Error generating flashcards:", error);
    return new NextResponse(
      JSON.stringify({ error: error.message || "Failed to generate flashcards" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}