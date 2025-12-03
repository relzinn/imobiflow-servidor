
import React, { useState, useEffect, useRef } from 'react';
import { StrategyWizard } from './components/StrategyWizard';
import { ContactModal } from './components/ContactModal';
import { QRCodeModal } from './components/QRCodeModal';
import { Icons } from './constants';
import { AppSettings, Contact, ContactType, AutomationStage } from './types';
import { generateFollowUpMessage } from './services/geminiService';

// --- HELPERS ---
const generateId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`;

// --- COMPONENTE INTERNO: MODAL DE CONFIGURAÇÕES GERAIS ---
const SettingsModal: React.FC<{ isOpen: boolean, onClose: () => void, settings: AppSettings, onSave: (s: AppSettings) => void }> = ({ isOpen, onClose, settings, onSave }) => {
    const [localSettings, setLocalSettings] = useState(settings);
    
    useEffect(() => { setLocalSettings(settings); }, [settings, isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                <h2 className="text-xl font-bold mb-4">Ajustes Gerais</h2>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Seu Nome</label>
                        <input className="w-full border p-2 rounded" value={localSettings.agentName} onChange={e => setLocalSettings({...localSettings, agentName: e.target.value})} />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Imobiliária</label>
                        <input className="w-full border p-2 rounded" value={localSettings.agencyName} onChange={e => setLocalSettings({...localSettings, agencyName: e.target.value})} />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Tom de Voz da Mensagem</label>
                        <select className="w-full border p-2 rounded" value={localSettings.messageTone} onChange={e => setLocalSettings({...localSettings, messageTone: e.target.value as any})}>
                            <option value="Casual">Casual</option><option value="Formal">Formal</option><option value="Amigável">Amigável</option><option value="Persuasivo">Persuasivo</option>
                            <option value="Consultivo">Consultivo</option><option value="Elegante">Elegante</option><option value="Urgente">Urgente</option><option value="Entusiasta">Entusiasta</option>
                        </select>
                    </div>
                    <div className="border-t pt-4 mt-4">
                        <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Ciclos de Follow-up (Dias)</label>
                        <div className="grid grid-cols-3 gap-2">
                             <div><label className="text-[10px]">Proprietário</label><input type="number" className="w-full border p-1 rounded" value={localSettings.defaultFrequencyOwner} onChange={e => setLocalSettings({...localSettings, defaultFrequencyOwner: Number(e.target.value)})} /></div>
                             <div><label className="text-[10px]">Construtor</label><input type="number" className="w-full border p-1 rounded" value={localSettings.defaultFrequencyBuilder} onChange={e => setLocalSettings({...localSettings, defaultFrequencyBuilder: Number(e.target.value)})} /></div>
                             <div><label className="text-[10px]">Cliente</label><input type="number" className="w-full border p-1 rounded" value={localSettings.defaultFrequencyClient} onChange={e => setLocalSettings({...localSettings, defaultFrequencyClient: Number(e.target.value)})} /></div>
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200">Cancelar</button>
                    <button onClick={() => { onSave(localSettings); onClose(); }} className="px-4 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700">Salvar Alterações</button>
                </div>
            </div>
        </div>
    );
};

// --- APP PRINCIPAL ---

const App: React.FC = () => {
  const [viewState, setViewState] = useState<'loading' | 'wizard' | 'welcome' | 'dashboard'>('loading');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  
  // Modais
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false); // Modal de Configs
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
  const [processingReplyId, setProcessingReplyId] = useState<string | null>(null);

  const contactsRef = useRef(contacts);
  
  useEffect(() => { contactsRef.current = contacts; }, [contacts]);

  // --- INICIALIZAÇÃO E CARREGAMENTO ---

  // Recupera URL do servidor salva no navegador (única coisa que fica no local)
  const getServerUrl = () => {
      const stored = localStorage.getItem('imobiflow_server_url');
      return (stored || 'https://ameer-uncondensational-lemuel.ngrok-free.dev').replace(/\/$/, '');
  };

  const getHeaders = () => ({ 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' });

  // Ao iniciar, tenta buscar configurações no servidor
  useEffect(() => {
      const loadSettings = async () => {
          try {
              const url = getServerUrl();
              const res = await fetch(`${url}/settings`, { headers: getHeaders() });
              if (res.ok) {
                  const data = await res.json();
                  setSettings({...data, serverUrl: url}); // Garante que URL local está no objeto
                  setViewState('welcome'); // Achei settings! Vai pra tela de boas-vindas
              } else {
                  setViewState('wizard'); // Não achei, vai pro wizard
              }
          } catch (e) {
              // Se der erro de conexão, assume wizard mas mantém URL pra tentar conectar
              console.error("Falha ao conectar servidor:", e);
              setViewState('wizard');
          }
      };
      loadSettings();
  }, []);

  // Salva configurações no servidor
  const persistSettings = async (newSettings: AppSettings) => {
      setSettings(newSettings);
      // Salva URL no navegador pra próxima vez
      if (newSettings.serverUrl) localStorage.setItem('imobiflow_server_url', newSettings.serverUrl);
      
      try {
          await fetch(`${newSettings.serverUrl}/settings`, {
              method: 'POST',
              headers: getHeaders(),
              body: JSON.stringify(newSettings)
          });
      } catch (e) {
          console.error("Erro ao salvar settings no servidor", e);
          setToast({msg: 'Erro ao salvar configurações.', type: 'error'});
      }
  };

  const handleWizardComplete = async (s: AppSettings) => {
      await persistSettings(s);
      setViewState('dashboard');
      fetchContacts(s.serverUrl);
  };

  const handleLogin = () => {
      setViewState('dashboard');
      fetchContacts(settings?.serverUrl);
  };

  // Carregar Contatos
  const fetchContacts = async (url = getServerUrl()) => {
      try {
          const res = await fetch(`${url}/contacts`, { headers: getHeaders() });
          if (res.ok) {
              setContacts(await res.json());
          }
      } catch (e) {}
  };

  // Salvar Contatos
  const persistContacts = async (newContacts: Contact[]) => {
      setContacts(newContacts);
      if (!settings) return;
      try {
          await fetch(`${settings.serverUrl}/contacts`, {
              method: 'POST',
              headers: getHeaders(),
              body: JSON.stringify(newContacts)
          });
      } catch (e) {
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

  // --- SYNC & AUTOMATION ---
  const arePhonesCompatible = (p1: string, p2: string) => {
      const c1 = p1.replace(/\D/g, '');
      const c2 = p2.replace(/\D/g, '');
      return c1.endsWith(c2) || c2.endsWith(c1);
  };

  const syncServer = async () => {
    if (!settings || viewState !== 'dashboard') return;
    try {
        const url = settings.serverUrl!;
        const headers = getHeaders();

        const stRes = await fetch(`${url}/status`, { headers });
        const stData = await stRes.json();
        setServerStatus(stData.isReady);
        setLastSync(new Date().toLocaleTimeString());

        if (stData.isReady) {
            const actRes = await fetch(`${url}/activity`, { headers });
            const actData = await actRes.json();
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
                        if (msgTime > (c.lastReplyTimestamp || 0)) {
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
                if (changed) persistContacts(next);
                return changed ? next : prev;
            });
        }
    } catch (e) { setServerStatus(false); }
  };

  useEffect(() => {
    if (viewState === 'dashboard') {
        const i = setInterval(syncServer, 5000);
        return () => clearInterval(i);
    }
  }, [viewState, settings]);

  // --- ACTIONS ---
  const handleSaveContact = async (data: Contact) => {
    if (processingReplyId && processingReplyId === data.id) {
        data.automationStage = AutomationStage.IDLE;
        data.lastContactDate = new Date().toISOString();
        data.hasUnreadReply = false;
        setProcessingReplyId(null);
    }
    const newList = contacts.some(c => c.id === data.id) ? contacts.map(c => c.id === data.id ? data : c) : [...contacts, data];
    await persistContacts(newList);
    setEditingContact(null);
    setToast({msg: 'Salvo!', type: 'success'});
  };

  const handleDelete = (id: string) => {
    setConfirmData({
        show: true, msg: 'Excluir contato?',
        action: () => {
            const newList = contacts.filter(c => c.id !== id);
            persistContacts(newList);
            setConfirmData({show: false, msg: '', action: () => {}});
            setToast({msg: 'Removido.', type: 'success'});
        }
    });
  };

  const handleKeepContact = (c: Contact) => {
      setProcessingReplyId(c.id);
      setEditingContact(c);
      setIsModalOpen(true);
      setConfirmData({show: false, msg: '', action: () => {}});
  };
  const handleFinalizeContact = (c: Contact) => handleDelete(c.id);
  
  const handleOpenWA = (phone: string) => {
      const p = phone.replace(/\D/g, '');
      window.open(`https://web.whatsapp.com/send?phone=${p}`, '_blank');
  };

  const sendManual = async (c: Contact) => {
      setSending(true);
      try {
          const res = await fetch(`${settings!.serverUrl}/send`, {
              method: 'POST', headers: getHeaders(), body: JSON.stringify({ phone: c.phone, message: genMsg })
          });
          const d = await res.json();
          if (d.success) {
              setToast({msg: 'Enviado!', type: 'success'});
              persistContacts(contacts.map(item => item.id === c.id ? {...item, lastContactDate: new Date().toISOString()} : item));
              setSelectedId(null);
          } else { setToast({msg: 'Erro ao enviar.', type: 'error'}); }
      } catch (e) { setToast({msg: 'Erro de conexão.', type: 'error'}); }
      setSending(false);
  };

  // --- AUTOMAÇÃO ---
  useEffect(() => {
    if (!autoPilot || !serverStatus || !settings || viewState !== 'dashboard') return;
    const runAuto = async () => {
        const now = Date.now();
        const list = contactsRef.current;
        const updates = new Map();
        for (const c of list) {
            if (c.autoPilotEnabled === false || c.hasUnreadReply) continue;
            let change = null;
            if (c.automationStage === AutomationStage.IDLE) {
                const last = new Date(c.lastContactDate).getTime();
                if ((now - last) / (86400000) >= c.followUpFrequencyDays) {
                    const msg = await generateFollowUpMessage(c, settings, false);
                    try {
                        await fetch(`${settings.serverUrl}/send`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ phone: c.phone, message: msg }) });
                        change = { automationStage: AutomationStage.WAITING_REPLY_1, lastAutomatedMsgDate: new Date().toISOString(), lastContactDate: new Date().toISOString() };
                        setLogs(l => [`✅ Enviado para ${c.name}`, ...l]);
                    } catch {}
                }
            }
            if (change) updates.set(c.id, change);
        }
        if (updates.size > 0) persistContacts(list.map(c => updates.has(c.id) ? { ...c, ...updates.get(c.id) } : c));
    };
    const i = setInterval(runAuto, 30000);
    runAuto();
    return () => clearInterval(i);
  }, [autoPilot, serverStatus, settings, viewState]);

  // --- RENDER VIEWS ---

  if (viewState === 'loading') {
      return <div className="min-h-screen flex items-center justify-center bg-gray-100"><div className="text-gray-500 animate-pulse">Carregando sistema...</div></div>;
  }

  if (viewState === 'wizard') {
      return <StrategyWizard onComplete={handleWizardComplete} />;
  }

  if (viewState === 'welcome') {
      return (
          <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4">
              <div className="bg-white/10 p-8 rounded-2xl backdrop-blur-md max-w-md w-full text-center border border-white/20 shadow-2xl animate-in zoom-in-95">
                  <div className="text-4xl mb-4">👋</div>
                  <h1 className="text-2xl font-bold mb-2">Olá, {settings?.agentName}</h1>
                  <p className="text-gray-300 mb-8">Bem-vindo de volta ao ImobiFlow.</p>
                  <button 
                    onClick={handleLogin}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-900/50"
                  >
                    Entrar no Sistema
                  </button>
                  <button 
                    onClick={() => setViewState('wizard')}
                    className="mt-4 text-xs text-gray-400 hover:text-white underline"
                  >
                    Não é você? Reconfigurar
                  </button>
              </div>
          </div>
      );
  }

  // DASHBOARD
  const unread = contacts.filter(c => c.hasUnreadReply);
  const filtered = contacts.filter(c => filterType === 'ALL' || c.type === filterType);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-100 font-sans text-gray-800">
        <aside className="bg-slate-900 text-white w-full md:w-64 p-6 flex flex-col shrink-0">
            <h1 className="text-xl font-bold flex items-center gap-2 mb-8">
                <span className="bg-blue-600 p-1 rounded"><Icons.Users /></span> ImobiFlow
            </h1>
            <div className="space-y-4">
                {/* Conexão */}
                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                    <div className="text-xs font-bold text-slate-500 uppercase mb-2">Conexão</div>
                    <div className="flex justify-between items-center mb-2">
                        <span>WhatsApp</span>
                        {serverStatus 
                            ? <span className="text-emerald-400 text-xs font-bold flex gap-1 items-center" title="Servidor conectado">● Online</span>
                            : <button onClick={() => setIsQRCodeOpen(true)} className="text-red-400 text-xs font-bold flex gap-1 items-center hover:underline" title="Reconectar">● Conectar</button>
                        }
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-slate-500 mt-2 pt-2 border-t border-slate-700">
                         <span>Sync: {lastSync}</span>
                         <button onClick={syncServer} title="Forçar sincronização com servidor"><Icons.Refresh /></button>
                    </div>
                </div>
                {/* Piloto */}
                <div className={`p-4 rounded-xl border transition-colors ${autoPilot ? 'bg-indigo-900/40 border-indigo-500' : 'bg-slate-800 border-slate-700'}`}>
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-slate-300 uppercase">Piloto Automático</span>
                        <button onClick={() => setAutoPilot(!autoPilot)} className={`w-10 h-5 rounded-full relative transition-colors ${autoPilot ? 'bg-indigo-500' : 'bg-slate-600'}`} title="Ligar/Desligar Automação">
                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${autoPilot ? 'left-6' : 'left-1'}`} />
                        </button>
                    </div>
                    {autoPilot && <div className="text-[10px] font-mono text-indigo-300 max-h-24 overflow-y-auto">{logs.map((l, i) => <div key={i}>{l}</div>)}</div>}
                </div>
            </div>
            <div className="mt-auto pt-4 flex flex-col gap-2">
                <button onClick={() => setIsSettingsOpen(true)} className="text-sm text-gray-300 hover:text-white flex items-center gap-2 bg-slate-800 p-2 rounded hover:bg-slate-700" title="Alterar Nome, Tom de Voz ou Frequências">⚙️ Ajustes Gerais</button>
                <button onClick={() => setViewState('wizard')} className="text-xs text-blue-400 hover:text-white" title="Apagar configurações e recomeçar do zero">Reconfigurar Zero</button>
            </div>
        </aside>

        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
            <header className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold">Contatos</h2>
                    <p className="text-sm text-gray-500">Olá, {settings?.agentName} da {settings?.agencyName}</p>
                </div>
                <button onClick={() => { setEditingContact(null); setIsModalOpen(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-blue-700 flex items-center gap-2" title="Adicionar novo cliente ou parceiro">
                    <Icons.Plus /> Novo
                </button>
            </header>

            {/* Filters */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                {['ALL', ...Object.values(ContactType)].map(t => (
                    <button key={t} onClick={() => setFilterType(t)} title={`Filtrar lista por ${t === 'ALL' ? 'todos' : t}`} className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap ${filterType === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>{t === 'ALL' ? 'Todos' : t}</button>
                ))}
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase"><tr><th className="p-4 w-12">Auto</th><th className="p-4">Nome</th><th className="p-4">Status</th><th className="p-4 text-right">Ações</th></tr></thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                        {filtered.map(c => {
                            const daysWait = c.automationStage !== AutomationStage.IDLE ? Math.floor((Date.now() - new Date(c.lastAutomatedMsgDate || c.lastContactDate).getTime()) / 86400000) : 0;
                            return (
                            <React.Fragment key={c.id}>
                                <tr className={`hover:bg-gray-50 ${c.hasUnreadReply ? 'bg-yellow-50' : ''}`}>
                                    <td className="p-4 text-center"><button onClick={() => handleSaveContact({...c, autoPilotEnabled: !c.autoPilotEnabled})} className={`w-8 h-8 rounded-full flex items-center justify-center ${c.autoPilotEnabled !== false ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`} title={c.autoPilotEnabled !== false ? "Pausar automação para este contato" : "Ativar automação para este contato"}>{c.autoPilotEnabled !== false ? <Icons.Pause /> : <Icons.Play />}</button></td>
                                    <td className="p-4"><div className="font-bold">{c.name}</div><div className="text-xs text-gray-500">{c.type}</div>{c.hasUnreadReply && <div className="text-[10px] font-bold text-yellow-600 mt-1">🔔 Nova Resposta</div>}</td>
                                    <td className="p-4">{c.automationStage === AutomationStage.IDLE ? <span className="px-2 py-1 bg-gray-100 rounded text-xs" title="Aguardando data do próximo follow-up">Pendente</span> : <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs" title={`Mensagem enviada há ${daysWait} dias. Aguardando retorno.`}>Aguardando ({daysWait}d)</span>}</td>
                                    <td className="p-4 text-right flex justify-end gap-2">
                                        <button onClick={() => { setSelectedId(c.id); setGenMsg('Gerando...'); generateFollowUpMessage(c, settings!, false).then(setGenMsg); }} className="p-2 bg-blue-50 text-blue-600 rounded" title="Gerar e enviar mensagem manualmente"><Icons.Message /></button>
                                        <button onClick={() => { setEditingContact(c); setIsModalOpen(true); }} className="p-2 bg-gray-50 text-gray-600 rounded" title="Editar dados e notas"><Icons.Users /></button>
                                        <button onClick={() => handleDelete(c.id)} className="p-2 bg-red-50 text-red-600 rounded" title="Excluir contato permanentemente"><Icons.Trash /></button>
                                    </td>
                                </tr>
                                {selectedId === c.id && (
                                    <tr className="bg-blue-50/50"><td colSpan={4} className="p-4"><div className="bg-white border rounded p-4 shadow-sm max-w-2xl mx-auto"><div className="text-xs font-bold text-gray-500 mb-2">Prévia:</div><textarea className="w-full border rounded p-2 text-sm mb-2" rows={3} value={genMsg} onChange={e => setGenMsg(e.target.value)} /><div className="flex justify-end gap-2"><button onClick={() => setSelectedId(null)} className="px-3 py-1 text-sm bg-gray-200 rounded" title="Cancelar envio">Cancelar</button><button onClick={() => sendManual(c)} disabled={sending} className="px-3 py-1 text-sm bg-blue-600 text-white rounded font-bold" title="Confirmar envio da mensagem">{sending ? '...' : 'Enviar'}</button></div></div></td></tr>
                                )}
                            </React.Fragment>
                        );})}
                    </tbody>
                </table>
            </div>

            {/* Inbox Button */}
            {unread.length > 0 && <button onClick={() => setIsInboxOpen(true)} className="fixed bottom-6 right-6 bg-red-600 text-white p-4 rounded-full shadow-xl animate-bounce z-50 flex items-center justify-center" title="Ver mensagens não lidas"><Icons.Message /><span className="absolute -top-1 -right-1 bg-white text-red-600 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center border border-red-200">{unread.length}</span></button>}

            {/* Modals */}
            <ContactModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveContact} initialContact={editingContact} settings={settings} />
            <QRCodeModal isOpen={isQRCodeOpen} onClose={() => setIsQRCodeOpen(false)} onConnected={() => { setServerStatus(true); setIsQRCodeOpen(false); }} serverUrl={settings?.serverUrl} onUrlChange={(u) => persistSettings({...settings!, serverUrl: u})} />
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={settings!} onSave={persistSettings} />
            
            {/* Inbox Modal */}
            {isInboxOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl"><h3 className="font-bold">Notificações ({unread.length})</h3><button onClick={() => setIsInboxOpen(false)} title="Fechar janela">✕</button></div>
                        <div className="p-4 overflow-y-auto space-y-3">
                            {unread.map(c => (
                                <div key={c.id} className="border rounded-lg p-3 bg-yellow-50 border-yellow-200">
                                    <div className="font-bold flex justify-between">{c.name} <span className="text-[10px] font-normal text-gray-500">Recente</span></div>
                                    <div className="text-sm my-2 italic text-gray-700">"Nova mensagem recebida."</div>
                                    <div className="flex gap-2 mt-2">
                                        <button onClick={() => handleOpenWA(c.phone)} className="flex-1 bg-green-600 text-white py-1 rounded text-xs font-bold" title="Abrir conversa no WhatsApp Web/App">Abrir Chat</button>
                                        <button onClick={() => { setIsInboxOpen(false); handleKeepContact(c); }} className="flex-1 bg-blue-600 text-white py-1 rounded text-xs font-bold" title="Atualizar informações e manter na lista">Atualizar</button>
                                        <button onClick={() => { setIsInboxOpen(false); handleFinalizeContact(c); }} className="flex-1 bg-gray-200 text-gray-700 py-1 rounded text-xs font-bold" title="Finalizar e remover contato">Finalizar</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm Modal */}
            {confirmData.show && <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"><div className="bg-white rounded-lg p-6 shadow-xl max-w-xs w-full text-center"><p className="font-bold mb-4">{confirmData.msg}</p><div className="flex gap-2 justify-center"><button onClick={() => setConfirmData({show: false, msg: '', action: () => {}})} className="px-4 py-2 bg-gray-200 rounded">Cancelar</button><button onClick={confirmData.action} className="px-4 py-2 bg-red-600 text-white rounded font-bold">Confirmar</button></div></div></div>}
            {toast && <div className={`fixed top-4 right-4 z-[70] px-4 py-2 rounded shadow-lg text-white font-bold ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>{toast.msg}</div>}
        </main>
    </div>
  );
};

export default App;
