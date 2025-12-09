
import React, { useState, useEffect, useRef } from 'react';
import { StrategyWizard } from './components/StrategyWizard';
import { ContactModal } from './components/ContactModal';
import { QRCodeModal } from './components/QRCodeModal';
import { Icons } from './constants';
import { AppSettings, Contact, ContactType, AutomationStage, ChatMessage } from './types';
import { generateFollowUpMessage } from './services/geminiService';

const generateId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`;

// --- HELPERS ---
const getInitials = (name: string) => {
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const getColorFromInitial = (char: string) => {
    const colors = ['bg-red-100 text-red-700', 'bg-blue-100 text-blue-700', 'bg-green-100 text-green-700', 'bg-purple-100 text-purple-700', 'bg-yellow-100 text-yellow-700', 'bg-indigo-100 text-indigo-700', 'bg-pink-100 text-pink-700', 'bg-teal-100 text-teal-700'];
    const index = char.charCodeAt(0) % colors.length;
    return colors[index];
};

// --- COMPONENTS ---

const LoginScreen: React.FC<{ onLogin: (pass: string) => void, error: string }> = ({ onLogin, error }) => {
    const [pass, setPass] = useState('');
    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm animate-in fade-in zoom-in-95 duration-500">
                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-800">ImobiFlow</h1>
                    <p className="text-gray-500 text-sm">Acesso Restrito</p>
                </div>
                <form onSubmit={e => { e.preventDefault(); onLogin(pass); }}>
                    <div className="mb-4">
                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Senha</label>
                        <input type="password" autoFocus className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" value={pass} onChange={e => setPass(e.target.value)} placeholder="Sua senha..." />
                    </div>
                    {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs rounded border border-red-200">{error}</div>}
                    <button type="submit" className="w-full bg-slate-900 text-white p-3 rounded-lg font-bold hover:bg-black transition-colors">Entrar</button>
                </form>
            </div>
        </div>
    );
};

const ImportModal: React.FC<{ isOpen: boolean, onClose: () => void, serverUrl: string, existingContacts: Contact[], onImport: (newContacts: Contact[]) => void, settings: AppSettings, apiHeaders: any }> = ({ isOpen, onClose, serverUrl, existingContacts, onImport, settings, apiHeaders }) => {
    const [waContacts, setWaContacts] = useState<{name: string, phone: string, timestamp?: number}[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [targetType, setTargetType] = useState<ContactType>(ContactType.CLIENT);

    const [reviewQueue, setReviewQueue] = useState<{name: string, phone: string, timestamp?: number}[]>([]);
    const [reviewedContacts, setReviewedContacts] = useState<any[]>([]);
    const [isReviewing, setIsReviewing] = useState(false);
    const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
    
    const [reviewName, setReviewName] = useState('');
    const [reviewNotes, setReviewNotes] = useState('');
    const [reviewType, setReviewType] = useState<ContactType>(ContactType.CLIENT);
    const [reviewTone, setReviewTone] = useState('');
    
    const toneOptions = ['Casual', 'Formal', 'Persuasivo', 'Amigável', 'Consultivo', 'Urgente', 'Entusiasta', 'Elegante'];

    useEffect(() => {
        if (isOpen) {
            setSelected(new Set());
            setLoading(true);
            setSearchTerm('');
            setIsReviewing(false);
            setReviewQueue([]);
            setReviewedContacts([]);
            fetch(`${serverUrl}/whatsapp-contacts`, { headers: apiHeaders })
                .then(res => res.json())
                .then(data => {
                    const existingPhones = new Set(existingContacts.map(c => c.phone.replace(/\D/g, '').slice(-8)));
                    const available = data.filter((c: any) => !existingPhones.has(c.phone.replace(/\D/g, '').slice(-8)));
                    setWaContacts(available);
                })
                .catch(() => alert('Erro ao buscar. WhatsApp conectado?'))
                .finally(() => setLoading(false));
        }
    }, [isOpen]);

    const handleToggle = (phone: string) => {
        const next = new Set(selected);
        if (next.has(phone)) next.delete(phone);
        else next.add(phone);
        setSelected(next);
    };

    const handleStartImport = () => {
        const selectedList = waContacts.filter(c => selected.has(c.phone));
        if (selectedList.length === 0) return;
        setReviewedContacts([]); 
        setReviewQueue(selectedList);
        setIsReviewing(true);
        setCurrentReviewIndex(0);
        setReviewName(selectedList[0].name || '');
        setReviewNotes('');
        setReviewType(targetType); 
        setReviewTone('');
    };

    const handleNextReview = () => {
        if (!reviewName.trim()) { alert("Nome obrigatório"); return; }
        const current = reviewQueue[currentReviewIndex];
        const updated = { ...current, name: reviewName, customNotes: reviewNotes, type: reviewType, messageTone: reviewTone || undefined };
        const newList = [...reviewedContacts, updated];
        setReviewedContacts(newList);

        if (currentReviewIndex < reviewQueue.length - 1) {
            const nextIndex = currentReviewIndex + 1;
            setCurrentReviewIndex(nextIndex);
            setReviewName(reviewQueue[nextIndex].name || '');
            setReviewNotes('');
            setReviewType(targetType); 
            setReviewTone('');
        } else {
            finalizeImport(newList);
        }
    };

    const finalizeImport = (finalList: any[]) => {
        const newContacts: Contact[] = finalList.map(c => {
            let freq = 30;
            const t = c.type || targetType;
            if (t === ContactType.OWNER) freq = settings.defaultFrequencyOwner;
            else if (t === ContactType.BUILDER) freq = settings.defaultFrequencyBuilder;
            else freq = settings.defaultFrequencyClient;
            
            let lastDateStr = new Date().toISOString().split('T')[0];
            if (c.timestamp) {
                lastDateStr = new Date(c.timestamp * 1000).toISOString().split('T')[0];
            }

            return {
                id: generateId(), name: c.name, phone: c.phone.startsWith('55') ? c.phone : '55'+c.phone,
                type: t, notes: c.customNotes || 'Importado via WhatsApp', 
                lastContactDate: lastDateStr,
                followUpFrequencyDays: freq, messageTone: c.messageTone, automationStage: AutomationStage.IDLE, autoPilotEnabled: true, hasUnreadReply: false
            };
        });
        onImport(newContacts);
        onClose();
        fetch(`${serverUrl}/trigger-automation`, { headers: apiHeaders }).catch(()=>{});
    };

    if (!isOpen) return null;
    if (isReviewing) {
        return (
            <div className="fixed inset-0 bg-black/60 z-[95] flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
                    <div className="flex justify-between mb-4"><h3 className="font-bold text-blue-600">Qualificar Contato ({currentReviewIndex + 1}/{reviewQueue.length})</h3><button onClick={onClose} className="font-bold text-xl">✕</button></div>
                    <div className="bg-gray-100 p-2 rounded mb-4 text-center font-mono font-bold">{reviewQueue[currentReviewIndex].phone}</div>
                    <div className="space-y-3">
                        <div><label className="text-xs font-bold uppercase">Nome</label><input className="w-full border p-2 rounded" value={reviewName} onChange={e=>setReviewName(e.target.value)}/></div>
                        <div><label className="text-xs font-bold uppercase">Tipo</label><select className="w-full border p-2 rounded" value={reviewType} onChange={e=>setReviewType(e.target.value as any)}>{Object.values(ContactType).map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                        <div>
                            <label className="text-xs font-bold uppercase">Tom</label>
                            <select className="w-full border p-2 rounded" value={reviewTone} onChange={e=>setReviewTone(e.target.value)}>
                                <option value="">Padrão</option> 
                                {toneOptions.map(t=><option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div><label className="text-xs font-bold uppercase">Obs</label><textarea className="w-full border p-2 rounded" value={reviewNotes} onChange={e=>setReviewNotes(e.target.value)}/></div>
                    </div>
                    <div className="flex justify-between mt-6 pt-4 border-t"><button onClick={onClose} className="text-gray-500 font-bold">Cancelar</button><button onClick={handleNextReview} className="bg-blue-600 text-white px-6 py-2 rounded font-bold">Salvar e Próximo</button></div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/60 z-[90] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg h-[600px] flex flex-col animate-in zoom-in-95">
                <div className="p-4 border-b flex justify-between"><h3 className="font-bold">Importar</h3><button onClick={onClose} className="font-bold text-xl">✕</button></div>
                <div className="p-4 bg-gray-50 flex gap-2"><div className="relative w-full"><input className="w-full border rounded p-2 pr-8" placeholder="Buscar..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}/><button onClick={()=>setSearchTerm('')} className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 font-bold">✕</button></div></div>
                <div className="flex-1 overflow-y-auto p-2">{loading?<div className="text-center p-10">Carregando conversas do WhatsApp...</div>:waContacts.filter(c=>c.name.toLowerCase().includes(searchTerm.toLowerCase())).map(c=>(<div key={c.phone} onClick={()=>handleToggle(c.phone)} className={`flex p-2 hover:bg-gray-100 cursor-pointer ${selected.has(c.phone)?'bg-blue-50 border':''}`}><input type="checkbox" checked={selected.has(c.phone)} readOnly className="mr-3"/><div><div className="font-bold">{c.name}</div><div className="text-xs text-gray-500">{c.phone}</div></div></div>))}</div>
                <div className="p-4 border-t flex justify-between bg-gray-50"><span>{selected.size} selecionados</span><div className="flex gap-2"><button onClick={onClose} className="bg-gray-200 px-4 py-2 rounded font-bold">Cancelar</button><button onClick={handleStartImport} disabled={!selected.size} className="bg-blue-600 text-white px-6 py-2 rounded font-bold disabled:opacity-50">Qualificar</button></div></div>
            </div>
        </div>
    );
};

const ChatModal: React.FC<{ contact: Contact | null, onClose: () => void, serverUrl: string, apiHeaders: any }> = ({ contact, onClose, serverUrl, apiHeaders }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    const fetchHistory = async () => {
        if(!contact) return;
        try { const res = await fetch(`${serverUrl}/chat/${contact.phone}`,{headers: apiHeaders}); setMessages(await res.json()); } catch {}
    };
    useEffect(() => { if(contact){ fetchHistory(); const i = setInterval(fetchHistory,3000); return ()=>clearInterval(i); } }, [contact]);
    useEffect(() => { if(scrollRef.current) scrollRef.current.scrollTop=scrollRef.current.scrollHeight; }, [messages]);
    const handleSend = async () => {
        if(!newMessage.trim()||!contact) return;
        await fetch(`${serverUrl}/send`,{method:'POST',headers:{...apiHeaders, 'Content-Type':'application/json'},body:JSON.stringify({phone:contact.phone,message:newMessage})});
        setNewMessage(''); fetchHistory();
    };
    if(!contact) return null;
    return (
        <div className="fixed inset-0 bg-black/60 z-[90] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl h-[600px] flex flex-col animate-in zoom-in-95">
                <div className="bg-slate-100 p-4 border-b flex justify-between"><h3 className="font-bold">{contact.name}</h3><button onClick={onClose}>✕</button></div>
                <div className="flex-1 bg-[#e5ded8] p-4 overflow-y-auto space-y-2" ref={scrollRef}>
                    {messages.map((m,i)=>(<div key={i} className={`flex ${m.fromMe?'justify-end':'justify-start'}`}><div className={`p-2 rounded-lg max-w-[70%] text-sm shadow ${m.fromMe?'bg-[#d9fdd3]':'bg-white'}`}>{m.body}</div></div>))}
                </div>
                <div className="p-3 bg-slate-50 border-t flex gap-2"><input className="flex-1 border rounded-full px-4" value={newMessage} onChange={e=>setNewMessage(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSend()}/><button onClick={handleSend} className="bg-green-600 text-white p-3 rounded-full"><Icons.Play/></button></div>
            </div>
        </div>
    );
};

const SettingsModal: React.FC<{ isOpen: boolean, onClose: () => void, settings: AppSettings, onSave: (s: AppSettings) => void }> = ({ isOpen, onClose, settings, onSave }) => {
    const [s, setS] = useState(settings);
    
    useEffect(()=>setS(settings),[settings,isOpen]);
    
    if(!isOpen) return null;
    
    return (
        <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                <h2 className="font-bold text-xl">Ajustes Gerais</h2>
                <div><label className="text-xs font-bold text-gray-500">NOME DO CORRETOR</label><input className="w-full border p-2 rounded" value={s.agentName} onChange={e=>setS({...s,agentName:e.target.value})}/></div>
                <div><label className="text-xs font-bold text-gray-500">NOME DA IMOBILIÁRIA</label><input className="w-full border p-2 rounded" value={s.agencyName} onChange={e=>setS({...s,agencyName:e.target.value})}/></div>
                
                <div>
                    <label className="text-xs font-bold text-gray-500 mb-1">TOM DE VOZ PADRÃO</label>
                    <select className="w-full border p-2 rounded" value={s.messageTone} onChange={e => setS({...s, messageTone: e.target.value as any})}>
                        <option value="Casual">Casual</option><option value="Formal">Formal</option><option value="Amigável">Amigável</option><option value="Persuasivo">Persuasivo</option>
                        <option value="Consultivo">Consultivo</option><option value="Elegante">Elegante</option><option value="Urgente">Urgente</option><option value="Entusiasta">Entusiasta</option>
                    </select>
                </div>
                
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <label className="text-xs font-bold text-blue-600 mb-1 block">GOOGLE GEMINI API KEY</label>
                    <input 
                        className="w-full border p-2 rounded bg-white text-sm" 
                        type="password"
                        placeholder="AIzaSy..." 
                        value={s.apiKey || ''} 
                        onChange={e=>setS({...s,apiKey:e.target.value})}
                    />
                    <p className="text-[10px] text-blue-400 mt-1">Insira aqui se não conseguir usar o arquivo .env</p>
                </div>

                <div className="pt-4 border-t"><h4 className="font-bold text-xs uppercase mb-2">Ciclo Padrão (Dias)</h4><div className="grid grid-cols-3 gap-2">
                    <div><label className="text-[10px]">Prop</label><input type="number" className="w-full border p-1 rounded" value={s.defaultFrequencyOwner} onChange={e => setS({...s, defaultFrequencyOwner: Number(e.target.value)})}/></div>
                    <div><label className="text-[10px]">Const</label><input type="number" className="w-full border p-1 rounded" value={s.defaultFrequencyBuilder} onChange={e => setS({...s, defaultFrequencyBuilder: Number(e.target.value)})}/></div>
                    <div><label className="text-[10px]">Cli</label><input type="number" className="w-full border p-1 rounded" value={s.defaultFrequencyClient} onChange={e => setS({...s, defaultFrequencyClient: Number(e.target.value)})}/></div>
                </div></div>
                <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded">Cancelar</button><button onClick={()=>{onSave(s);onClose()}} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">Salvar</button></div>
            </div>
        </div>
    );
};

// --- MAIN APP ---

const App: React.FC = () => {
  const [viewState, setViewState] = useState<'loading'|'auth_check'|'wizard'|'login'|'dashboard'>('loading');
  const [settings, setSettings] = useState<AppSettings|null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [authToken, setAuthToken] = useState<string>(() => localStorage.getItem('imobiflow_auth') || '');
  const [loginError, setLoginError] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact|null>(null);
  const [isQRCodeOpen, setIsQRCodeOpen] = useState(false);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [chatContact, setChatContact] = useState<Contact|null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState<any>(null);
  const [serverStatus, setServerStatus] = useState(false);
  const [lastSync, setLastSync] = useState('-');
  const [genMsg, setGenMsg] = useState('');
  const [selectedId, setSelectedId] = useState<string|null>(null);
  const [confirmData, setConfirmData] = useState<any>({show:false});
  const [sending, setSending] = useState(false);
  
  // Controle do menu dropdown (kebab) por ID do contato
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const getServerUrl = () => (localStorage.getItem('imobiflow_server_url') || 'https://followimob.squareweb.app').replace(/\/$/, '');
  const getHeaders = () => ({ 
      'Content-Type': 'application/json', 
      'ngrok-skip-browser-warning': 'true',
      'x-access-token': authToken
  });

  useEffect(() => {
      setViewState('loading');
      fetch(`${getServerUrl()}/auth-status`, { headers: { 'ngrok-skip-browser-warning': 'true' } })
        .then(r => r.json())
        .then(data => {
            if (!data.configured) setViewState('wizard');
            else {
                if (authToken) {
                   fetch(`${getServerUrl()}/settings`, { headers: getHeaders() })
                      .then(r => { if(r.ok) return r.json(); throw new Error('Unauthorized'); })
                      .then(d => { setSettings({...d, serverUrl: getServerUrl()}); setViewState('dashboard'); fetchContacts(); })
                      .catch(() => { setAuthToken(''); localStorage.removeItem('imobiflow_auth'); setViewState('login'); });
                } else setViewState('login');
            }
        })
        .catch(() => setViewState('wizard'));
  }, []);

  const handleLoginSubmit = async (password: string) => {
      setLoginError('');
      try {
          const res = await fetch(`${getServerUrl()}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }, body: JSON.stringify({ password }) });
          const data = await res.json();
          if (data.success) {
              const token = password;
              setAuthToken(token);
              localStorage.setItem('imobiflow_auth', token);
              const settingsRes = await fetch(`${getServerUrl()}/settings`, { headers: { ...getHeaders(), 'x-access-token': token } });
              setSettings({ ...(await settingsRes.json()), serverUrl: getServerUrl() });
              setViewState('dashboard');
          } else setLoginError('Senha incorreta.');
      } catch (e) { setLoginError('Erro de conexão com servidor.'); }
  };

  const handleWizardComplete = (s: AppSettings) => {
      fetch(`${s.serverUrl}/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }, body: JSON.stringify(s) }).then(res => res.json()).then(data => {
          if (data.success) {
              setAuthToken(s.password || '');
              localStorage.setItem('imobiflow_auth', s.password || '');
              persistSettings(s);
              setViewState('dashboard');
              fetchContacts();
          }
      });
  };

  const persistSettings = (s:AppSettings) => { setSettings(s); localStorage.setItem('imobiflow_server_url',s.serverUrl!); fetch(`${s.serverUrl}/settings`,{method:'POST',headers:getHeaders(),body:JSON.stringify(s)}); };
  const fetchContacts = () => fetch(`${settings!.serverUrl}/contacts`,{headers:getHeaders()}).then(r=>r.json()).then(setContacts).catch(()=>{});
  const persistContacts = async (list:Contact[]) => { setContacts(list); await fetch(`${settings!.serverUrl}/contacts`,{method:'POST',headers:getHeaders(),body:JSON.stringify(list)}); };
  
  const handleLogoutSystem = () => { setAuthToken(''); localStorage.removeItem('imobiflow_auth'); setViewState('login'); };
  const toggleAutomation = () => fetch(`${settings!.serverUrl}/toggle-automation`,{method:'POST',headers:getHeaders(),body:JSON.stringify({active:!settings!.automationActive})}).then(()=>setSettings({...settings!,automationActive:!settings!.automationActive}));
  const handleResetStage = async (c: Contact) => { const updated = { ...c, automationStage: AutomationStage.IDLE, lastContactDate: new Date().toISOString() }; await persistContacts(contacts.map(x=>x.id===c.id?updated:x)); setToast({msg: 'Ciclo reiniciado!', type: 'success'}); };
  const handleForceTest = async (c: Contact) => { const past = new Date(); past.setDate(past.getDate()- (c.followUpFrequencyDays + 2)); const updated = { ...c, lastContactDate: past.toISOString().split('T')[0], automationStage: AutomationStage.IDLE }; await persistContacts(contacts.map(x=>x.id===c.id?updated:x)); fetch(`${settings!.serverUrl}/trigger-automation`,{headers:getHeaders()}); setToast({msg:'Teste disparado (Ciclo Resetado)', type:'success'}); };
  const handleDisconnectWhatsapp = async () => { try { await fetch(`${settings!.serverUrl}/logout`, { method: 'POST', headers: getHeaders() }); setServerStatus(false); setToast({msg: 'Desconectado do WhatsApp!', type: 'success'}); } catch (e) { setToast({msg: 'Erro ao desconectar', type: 'error'}); } };
  const sendManual = async (c: Contact) => { if (!genMsg.trim()) return; setSending(true); try { await fetch(`${settings!.serverUrl}/send`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ phone: c.phone, message: genMsg }) }); setToast({ msg: 'Enviado!', type: 'success' }); const updated = { ...c, lastContactDate: new Date().toISOString().split('T')[0], automationStage: AutomationStage.IDLE }; await persistContacts(contacts.map(x => x.id === c.id ? updated : x)); setSelectedId(null); setGenMsg(''); } catch (e) { setToast({ msg: 'Erro ao enviar', type: 'error' }); } finally { setSending(false); } };
  const handleSaveContact = async (contact: Contact) => { let newList; const exists = contacts.find(c => c.id === contact.id); if (exists) newList = contacts.map(c => c.id === contact.id ? contact : c); else newList = [...contacts, contact]; await persistContacts(newList); };
  const handleImportContacts = async (newContacts: Contact[]) => { const uniqueNew = newContacts.filter(nc => !contacts.some(oc => oc.phone === nc.phone)); await persistContacts([...contacts, ...uniqueNew]); setToast({ msg: `${uniqueNew.length} importados`, type: 'success' }); };
  const handleUpdateContact = (c: Contact) => { setEditingContact(c); setIsModalOpen(true); };
  const handleFinalizeContact = async (c: Contact) => { await persistContacts(contacts.filter(x => x.id !== c.id)); setToast({ msg: 'Contato finalizado', type: 'success' }); };
  
  // --- DELETE FIX & DUPLICATE VALIDATION ---

  const handleDelete = async (id:string) => {
     // Exclusão direta, sem criar conflito com o modal
     await persistContacts(contacts.filter(c => c.id !== id));
     setToast({msg: 'Contato excluído', type: 'success'});
  };

  const handleValidateContact = (contact: Contact): string | null => {
      // Normaliza para verificar apenas os últimos 8 dígitos (evita problemas com 55 ou DDD)
      const cleanNew = contact.phone.replace(/\D/g, '').slice(-8);
      
      const duplicate = contacts.find(c => {
          if (c.id === contact.id) return false; // Não compara com ele mesmo na edição
          const cleanExisting = c.phone.replace(/\D/g, '').slice(-8);
          return cleanExisting === cleanNew;
      });

      if (duplicate) {
          return `Este número já pertence a ${duplicate.name}`;
      }
      return null;
  };

  useEffect(() => { if(toast) setTimeout(()=>setToast(null),3000); }, [toast]);
  useEffect(() => { if(viewState==='dashboard' && settings) { const i=setInterval(()=>{ fetch(`${settings.serverUrl}/status`,{headers:getHeaders()}).then(r=>r.json()).then(d=>setServerStatus(d.isReady)).catch(()=>setServerStatus(false)); fetchContacts(); setLastSync(new Date().toLocaleTimeString()); },5000); return ()=>clearInterval(i); } }, [viewState, settings]);

  // Click outside listener for kebab menu
  useEffect(() => {
    const handleClickOutside = () => setOpenMenuId(null);
    if(openMenuId) window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [openMenuId]);

  if(viewState==='loading') return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white"><div className="animate-pulse">Carregando ImobiFlow...</div></div>;
  if(viewState==='wizard') return <StrategyWizard onComplete={handleWizardComplete}/>;
  if(viewState==='login') return <LoginScreen onLogin={handleLoginSubmit} error={loginError} />;

  // --- FILTRAGEM ---
  const filtered = contacts.filter(c => {
    const matchesFilter = filterType === 'ALL' || c.type === filterType;
    const matchesSearch = searchTerm === '' || 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.phone.includes(searchTerm);
    return matchesFilter && matchesSearch;
  });
  
  const unread = contacts.filter(c=>c.hasUnreadReply);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#F8F9FA] font-sans text-slate-800">
        
        {/* SIDEBAR MODERNA */}
        <aside className="bg-[#0F172A] text-slate-400 w-full md:w-64 flex flex-col shrink-0 transition-all">
            <div className="p-6">
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-900/50">
                        <Icons.Flash />
                    </div>
                    <span className="text-xl font-bold text-white tracking-tight">ImobiFlow</span>
                </div>

                {/* Status Widget Compacto */}
                <div className="bg-[#1E293B] rounded-xl p-3 border border-slate-700/50 shadow-sm mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${serverStatus ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'} transition-all`} />
                        <span className={`text-xs font-bold ${serverStatus ? 'text-slate-200' : 'text-slate-400'}`}>
                            {serverStatus ? 'WhatsApp Online' : 'Desconectado'}
                        </span>
                    </div>
                    {!serverStatus && <button onClick={() => setIsQRCodeOpen(true)} className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-500 transition-colors">Conectar</button>}
                    {serverStatus && <button onClick={handleDisconnectWhatsapp} className="text-slate-500 hover:text-red-400"><Icons.Pause/></button>}
                </div>

                {/* Automação Toggle */}
                <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/50 transition-colors mb-6 cursor-pointer" onClick={toggleAutomation}>
                    <span className="text-sm font-medium text-slate-300">Automação IA</span>
                    <div className={`w-9 h-5 rounded-full relative transition-colors ${settings?.automationActive ? 'bg-indigo-500' : 'bg-slate-600'}`}>
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all shadow-sm ${settings?.automationActive ? 'left-5' : 'left-1'}`} />
                    </div>
                </div>

                <nav className="space-y-1">
                    <button className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-white bg-slate-800/50 rounded-lg"><Icons.Users /> Contatos</button>
                    <button onClick={() => setIsSettingsOpen(true)} className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors"><Icons.Pencil /> Ajustes</button>
                </nav>
            </div>

            <div className="mt-auto p-6 border-t border-slate-800">
                <button onClick={handleLogoutSystem} className="flex items-center gap-2 text-xs font-bold text-red-400 hover:text-red-300 transition-colors">
                    <Icons.Pause /> Sair do Sistema
                </button>
                <div className="text-[10px] text-slate-600 mt-2 text-center">Sync: {lastSync}</div>
            </div>
        </aside>

        {/* CONTEÚDO PRINCIPAL */}
        <main className="flex-1 h-screen overflow-hidden flex flex-col">
            {/* Header com Search Global */}
            <header className="px-8 py-6 bg-white border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Contatos</h1>
                    <p className="text-sm text-slate-400">Gerencie seu funil de vendas</p>
                </div>
                
                <div className="flex flex-1 max-w-2xl w-full gap-4 items-center justify-end">
                    {/* Search Bar */}
                    <div className="relative w-full max-w-md group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                            <Icons.Search />
                        </div>
                        <input 
                            type="text" 
                            className="block w-full pl-10 pr-3 py-2.5 border-none rounded-xl bg-slate-50 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all shadow-inner"
                            placeholder="Buscar por nome ou telefone..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <button onClick={() => setIsImportOpen(true)} className="p-2.5 text-slate-500 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-200 transition-all" title="Importar">
                        <Icons.CloudDownload />
                    </button>
                    <button onClick={() => { setEditingContact(null); setIsModalOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-md shadow-blue-200 transition-all flex items-center gap-2 shrink-0">
                        <Icons.Plus /> Novo Contato
                    </button>
                </div>
            </header>

            {/* Filtros e Lista */}
            <div className="flex-1 overflow-hidden flex flex-col p-8 pt-6">
                
                {/* Filter Chips */}
                <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide shrink-0">
                    {['ALL', ...Object.values(ContactType)].map(t => {
                        const typeContacts = contacts.filter(c => t === 'ALL' || c.type === t);
                        const isActive = filterType === t;
                        return (
                            <button 
                                key={t} 
                                onClick={() => setFilterType(t)} 
                                className={`px-4 py-2 rounded-full text-sm font-medium transition-all border whitespace-nowrap flex items-center gap-2
                                ${isActive ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                            >
                                {t === 'ALL' ? 'Todos' : t}
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                    {typeContacts.length}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* RICH LIST (Cards Layout) */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-2 pb-20">
                    {filtered.map(c => {
                        const lastDate = new Date(c.lastContactDate || Date.now());
                        const nextDate = new Date(lastDate);
                        nextDate.setDate(lastDate.getDate() + c.followUpFrequencyDays);
                        const daysWait = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
                        const isAlert = c.automationStage === 3;
                        const initialColor = getColorFromInitial(c.name);

                        // Cálculo status visual
                        let statusBadge = <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full text-xs font-bold border border-slate-200">Em dia</span>;
                        if(c.automationStage === 1) statusBadge = <span className="bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full text-xs font-bold border border-blue-100 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"/> Aguardando (1)</span>;
                        if(c.automationStage === 2) statusBadge = <span className="bg-purple-50 text-purple-600 px-2.5 py-1 rounded-full text-xs font-bold border border-purple-100 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-purple-500"/> Aguardando (2)</span>;
                        if(isAlert) statusBadge = <span className="bg-red-50 text-red-600 px-2.5 py-1 rounded-full text-xs font-bold border border-red-100 flex items-center gap-1 animate-pulse"><span className="w-1.5 h-1.5 rounded-full bg-red-500"/> Sem Retorno</span>;

                        return (
                            <div key={c.id} className={`group bg-white rounded-xl p-4 border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-100 transition-all relative ${c.hasUnreadReply ? 'ring-2 ring-yellow-400 bg-yellow-50/30' : ''}`}>
                                
                                {selectedId === c.id && (
                                    <div className="absolute inset-x-0 -bottom-32 z-20 p-4 bg-white rounded-b-xl shadow-xl border-t border-slate-100 animate-in slide-in-from-top-2">
                                        <textarea className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none mb-2 shadow-inner" rows={3} value={genMsg} onChange={e=>setGenMsg(e.target.value)} placeholder="Edite a mensagem antes de enviar..." autoFocus/>
                                        <div className="flex justify-end gap-2">
                                            <button onClick={()=>setSelectedId(null)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded">Cancelar</button>
                                            <button onClick={()=>sendManual(c)} disabled={sending} className="px-4 py-1.5 text-xs font-bold bg-blue-600 text-white rounded hover:bg-blue-700 shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center gap-2">
                                                {sending ? 'Enviando...' : <><Icons.Flash/> Enviar Agora</>}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center justify-between gap-4">
                                    {/* 1. Identity Section */}
                                    <div className="flex items-center gap-4 min-w-[200px]">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${initialColor}`}>
                                            {getInitials(c.name)}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-800 text-sm">{c.name}</h3>
                                            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{c.type}</p>
                                        </div>
                                    </div>

                                    {/* 2. Status Badge */}
                                    <div className="hidden md:flex items-center min-w-[120px]">
                                        {c.hasUnreadReply ? (
                                            <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-sm"><Icons.Bell/> Nova msg</span>
                                        ) : statusBadge}
                                    </div>

                                    {/* 3. Dates/Metrics */}
                                    <div className="hidden lg:flex flex-col gap-1 text-[11px] text-slate-500 min-w-[140px]">
                                        <div className="flex items-center gap-1.5">
                                            <Icons.Clock />
                                            <span className={daysWait > c.followUpFrequencyDays ? 'text-red-500 font-bold' : ''}>Último: {daysWait} dias</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 opacity-70">
                                            <Icons.Calendar />
                                            <span>Próx: {nextDate.toLocaleDateString('pt-BR').slice(0,5)}</span>
                                        </div>
                                    </div>

                                    {/* 4. Actions (Primary & Secondary) */}
                                    <div className="flex items-center gap-2 ml-auto">
                                        {/* Toggle Auto */}
                                        <button 
                                            onClick={() => persistContacts(contacts.map(x => x.id === c.id ? { ...x, autoPilotEnabled: !c.autoPilotEnabled } : x))}
                                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${c.autoPilotEnabled !== false ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                                            title="Automação"
                                        >
                                            {c.autoPilotEnabled !== false ? <span className="text-xs">ON</span> : <span className="text-[10px]">OFF</span>}
                                        </button>

                                        {/* Primary Actions */}
                                        <button onClick={() => setChatContact(c)} className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 hover:scale-110 transition-all shadow-sm" title="Abrir Chat"><Icons.WhatsApp/></button>
                                        <button onClick={() => { setSelectedId(c.id); generateFollowUpMessage(c, settings!, false).then(setGenMsg); }} className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-100 hover:scale-110 transition-all shadow-sm" title="Gerar Msg"><Icons.Flash/></button>

                                        {/* Kebab Menu (Dropdown) */}
                                        <div className="relative">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === c.id ? null : c.id); }}
                                                className="w-8 h-8 rounded-full text-slate-400 hover:bg-slate-50 hover:text-slate-600 flex items-center justify-center transition-colors"
                                            >
                                                <Icons.MoreVertical />
                                            </button>
                                            
                                            {openMenuId === c.id && (
                                                <div className="absolute right-0 top-10 w-48 bg-white rounded-lg shadow-xl border border-slate-100 z-50 py-1 text-sm animate-in fade-in zoom-in-95" onClick={e => e.stopPropagation()}>
                                                    <button onClick={() => { handleUpdateContact(c); setOpenMenuId(null); }} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-2"><Icons.Pencil /> Editar</button>
                                                    <button onClick={() => { handleForceTest(c); setOpenMenuId(null); }} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-2"><Icons.Refresh /> Resetar Ciclo</button>
                                                    <div className="h-px bg-slate-100 my-1" />
                                                    <button 
                                                        onClick={() => { 
                                                            setConfirmData({
                                                                show: true, 
                                                                msg: 'Excluir contato permanentemente?', 
                                                                action: () => handleDelete(c.id) // AGORA CHAMA A FUNÇÃO CORRETA
                                                            }); 
                                                            setOpenMenuId(null); 
                                                        }} 
                                                        className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 font-medium flex items-center gap-2"
                                                    >
                                                        <Icons.Trash /> Excluir
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Inbox Button */}
            {unread.length > 0 && (
                <button onClick={() => setIsInboxOpen(true)} className="fixed bottom-8 right-8 bg-blue-600 text-white p-4 rounded-full shadow-2xl shadow-blue-500/50 hover:scale-110 transition-transform z-50 flex items-center gap-2 pr-6 group">
                    <span className="relative">
                        <Icons.Message />
                        <span className="absolute -top-2 -right-2 bg-red-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-blue-600">{unread.length}</span>
                    </span>
                    <span className="font-bold text-sm">Inbox</span>
                </button>
            )}

            {/* MODALS */}
            <ContactModal 
                isOpen={isModalOpen} 
                onClose={()=>setIsModalOpen(false)} 
                onSave={handleSaveContact} 
                onValidate={handleValidateContact} // PASSA VALIDAÇÃO
                initialContact={editingContact} 
                settings={settings} 
                defaultType={filterType!=='ALL'?(filterType as ContactType):ContactType.CLIENT}
            />
            <ImportModal isOpen={isImportOpen} onClose={()=>setIsImportOpen(false)} serverUrl={settings?.serverUrl||''} existingContacts={contacts} onImport={handleImportContacts} settings={settings!} apiHeaders={getHeaders()}/>
            <QRCodeModal isOpen={isQRCodeOpen} onClose={()=>setIsQRCodeOpen(false)} onConnected={()=>{setServerStatus(true);setIsQRCodeOpen(false)}} serverUrl={settings?.serverUrl} onUrlChange={u=>persistSettings({...settings!,serverUrl:u})}/>
            <SettingsModal isOpen={isSettingsOpen} onClose={()=>setIsSettingsOpen(false)} settings={settings!} onSave={persistSettings}/>
            
            {isInboxOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col animate-in zoom-in-95">
                        <div className="p-5 border-b flex justify-between items-center"><h3 className="font-bold text-lg text-slate-800">Inbox ({unread.length})</h3><button onClick={()=>setIsInboxOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button></div>
                        <div className="p-5 overflow-y-auto space-y-4 bg-slate-50">
                            {unread.map(c=>(
                                <div key={c.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="font-bold text-slate-800">{c.name}</div>
                                        <span className="text-[10px] text-slate-400">{new Date(c.lastReplyTimestamp || 0).toLocaleTimeString()}</span>
                                    </div>
                                    <div className="bg-yellow-50 p-3 rounded-lg text-sm text-slate-700 italic border border-yellow-100 mb-4 relative">
                                        <div className="absolute -top-1 left-4 w-2 h-2 bg-yellow-50 transform rotate-45 border-t border-l border-yellow-100"></div>
                                        "{c.lastReplyContent || 'Nova mensagem de áudio/mídia'}"
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button onClick={()=>{setIsInboxOpen(false);setChatContact(c);}} className="bg-green-50 text-green-700 py-2 rounded-lg text-xs font-bold hover:bg-green-100 transition-colors">Responder</button>
                                        <button onClick={()=>{setIsInboxOpen(false);handleUpdateContact(c);}} className="bg-blue-50 text-blue-700 py-2 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors">Atualizar</button>
                                        <button onClick={()=>{setIsInboxOpen(false);setConfirmData({show:true,msg:'Finalizar e excluir este contato?',action:()=>handleFinalizeContact(c)})}} className="bg-red-50 text-red-700 py-2 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors">Finalizar</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            
            {chatContact && <ChatModal contact={chatContact} onClose={()=>setChatContact(null)} serverUrl={settings?.serverUrl||''} apiHeaders={getHeaders()} />}
            {confirmData.show && <div className="fixed inset-0 bg-slate-900/60 z-[70] flex items-center justify-center p-4"><div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full text-center animate-in zoom-in-95"><div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4"><Icons.Trash/></div><h3 className="font-bold text-lg mb-2">Tem certeza?</h3><p className="text-slate-500 text-sm mb-6">{confirmData.msg}</p><div className="flex gap-3 justify-center"><button onClick={()=>setConfirmData({show:false})} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg font-bold hover:bg-slate-200">Cancelar</button><button onClick={()=>{confirmData.action();setConfirmData({show:false})}} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 shadow-lg shadow-red-200">Sim, Confirmar</button></div></div></div>}
            {toast && <div className={`fixed top-6 right-6 z-[100] px-6 py-3 rounded-xl text-white font-bold shadow-2xl animate-in slide-in-from-right-10 flex items-center gap-3 ${toast.type==='success'?'bg-slate-800 border border-slate-700':'bg-red-600'}`}>{toast.type === 'success' ? <Icons.Check/> : null} {toast.msg}</div>}
        </main>
    </div>
  );
};
export default App;
