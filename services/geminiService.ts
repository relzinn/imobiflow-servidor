
import { GoogleGenAI } from "@google/genai";
import { Contact, AppSettings, ContactType } from "../types";

// Serviço Híbrido: Usa IA se tiver chave, ou Templates se não tiver.
export const generateFollowUpMessage = async (
  contact: Contact,
  settings: AppSettings,
  isNudge: boolean = false
): Promise<string> => {
  const agentName = settings.agentName || "Seu Corretor";
  const agencyName = settings.agencyName || "nossa imobiliária";
  
  // --- MODO OFFLINE (TEMPLATES) ---
  // IMPORTANTE: No modo offline (sem IA), NÃO inserimos as 'notes' diretamente para evitar vazamento de dados sensíveis.
  // Usamos frases genéricas porém profissionais.
  if (!settings.apiKey || settings.apiKey.trim() === "") {
      if (isNudge) {
          return `Oi ${contact.name}, tudo bem? Sou eu, ${agentName}. Chegou a ver minha mensagem anterior?`;
      }

      switch (contact.type) {
          case ContactType.OWNER:
              return `Olá ${contact.name}, aqui é ${agentName} da ${agencyName}. Como estão as coisas? Gostaria de saber se o imóvel ainda está disponível para venda ou se houve alguma mudança. Abraço!`;
          case ContactType.BUILDER:
              return `Olá ${contact.name}, aqui é ${agentName} da ${agencyName}. Tudo bem? Estou atualizando nossa carteira de áreas e lembrei de você. Ainda está buscando novos terrenos na região?`;
          case ContactType.CLIENT:
          default:
              return `Olá ${contact.name}, aqui é ${agentName} da ${agencyName}. Tudo bem? Passando para saber se continua na busca pelo seu imóvel ou se podemos retomar a pesquisa com novas opções.`;
      }
  }

  // --- MODO ONLINE (IA GEMINI) ---
  try {
    const ai = new GoogleGenAI({ apiKey: settings.apiKey });
    const modelId = "gemini-2.5-flash"; 

    // Instrução de Segurança Crítica: Notas são contexto interno.
    const internalNotes = contact.notes ? `CONTEXTO INTERNO (SIGILOSO - USE APENAS PARA ENTENDER O INTERESSE, NÃO COPIE ESTE TEXTO): "${contact.notes}"` : "Sem notas adicionais.";

    let objective = "";
    if (isNudge) {
      objective = `
        OBJETIVO: Cobrança suave de resposta.
        Contexto: Mandei mensagem ontem e não responderam.
        Ação: Perguntar educadamente se viram a msg. Curto.
      `;
    } else {
      objective = `
        OBJETIVO: Retomar contato (Follow-up) de forma personalizada.
        Perfil do Contato: ${contact.type}.
        ${internalNotes}
        
        INSTRUÇÃO CRÍTICA: Baseado no contexto interno acima, crie uma mensagem perguntando se o cliente ainda tem interesse naquele tipo de imóvel ou situação específica. 
        NÃO repita as notas internas literalmente (ex: não diga 'vi que você achou caro'). Em vez disso, diga 'vi que buscava algo com melhor custo-benefício' ou similar. Interprete a nota.
      `;
    }

    const prompt = `
      Aja como ${agentName}, corretor da imobiliária ${agencyName}.
      Escreva uma mensagem de WhatsApp para ${contact.name}.
      
      ${objective}
      
      Tom de Voz: ${settings.messageTone || 'Casual'}.
      Regras: Sem hashtags. Curto e direto. Pareça humano. Use português do Brasil natural.
    `;

    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
    });
    
    return response.text.trim();
  } catch (error) {
    console.error("Erro na IA, usando template de emergência:", error);
    // Fallback seguro
    return `Olá ${contact.name}, aqui é ${agentName} da ${agencyName}. Gostaria de retomar nosso contato sobre seu interesse em imóveis. Podemos falar?`;
  }
};
