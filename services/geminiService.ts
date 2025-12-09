import { Contact, AppSettings } from "../types";

// Agora o serviço é apenas um "carteiro" que pede para o servidor gerar a mensagem.
// A chave API fica segura no servidor.
export const generateFollowUpMessage = async (
  contact: Contact,
  settings: AppSettings,
  isNudge: boolean = false
): Promise<string> => {
  
  const serverUrl = settings.serverUrl || 'http://localhost:3001';
  // Recupera o token salvo no navegador para autenticar a requisição
  const token = localStorage.getItem('imobiflow_auth') || '';
  
  try {
      const response = await fetch(`${serverUrl}/generate-message`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'ngrok-skip-browser-warning': 'true',
              'x-access-token': token // ENVIA A SENHA PARA O SERVIDOR
          },
          body: JSON.stringify({
              contact,
              settings, // Passa as configurações de tom e nome
              isNudge
          })
      });

      if (response.status === 401) {
          throw new Error("Erro de Autenticação: Senha incorreta ou sessão expirada.");
      }

      if (!response.ok) {
          throw new Error("Falha ao gerar mensagem no servidor");
      }

      const data = await response.json();
      return data.message;

  } catch (error) {
      console.error("Erro ao solicitar IA do servidor:", error);
      // Fallback local simples caso servidor não responda ou erro de auth
      return `Olá ${contact.name}, aqui é ${settings.agentName}. Gostaria de retomar nosso contato. Podemos falar?`;
  }
};