
import { GoogleGenAI } from "@google/genai";
import { Contact, AppSettings, ContactType } from "../types";

// Note: In a real production app, you might proxy this through a backend.
// For this demo, we assume the API KEY is available in the environment.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateFollowUpMessage = async (
  contact: Contact,
  settings: AppSettings,
  isNudge: boolean = false // Novo parâmetro: é uma cobrança?
): Promise<string> => {
  const modelId = "gemini-2.5-flash"; 

  let promptContext = "";
  let objective = "";

  // Definição de contexto baseada no tipo
  switch (contact.type) {
    case ContactType.OWNER:
      promptContext = "Este contato é um PROPRIETÁRIO de um imóvel.";
      break;
    case ContactType.BUILDER:
      promptContext = "Este contato é um CONSTRUTOR.";
      break;
    case ContactType.CLIENT:
      promptContext = "Este contato é um CLIENTE COMPRADOR.";
      break;
  }

  // Definição do objetivo baseada se é primeira msg ou cobrança
  if (isNudge) {
    objective = `
      OBJETIVO CRÍTICO: Você enviou uma mensagem ontem e não teve resposta.
      Mande uma mensagem MUITO CURTA (máximo 1 frase) apenas perguntando se ele viu a mensagem anterior.
      Não seja chato, seja prestativo. Ex: "Oi [Nome], conseguiu ver minha msg acima?"
    `;
  } else {
    objective = `
      OBJETIVO: Retomar contato de rotina.
      Contexto: ${contact.notes}.
      Objetivo específico: Saber se ainda há interesse ou novidades.
    `;
  }

  const prompt = `
    Atue como um Corretor de Imóveis chamado ${settings.agentName}.
    Escreva uma mensagem para WhatsApp.
    
    Destinatário: ${contact.name}
    Tipo: ${contact.type}
    
    ${objective}
    
    Tom de voz: ${settings.messageTone}
    
    Instruções:
    - Não use hashtags.
    - Se for cobrança (follow-up de 1 dia), seja extremamente breve.
    - Se for contato normal, máx 3 frases e termine com pergunta.
    - Apenas retorne o texto da mensagem.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
    });
    return response.text.trim();
  } catch (error) {
    console.error("Error generating message:", error);
    if (isNudge) return `Oi ${contact.name}, conseguiu ver minha mensagem anterior?`;
    return `Olá ${contact.name}, aqui é ${settings.agentName}. Tudo bem? Gostaria de retomar nosso papo sobre ${contact.notes}.`;
  }
};
