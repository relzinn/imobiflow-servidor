
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { StrategyWizard } from './components/StrategyWizard';
import { ContactModal } from './components/ContactModal';
import { QRCodeModal } from './components/QRCodeModal';
import { Icons } from './constants';
import { AppSettings, Contact, ContactType, AutomationStage } from './types';
import { generateFollowUpMessage } from './services/geminiService';

// Helper seguro para ID
const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// Mock data for initial state if empty
const MOCK_CONTACTS: Contact[] = [
  {
    id: '1',
    name: 'Roberto Construtor',
    phone: '5511999999999',
    type: ContactType.BUILDER,
    lastContactDate: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    notes: 'Procurando terreno Zona Sul acima de 500m2',
    followUpFrequencyDays: 30,
    automationStage: AutomationStage.IDLE,
    autoPilotEnabled: true,
    lastReplyTimestamp: 0
  }
];

const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQRCodeOpen, setIsQRCodeOpen] = useState(false);
  const [isInboxOpen, setIsInboxOpen] = useState(false); // New Inbox Modal State
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  
  // Custom Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
      isOpen: boolean;
      message: string;
      onConfirm: () => void;
  }>({ isOpen: false, message: '', onConfirm: () => {} });

  // Custom Notification Toast State
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<string>('ALL'); // 'ALL' | ContactType values
  
  // Follow-up Generation State
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [generatedMessage, setGeneratedMessage] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSendingServer, setIsSendingServer] = useState(false);
  const [serverStatus, setServerStatus] = useState<boolean>(false);
  const [lastServerCheck, setLastServerCheck] = useState<string>('-');

  // AUTOMATION STATE
  const [autoPilot, setAutoPilot] = useState(false);
  const [autoLog, setAutoLog] = useState<string[]>([]); // Logs de automação para UI
  const processLock = useRef(false); // Evitar execução dupla
  
  // REF to hold contacts for the interval without triggering re-renders
  const contactsRef = useRef(contacts);
  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);

  // Toast Timer
  useEffect(() => {
      if (toast) {
          const timer = setTimeout(() => setToast(null), 3000);
          return () => clearTimeout(timer);
      }
  }, [toast]);

  // Load from Local Storage on Mount with DEDUPLICATION
  useEffect(() => {
    const savedSettings = localStorage.getItem('imobiflow_settings');
    const savedContacts = localStorage.getItem('imobiflow_contacts');

    if (savedSettings) setSettings(JSON.parse(savedSettings));
    if (savedContacts) {
      try {
          const parsedContacts: Contact[] = JSON.parse(savedContacts);
          // Remove duplicates based on ID
          const seenIds = new Set();
          const uniqueContacts = parsedContacts.filter(contact => {
              if (seenIds.has(contact.id)) return false;
              seenIds.add(contact.id);
              return true;
          });
          setContacts(uniqueContacts);
      } catch (e) {
          console.error("Erro ao carregar contatos", e);
          setContacts(MOCK_CONTACTS);
      }
    } else {
      setContacts(MOCK_CONTACTS);
    }
  }, []);

  // Persistence
  useEffect(() => {
    if (settings) localStorage.setItem('imobiflow_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('imobiflow_contacts', JSON.stringify(contacts));
  }, [contacts]);

  // --- AUTOMATION ENGINE ---

  // Helper function to match phones (handles 55 prefix, 9 digit issue)
  const arePhonesCompatible = (phoneA: string, phoneB: string): boolean => {
      // 1. Clean both phones (only numbers)
      const cleanA = phoneA.replace(/\D/g, '');
      const cleanB = phoneB.replace(/\D/g, '');
      
      // 2. If exact match, return true
      if (cleanA === cleanB) return true;
      
      // 3. Check if one ends with the other (handles DDI 55 or DDD missing)
      // e.g. 5511999998888 ends with 11999998888
      // e.g. 5511999998888 ends with 999998888
      if (cleanA.length > cleanB.length) return cleanA.endsWith(cleanB);
      if (cleanB.length > cleanA.length) return cleanB.endsWith(cleanA);
      
      return false;
  };

  const syncServer = async () => {
    if (!settings || settings.integrationMode !== 'server') return;

    try {
        // Fallback to Localhost
        const url = settings.serverUrl || 'http://localhost:3001';
        
        // Check Status
        const statusRes = await fetch(`${url}/status`);
        const statusData = await statusRes.json();
        setServerStatus(statusData.isReady);
        setLastServerCheck(new Date().toLocaleTimeString());

        if (statusData.isReady) {
             // Check Replies
             const activityRes = await fetch(`${url}/activity`);
             const activityData: Record<string, any> = await activityRes.json();
             
             // Iterate through INCOMING messages first to find owners
             const entries = Object.entries(activityData);
             
             if (entries.length === 0) return;

             setContacts(prevContacts => {
                 let hasChanges = false;
                 
                 // Create a copy
                 const newContacts = [...prevContacts];

                 // For each incoming message, find the contact
                 entries.forEach(([senderPhone, data]) => {
                     if (!data || !data.body || data.body.trim() === '') return;
                     
                     // Find contact that matches this sender phone
                     const contactIndex = newContacts.findIndex(c => arePhonesCompatible(c.phone, senderPhone));
                     
                     if (contactIndex !== -1) {
                         const c = newContacts[contactIndex];
                         const serverMsgTime = data.timestamp || 0;
                         const serverMsgBody = "Nova mensagem recebida. Verifique o WhatsApp.";
                         const localLastMsgTime = c.lastReplyTimestamp || 0;

                         // If NEW message
                         if (serverMsgTime > localLastMsgTime) {
                             hasChanges = true;
                             addLog(`💬 Notificação de resposta de ${c.name}`);
                             
                             // Update the contact in the copy array
                             newContacts[contactIndex] = {
                                 ...c,
                                 lastContactDate: new Date(serverMsgTime).toISOString(),
                                 automationStage: AutomationStage.IDLE,
                                 lastAutomatedMsgDate: undefined,
                                 lastReplyContent: serverMsgBody,
                                 lastReplyTimestamp: serverMsgTime,
                                 hasUnreadReply: true 
                             };
                         }
                     } else {
                         // Optional: Log unassigned message
                         // console.log("Message from unknown number:", senderPhone);
                     }
                 });

                 return hasChanges ? newContacts : prevContacts;
             });
        }
    } catch (e) {
        setServerStatus(false);
    }
  };

  // 1. Check Server & Replies (Runs regardless of AutoPilot)
  useEffect(() => {
    if (settings?.integrationMode !== 'server') return;

    const interval = setInterval(syncServer, 5000); // Sync a cada 5s
    return () => clearInterval(interval);
  }, [settings?.integrationMode, settings?.serverUrl]);


  // 2. Auto-Pilot Processor (Runs logic to send messages)
  useEffect(() => {
    if (!autoPilot || !serverStatus || !settings) return;

    const runAutomation = async () => {
        if (processLock.current) return;
        processLock.current = true;
        
        try {
            const now = new Date();
            // Use ref current state to allow async iteration without closure staleness issues on loop start
            const candidates = contactsRef.current;
            
            // We store updates in a Map to apply them safely via setContacts(prev => ...)
            // This prevents overwriting user actions (like delete) that happened during the async wait.
            const updates = new Map<string, Partial<Contact>>();
            let activityLog = [];

            for (const c of candidates) {
                // SKIP if paused manually OR has unread reply
                if (c.autoPilotEnabled === false) continue;
                if (c.hasUnreadReply) continue; // Don't annoy people who just replied

                let changes: Partial<Contact> | null = null;

                // --- CRITERIA 1: START NEW CYCLE ---
                if (c.automationStage === AutomationStage.IDLE) {
                    const last = new Date(c.lastContactDate);
                    const diffDays = Math.ceil((now.getTime() - last.getTime()) / (86400000));
                    
                    let freq = c.followUpFrequencyDays || 30;
                    
                    if (diffDays >= freq) {
                        const msg = await generateFollowUpMessage(c, settings, false);
                        const success = await sendViaServer(c.phone, msg);
                        if (success) {
                            changes = {
                                automationStage: AutomationStage.WAITING_REPLY_1,
                                lastAutomatedMsgDate: now.toISOString()
                            };
                            activityLog.push(`✅ Enviado (1ª tentativa) para ${c.name}`);
                        }
                    }
                }

                // --- CRITERIA 2: RETRY (1 DAY LATER) ---
                else if (c.automationStage === AutomationStage.WAITING_REPLY_1) {
                     const lastAuto = c.lastAutomatedMsgDate ? new Date(c.lastAutomatedMsgDate).getTime() : 0;
                     const hoursSince = (now.getTime() - lastAuto) / (1000 * 60 * 60);

                     if (hoursSince >= 24) {
                         const msg = await generateFollowUpMessage(c, settings, true); 
                         const success = await sendViaServer(c.phone, msg);
                         if (success) {
                             changes = {
                                automationStage: AutomationStage.WAITING_REPLY_2,
                                lastAutomatedMsgDate: now.toISOString()
                             };
                             activityLog.push(`✅ Cobrança enviada para ${c.name}`);
                         }
                     }
                }

                // --- CRITERIA 3: FAILURE (GIVE UP) ---
                else if (c.automationStage === AutomationStage.WAITING_REPLY_2) {
                     const lastAuto = c.lastAutomatedMsgDate ? new Date(c.lastAutomatedMsgDate).getTime() : 0;
                     const hoursSince = (now.getTime() - lastAuto) / (1000 * 60 * 60);

                     if (hoursSince >= 24) {
                         changes = {
                            automationStage: AutomationStage.NO_RESPONSE_ALERT
                         };
                         activityLog.push(`⚠️ FALHA: ${c.name} não respondeu. Marque manualmente.`);
                     }
                }

                if (changes) {
                    updates.set(c.id, changes);
                }
            }

            // Apply Logs
            if (activityLog.length > 0) {
                activityLog.forEach(l => addLog(l));
            }

            // Apply Updates Safely
            if (updates.size > 0) {
                setContacts(prev => prev.map(contact => {
                    const update = updates.get(contact.id);
                    return update ? { ...contact, ...update } : contact;
                }));
            }

        } catch (e) {
            console.error("AutoPilot Error", e);
        } finally {
            processLock.current = false;
        }
    };

    const interval = setInterval(runAutomation, 30000); 
    runAutomation(); 

    return () => clearInterval(interval);

  }, [autoPilot, serverStatus, settings]); 

  // Helpers
  const addLog = (msg: string) => {
      const time = new Date().toLocaleTimeString();
      setAutoLog(prev => [`[${time}] ${msg}`, ...prev].slice(0, 50));
  };

  const sendViaServer = async (phone: string, message: string): Promise<boolean> => {
      const url = settings?.serverUrl || 'http://localhost:3001';
      try {
          const res = await fetch(`${url}/send`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ phone, message })
          });
          const data = await res.json();
          return data.success;
      } catch (e) {
          addLog(`Erro de conexão ao enviar para ${phone}`);
          return false;
      }
  };

  // --- NORMAL UI HANDLERS ---

  const handleSaveContact = (contact: Contact) => {
    // Preserve existing automation state if editing, or set defaults for new
    const contactToSave = {
        ...contact,
        automationStage: contact.automationStage !== undefined ? contact.automationStage : AutomationStage.IDLE,
        autoPilotEnabled: contact.autoPilotEnabled !== undefined ? contact.autoPilotEnabled : true,
        lastReplyTimestamp: contact.lastReplyTimestamp || 0
    };

    setContacts(prev => {
        // Force string comparison for IDs to ensure match
        const existingIndex = prev.findIndex(c => String(c.id) === String(contactToSave.id));
        
        if (existingIndex >= 0) {
            // Update using map to ensure immutability
            return prev.map((c, idx) => idx === existingIndex ? contactToSave : c);
        } else {
            // Add new
            if (!contactToSave.id) contactToSave.id = generateId();
            return [...prev, contactToSave];
        }
    });
    
    setEditingContact(null);
  };

  const handleDeleteContact = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); 
    e.preventDefault();
    
    setConfirmModal({
        isOpen: true,
        message: 'Tem certeza que deseja remover este contato?',
        onConfirm: () => {
            setContacts(prev => {
                // Aggressive filtering
                const filtered = prev.filter(c => String(c.id) !== String(id));
                return filtered;
            });
            if (selectedContactId === id) setSelectedContactId(null);
            setConfirmModal({ isOpen: false, message: '', onConfirm: () => {} });
            setToast({ message: 'Contato removido com sucesso!', type: 'success' });
        }
    });
  };

  const handleToggleAutoPilot = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setContacts(prev => prev.map(c => {
          if (c.id === id) {
              return { ...c, autoPilotEnabled: c.autoPilotEnabled === false ? true : false };
          }
          return c;
      }));
  };

  const handleManualReset = (contact: Contact) => {
      const updated = {
          ...contact,
          lastContactDate: new Date().toISOString(),
          automationStage: AutomationStage.IDLE,
          lastAutomatedMsgDate: undefined
      };
      handleSaveContact(updated);
  };

  const handleDismissReply = (contact: Contact) => {
      const updated = {
          ...contact,
          hasUnreadReply: false // Marca como lida
          // IMPORTANT: We do NOT reset timestamp here, because we want to ignore THIS message in future,
          // but accept NEW messages with HIGHER timestamps.
      };
      handleSaveContact(updated);
      setToast({ message: 'Mensagem marcada como lida.', type: 'success' });
  };
  
  const handleOpenWhatsApp = (phone: string) => {
      // Abre o WhatsApp Web com o número do contato
      const cleanPhone = phone.replace(/\D/g, '');
      const url = `https://web.whatsapp.com/send?phone=${cleanPhone}`;
      window.open(url, '_blank');
  };

  const handleGenerateMessage = (contact: Contact) => {
    if (!settings) return;
    setIsGenerating(true);
    setGeneratedMessage('');
    setSelectedContactId(contact.id);
    setIsInboxOpen(false); // Close inbox if open
    generateFollowUpMessage(contact, settings, false).then(msg => {
        setGeneratedMessage(msg);
        setIsGenerating(false);
    });
  };

  const handleSendWhatsAppManual = async (contact: Contact) => {
      if (!settings) return;
      
      if (settings.integrationMode === 'server') {
          setIsSendingServer(true);
          const success = await sendViaServer(contact.phone, generatedMessage);
          setIsSendingServer(false);
          if (success) {
               setToast({ message: 'Mensagem enviada com sucesso!', type: 'success' });
               handleManualReset(contact); 
          } else {
               setToast({ message: 'Erro ao enviar. Verifique o servidor.', type: 'error' });
          }
      } else {
          // Browser mode
          const encodedText = encodeURIComponent(generatedMessage);
          let url = settings.preferredWhatsappMode === 'app' 
            ? `whatsapp://send?phone=${contact.phone}&text=${encodedText}`
            : `https://web.whatsapp.com/send?phone=${contact.phone}&text=${encodedText}`;
          window.open(url, '_blank');
          handleManualReset(contact);
      }
  };

  // Filter Logic
  const filteredContacts = useMemo(() => {
      return contacts.filter(c => {
          if (filterType === 'ALL') return true;
          return c.type === filterType;
      });
  }, [contacts, filterType]);

  // Derived Data
  const unreadContacts = useMemo(() => {
      return contacts.filter(c => c.hasUnreadReply);
  }, [contacts]);

  if (!settings) {
    return <StrategyWizard onComplete={setSettings} />;
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row font-sans text-gray-900 relative">
      
      {/* --- FLOATING INBOX BUTTON --- */}
      {unreadContacts.length > 0 && (
          <button 
             onClick={() => setIsInboxOpen(true)}
             className="fixed bottom-6 right-6 z-40 bg-red-600 text-white p-4 rounded-full shadow-2xl animate-bounce hover:bg-red-700 flex items-center justify-center"
          >
              <Icons.Message />
              <span className="absolute -top-1 -right-1 bg-white text-red-600 font-bold text-xs w-5 h-5 rounded-full flex items-center justify-center border border-red-200">
                  {unreadContacts.length}
              </span>
          </button>
      )}

      {/* --- INBOX MODAL --- */}
      {isInboxOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col animate-in zoom-in-95">
                  <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                      <h3 className="font-bold text-lg flex items-center gap-2">
                          <span className="text-xl">📬</span> Notificações
                          <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">{unreadContacts.length} novas</span>
                      </h3>
                      <button onClick={() => setIsInboxOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                  </div>
                  <div className="overflow-y-auto p-4 space-y-3 flex-1">
                      {unreadContacts.length === 0 ? (
                          <div className="text-center py-8 text-gray-400">
                              <p>Tudo limpo! Nenhuma mensagem nova.</p>
                          </div>
                      ) : (
                          unreadContacts.map(c => (
                              <div key={c.id} className="bg-white border border-blue-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                                  <div className="flex justify-between items-start mb-2">
                                      <h4 className="font-bold text-gray-800">{c.name}</h4>
                                      <span className="text-[10px] text-gray-400">{new Date(c.lastReplyTimestamp || c.lastContactDate).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                  </div>
                                  <div className="bg-yellow-50 p-3 rounded-lg text-sm text-yellow-800 mb-3 border border-yellow-100 flex items-center gap-2">
                                      <span>🔔</span> Nova interação detectada.
                                  </div>
                                  <div className="flex gap-2">
                                      <button onClick={() => handleOpenWhatsApp(c.phone)} className="flex-1 bg-green-600 text-white text-xs font-bold py-2 rounded hover:bg-green-700 flex items-center justify-center gap-1">
                                          <Icons.WhatsApp /> Abrir WhatsApp
                                      </button>
                                      <button onClick={() => handleDismissReply(c)} className="flex-1 bg-gray-100 text-gray-600 text-xs font-bold py-2 rounded hover:bg-gray-200">
                                          Marcar Lida
                                      </button>
                                  </div>
                              </div>
                          ))
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* --- CUSTOM TOAST & MODAL --- */}
      
      {/* Toast Notification */}
      {toast && (
          <div className={`fixed top-4 right-4 z-[9999] px-6 py-4 rounded-xl shadow-2xl animate-in slide-in-from-right fade-in duration-300 flex items-center gap-3 ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
              <span className="text-xl">{toast.type === 'success' ? '✅' : '⚠️'}</span>
              <span className="font-bold">{toast.message}</span>
          </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
          <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full animate-in zoom-in-95">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Confirmação</h3>
                  <p className="text-gray-600 mb-6">{confirmModal.message}</p>
                  <div className="flex justify-end gap-3">
                      <button 
                          onClick={() => setConfirmModal({...confirmModal, isOpen: false})}
                          className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold"
                      >
                          Cancelar
                      </button>
                      <button 
                          onClick={confirmModal.onConfirm}
                          className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg font-bold shadow-lg shadow-red-200"
                      >
                          Confirmar Exclusão
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* --- SIDEBAR --- */}
      <aside className="w-full md:w-64 bg-slate-900 text-white p-6 flex flex-col justify-between shadow-2xl shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-10">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Icons.Users />
            </div>
            <div>
              <h1 className="text-xl font-bold">ImobiFlow</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">CRM Pro</p>
            </div>
          </div>
          
          <div className="space-y-6">
            {/* Auto Pilot Toggle */}
            {settings.integrationMode === 'server' && (
                <div className={`p-4 border rounded-xl transition-all ${autoPilot ? 'bg-indigo-900/40 border-indigo-500' : 'bg-slate-800 border-slate-700'}`}>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Piloto Automático</span>
                        <div 
                            className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${autoPilot ? 'bg-indigo-500' : 'bg-slate-600'}`}
                            onClick={() => {
                                if (!serverStatus) return setToast({message: "Conecte o servidor primeiro", type: 'error'});
                                setAutoPilot(!autoPilot);
                            }}
                        >
                            <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-all ${autoPilot ? 'left-6' : 'left-1'}`} />
                        </div>
                    </div>
                    {autoPilot && (
                        <div className="mt-2 text-[10px] font-mono text-indigo-300 bg-slate-950/50 p-2 rounded max-h-24 overflow-y-auto">
                            {autoLog.length === 0 && "Iniciando..."}
                            {autoLog.map((l, i) => <div key={i} className="truncate border-b border-indigo-900/30 pb-0.5 mb-0.5 last:border-0">{l}</div>)}
                        </div>
                    )}
                </div>
            )}

            <div className="p-4 bg-slate-800 border border-slate-700 rounded-xl space-y-3">
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Conexão</p>
              
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-300">WhatsApp</span>
                {settings.integrationMode === 'server' ? (
                     serverStatus ? (
                        <span className="flex items-center gap-1.5 text-emerald-400 font-medium text-xs bg-emerald-900/30 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                            Online
                        </span>
                     ) : (
                        <span className="flex items-center gap-1.5 text-red-400 font-medium text-xs bg-red-900/30 px-2 py-0.5 rounded-full cursor-pointer hover:bg-red-900/50" onClick={() => setIsQRCodeOpen(true)}>
                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                            Offline (Scan)
                        </span>
                     )
                ) : (
                    <span className="text-yellow-500 text-xs">Manual</span>
                )}
              </div>
              {settings.integrationMode === 'server' && (
                  <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-700 pt-2">
                      <span>Último sync: {lastServerCheck}</span>
                      <button onClick={syncServer} className="text-blue-400 hover:text-white hover:underline">
                          <Icons.Refresh />
                      </button>
                  </div>
              )}
            </div>
            
            {/* Button to Clear Server Cache for Debugging */}
            {settings.integrationMode === 'server' && (
                <button 
                  onClick={async () => {
                     const url = settings.serverUrl || 'http://localhost:3001';
                     await fetch(`${url}/clear`); // Assume endpoint created previously
                     setToast({message: "Memória do servidor limpa", type: 'success'});
                  }}
                  className="w-full text-xs text-gray-500 hover:text-white border border-gray-700 hover:border-gray-500 rounded py-2"
                >
                  Limpar Memória Server
                </button>
            )}
          </div>
        </div>
        
        <div className="text-xs text-slate-500 mt-8">
            <button onClick={() => setSettings(null)} className="text-blue-400 hover:text-blue-300 hover:underline">Reconfigurar Sistema</button>
        </div>
      </aside>

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto bg-gray-50">
        <header className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Meus Contatos</h2>
            <p className="text-sm text-gray-500 mt-1">
                {autoPilot 
                    ? <span className="text-indigo-600 font-bold">Automação Ativa</span> 
                    : "Modo Manual"}
            </p>
          </div>
          <button 
            onClick={() => { setEditingContact(null); setIsModalOpen(true); }}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition shadow-lg shadow-blue-200 font-medium"
          >
            <Icons.Plus /> Adicionar Novo
          </button>
        </header>

        {/* ALERTS SECTION (NO RESPONSE) */}
        {contacts.some(c => c.automationStage === AutomationStage.NO_RESPONSE_ALERT) && (
            <section className="mb-6 animate-in slide-in-from-top-2">
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 md:p-6">
                    <h3 className="text-red-800 font-bold flex items-center gap-2 mb-4 text-sm uppercase tracking-wide">
                        ⚠️ Requer Atenção (Sem Resposta)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {contacts.filter(c => c.automationStage === AutomationStage.NO_RESPONSE_ALERT).map(c => (
                            <div key={c.id} className="bg-white p-4 rounded-lg shadow-sm border border-red-100 flex flex-col justify-between">
                                <div>
                                    <p className="font-bold text-gray-800">{c.name}</p>
                                    <p className="text-xs text-red-600 mb-3">Falha após 2 tentativas.</p>
                                </div>
                                <div className="flex gap-2 mt-2">
                                    <button onClick={() => handleManualReset(c)} className="flex-1 bg-gray-100 text-gray-700 text-xs py-2 rounded hover:bg-gray-200 font-bold">
                                        Resetar
                                    </button>
                                    <button onClick={() => handleGenerateMessage(c)} className="flex-1 bg-red-100 text-red-700 text-xs py-2 rounded hover:bg-red-200 font-bold">
                                        Tentar Manual
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        )}

        {/* FILTERS TABS */}
        <div className="flex gap-2 mb-6 border-b border-gray-200 pb-1 overflow-x-auto">
            <button 
                onClick={() => setFilterType('ALL')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${filterType === 'ALL' ? 'bg-white border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
                Todos
            </button>
            {Object.values(ContactType).map(type => (
                <button 
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${filterType === type ? 'bg-white border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    {type}s
                </button>
            ))}
        </div>

        {/* CONTACTS TABLE */}
        <section>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase border-b border-gray-100">
                <tr>
                  <th className="p-4 font-semibold w-10 text-center">Auto</th>
                  <th className="p-4 font-semibold">Nome / Perfil</th>
                  <th className="p-4 font-semibold">Status / Última Resposta</th>
                  <th className="p-4 font-semibold hidden md:table-cell">Ciclo</th>
                  <th className="p-4 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredContacts.map(contact => (
                  <React.Fragment key={contact.id}>
                  <tr className={`hover:bg-gray-50 transition-colors group ${contact.hasUnreadReply ? 'bg-yellow-50 border-l-4 border-l-yellow-400' : (contact.lastReplyContent ? 'bg-green-50/20' : '')}`}>
                    {/* Automation Toggle Column */}
                    <td className="p-4 text-center">
                        <button 
                            onClick={(e) => handleToggleAutoPilot(contact.id, e)}
                            title={contact.autoPilotEnabled !== false ? "Pausar Automação" : "Ativar Automação"}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                                contact.autoPilotEnabled !== false 
                                ? 'bg-green-100 text-green-600 hover:bg-green-200 shadow-sm' 
                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                            }`}
                        >
                            {contact.autoPilotEnabled !== false ? (
                                <Icons.Pause />
                            ) : (
                                <Icons.Play />
                            )}
                        </button>
                    </td>

                    <td className="p-4">
                        <div className="font-bold text-gray-900 flex items-center gap-2">
                            {contact.name}
                            {contact.hasUnreadReply && <span className="animate-pulse text-yellow-500 text-xs">🔔</span>}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">{contact.type}</div>
                    </td>

                    <td className="p-4">
                      {/* Automation Status Badge */}
                      <div className="mb-2">
                        {contact.automationStage === AutomationStage.IDLE && <span className="text-gray-400 text-xs border border-gray-200 px-2 py-0.5 rounded-full">Aguardando ciclo</span>}
                        {contact.automationStage === AutomationStage.WAITING_REPLY_1 && <span className="text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full text-xs font-bold">Enviado (24h)</span>}
                        {contact.automationStage === AutomationStage.WAITING_REPLY_2 && <span className="text-orange-600 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full text-xs font-bold">Cobrança</span>}
                        {contact.automationStage === AutomationStage.NO_RESPONSE_ALERT && <span className="text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full text-xs font-bold">Sem Resposta</span>}
                      </div>
                      
                      {/* Last Reply Preview in Table */}
                      {contact.lastReplyContent && (
                          <div 
                             className={`text-xs p-2 rounded inline-block max-w-[200px] truncate shadow-sm cursor-pointer ${contact.hasUnreadReply ? 'font-bold text-yellow-800 bg-yellow-100 ring-2 ring-yellow-200' : 'text-green-700 bg-green-100'}`}
                             title={contact.lastReplyContent}
                             onClick={() => setIsInboxOpen(true)}
                          >
                             {contact.hasUnreadReply ? "🔔 Ver no WhatsApp" : "💬 Ver histórico"}
                          </div>
                      )}
                    </td>

                    <td className="p-4 text-gray-500 hidden md:table-cell text-xs">
                        {contact.followUpFrequencyDays} dias<br/>
                        <span className="text-[10px] text-gray-400">Últ: {new Date(contact.lastContactDate).toLocaleDateString()}</span>
                    </td>

                    <td className="p-4 text-right">
                       <div className="flex justify-end items-center gap-1">
                           <button onClick={() => { setEditingContact(contact); setIsModalOpen(true); }} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer" title="Editar">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                           </button>
                           <button onClick={() => handleGenerateMessage(contact)} className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer" title="Gerar Mensagem">
                                <Icons.Message />
                           </button>
                           <button 
                             type="button"
                             onClick={(e) => handleDeleteContact(contact.id, e)}
                             className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer z-10 relative"
                             title="Excluir Contato"
                           >
                             <Icons.Trash />
                           </button>
                       </div>
                    </td>
                  </tr>
                  
                  {/* Manual Message Box Expansion */}
                  {selectedContactId === contact.id && (
                      <tr className="animate-in fade-in slide-in-from-top-2">
                          <td colSpan={5} className="bg-blue-50/50 p-4 border-b border-blue-100">
                             <div className="max-w-2xl mx-auto bg-white p-4 rounded-xl shadow-sm border border-blue-100">
                                <h4 className="font-bold text-gray-800 mb-2 text-sm flex justify-between">
                                    <span>Envio Manual para {contact.name}</span>
                                    <button onClick={() => setSelectedContactId(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                                </h4>
                                {isGenerating ? (
                                    <div className="py-4 text-center text-blue-600 text-sm animate-pulse">✨ Criando mensagem com IA...</div>
                                ) : (
                                    <>
                                        <textarea 
                                            className="w-full p-3 border border-gray-200 rounded-lg text-sm mb-3 focus:ring-2 focus:ring-blue-500 outline-none"
                                            rows={3}
                                            value={generatedMessage}
                                            onChange={(e) => setGeneratedMessage(e.target.value)}
                                        />
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => handleSendWhatsAppManual(contact)} disabled={isSendingServer} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 text-sm shadow-md shadow-blue-200">
                                                {isSendingServer ? 'Enviando...' : 'Enviar Agora'}
                                            </button>
                                        </div>
                                    </>
                                )}
                             </div>
                          </td>
                      </tr>
                  )}
                  </React.Fragment>
                ))}
                
                {filteredContacts.length === 0 && (
                    <tr>
                        <td colSpan={5} className="p-8 text-center text-gray-400">
                            Nenhum contato encontrado neste filtro.
                        </td>
                    </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <ContactModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          onSave={handleSaveContact}
          initialContact={editingContact}
          settings={settings}
        />

        <QRCodeModal
            isOpen={isQRCodeOpen}
            onClose={() => setIsQRCodeOpen(false)}
            onConnected={() => {
                setSettings(prev => prev ? ({...prev, whatsappConnected: true}) : null);
            }}
            serverUrl={settings.serverUrl}
        />
      </main>
    </div>
  );
};

export default App;
