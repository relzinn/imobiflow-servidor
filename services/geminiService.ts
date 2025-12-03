import { Contact, AppSettings } from "../types";

// Agora o serviço é apenas um "carteiro" que pede para o servidor gerar a mensagem.
// A chave API fica segura no servidor.
export const generateFollowUpMessage = async (
  contact: Contact,
  settings: AppSettings,
  isNudge: boolean = false
): Promise<string> => {
  
  const serverUrl = settings.serverUrl || 'http://localhost:3001';
  
  try {
      const response = await fetch(`${serverUrl}/generate-message`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'ngrok-skip-browser-warning': 'true'
          },
          body: JSON.stringify({
              contact,
              settings, // Passa as configurações de tom e nome
              isNudge
          })
      });

      if (!response.ok) {
          throw new Error("Falha ao gerar mensagem no servidor");
      }

      const data = await response.json();
      return data.message;

  } catch (error) {
      console.error("Erro ao solicitar IA do servidor:", error);
      // Fallback local simples caso servidor não responda
      return `Olá ${contact.name}, aqui é ${settings.agentName}. Gostaria de retomar nosso contato. Podemos falar?`;
  }
};