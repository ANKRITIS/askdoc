import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export const geminiModel = genAI.getGenerativeModel({ 
  model: 'gemini-pro' 
})

export const geminiEmbedding = genAI.getGenerativeModel({ 
  model: 'text-embedding-004' 
})

export async function getEmbedding(text: string) {
  const result = await geminiEmbedding.embedContent(text)
  return result.embedding.values
}

export async function chatWithGemini(prompt: string, context: string) {
  const fullPrompt = `Context from document: ${context}\n\nUser question: ${prompt}\n\nAnswer based on the context provided. If the answer is not in the context, say so.`
  
  const result = await geminiModel.generateContent(fullPrompt)
  const response = await result.response
  return response.text()
}