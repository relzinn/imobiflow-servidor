
import { GoogleGenAI } from "@google/genai";
import { Contact, AppSettings, ContactType } from "../types";

// Agora instanciamos a IA dinamicamente com a chave fornecida pelo usuário
// Isso resolve o problema de falta de process.env e evita erros se a chave mudar/for revogada

export const generateFollowUpMessage = async (
  contact: Contact,
  settings: AppSettings,
  isNudge: boolean = false
): Promise<string> => {
  const modelId = "gemini-2.5-flash"; 
  
  // Verificação de Segurança
  if (!settings.apiKey) {
      console.error("API Key não encontrada nas configurações.");
      return "Erro: Chave API do Google não configurada. Vá em Reconfigurar Sistema.";
  }

  const ai = new GoogleGenAI({ apiKey: settings.apiKey });

  let objective = "";

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
