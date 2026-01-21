import { GoogleGenAI } from "@google/genai";
import { Contact, AppSettings } from "../types";

export const generateFollowUpMessage = async (
  contact: Contact,
  settings: AppSettings,
  isNudge: boolean = false
): Promise<string> => {
  // Verificação de segurança adicional
  if (!settings) {
    return `Olá ${contact.name}, gostaria de retomar nosso contato. Podemos falar?`;
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemInstruction = `
    Você é um corretor de imóveis sênior e atencioso chamado ${settings.agentName} da imobiliária ${settings.agencyName}.
    Seu objetivo é escrever mensagens curtas, envolventes e profissionais para o WhatsApp.
    O tom de voz deve ser ${contact.messageTone || settings.messageTone}.
    
    Diretrizes Importantes:
    - Nunca use placeholders genéricos como "[NOME DO CLIENTE]". Use os dados reais fornecidos.
    - Se "isNudge" for verdadeiro, a mensagem deve ser um reengajamento gentil para obter uma resposta pendente.
    - Não inclua explicações ou aspas, retorne apenas o texto da mensagem.
  `;

  const prompt = `
    Gere uma mensagem de acompanhamento para o seguinte contato:
    Nome: ${contact.name}
    Tipo: ${contact.type}
    Notas/Preferências: ${contact.notes}
    ${contact.propertyType ? `Interesse no imóvel: ${contact.propertyType}` : ''}
    ${contact.propertyAddress ? `Localização: ${contact.propertyAddress}` : ''}
    ${contact.propertyValue ? `Valor Pretendido: ${contact.propertyValue}` : ''}
    ${contact.exchangeDescription ? `Possui permuta: ${contact.exchangeDescription} (Avaliada em: ${contact.exchangeValue})` : ''}
    
    Tipo de Follow-up: ${isNudge ? 'Cobrança de resposta amigável' : 'Acompanhamento periódico planejado'}.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
      },
    });

    const generatedText = response.text;
    if (generatedText) {
      return generatedText.trim();
    }
    
    throw new Error("Resposta da IA está vazia");

  } catch (error) {
    console.error("Erro na geração Gemini:", error);
    return `Olá ${contact.name}, tudo bem? Aqui é ${settings.agentName}. Estou passando para ver se você conseguiu analisar o que conversamos e se tem alguma dúvida. Aguardo seu retorno!`;
  }
};