
export enum ContactType {
  OWNER = 'Proprietário',
  BUILDER = 'Construtor',
  CLIENT = 'Cliente/Comprador'
}

export enum FollowUpStatus {
  PENDING = 'Pendente',
  DONE = 'Feito',
  LATER = 'Adiado'
}

export enum AutomationStage {
  IDLE = 0,             // Nada acontecendo, aguardando ciclo normal
  WAITING_REPLY_1 = 1,  // 1ª msg enviada, esperando resposta (janela de 24h)
  WAITING_REPLY_2 = 2,  // 2ª msg (cobrança) enviada, esperando resposta
  NO_RESPONSE_ALERT = 3 // Falha: cliente não respondeu as duas tentativas
}

export interface Contact {
  id: string;
  name: string;
  phone: string; // Format: 5511999999999
  type: ContactType;
  lastContactDate: string; // ISO Date (Data da última interação REAL)
  notes: string;
  followUpFrequencyDays: number;
  
  // Automation Fields
  autoPilotEnabled?: boolean; // Novo: Permite pausar automação deste contato específico
  automationStage: AutomationStage;
  lastAutomatedMsgDate?: string; // Data do envio automático (para contar as 24h)
  lastReplyContent?: string; // Novo: Guarda o texto da última resposta do cliente
  lastReplyTimestamp?: number; // Novo: Controle preciso de tempo para evitar conflitos
  hasUnreadReply?: boolean; // Novo: Indica se a resposta ainda não foi vista/tratada pelo usuário
}

export interface AppSettings {
  agentName: string;
  messageTone: 'Formal' | 'Casual' | 'Persuasivo' | 'Amigável';
  defaultFrequencyOwner: number;
  defaultFrequencyBuilder: number;
  defaultFrequencyClient: number;
  
  // Integration Settings
  integrationMode: 'browser' | 'server'; 
  serverUrl?: string; 
  
  preferredWhatsappMode: 'web' | 'app';
  whatsappConnected: boolean;
}

export interface GeneratedMessage {
  text: string;
  contactId: string;
}
