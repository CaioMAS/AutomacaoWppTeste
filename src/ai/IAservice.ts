// geminiService.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// 🔹 Função base: recebe um prompt e retorna o texto gerado
export async function gerarMensagemGemini(prompt: string): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    return text.trim();
  } catch (error: any) {
    console.error("Erro ao gerar mensagem Gemini:", error.message);
    throw new Error("Falha ao gerar mensagem com Gemini");
  }
}
