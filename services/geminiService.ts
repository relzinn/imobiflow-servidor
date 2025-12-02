
import { GoogleGenAI } from "@google/genai";
import { Contact, AppSettings, ContactType } from "../types";

// Serviço Híbrido: Usa IA se tiver chave, ou Templates se não tiver.
export const generateFollowUpMessage = async (
  contact: Contact,
  settings: AppSettings,
  isNudge: boolean = false
): Promise<string> => {
  const agentName = settings.agentName || "Seu Corretor";
  
  // --- MODO OFFLINE (TEMPLATES) ---
  // Se não houver API Key configurada, usamos modelos pré-definidos seguros.
  if (!settings.apiKey || settings.apiKey.trim() === "") {
      if (isNudge) {
          return `Oi ${contact.name}, tudo bem? Conseguiu ver minha mensagem anterior?`;
      }

      switch (contact.type) {
          case ContactType.OWNER:
              return `Olá ${contact.name}, aqui é ${agentName}. Como estão as coisas? Gostaria de saber se o imóvel ainda está disponível ou se houve alguma mudança nos planos. Abraço!`;
          case ContactType.BUILDER:
              return `Olá ${contact.name}, aqui é ${agentName}. Tudo bem? Surgiram novas oportunidades de terreno na região e lembrei de você. Ainda está buscando novas áreas?`;
          case ContactType.CLIENT:
          default:
              return `Olá ${contact.name}, aqui é ${agentName}. Tudo bem? Passando para saber se continua na busca por ${contact.notes || "imóveis"} ou se podemos retomar a pesquisa.`;
      }
  }

  // --- MODO ONLINE (IA GEMINI) ---
  try {
    const ai = new GoogleGenAI({ apiKey: settings.apiKey });
    const modelId = "gemini-2.5-flash"; 

    let objective = "";
    if (isNudge) {
      objective = `
        OBJETIVO: Cobrança suave de resposta.
        Contexto: Mandei mensagem ontem e não responderam.
        Ação: Perguntar educadamente se viram a msg. Máximo 1 frase.
      `;
    } else {
      objective = `
        OBJETIVO: Retomar contato (Follow-up).
        Perfil do Contato: ${contact.type}.
        Nota sobre o contato: "${contact.notes}".
        Ação: Verificar interesse e reaquecer a negociação.
      `;
    }

    const prompt = `
      Aja como ${agentName}, um corretor de imóveis.
      Escreva uma mensagem de WhatsApp para ${contact.name}.
      
      ${objective}
      
      Tom: ${settings.messageTone || 'Casual'}.
      Regras: Sem hashtags. Curto e direto. Pareça humano, não robô.
    `;

    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
    });
    
    return response.text.trim();
  } catch (error) {
    console.error("Erro na IA, usando template de emergência:", error);
    // Fallback de emergência caso a IA falhe mesmo com chave
    return `Olá ${contact.name}, aqui é ${agentName}. Gostaria de retomar nosso contato sobre ${contact.notes || "seu interesse em imóveis"}. Podemos falar?`;
  }
};
