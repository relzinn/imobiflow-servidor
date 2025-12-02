
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
  
  // Automação e Sync
  autoPilotEnabled?: boolean;
  automationStage: AutomationStage;
  lastAutomatedMsgDate?: string;
  lastReplyContent?: string;
  lastReplyTimestamp?: number;
  hasUnreadReply?: boolean;
}

export interface AppSettings {
  agentName: string;
  agencyName: string; // Novo campo
  apiKey?: string;
  messageTone: 'Formal' | 'Casual' | 'Persuasivo' | 'Amigável' | 'Consultivo' | 'Urgente' | 'Entusiasta' | 'Elegante';
  defaultFrequencyOwner: number;
  defaultFrequencyBuilder: number;
  defaultFrequencyClient: number;
  integrationMode: 'browser' | 'server';
  serverUrl?: string;
  preferredWhatsappMode: 'web' | 'app';
  whatsappConnected: boolean;
}
