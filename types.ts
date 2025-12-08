
export enum ContactType {
  OWNER = 'Proprietário',
  BUILDER = 'Construtor',
  CLIENT = 'Cliente/Comprador'
}

export enum AutomationStage {
  IDLE = 0,
  WAITING_REPLY_1 = 1,
  WAITING_REPLY_2 = 2,
  NO_RESPONSE_ALERT = 3
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  type: ContactType;
  lastContactDate: string;
  notes: string;
  followUpFrequencyDays: number;
  messageTone?: string; // Tom de voz específico para este contato
  
  // Automação e Sync
  autoPilotEnabled?: boolean;
  automationStage: AutomationStage;
  lastAutomatedMsgDate?: string;
  lastReplyContent?: string;
  lastReplyTimestamp?: number;
  hasUnreadReply?: boolean;
}

export interface ChatMessage {
    id: string;
    fromMe: boolean;
    body: string;
    timestamp: number;
}

export interface AppSettings {
  agentName: string;
  agencyName: string;
  password?: string; // Senha de acesso ao sistema
  messageTone: 'Formal' | 'Casual' | 'Persuasivo' | 'Amigável' | 'Consultivo' | 'Urgente' | 'Entusiasta' | 'Elegante';
  defaultFrequencyOwner: number;
  defaultFrequencyBuilder: number;
  defaultFrequencyClient: number;
  integrationMode: 'server';
  serverUrl?: string;
  preferredWhatsappMode: 'app';
  whatsappConnected: boolean;
  
  // Controle Servidor
  automationActive: boolean;
}
