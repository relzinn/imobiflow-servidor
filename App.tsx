
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { StrategyWizard } from './components/StrategyWizard';
import { ContactModal } from './components/ContactModal';
import { QRCodeModal } from './components/QRCodeModal';
import { Icons } from './constants';
import { AppSettings, Contact, ContactType, AutomationStage } from './types';
import { generateFollowUpMessage } from './services/geminiService';

// --- HELPERS ---
const generateId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`;

// Mock inicial
const MOCK_CONTACTS: Contact[] = [
  {
    id: '1',
    name: 'Exemplo Cliente',
    phone: '5511999999999',
    type: ContactType.CLIENT,
    lastContactDate: new Date().toISOString(),
    notes: 'Interessado em apto 3 quartos.',
    followUpFrequencyDays: 30,
    automationStage: AutomationStage.IDLE,
    autoPilotEnabled: true
  }
];

const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  
  // Modais
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [isQRCodeOpen, setIsQRCodeOpen] = useState(false);
  const [isInboxOpen, setIsInboxOpen] = useState(false);

  // Estados de Interface
  const [filterType, setFilterType] = useState<string>('ALL');
  const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  
  // Confirmação Customizada
  const [confirmData, setConfirmData] = useState<{show: boolean, msg: string, action: () => void}>({show: false, msg: '', action: () => {}});

  // Estados do Servidor/IA
  const [serverStatus, setServerStatus] = useState(false);
  const [lastSync, setLastSync] = useState('-');
  const [autoPilot, setAutoPilot] = useState(false);
  const [genMsg, setGenMsg] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const contactsRef = useRef(contacts);
  
  // --- EFEITOS DE INICIALIZAÇÃO ---

  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);

  // Carregar Dados
  useEffect(() => {
    const s = localStorage.getItem('imobiflow_settings');
    const c = localStorage.getItem('imobiflow_contacts');
    
    if (s) setSettings(JSON.parse(s));
    if (c) {
        try {
            const parsed = JSON.parse(c);
            // Deduplicação ao carregar
            const unique = new Map();
            parsed.forEach((item: Contact) => unique.set(item.id, item));
            setContacts(Array.from(unique.values()));
        } catch (e) {
            setContacts(MOCK_CONTACTS);
        }
    } else {
        setContacts(MOCK_CONTACTS);
    }
  }, []);

  // Salvar Dados
  useEffect(() => {
    if (settings) localStorage.setItem('imobiflow_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('imobiflow_contacts', JSON.stringify(contacts));
  }, [contacts]);

  // Toast Timer
  useEffect(() => {
    if (toast) {
        const t = setTimeout(() => setToast(null), 3000);
        return () => clearTimeout(t);
    }
  }, [toast]);

  // --- SINCRONIZAÇÃO COM SERVIDOR ---

  const arePhonesCompatible = (p1: string, p2: string) => {
      const c1 = p1.replace(/\D/g, '');
      const c2 = p2.replace(/\D/g, '');
      return c1.endsWith(c2) || c2.endsWith(c1);
  };

  const syncServer = async () => {
    if (!settings || settings.integrationMode !== 'server') return;
    
    try {
        const url = (settings.serverUrl || 'http://localhost:3001').replace(/\/$/, '');
        
        // 1. Checa Status
        const stRes = await fetch(`${url}/status`);
        const stData = await stRes.json();
        setServerStatus(stData.isReady);
        setLastSync(new Date().toLocaleTimeString());

        if (stData.isReady) {
            // 2. Busca Atividade (Respostas)
            const actRes = await fetch(`${url}/activity`);
            const actData = await actRes.json();
            
            // Processa mensagens
            const entries = Object.entries(actData);
            if (entries.length === 0) return;

            setContacts(prev => {
                const next = [...prev];
                let changed = false;

                entries.forEach(([phone, data]: [string, any]) => {
                    const idx = next.findIndex(c => arePhonesCompatible(c.phone, phone));
                    if (idx >= 0) {
                        const c = next[idx];
                        const msgTime = data.timestamp || 0;
                        const lastTime = c.lastReplyTimestamp || 0;

                        // Só atualiza se for mensagem nova
                        if (msgTime > lastTime) {
                            changed = true;
                            next[idx] = {
                                ...c,
                                lastReplyContent: "Nova mensagem recebida. Verifique o WhatsApp.",
                                lastReplyTimestamp: msgTime,
                                hasUnreadReply: true,
                                automationStage: AutomationStage.IDLE, // Reseta automação pois respondeu
                                lastAutomatedMsgDate: undefined
                            };
                            setLogs(l => [`🔔 Resposta de ${c.name}`, ...l].slice(0, 20));
                        }
                    }
                });
                return changed ? next : prev;
            });
        }
    } catch (e) {
        setServerStatus(false);
    }
  };

  // Loop de Sync (5s)
  useEffect(() => {
    if (settings?.integrationMode === 'server') {
        const i = setInterval(syncServer, 5000);
        return () => clearInterval(i);
    }
  }, [settings?.integrationMode, settings?.serverUrl]);

  // --- AUTOMAÇÃO ---

  const sendViaServer = async (phone: string, text: string) => {
      try {
          const url = (settings?.serverUrl || 'http://localhost:3001').replace(/\/$/, '');
          const res = await fetch(`${url}/send`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ phone, message: text })
          });
          const d = await res.json();
          return d.success;
      } catch (e) {
          return false;
      }
  };

  useEffect(() => {
    if (!autoPilot || !serverStatus || !settings) return;

    const runAuto = async () => {
        const now = Date.now();
        const list = contactsRef.current;
        const updates = new Map();

        for (const c of list) {
            // Pula se desativado ou tem msg não lida
            if (c.autoPilotEnabled === false || c.hasUnreadReply) continue;

            let change = null;
            
            // Lógica 1: Início de Ciclo
            if (c.automationStage === AutomationStage.IDLE) {
                const last = new Date(c.lastContactDate).getTime();
                const daysSince = (now - last) / (1000 * 60 * 60 * 24);
                
                if (daysSince >= c.followUpFrequencyDays) {
                    const msg = await generateFollowUpMessage(c, settings, false);
                    if (await sendViaServer(c.phone, msg)) {
                        change = { 
                            automationStage: AutomationStage.WAITING_REPLY_1,
                            lastAutomatedMsgDate: new Date().toISOString()
                        };
                        setLogs(l => [`✅ Enviado (Ciclo) para ${c.name}`, ...l]);
                    }
                }
            }
            // Lógica 2: Cobrança (24h)
            else if (c.automationStage === AutomationStage.WAITING_REPLY_1) {
                const lastAuto = c.lastAutomatedMsgDate ? new Date(c.lastAutomatedMsgDate).getTime() : 0;
                if ((now - lastAuto) > (24 * 60 * 60 * 1000)) {
                    const msg = await generateFollowUpMessage(c, settings, true);
                    if (await sendViaServer(c.phone, msg)) {
                         change = { 
                            automationStage: AutomationStage.WAITING_REPLY_2,
                            lastAutomatedMsgDate: new Date().toISOString()
                        };
                        setLogs(l => [`✅ Cobrança enviada para ${c.name}`, ...l]);
                    }
                }
            }
            // Lógica 3: Falha
            else if (c.automationStage === AutomationStage.WAITING_REPLY_2) {
                const lastAuto = c.lastAutomatedMsgDate ? new Date(c.lastAutomatedMsgDate).getTime() : 0;
                if ((now - lastAuto) > (24 * 60 * 60 * 1000)) {
                    change = { automationStage: AutomationStage.NO_RESPONSE_ALERT };
                    setLogs(l => [`⚠️ ${c.name} não respondeu.`, ...l]);
                }
            }

            if (change) updates.set(c.id, change);
        }

        if (updates.size > 0) {
            setContacts(prev => prev.map(c => updates.has(c.id) ? { ...c, ...updates.get(c.id) } : c));
        }
    };

    const i = setInterval(runAuto, 30000); // Roda a cada 30s
    runAuto();
    return () => clearInterval(i);
  }, [autoPilot, serverStatus, settings]);

  // --- ACTIONS UI ---

  const handleSaveContact = (data: Contact) => {
    setContacts(prev => {
        const exists = prev.find(c => c.id === data.id);
        if (exists) {
            return prev.map(c => c.id === data.id ? data : c);
        }
        return [...prev, data];
    });
    setEditingContact(null);
  };

  const handleDelete = (id: string) => {
    setConfirmData({
        show: true,
        msg: 'Tem certeza que deseja excluir?',
        action: () => {
            setContacts(prev => prev.filter(c => c.id !== id));
            setConfirmData({show: false, msg: '', action: () => {}});
            setToast({msg: 'Contato removido.', type: 'success'});
        }
    });
  };

  const handleMarkRead = (c: Contact) => {
      handleSaveContact({
          ...c,
          hasUnreadReply: false
      });
      setToast({msg: 'Mensagem marcada como lida.', type: 'success'});
  };

  const handleOpenWA = (phone: string) => {
      const p = phone.replace(/\D/g, '');
      window.open(`https://web.whatsapp.com/send?phone=${p}`, '_blank');
  };

  const handleManualMsg = async (c: Contact) => {
      setSelectedId(c.id);
      setGenMsg('Gerando...');
      const msg = await generateFollowUpMessage(c, settings!, false);
      setGenMsg(msg);
  };

  const sendManual = async (c: Contact) => {
      setSending(true);
      if (settings?.integrationMode === 'server') {
          if (await sendViaServer(c.phone, genMsg)) {
              setToast({msg: 'Enviado!', type: 'success'});
              handleSaveContact({...c, lastContactDate: new Date().toISOString()});
              setSelectedId(null);
          } else {
              setToast({msg: 'Erro ao enviar.', type: 'error'});
          }
      } else {
          const url = `https://web.whatsapp.com/send?phone=${c.phone.replace(/\D/g,'')}&text=${encodeURIComponent(genMsg)}`;
          window.open(url, '_blank');
          handleSaveContact({...c, lastContactDate: new Date().toISOString()});
          setSelectedId(null);
      }
      setSending(false);
  };

  // --- RENDER ---

  if (!settings) return <StrategyWizard onComplete={setSettings} />;

  const unread = contacts.filter(c => c.hasUnreadReply);
  const filtered = contacts.filter(c => filterType === 'ALL' || c.type === filterType);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-100 font-sans text-gray-800">
        
        {/* Sidebar */}
        <aside className="bg-slate-900 text-white w-full md:w-64 p-6 flex flex-col shrink-0">
            <h1 className="text-xl font-bold flex items-center gap-2 mb-8">
                <span className="bg-blue-600 p-1 rounded"><Icons.Users /></span> ImobiFlow
            </h1>

            <div className="space-y-4">
                {/* Status Card */}
                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                    <div className="text-xs font-bold text-slate-500 uppercase mb-2">Conexão</div>
                    <div className="flex justify-between items-center mb-2">
                        <span>WhatsApp</span>
                        {settings.integrationMode === 'server' ? (
                            serverStatus 
                            ? <span className="text-emerald-400 text-xs font-bold flex gap-1 items-center">● Online</span>
                            : <button onClick={() => setIsQRCodeOpen(true)} className="text-red-400 text-xs font-bold flex gap-1 items-center hover:underline">● Conectar</button>
                        ) : <span className="text-yellow-500 text-xs">Manual</span>}
                    </div>
                    {settings.integrationMode === 'server' && (
                        <div className="text-[10px] text-slate-500 flex justify-between mt-2 pt-2 border-t border-slate-700">
                            <span>Sync: {lastSync}</span>
                            <button onClick={syncServer} title="Atualizar"><Icons.Refresh /></button>
                        </div>
                    )}
                </div>

                {/* Autopilot Card */}
                {settings.integrationMode === 'server' && (
                    <div className={`p-4 rounded-xl border transition-colors ${autoPilot ? 'bg-indigo-900/40 border-indigo-500' : 'bg-slate-800 border-slate-700'}`}>
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-slate-300 uppercase">Piloto Automático</span>
                            <button 
                                onClick={() => setAutoPilot(!autoPilot)}
                                className={`w-10 h-5 rounded-full relative transition-colors ${autoPilot ? 'bg-indigo-500' : 'bg-slate-600'}`}
                            >
                                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${autoPilot ? 'left-6' : 'left-1'}`} />
                            </button>
                        </div>
                        {autoPilot && (
                            <div className="text-[10px] font-mono text-indigo-300 max-h-24 overflow-y-auto">
                                {logs.map((l, i) => <div key={i}>{l}</div>)}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="mt-auto pt-4">
                <button onClick={() => setSettings(null)} className="text-xs text-blue-400 hover:text-white">Reconfigurar</button>
            </div>
        </aside>

        {/* Main */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
            <header className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold">Contatos</h2>
                    <p className="text-sm text-gray-500">Gestão de Follow-up</p>
                </div>
                <button onClick={() => { setEditingContact(null); setIsModalOpen(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-blue-700 flex items-center gap-2">
                    <Icons.Plus /> Novo
                </button>
            </header>

            {/* Filters */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                {['ALL', ...Object.values(ContactType)].map(t => (
                    <button 
                        key={t}
                        onClick={() => setFilterType(t)}
                        className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap ${filterType === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                    >
                        {t === 'ALL' ? 'Todos' : t}
                    </button>
                ))}
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                        <tr>
                            <th className="p-4 w-12">Auto</th>
                            <th className="p-4">Nome</th>
                            <th className="p-4">Status</th>
                            <th className="p-4 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                        {filtered.map(c => (
                            <React.Fragment key={c.id}>
                                <tr className={`hover:bg-gray-50 ${c.hasUnreadReply ? 'bg-yellow-50' : ''}`}>
                                    <td className="p-4 text-center">
                                        <button 
                                            onClick={() => handleSaveContact({...c, autoPilotEnabled: !c.autoPilotEnabled})}
                                            className={`w-8 h-8 rounded-full flex items-center justify-center ${c.autoPilotEnabled !== false ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}
                                        >
                                            {c.autoPilotEnabled !== false ? <Icons.Pause /> : <Icons.Play />}
                                        </button>
                                    </td>
                                    <td className="p-4">
                                        <div className="font-bold">{c.name}</div>
                                        <div className="text-xs text-gray-500">{c.type}</div>
                                        {c.hasUnreadReply && <div className="text-[10px] font-bold text-yellow-600 mt-1">🔔 Nova Resposta</div>}
                                    </td>
                                    <td className="p-4">
                                        {c.automationStage === AutomationStage.IDLE && <span className="px-2 py-1 bg-gray-100 rounded text-xs">Pendente</span>}
                                        {c.automationStage === AutomationStage.WAITING_REPLY_1 && <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs">Aguardando (1)</span>}
                                        {c.automationStage === AutomationStage.WAITING_REPLY_2 && <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">Cobrança (2)</span>}
                                        {c.automationStage === AutomationStage.NO_RESPONSE_ALERT && <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">Falha</span>}
                                    </td>
                                    <td className="p-4 text-right flex justify-end gap-2">
                                        <button onClick={() => handleManualMsg(c)} className="p-2 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"><Icons.Message /></button>
                                        <button onClick={() => { setEditingContact(c); setIsModalOpen(true); }} className="p-2 bg-gray-50 text-gray-600 rounded hover:bg-gray-100">✏️</button>
                                        <button onClick={() => handleDelete(c.id)} className="p-2 bg-red-50 text-red-600 rounded hover:bg-red-100"><Icons.Trash /></button>
                                    </td>
                                </tr>
                                {selectedId === c.id && (
                                    <tr className="bg-blue-50/50">
                                        <td colSpan={4} className="p-4">
                                            <div className="bg-white border rounded-lg p-4 shadow-sm max-w-2xl mx-auto">
                                                <h4 className="font-bold text-sm mb-2">Enviar Mensagem</h4>
                                                <textarea 
                                                    className="w-full border rounded p-2 text-sm mb-2" 
                                                    rows={3}
                                                    value={genMsg}
                                                    onChange={e => setGenMsg(e.target.value)}
                                                />
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => setSelectedId(null)} className="px-3 py-1 text-sm bg-gray-200 rounded">Cancelar</button>
                                                    <button onClick={() => sendManual(c)} disabled={sending} className="px-3 py-1 text-sm bg-blue-600 text-white rounded font-bold">
                                                        {sending ? 'Enviando...' : 'Enviar'}
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Floating Inbox Button */}
            {unread.length > 0 && (
                <button 
                    onClick={() => setIsInboxOpen(true)}
                    className="fixed bottom-6 right-6 bg-red-600 text-white p-4 rounded-full shadow-xl animate-bounce z-50 flex items-center justify-center"
                >
                    <Icons.Message />
                    <span className="absolute -top-1 -right-1 bg-white text-red-600 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center border border-red-200">{unread.length}</span>
                </button>
            )}

            {/* Modals */}
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
                onConnected={() => { setServerStatus(true); setIsQRCodeOpen(false); }}
                serverUrl={settings.serverUrl}
                onUrlChange={(url) => setSettings({...settings, serverUrl: url})}
            />

            {/* Inbox Modal */}
            {isInboxOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                            <h3 className="font-bold">Notificações ({unread.length})</h3>
                            <button onClick={() => setIsInboxOpen(false)}>✕</button>
                        </div>
                        <div className="p-4 overflow-y-auto space-y-3">
                            {unread.map(c => (
                                <div key={c.id} className="border rounded-lg p-3 bg-yellow-50 border-yellow-200">
                                    <div className="font-bold flex justify-between">
                                        {c.name}
                                        <span className="text-[10px] font-normal text-gray-500">{new Date(c.lastReplyTimestamp || 0).toLocaleTimeString()}</span>
                                    </div>
                                    <div className="text-sm my-2 italic text-gray-700">"Nova mensagem recebida. Verifique o WhatsApp."</div>
                                    <div className="flex gap-2 mt-2">
                                        <button onClick={() => handleOpenWA(c.phone)} className="flex-1 bg-green-600 text-white py-1 rounded text-xs font-bold">Abrir WhatsApp</button>
                                        <button onClick={() => handleMarkRead(c)} className="flex-1 bg-gray-200 text-gray-700 py-1 rounded text-xs font-bold">Marcar Lida</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm Modal */}
            {confirmData.show && (
                <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg p-6 shadow-xl max-w-xs w-full text-center">
                        <p className="font-bold mb-4">{confirmData.msg}</p>
                        <div className="flex gap-2 justify-center">
                            <button onClick={() => setConfirmData({show: false, msg: '', action: () => {}})} className="px-4 py-2 bg-gray-200 rounded">Não</button>
                            <button onClick={confirmData.action} className="px-4 py-2 bg-red-600 text-white rounded font-bold">Sim</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-[70] px-4 py-2 rounded shadow-lg text-white font-bold animate-in slide-in-from-right ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
                    {toast.msg}
                </div>
            )}
        </main>
    </div>
  );
};

export default App;
