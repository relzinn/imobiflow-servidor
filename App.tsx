
import React, { useState, useEffect, useRef } from 'react';
import { StrategyWizard } from './components/StrategyWizard';
import { ContactModal } from './components/ContactModal';
import { QRCodeModal } from './components/QRCodeModal';
import { Icons } from './constants';
import { AppSettings, Contact, ContactType, AutomationStage, ChatMessage } from './types';
import { generateFollowUpMessage } from './services/geminiService';

// --- HELPERS ---
const generateId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`;

// --- COMPONENTE INTERNO: MODAL IMPORTAÇÃO ---
const ImportModal: React.FC<{ isOpen: boolean, onClose: () => void, serverUrl: string, existingContacts: Contact[], onImport: (newContacts: Contact[]) => void, settings: AppSettings }> = ({ isOpen, onClose, serverUrl, existingContacts, onImport, settings }) => {
    const [waContacts, setWaContacts] = useState<{name: string, phone: string}[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [targetType, setTargetType] = useState<ContactType>(ContactType.CLIENT);

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            fetch(`${serverUrl}/whatsapp-contacts`, { headers: {'ngrok-skip-browser-warning': 'true'} })
                .then(res => res.json())
                .then(data => {
                    const existingPhones = new Set(existingContacts.map(c => c.phone.replace(/\D/g, '').slice(-8)));
                    const available = data.filter((c: any) => !existingPhones.has(c.phone.replace(/\D/g, '').slice(-8)));
                    setWaContacts(available);
                })
                .catch(() => alert('Erro ao buscar contatos. WhatsApp conectado?'))
                .finally(() => setLoading(false));
        }
    }, [isOpen]);

    const handleToggle = (phone: string) => {
        const next = new Set(selected);
        if (next.has(phone)) next.delete(phone);
        else next.add(phone);
        setSelected(next);
    };

    const handleExecuteImport = () => {
        const toImport = waContacts.filter(c => selected.has(c.phone));
        
        let freq = 30;
        if (targetType === ContactType.OWNER) freq = settings.defaultFrequencyOwner;
        else if (targetType === ContactType.BUILDER) freq = settings.defaultFrequencyBuilder;
        else freq = settings.defaultFrequencyClient;

        const newContacts: Contact[] = toImport.map(c => ({
            id: generateId(),
            name: c.name,
            phone: c.phone.startsWith('55') ? c.phone : '55' + c.phone,
            type: targetType,
            notes: 'Importado do WhatsApp',
            lastContactDate: new Date().toISOString().split('T')[0],
            followUpFrequencyDays: freq,
            automationStage: AutomationStage.IDLE,
            autoPilotEnabled: true,
            hasUnreadReply: false
        }));

        onImport(newContacts);
        onClose();
    };

    if (!isOpen) return null;

    const filtered = waContacts.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="fixed inset-0 bg-black/60 z-[90] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg h-[600px] flex flex-col animate-in zoom-in-95">
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="font-bold">Importar do WhatsApp</h3>
                    <button onClick={onClose}>✕</button>
                </div>
                
                <div className="p-4 border-b bg-gray-50 space-y-3">
                    <input 
                        className="w-full border rounded p-2" 
                        placeholder="Buscar por nome..." 
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
                    />
                    <div className="flex items-center gap-2">
                         <span className="text-sm font-bold text-gray-500">Importar como:</span>
                         <select className="border rounded p-1 text-sm flex-1" value={targetType} onChange={e => setTargetType(e.target.value as ContactType)}>
                            {Object.values(ContactType).map(t => <option key={t} value={t}>{t}</option>)}
                         </select>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {loading ? <div className="text-center p-10">Carregando conversas do celular...</div> : (
                        <div className="space-y-1">
                            {filtered.map(c => (
                                <div key={c.phone} className={`flex items-center p-2 rounded cursor-pointer hover:bg-gray-100 ${selected.has(c.phone) ? 'bg-blue-50 border-blue-200 border' : ''}`} onClick={() => handleToggle(c.phone)}>
                                    <input type="checkbox" checked={selected.has(c.phone)} readOnly className="mr-3 h-4 w-4" />
                                    <div>
                                        <div className="font-bold text-sm">{c.name}</div>
                                        <div className="text-xs text-gray-500">{c.phone}</div>
                                    </div>
                                </div>
                            ))}
                            {filtered.length === 0 && <div className="text-center p-4 text-gray-500">Nenhuma conversa nova encontrada.</div>}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t flex justify-between items-center bg-gray-50">
                    <div className="text-sm text-gray-600">{selected.size} selecionados</div>
                    <button onClick={handleExecuteImport} disabled={selected.size === 0} className="bg-blue-600 text-white px-6 py-2 rounded font-bold disabled:opacity-50">Confirmar Importação</button>
                </div>
            </div>
        </div>
    );
};

// --- COMPONENTE INTERNO: MODAL DE CHAT ---
const ChatModal: React.FC<{ contact: Contact | null, onClose: () => void, serverUrl: string }> = ({ contact, onClose, serverUrl }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const fetchHistory = async () => {
        if (!contact) return;
        try {
            const res = await fetch(`${serverUrl}/chat/${contact.phone}`, { headers: {'ngrok-skip-browser-warning': 'true'} });
            const data = await res.json();
            setMessages(data);
        } catch (e) {}
    };

    useEffect(() => {
        if (contact) {
            fetchHistory();
            const i = setInterval(fetchHistory, 3000); // Polling chat
            return () => clearInterval(i);
        }
    }, [contact]);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages]);

    const handleSend = async () => {
        if (!newMessage.trim() || !contact) return;
        setLoading(true);
        try {
            await fetch(`${serverUrl}/send`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'},
                body: JSON.stringify({ phone: contact.phone, message: newMessage })
            });
            setNewMessage('');
            fetchHistory();
        } catch (e) {}
        setLoading(false);
    };

    if (!contact) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-[90] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl h-[600px] flex flex-col overflow-hidden animate-in zoom-in-95">
                {/* Header */}
                <div className="bg-slate-100 p-4 border-b flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-300 rounded-full flex items-center justify-center font-bold text-slate-600">{contact.name.substring(0,2)}</div>
                        <div>
                            <h3 className="font-bold">{contact.name}</h3>
                            <p className="text-xs text-gray-500">{contact.phone}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full">✕</button>
                </div>

                {/* Messages */}
                <div className="flex-1 bg-[#e5ded8] p-4 overflow-y-auto" ref={scrollRef}>
                    <div className="space-y-2">
                        {messages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.fromMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[70%] p-2 rounded-lg shadow text-sm ${msg.fromMe ? 'bg-[#d9fdd3] rounded-tr-none' : 'bg-white rounded-tl-none'}`}>
                                    <div className="whitespace-pre-wrap">{msg.body}</div>
                                    <div className="text-[10px] text-gray-500 text-right mt-1">
                                        {new Date(msg.timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {messages.length === 0 && <div className="text-center text-gray-500 text-sm mt-10">Nenhuma mensagem recente encontrada.</div>}
                    </div>
                </div>

                {/* Input */}
                <div className="p-3 bg-slate-50 border-t flex gap-2">
                    <input 
                        className="flex-1 border rounded-full px-4 py-2 focus:outline-none focus:border-blue-500"
                        placeholder="Digite sua mensagem..."
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                    />
                    <button 
                        onClick={handleSend} 
                        disabled={loading}
                        className="bg-green-600 text-white rounded-full p-3 hover:bg-green-700 disabled:opacity-50"
                    >
                        <Icons.Play /> {/* Seta de envio */}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- SETTINGS MODAL ---
const SettingsModal: React.FC<{ isOpen: boolean, onClose: () => void, settings: AppSettings, onSave: (s: AppSettings) => void }> = ({ isOpen, onClose, settings, onSave }) => {
    const [localSettings, setLocalSettings] = useState(settings);
    useEffect(() => { setLocalSettings(settings); }, [settings, isOpen]);
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                <h2 className="text-xl font-bold mb-4">Ajustes Gerais</h2>
                <div className="space-y-4">
                    <div><label className="text-xs font-bold text-gray-500 uppercase">Seu Nome</label><input className="w-full border p-2 rounded" value={localSettings.agentName} onChange={e => setLocalSettings({...localSettings, agentName: e.target.value})} /></div>
                    <div><label className="text-xs font-bold text-gray-500 uppercase">Imobiliária</label><input className="w-full border p-2 rounded" value={localSettings.agencyName} onChange={e => setLocalSettings({...localSettings, agencyName: e.target.value})} /></div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Tom de Voz</label>
                        <select className="w-full border p-2 rounded" value={localSettings.messageTone} onChange={e => setLocalSettings({...localSettings, messageTone: e.target.value as any})}>
                            <option value="Casual">Casual</option><option value="Formal">Formal</option><option value="Amigável">Amigável</option><option value="Persuasivo">Persuasivo</option>
                            <option value="Consultivo">Consultivo</option><option value="Elegante">Elegante</option><option value="Urgente">Urgente</option><option value="Entusiasta">Entusiasta</option>
                        </select>
                    </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded">Cancelar</button>
                    <button onClick={() => { onSave(localSettings); onClose(); }} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">Salvar</button>
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [isQRCodeOpen, setIsQRCodeOpen] = useState(false);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [chatContact, setChatContact] = useState<Contact | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Estados UI
  const [filterType, setFilterType] = useState<string>('ALL');
  const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const [confirmData, setConfirmData] = useState<{show: boolean, msg: string, action: () => void}>({show: false, msg: '', action: () => {}});

  // Estados Servidor
  const [serverStatus, setServerStatus] = useState(false);
  const [lastSync, setLastSync] = useState('-');
  const [genMsg, setGenMsg] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [processingReplyId, setProcessingReplyId] = useState<string | null>(null);

  const getServerUrl = () => (localStorage.getItem('imobiflow_server_url') || 'https://ameer-uncondensational-lemuel.ngrok-free.dev').replace(/\/$/, '');
  const getHeaders = () => ({ 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' });

  // Init
  useEffect(() => {
      const loadSettings = async () => {
          try {
              const url = getServerUrl();
              const res = await fetch(`${url}/settings`, { headers: getHeaders() });
              if (res.ok) {
                  const data = await res.json();
                  setSettings({...data, serverUrl: url});
                  setViewState('welcome');
              } else { setViewState('wizard'); }
          } catch (e) { setViewState('wizard'); }
      };
      loadSettings();
  }, []);

  const persistSettings = async (newSettings: AppSettings) => {
      setSettings(newSettings);
      if (newSettings.serverUrl) localStorage.setItem('imobiflow_server_url', newSettings.serverUrl);
      try { await fetch(`${newSettings.serverUrl}/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(newSettings) }); } catch (e) {}
  };

  const handleWizardComplete = async (s: AppSettings) => { await persistSettings(s); setViewState('dashboard'); fetchContacts(s.serverUrl); };
  const handleLogin = () => { setViewState('dashboard'); fetchContacts(settings?.serverUrl); };

  const fetchContacts = async (url = getServerUrl()) => {
      try {
          const res = await fetch(`${url}/contacts`, { headers: getHeaders() });
          if (res.ok) setContacts(await res.json());
      } catch (e) {}
  };

  const persistContacts = async (newContacts: Contact[]) => {
      setContacts(newContacts);
      try { await fetch(`${settings!.serverUrl}/contacts`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(newContacts) }); } catch (e) {}
  };

  // Toast
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  // Sync e Automação Control
  const toggleAutomation = async () => {
      if (!settings) return;
      const newState = !settings.automationActive;
      try {
          await fetch(`${settings.serverUrl}/toggle-automation`, { 
              method: 'POST', headers: getHeaders(), 
              body: JSON.stringify({ active: newState }) 
          });
          setSettings({...settings, automationActive: newState});
          setToast({msg: newState ? 'Automação Ativada (Server)' : 'Automação Pausada', type: 'success'});
      } catch (e) {
          setToast({msg: 'Erro ao comunicar servidor', type: 'error'});
      }
  };

  const syncServer = async () => {
    if (!settings || viewState !== 'dashboard') return;
    try {
        const url = settings.serverUrl!;
        const stRes = await fetch(`${url}/status`, { headers: getHeaders() });
        const stData = await stRes.json();
        setServerStatus(stData.isReady);
        setLastSync(new Date().toLocaleTimeString());

        // Atualiza settings remotos
        const setRes = await fetch(`${url}/settings`, { headers: getHeaders() });
        if(setRes.ok) {
            const remoteSettings = await setRes.json();
            if (remoteSettings.automationActive !== settings.automationActive) {
                setSettings(prev => ({...prev!, automationActive: remoteSettings.automationActive}));
            }
        }
        
        if (stData.isReady) {
            fetchContacts(url);
        }
    } catch (e) { setServerStatus(false); }
  };

  useEffect(() => {
    if (viewState === 'dashboard') {
        const i = setInterval(syncServer, 5000);
        return () => clearInterval(i);
    }
  }, [viewState, settings]);

  // Ações
  const handleSaveContact = async (data: Contact) => {
    const newList = contacts.some(c => c.id === data.id) ? contacts.map(c => c.id === data.id ? data : c) : [...contacts, data];
    await persistContacts(newList);
    setEditingContact(null);
  };
  
  const handleDelete = (id: string) => {
    setConfirmData({show: true, msg: 'Deseja finalizar o atendimento e excluir este contato?', action: () => {
        persistContacts(contacts.filter(c => c.id !== id));
        setConfirmData({show:false, msg:'', action:()=>{}});
    }});
  };

  const handleMarkAsRead = async (c: Contact) => {
      if (c.hasUnreadReply) {
          await handleSaveContact({...c, hasUnreadReply: false});
      }
  };

  const handleOpenChat = async (c: Contact) => {
      await handleMarkAsRead(c); // Limpa notificação ao abrir chat
      setChatContact(c);
  };
  
  const handleForceTest = async (c: Contact) => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - (c.followUpFrequencyDays + 2)); 
      const updated = {...c, lastContactDate: pastDate.toISOString().split('T')[0]};
      
      const newList = contacts.map(x => x.id === c.id ? updated : x);
      await persistContacts(newList);
      
      await fetch(`${settings!.serverUrl}/toggle-automation`, { 
              method: 'POST', headers: getHeaders(), 
              body: JSON.stringify({ active: true }) 
      });
      setToast({msg: 'Teste Disparado! Verifique logs do servidor.', type: 'success'});
  };

  const handleKeepContact = (c: Contact) => { 
      // Abre modal mas não limpa flag ainda, será limpo no onSave
      setProcessingReplyId(c.id); 
      setEditingContact(c); 
      setIsModalOpen(true); 
  };
  
  const handleFinalizeContact = (c: Contact) => handleDelete(c.id);

  const handleImportContacts = async (newContacts: Contact[]) => {
      const merged = [...contacts, ...newContacts];
      await persistContacts(merged);
      setToast({msg: `${newContacts.length} contatos importados!`, type: 'success'});
  };

  const sendManual = async (c: Contact) => {
      setSending(true);
      try {
          await fetch(`${settings!.serverUrl}/send`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ phone: c.phone, message: genMsg }) });
          setToast({msg: 'Enviado!', type: 'success'});
          setSelectedId(null);
          fetchContacts();
      } catch (e) { setToast({msg: 'Erro', type: 'error'}); }
      setSending(false);
  };

  if (viewState === 'loading') return <div>Carregando...</div>;
  if (viewState === 'wizard') return <StrategyWizard onComplete={handleWizardComplete} />;
  if (viewState === 'welcome') return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
          <div className="bg-white/10 p-8 rounded-xl text-center">
              <h1 className="text-2xl font-bold mb-4">Olá, {settings?.agentName}</h1>
              <button onClick={handleLogin} className="bg-blue-600 px-6 py-3 rounded font-bold">Entrar</button>
              <button onClick={() => setViewState('wizard')} className="block mt-4 text-xs text-gray-400 mx-auto">Reconfigurar</button>
          </div>
      </div>
  );

  const unread = contacts.filter(c => c.hasUnreadReply);
  const filtered = contacts.filter(c => filterType === 'ALL' || c.type === filterType);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-100 font-sans text-gray-800">
        <aside className="bg-slate-900 text-white w-full md:w-64 p-6 flex flex-col shrink-0">
            <h1 className="text-xl font-bold mb-8">ImobiFlow</h1>
            <div className="space-y-4">
                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                    <div className="text-xs font-bold text-slate-500 uppercase mb-2">Status do Servidor</div>
                    <div className="flex justify-between items-center">
                        <span>WhatsApp</span>
                        {serverStatus ? <span className="text-green-400 text-xs">● Online</span> : <button onClick={() => setIsQRCodeOpen(true)} className="text-red-400 text-xs">● Conectar</button>}
                    </div>
                </div>
                <div className={`p-4 rounded-xl border ${settings?.automationActive ? 'bg-indigo-900/40 border-indigo-500' : 'bg-slate-800 border-slate-700'}`}>
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-300 uppercase">Automação</span>
                        <button title={settings?.automationActive ? "Desligar Automação" : "Ligar Automação"} onClick={toggleAutomation} className={`w-10 h-5 rounded-full relative ${settings?.automationActive ? 'bg-indigo-500' : 'bg-slate-600'}`}>
                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${settings?.automationActive ? 'left-6' : 'left-1'}`} />
                        </button>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">O servidor gerencia os disparos automaticamente mesmo com site fechado.</p>
                </div>
            </div>
            <div className="mt-auto flex flex-col gap-2">
                <button onClick={() => setIsSettingsOpen(true)} className="text-sm bg-slate-800 p-2 rounded" title="Alterar tom de voz e dados">⚙️ Ajustes</button>
                <button onClick={syncServer} className="text-xs text-center text-gray-500" title="Forçar sincronização">Sync: {lastSync}</button>
            </div>
        </aside>

        <main className="flex-1 p-8 overflow-y-auto">
            <header className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Contatos</h2>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setIsImportOpen(true)}
                        className="bg-white text-gray-700 border hover:bg-gray-50 px-4 py-2.5 rounded-full font-bold shadow-sm flex items-center gap-2 transition-all" 
                        title="Importar contatos salvos no WhatsApp"
                    >
                        <Icons.CloudDownload />
                        <span>Importar</span>
                    </button>
                    <button 
                        onClick={() => { setEditingContact(null); setIsModalOpen(true); }} 
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 py-2.5 rounded-full font-bold shadow-lg shadow-blue-500/30 flex items-center gap-2 transition-all hover:scale-105 active:scale-95" 
                        title="Adicionar novo contato para follow-up"
                    >
                        <Icons.Plus /> 
                        <span>Novo Contato</span>
                    </button>
                </div>
            </header>

            <div className="flex gap-2 mb-4">
                {['ALL', ...Object.values(ContactType)].map(t => (
                    <button key={t} onClick={() => setFilterType(t)} className={`px-4 py-1 rounded-full text-sm font-bold ${filterType === t ? 'bg-blue-600 text-white' : 'bg-white border'}`} title={`Filtrar por ${t}`}>{t === 'ALL' ? 'Todos' : t}</button>
                ))}
            </div>

            <div className="bg-white rounded-xl shadow border overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="p-4">Auto</th><th className="p-4">Nome</th><th className="p-4">Status</th><th className="p-4 text-right">Ações</th></tr></thead>
                    <tbody className="divide-y text-sm">
                        {filtered.map(c => {
                             const lastDate = new Date(c.lastContactDate || Date.now());
                             const daysWait = Math.ceil((Date.now() - lastDate.getTime())/(1000*60*60*24));
                             
                             return (
                            <React.Fragment key={c.id}>
                                <tr className={`hover:bg-gray-50 ${c.hasUnreadReply ? 'bg-yellow-50' : ''}`}>
                                    <td className="p-4"><button onClick={() => handleSaveContact({...c, autoPilotEnabled: !c.autoPilotEnabled})} title={c.autoPilotEnabled!==false?"Pausar Automação para este contato":"Ativar Automação"} className={`w-8 h-8 rounded-full flex items-center justify-center ${c.autoPilotEnabled!==false?'bg-green-100 text-green-600':'bg-gray-100 text-gray-400'}`}>{c.autoPilotEnabled!==false?<Icons.Pause/>:<Icons.Play/>}</button></td>
                                    <td className="p-4 font-bold">{c.name}<div className="text-xs font-normal text-gray-500">{c.type}</div>{c.hasUnreadReply && <div className="text-xs text-yellow-600 font-bold animate-pulse">🔔 Nova Mensagem</div>}</td>
                                    <td className="p-4">
                                        {c.automationStage === AutomationStage.IDLE 
                                            ? <span className="text-gray-500" title="Aguardando data do próximo ciclo">Pendente ({daysWait}d)</span> 
                                            : <span className="text-blue-600 font-bold" title="Mensagem enviada, aguardando resposta">Aguardando ({daysWait}d)</span>
                                        }
                                    </td>
                                    <td className="p-4 text-right flex justify-end gap-2">
                                        <button onClick={() => handleForceTest(c)} className="p-2 bg-yellow-50 text-yellow-600 rounded" title="⚡ TESTE: Forçar Vencimento Agora"><Icons.Flash /></button>
                                        <button onClick={() => handleOpenChat(c)} className="p-2 bg-green-50 text-green-600 rounded" title="Abrir Chat Ao Vivo (Marca como lida)"><Icons.WhatsApp /></button>
                                        <button onClick={() => { setSelectedId(c.id); generateFollowUpMessage(c, settings!, false).then(setGenMsg); }} className="p-2 bg-blue-50 text-blue-600 rounded" title="Gerar Mensagem de Follow-up"><Icons.Message /></button>
                                        <button onClick={() => { setEditingContact(c); setIsModalOpen(true); }} className="p-2 bg-gray-50 text-gray-600 rounded" title="Editar Contato"><Icons.Users /></button>
                                        <button onClick={() => handleDelete(c.id)} className="p-2 bg-red-50 text-red-600 rounded" title="Excluir Contato"><Icons.Trash /></button>
                                    </td>
                                </tr>
                                {selectedId === c.id && (
                                    <tr className="bg-blue-50/50"><td colSpan={4} className="p-4"><div className="bg-white border p-4 rounded shadow-sm max-w-2xl mx-auto"><textarea className="w-full border rounded p-2 mb-2" rows={3} value={genMsg} onChange={e => setGenMsg(e.target.value)} /><div className="flex justify-end gap-2"><button onClick={() => setSelectedId(null)} className="px-3 py-1 bg-gray-200 rounded" title="Cancelar envio">Cancelar</button><button onClick={() => sendManual(c)} disabled={sending} className="px-3 py-1 bg-blue-600 text-white rounded font-bold" title="Confirmar envio">Enviar</button></div></div></td></tr>
                                )}
                            </React.Fragment>
                        );})}
                    </tbody>
                </table>
            </div>

            {unread.length > 0 && <button onClick={() => setIsInboxOpen(true)} className="fixed bottom-6 right-6 bg-red-600 text-white p-4 rounded-full shadow-xl animate-bounce z-50" title="Ver mensagens não lidas"><Icons.Message /> <span className="absolute -top-1 -right-1 bg-white text-red-600 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border">{unread.length}</span></button>}

            <ContactModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                onSave={handleSaveContact} 
                initialContact={editingContact} 
                settings={settings} 
                defaultType={filterType !== 'ALL' ? (filterType as ContactType) : ContactType.CLIENT}
            />
            <ImportModal
                isOpen={isImportOpen}
                onClose={() => setIsImportOpen(false)}
                serverUrl={settings?.serverUrl || ''}
                existingContacts={contacts}
                onImport={handleImportContacts}
                settings={settings!}
            />
            <QRCodeModal isOpen={isQRCodeOpen} onClose={() => setIsQRCodeOpen(false)} onConnected={() => { setServerStatus(true); setIsQRCodeOpen(false); }} serverUrl={settings?.serverUrl} onUrlChange={(u) => persistSettings({...settings!, serverUrl: u})} />
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={settings!} onSave={persistSettings} />
            
            {/* INBOX MODAL */}
            {isInboxOpen && (
                <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col animate-in zoom-in-95">
                        <div className="p-4 border-b flex justify-between"><h3 className="font-bold">Inbox ({unread.length})</h3><button onClick={() => setIsInboxOpen(false)}>✕</button></div>
                        <div className="p-4 overflow-y-auto space-y-3">
                            {unread.map(c => (
                                <div key={c.id} className="border p-3 bg-yellow-50 rounded-lg">
                                    <div className="font-bold">{c.name}</div>
                                    <div className="text-sm my-2 italic text-gray-700">"{c.lastReplyContent || 'Nova mensagem'}"</div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleOpenChat(c)} className="flex-1 bg-green-600 text-white py-1 rounded text-xs font-bold" title="Abrir conversa e marcar como lida">Chat</button>
                                        <button onClick={() => { setIsInboxOpen(false); handleKeepContact(c); }} className="flex-1 bg-blue-600 text-white py-1 rounded text-xs font-bold" title="Atualizar dados do contato e manter na lista">Atualizar</button>
                                        <button onClick={() => { setIsInboxOpen(false); handleFinalizeContact(c); }} className="flex-1 bg-red-600 text-white py-1 rounded text-xs font-bold" title="Finalizar atendimento e excluir contato">Finalizar</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            
            {/* CHAT MODAL */}
            {chatContact && <ChatModal contact={chatContact} onClose={() => setChatContact(null)} serverUrl={settings?.serverUrl || ''} />}
            
            {/* CONFIRM */}
            {confirmData.show && <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center"><div className="bg-white p-6 rounded shadow-xl text-center"><p className="mb-4 font-bold">{confirmData.msg}</p><div className="flex gap-2 justify-center"><button onClick={() => setConfirmData({show:false, msg:'', action:()=>{}})} className="px-4 py-2 bg-gray-200 rounded">Cancelar</button><button onClick={confirmData.action} className="px-4 py-2 bg-red-600 text-white rounded font-bold">Sim</button></div></div></div>}
            {toast && <div className={`fixed top-4 right-4 z-[80] px-4 py-2 rounded text-white font-bold ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>{toast.msg}</div>}
        </main>
    </div>
  );
};

export default App;
