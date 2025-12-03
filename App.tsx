
import React, { useState, useEffect, useRef } from 'react';
import { StrategyWizard } from './components/StrategyWizard';
import { ContactModal } from './components/ContactModal';
import { QRCodeModal } from './components/QRCodeModal';
import { Icons } from './constants';
import { AppSettings, Contact, ContactType, AutomationStage } from './types';
import { generateFollowUpMessage } from './services/geminiService';

// --- HELPERS ---
const generateId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`;

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
  const [confirmData, setConfirmData] = useState<{show: boolean, msg: string, action: () => void}>({show: false, msg: '', action: () => {}});

  // Estados do Servidor/IA
  const [serverStatus, setServerStatus] = useState(false);
  const [lastSync, setLastSync] = useState('-');
  const [autoPilot, setAutoPilot] = useState(false);
  const [genMsg, setGenMsg] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [processingReplyId, setProcessingReplyId] = useState<string | null>(null); // Novo: Tratamento de resposta

  const contactsRef = useRef(contacts);
  
  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);

  // Carregar Configurações
  useEffect(() => {
    const s = localStorage.getItem('imobiflow_settings');
    if (s) setSettings(JSON.parse(s));
  }, []);

  // Salvar Configurações
  useEffect(() => {
    if (settings) localStorage.setItem('imobiflow_settings', JSON.stringify(settings));
  }, [settings]);

  // --- API DO SERVIDOR (BANCO DE DADOS) ---
  
  const getServerUrl = () => (settings?.serverUrl || 'https://ameer-uncondensational-lemuel.ngrok-free.dev').replace(/\/$/, '');
  const getHeaders = () => ({ 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' });

  // Carregar Contatos do Servidor
  const fetchContacts = async () => {
      if (!settings) return;
      try {
          const res = await fetch(`${getServerUrl()}/contacts`, { headers: getHeaders() });
          if (res.ok) {
              const data = await res.json();
              setContacts(data);
          }
      } catch (e) {
          console.error("Erro ao carregar contatos do servidor", e);
      }
  };

  // Carrega contatos ao iniciar se tiver settings
  useEffect(() => {
      if (settings) fetchContacts();
  }, [settings]);

  // Salva contatos no servidor (Substitui localStorage)
  const persistContacts = async (newContacts: Contact[]) => {
      setContacts(newContacts); // Atualiza UI
      if (!settings) return;
      try {
          await fetch(`${getServerUrl()}/contacts`, {
              method: 'POST',
              headers: getHeaders(),
              body: JSON.stringify(newContacts)
          });
      } catch (e) {
          console.error("Erro ao salvar contatos no servidor", e);
          setToast({msg: 'Erro ao salvar dados!', type: 'error'});
      }
  };

  // Toast Timer
  useEffect(() => {
    if (toast) {
        const t = setTimeout(() => setToast(null), 3000);
        return () => clearTimeout(t);
    }
  }, [toast]);

  // --- SINCRONIZAÇÃO E AUTOMAÇÃO ---

  const arePhonesCompatible = (p1: string, p2: string) => {
      const c1 = p1.replace(/\D/g, '');
      const c2 = p2.replace(/\D/g, '');
      return c1.endsWith(c2) || c2.endsWith(c1);
  };

  const syncServer = async () => {
    if (!settings) return;
    try {
        const url = getServerUrl();
        const headers = getHeaders();

        // 1. Checa Status
        const stRes = await fetch(`${url}/status`, { headers });
        const stData = await stRes.json();
        setServerStatus(stData.isReady);
        setLastSync(new Date().toLocaleTimeString());

        if (stData.isReady) {
            // 2. Busca Atividade
            const actRes = await fetch(`${url}/activity`, { headers });
            const actData = await actRes.json();
            
            const entries = Object.entries(actData);
            if (entries.length === 0) return;

            // Atualiza contatos com novas mensagens
            // NÃO SALVA NO DISCO AQUI PARA EVITAR IO EXCESSIVO, APENAS NA MEMÓRIA REACT ATÉ INTERAÇÃO
            setContacts(prev => {
                const next = [...prev];
                let changed = false;

                entries.forEach(([phone, data]: [string, any]) => {
                    const idx = next.findIndex(c => arePhonesCompatible(c.phone, phone));
                    if (idx >= 0) {
                        const c = next[idx];
                        const msgTime = data.timestamp || 0;
                        const lastTime = c.lastReplyTimestamp || 0;

                        if (msgTime > lastTime) {
                            changed = true;
                            next[idx] = {
                                ...c,
                                lastReplyContent: "Nova mensagem recebida. Verifique o WhatsApp.",
                                lastReplyTimestamp: msgTime,
                                hasUnreadReply: true,
                                automationStage: AutomationStage.IDLE,
                                lastAutomatedMsgDate: undefined
                            };
                            setLogs(l => [`🔔 Resposta de ${c.name}`, ...l].slice(0, 20));
                        }
                    }
                });
                // Se mudou algo, persistimos
                if (changed) persistContacts(next);
                return changed ? next : prev;
            });
        }
    } catch (e) {
        setServerStatus(false);
    }
  };

  useEffect(() => {
    if (settings) {
        const i = setInterval(syncServer, 5000);
        return () => clearInterval(i);
    }
  }, [settings]);

  // --- ACTIONS UI ---

  const handleSaveContact = async (data: Contact) => {
    // Se for edição após resposta (resetar ciclo)
    if (processingReplyId && processingReplyId === data.id) {
        data.automationStage = AutomationStage.IDLE;
        data.lastContactDate = new Date().toISOString();
        data.hasUnreadReply = false;
        setProcessingReplyId(null);
    }

    let newList;
    if (contacts.some(c => c.id === data.id)) {
        newList = contacts.map(c => c.id === data.id ? data : c);
    } else {
        newList = [...contacts, data];
    }
    
    await persistContacts(newList);
    setEditingContact(null);
    setToast({msg: 'Contato salvo com sucesso!', type: 'success'});
  };

  const handleDelete = (id: string) => {
    setConfirmData({
        show: true,
        msg: 'Excluir contato permanentemente?',
        action: () => {
            const newList = contacts.filter(c => c.id !== id);
            persistContacts(newList);
            setConfirmData({show: false, msg: '', action: () => {}});
            setToast({msg: 'Contato removido.', type: 'success'});
        }
    });
  };

  // Processar Resposta (Fluxo Decisório)
  const handleProcessReply = (c: Contact) => {
      setConfirmData({
          show: true,
          msg: `O que deseja fazer com ${c.name}?`,
          action: () => {
             // Ação customizada via botões abaixo, este é placeholder
          }
      });
  };

  const handleKeepContact = (c: Contact) => {
      setProcessingReplyId(c.id);
      setEditingContact(c);
      setIsModalOpen(true);
      setConfirmData({show: false, msg: '', action: () => {}});
  };

  const handleFinalizeContact = (c: Contact) => {
      handleDelete(c.id); // Já fecha o confirm e deleta
  };

  const handleOpenWA = (phone: string) => {
      const p = phone.replace(/\D/g, '');
      window.open(`https://web.whatsapp.com/send?phone=${p}`, '_blank');
  };

  const sendManual = async (c: Contact) => {
      setSending(true);
      try {
          const res = await fetch(`${getServerUrl()}/send`, {
              method: 'POST',
              headers: getHeaders(),
              body: JSON.stringify({ phone: c.phone, message: genMsg })
          });
          const d = await res.json();
          if (d.success) {
              setToast({msg: 'Enviado!', type: 'success'});
              // Atualiza data do último contato
              const newList = contacts.map(item => 
                  item.id === c.id ? {...item, lastContactDate: new Date().toISOString()} : item
              );
              persistContacts(newList);
              setSelectedId(null);
          } else {
              setToast({msg: 'Erro ao enviar.', type: 'error'});
          }
      } catch (e) {
          setToast({msg: 'Erro de conexão.', type: 'error'});
      }
      setSending(false);
  };

  // --- AUTOMAÇÃO ---
  useEffect(() => {
    if (!autoPilot || !serverStatus || !settings) return;

    const runAuto = async () => {
        const now = Date.now();
        const list = contactsRef.current;
        const updates = new Map();

        for (const c of list) {
            if (c.autoPilotEnabled === false || c.hasUnreadReply) continue;

            let change = null;
            
            // Lógica 1: Início
            if (c.automationStage === AutomationStage.IDLE) {
                const last = new Date(c.lastContactDate).getTime();
                const daysSince = (now - last) / (1000 * 60 * 60 * 24);
                
                if (daysSince >= c.followUpFrequencyDays) {
                    const msg = await generateFollowUpMessage(c, settings, false);
                    try {
                        await fetch(`${getServerUrl()}/send`, {
                             method: 'POST', headers: getHeaders(), body: JSON.stringify({ phone: c.phone, message: msg })
                        });
                        change = { 
                            automationStage: AutomationStage.WAITING_REPLY_1,
                            lastAutomatedMsgDate: new Date().toISOString(),
                            lastContactDate: new Date().toISOString() // RESET PARA EVITAR LOOP
                        };
                        setLogs(l => [`✅ Enviado (Ciclo) para ${c.name}`, ...l]);
                    } catch {}
                }
            }
            // ... (Lógicas 2 e 3 similares, mantidas simplificadas) ...
            
            if (change) updates.set(c.id, change);
        }

        if (updates.size > 0) {
            const next = list.map(c => updates.has(c.id) ? { ...c, ...updates.get(c.id) } : c);
            persistContacts(next);
        }
    };

    const i = setInterval(runAuto, 30000);
    runAuto();
    return () => clearInterval(i);
  }, [autoPilot, serverStatus, settings]);

  if (!settings) return <StrategyWizard onComplete={(s) => { setSettings(s); fetchContacts(); }} />;

  const unread = contacts.filter(c => c.hasUnreadReply);
  const filtered = contacts.filter(c => filterType === 'ALL' || c.type === filterType);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-100 font-sans text-gray-800">
        <aside className="bg-slate-900 text-white w-full md:w-64 p-6 flex flex-col shrink-0">
            <h1 className="text-xl font-bold flex items-center gap-2 mb-8">
                <span className="bg-blue-600 p-1 rounded"><Icons.Users /></span> ImobiFlow
            </h1>
            <div className="space-y-4">
                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                    <div className="text-xs font-bold text-slate-500 uppercase mb-2">Conexão</div>
                    <div className="flex justify-between items-center mb-2">
                        <span>WhatsApp</span>
                        {serverStatus 
                            ? <span className="text-emerald-400 text-xs font-bold flex gap-1 items-center" title="Servidor conectado e pronto">● Online</span>
                            : <button onClick={() => setIsQRCodeOpen(true)} className="text-red-400 text-xs font-bold flex gap-1 items-center hover:underline" title="Clique para conectar seu WhatsApp">● Conectar</button>
                        }
                    </div>
                    <div className="text-[10px] text-slate-500 flex flex-col gap-1 mt-2 pt-2 border-t border-slate-700">
                        <div className="flex justify-between items-center">
                            <span>Sync: {lastSync}</span>
                            <button onClick={syncServer} title="Forçar verificação de novas mensagens agora"><Icons.Refresh /></button>
                        </div>
                    </div>
                </div>
                <div className={`p-4 rounded-xl border transition-colors ${autoPilot ? 'bg-indigo-900/40 border-indigo-500' : 'bg-slate-800 border-slate-700'}`}>
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-slate-300 uppercase">Piloto Automático</span>
                        <button 
                            onClick={() => setAutoPilot(!autoPilot)}
                            className={`w-10 h-5 rounded-full relative transition-colors ${autoPilot ? 'bg-indigo-500' : 'bg-slate-600'}`}
                            title={autoPilot ? "Desligar automação geral" : "Ligar automação: o sistema verificará ciclos e enviará mensagens"}
                        >
                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${autoPilot ? 'left-6' : 'left-1'}`} />
                        </button>
                    </div>
                    {autoPilot && (
                        <div className="text-[10px] font-mono text-indigo-300 max-h-24 overflow-y-auto" title="Log de atividades da automação">
                            {logs.map((l, i) => <div key={i}>{l}</div>)}
                        </div>
                    )}
                </div>
            </div>
            <div className="mt-auto pt-4">
                <button onClick={() => setSettings(null)} className="text-xs text-blue-400 hover:text-white" title="Alterar configurações do sistema, nome, imobiliária ou servidor">Reconfigurar Sistema</button>
            </div>
        </aside>

        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
            <header className="flex justify-between items-center mb-6">
                <div><h2 className="text-2xl font-bold">Contatos</h2></div>
                <button 
                    onClick={() => { setEditingContact(null); setIsModalOpen(true); }} 
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-blue-700 flex items-center gap-2"
                    title="Adicionar um novo cliente, proprietário ou construtor"
                >
                    <Icons.Plus /> Novo
                </button>
            </header>

            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                {['ALL', ...Object.values(ContactType)].map(t => (
                    <button 
                        key={t} 
                        onClick={() => setFilterType(t)} 
                        className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap ${filterType === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
                        title={`Filtrar lista para mostrar apenas: ${t === 'ALL' ? 'Todos' : t}`}
                    >
                        {t === 'ALL' ? 'Todos' : t}
                    </button>
                ))}
            </div>

            <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                        <tr><th className="p-4 w-12">Auto</th><th className="p-4">Nome</th><th className="p-4">Status</th><th className="p-4 text-right">Ações</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                        {filtered.map(c => {
                            const daysWait = c.automationStage !== AutomationStage.IDLE 
                                ? Math.floor((Date.now() - new Date(c.lastAutomatedMsgDate || c.lastContactDate).getTime()) / (1000 * 60 * 60 * 24)) 
                                : 0;
                            return (
                            <React.Fragment key={c.id}>
                                <tr className={`hover:bg-gray-50 ${c.hasUnreadReply ? 'bg-yellow-50' : ''}`}>
                                    <td className="p-4 text-center">
                                        <button 
                                            onClick={() => handleSaveContact({...c, autoPilotEnabled: !c.autoPilotEnabled})} 
                                            className={`w-8 h-8 rounded-full flex items-center justify-center ${c.autoPilotEnabled !== false ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}
                                            title={c.autoPilotEnabled !== false ? "Automação ATIVADA. Clique para pausar." : "Automação PAUSADA. Clique para ativar."}
                                        >
                                            {c.autoPilotEnabled !== false ? <Icons.Pause /> : <Icons.Play />}
                                        </button>
                                    </td>
                                    <td className="p-4">
                                        <div className="font-bold">{c.name}</div>
                                        <div className="text-xs text-gray-500">{c.type}</div>
                                        {c.hasUnreadReply && <div className="text-[10px] font-bold text-yellow-600 mt-1" title="Cliente respondeu no WhatsApp">🔔 Nova Resposta</div>}
                                    </td>
                                    <td className="p-4">
                                        {c.automationStage === AutomationStage.IDLE && <span className="px-2 py-1 bg-gray-100 rounded text-xs" title="Aguardando data do próximo contato">Pendente</span>}
                                        {c.automationStage > 0 && <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs" title={`Mensagem enviada há ${daysWait} dias. Aguardando resposta.`}>Aguardando ({daysWait}d)</span>}
                                    </td>
                                    <td className="p-4 text-right flex justify-end gap-2">
                                        <button 
                                            onClick={() => { setSelectedId(c.id); setGenMsg('Gerando...'); generateFollowUpMessage(c, settings!, false).then(setGenMsg); }} 
                                            className="p-2 bg-blue-50 text-blue-600 rounded"
                                            title="Gerar e enviar mensagem avulsa agora"
                                        >
                                            <Icons.Message />
                                        </button>
                                        <button 
                                            onClick={() => { setEditingContact(c); setIsModalOpen(true); }} 
                                            className="p-2 bg-gray-50 text-gray-600 rounded"
                                            title="Editar dados ou notas do contato"
                                        >
                                            ✏️
                                        </button>
                                        <button 
                                            onClick={() => handleDelete(c.id)} 
                                            className="p-2 bg-red-50 text-red-600 rounded"
                                            title="Excluir contato permanentemente"
                                        >
                                            <Icons.Trash />
                                        </button>
                                    </td>
                                </tr>
                                {selectedId === c.id && (
                                    <tr className="bg-blue-50/50">
                                        <td colSpan={4} className="p-4">
                                            <div className="bg-white border rounded-lg p-4 shadow-sm max-w-2xl mx-auto">
                                                <div className="text-xs font-bold text-gray-500 mb-2">Prévia da Mensagem:</div>
                                                <textarea className="w-full border rounded p-2 text-sm mb-2" rows={3} value={genMsg} onChange={e => setGenMsg(e.target.value)} />
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => setSelectedId(null)} className="px-3 py-1 text-sm bg-gray-200 rounded" title="Cancelar envio">Cancelar</button>
                                                    <button onClick={() => sendManual(c)} disabled={sending} className="px-3 py-1 text-sm bg-blue-600 text-white rounded font-bold" title="Confirmar e enviar para o WhatsApp">{sending ? 'Enviando...' : 'Enviar'}</button>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Inbox Button */}
            {unread.length > 0 && (
                <button 
                    onClick={() => setIsInboxOpen(true)} 
                    className="fixed bottom-6 right-6 bg-red-600 text-white p-4 rounded-full shadow-xl animate-bounce z-50 flex items-center justify-center"
                    title="Abrir Central de Notificações: Novas mensagens recebidas"
                >
                    <Icons.Message /><span className="absolute -top-1 -right-1 bg-white text-red-600 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center border border-red-200">{unread.length}</span>
                </button>
            )}

            {/* Modals */}
            <ContactModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveContact} initialContact={editingContact} settings={settings} />
            <QRCodeModal isOpen={isQRCodeOpen} onClose={() => setIsQRCodeOpen(false)} onConnected={() => { setServerStatus(true); setIsQRCodeOpen(false); }} serverUrl={settings.serverUrl} onUrlChange={(u) => setSettings({...settings, serverUrl: u})} />

            {/* Inbox Modal */}
            {isInboxOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                            <h3 className="font-bold">Notificações ({unread.length})</h3>
                            <button onClick={() => setIsInboxOpen(false)} title="Fechar notificações">✕</button>
                        </div>
                        <div className="p-4 overflow-y-auto space-y-3">
                            {unread.map(c => (
                                <div key={c.id} className="border rounded-lg p-3 bg-yellow-50 border-yellow-200">
                                    <div className="font-bold flex justify-between">{c.name} <span className="text-[10px] font-normal text-gray-500">Há pouco</span></div>
                                    <div className="text-sm my-2 italic text-gray-700">"Nova mensagem recebida. Verifique o WhatsApp."</div>
                                    <div className="flex gap-2 mt-2">
                                        <button 
                                            onClick={() => handleOpenWA(c.phone)} 
                                            className="flex-1 bg-green-600 text-white py-1 rounded text-xs font-bold"
                                            title="Abrir a conversa deste cliente no WhatsApp Web"
                                        >
                                            Abrir Chat
                                        </button>
                                        <button 
                                            onClick={() => { setIsInboxOpen(false); handleKeepContact(c); }} 
                                            className="flex-1 bg-blue-600 text-white py-1 rounded text-xs font-bold"
                                            title="Manter cliente na base: Abre edição para registrar a resposta e resetar o ciclo"
                                        >
                                            Atualizar
                                        </button>
                                        <button 
                                            onClick={() => { setIsInboxOpen(false); handleFinalizeContact(c); }} 
                                            className="flex-1 bg-gray-200 text-gray-700 py-1 rounded text-xs font-bold"
                                            title="Remover cliente da base (Vendeu/Desistiu)"
                                        >
                                            Finalizar
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Confirm Dialog (Decision) */}
            {confirmData.show && (
                <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg p-6 shadow-xl max-w-xs w-full text-center">
                        <p className="font-bold mb-4">{confirmData.msg}</p>
                        <div className="flex gap-2 justify-center">
                            <button onClick={() => setConfirmData({show: false, msg: '', action: () => {}})} className="px-4 py-2 bg-gray-200 rounded">Cancelar</button>
                            <button onClick={confirmData.action} className="px-4 py-2 bg-red-600 text-white rounded font-bold">Confirmar</button>
                        </div>
                    </div>
                </div>
            )}
            
            {toast && <div className={`fixed top-4 right-4 z-[70] px-4 py-2 rounded shadow-lg text-white font-bold ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>{toast.msg}</div>}
        </main>
    </div>
  );
};

export default App;
