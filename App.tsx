
import React, { useState, useEffect, useRef } from 'react';
import { StrategyWizard } from './components/StrategyWizard';
import { ContactModal } from './components/ContactModal';
import { QRCodeModal } from './components/QRCodeModal';
import { Icons } from './constants';
import { AppSettings, Contact, ContactType, AutomationStage, ChatMessage } from './types';
import { generateFollowUpMessage } from './services/geminiService';

const generateId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`;

// --- IMPORT MODAL ---
const ImportModal: React.FC<{ isOpen: boolean, onClose: () => void, serverUrl: string, existingContacts: Contact[], onImport: (newContacts: Contact[]) => void, settings: AppSettings }> = ({ isOpen, onClose, serverUrl, existingContacts, onImport, settings }) => {
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

    useEffect(() => {
        if (isOpen) {
            setSelected(new Set());
            setLoading(true);
            setSearchTerm('');
            setIsReviewing(false);
            setReviewQueue([]);
            setReviewedContacts([]);
            fetch(`${serverUrl}/whatsapp-contacts`, { headers: {'ngrok-skip-browser-warning': 'true'} })
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
            
            // Lógica de Data Inteligente
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
        fetch(`${serverUrl}/trigger-automation`, { headers: {'ngrok-skip-browser-warning': 'true'} }).catch(()=>{});
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
                        <div><label className="text-xs font-bold uppercase">Tom</label><select className="w-full border p-2 rounded" value={reviewTone} onChange={e=>setReviewTone(e.target.value)}><option value="">Padrão</option> {['Casual','Formal','Urgente'].map(t=><option key={t} value={t}>{t}</option>)}</select></div>
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

// --- CHAT MODAL ---
const ChatModal: React.FC<{ contact: Contact | null, onClose: () => void, serverUrl: string }> = ({ contact, onClose, serverUrl }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    const fetchHistory = async () => {
        if(!contact) return;
        try { const res = await fetch(`${serverUrl}/chat/${contact.phone}`,{headers:{'ngrok-skip-browser-warning':'true'}}); setMessages(await res.json()); } catch {}
    };
    useEffect(() => { if(contact){ fetchHistory(); const i = setInterval(fetchHistory,3000); return ()=>clearInterval(i); } }, [contact]);
    useEffect(() => { if(scrollRef.current) scrollRef.current.scrollTop=scrollRef.current.scrollHeight; }, [messages]);
    const handleSend = async () => {
        if(!newMessage.trim()||!contact) return;
        await fetch(`${serverUrl}/send`,{method:'POST',headers:{'Content-Type':'application/json','ngrok-skip-browser-warning':'true'},body:JSON.stringify({phone:contact.phone,message:newMessage})});
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

// --- SETTINGS MODAL ---
const SettingsModal: React.FC<{ isOpen: boolean, onClose: () => void, settings: AppSettings, onSave: (s: AppSettings) => void }> = ({ isOpen, onClose, settings, onSave }) => {
    const [s, setS] = useState(settings);
    const [showKey, setShowKey] = useState(false);
    useEffect(()=>setS(settings),[settings,isOpen]);
    if(!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
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
                
                <div className="pt-4 border-t"><h4 className="font-bold text-xs uppercase mb-2">Ciclos Padrão (Dias)</h4><div className="grid grid-cols-3 gap-2">
                    <div><label className="text-[10px]">Prop</label><input type="number" className="w-full border p-1 rounded" value={s.defaultFrequencyOwner} onChange={e=>setS({...s,defaultFrequencyOwner:Number(e.target.value)})}/></div>
                    <div><label className="text-[10px]">Const</label><input type="number" className="w-full border p-1 rounded" value={s.defaultFrequencyBuilder} onChange={e=>setS({...s,defaultFrequencyBuilder:Number(e.target.value)})}/></div>
                    <div><label className="text-[10px]">Cli</label><input type="number" className="w-full border p-1 rounded" value={s.defaultFrequencyClient} onChange={e=>setS({...s,defaultFrequencyClient:Number(e.target.value)})}/></div>
                </div></div>
                <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded">Cancelar</button><button onClick={()=>{onSave(s);onClose()}} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">Salvar</button></div>
            </div>
        </div>
    );
};

const App: React.FC = () => {
  const [viewState, setViewState] = useState<'loading'|'wizard'|'welcome'|'dashboard'>('loading');
  const [settings, setSettings] = useState<AppSettings|null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact|null>(null);
  const [isQRCodeOpen, setIsQRCodeOpen] = useState(false);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [chatContact, setChatContact] = useState<Contact|null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [toast, setToast] = useState<any>(null);
  const [serverStatus, setServerStatus] = useState(false);
  const [lastSync, setLastSync] = useState('-');
  const [genMsg, setGenMsg] = useState('');
  const [selectedId, setSelectedId] = useState<string|null>(null);
  const [confirmData, setConfirmData] = useState<any>({show:false});
  const [sending, setSending] = useState(false);

  const getServerUrl = () => (localStorage.getItem('imobiflow_server_url') || 'https://ameer-uncondensational-lemuel.ngrok-free.dev').replace(/\/$/, '');
  const getHeaders = () => ({ 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' });

  useEffect(() => {
      fetch(`${getServerUrl()}/settings`,{headers:getHeaders()}).then(r=>r.ok?r.json():null).then(d=>{ if(d){setSettings({...d,serverUrl:getServerUrl()});setViewState('welcome');}else setViewState('wizard'); }).catch(()=>setViewState('wizard'));
  }, []);
  const persistSettings = (s:AppSettings) => { setSettings(s); localStorage.setItem('imobiflow_server_url',s.serverUrl!); fetch(`${s.serverUrl}/settings`,{method:'POST',headers:getHeaders(),body:JSON.stringify(s)}); };
  const fetchContacts = () => fetch(`${settings!.serverUrl}/contacts`,{headers:getHeaders()}).then(r=>r.json()).then(setContacts).catch(()=>{});
  const persistContacts = async (list:Contact[]) => { setContacts(list); await fetch(`${settings!.serverUrl}/contacts`,{method:'POST',headers:getHeaders(),body:JSON.stringify(list)}); };
  const handleLogin = () => { setViewState('dashboard'); fetchContacts(); };
  
  useEffect(() => { if(toast) setTimeout(()=>setToast(null),3000); }, [toast]);
  useEffect(() => { if(viewState==='dashboard') { const i=setInterval(()=>{
      fetch(`${settings!.serverUrl}/status`,{headers:getHeaders()}).then(r=>r.json()).then(d=>setServerStatus(d.isReady)).catch(()=>setServerStatus(false));
      fetchContacts(); setLastSync(new Date().toLocaleTimeString());
  },5000); return ()=>clearInterval(i); } }, [viewState]);

  const toggleAutomation = () => fetch(`${settings!.serverUrl}/toggle-automation`,{method:'POST',headers:getHeaders(),body:JSON.stringify({active:!settings!.automationActive})}).then(()=>setSettings({...settings!,automationActive:!settings!.automationActive}));

  const handleGoodbye = async (c: Contact, sendMsg: boolean) => {
      await fetch(`${settings!.serverUrl}/goodbye`, {method:'POST', headers:getHeaders(), body:JSON.stringify({contactId: c.id, sendMsg})});
      fetchContacts();
      setConfirmData({show:false});
  };

  const handleResetStage = async (c: Contact) => {
      const updated = { ...c, automationStage: AutomationStage.IDLE, lastContactDate: new Date().toISOString() };
      const newList = contacts.map(x=>x.id===c.id?updated:x);
      await persistContacts(newList);
      setToast({msg: 'Ciclo reiniciado!', type: 'success'});
  };

  const handleDelete = (id:string) => setConfirmData({show:true, msg:'Excluir contato?', action:()=>persistContacts(contacts.filter(c=>c.id!==id))});
  
  const handleForceTest = async (c: Contact) => {
      const past = new Date(); past.setDate(past.getDate()- (c.followUpFrequencyDays + 2));
      const updated = { ...c, lastContactDate: past.toISOString().split('T')[0], automationStage: AutomationStage.IDLE };
      await persistContacts(contacts.map(x=>x.id===c.id?updated:x));
      fetch(`${settings!.serverUrl}/trigger-automation`,{headers:getHeaders()});
      setToast({msg:'Teste disparado (Ciclo Resetado)', type:'success'});
  };

  // Função para fechar o chat e REABRIR O INBOX se necessário
  const handleCloseChat = () => {
      setChatContact(null);
      // Se ainda houver mensagens não lidas, reabre o inbox para o usuário tomar a ação (Atualizar/Finalizar)
      if (contacts.some(c => c.hasUnreadReply)) {
          setIsInboxOpen(true);
      }
  };

  const handleLogout = async () => {
    try {
        await fetch(`${settings!.serverUrl}/logout`, { method: 'POST', headers: getHeaders() });
        setServerStatus(false);
        setToast({msg: 'Desconectado!', type: 'success'});
    } catch (e) {
        setToast({msg: 'Erro ao desconectar', type: 'error'});
    }
  };

  const sendManual = async (c: Contact) => {
    if (!genMsg.trim()) return;
    setSending(true);
    try {
        await fetch(`${settings!.serverUrl}/send`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ phone: c.phone, message: genMsg })
        });
        setToast({ msg: 'Enviado!', type: 'success' });
        const updated = { ...c, lastContactDate: new Date().toISOString().split('T')[0], automationStage: AutomationStage.IDLE };
        await persistContacts(contacts.map(x => x.id === c.id ? updated : x));
        setSelectedId(null);
        setGenMsg('');
    } catch (e) {
        setToast({ msg: 'Erro ao enviar', type: 'error' });
    } finally {
        setSending(false);
    }
  };

  const handleSaveContact = async (contact: Contact) => {
    let newList;
    const exists = contacts.find(c => c.id === contact.id);
    if (exists) {
        newList = contacts.map(c => c.id === contact.id ? contact : c);
    } else {
        newList = [...contacts, contact];
    }
    await persistContacts(newList);
  };

  const handleImportContacts = async (newContacts: Contact[]) => {
    const uniqueNew = newContacts.filter(nc => !contacts.some(oc => oc.phone === nc.phone));
    const newList = [...contacts, ...uniqueNew];
    await persistContacts(newList);
    setToast({ msg: `${uniqueNew.length} importados`, type: 'success' });
  };

  // Atualizar contato após resposta (abrindo modal para editar obs)
  const handleUpdateContact = (c: Contact) => {
      setEditingContact(c);
      setIsModalOpen(true);
      // Obs: A notificação só será limpa quando o usuário salvar o modal.
  };

  const handleFinalizeContact = async (c: Contact) => {
    const newList = contacts.filter(x => x.id !== c.id);
    await persistContacts(newList);
    setToast({ msg: 'Contato finalizado', type: 'success' });
  };

  if(viewState==='loading') return <div>Carregando...</div>;
  if(viewState==='wizard') return <StrategyWizard onComplete={s=>{persistSettings(s);setViewState('dashboard');fetchContacts();}}/>;
  if(viewState==='welcome') return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white"><div className="text-center bg-white/10 p-10 rounded-xl"><h1 className="text-2xl font-bold mb-4">Olá, {settings?.agentName}</h1><button onClick={handleLogin} className="bg-blue-600 px-8 py-3 rounded font-bold">Entrar</button></div></div>;

  const filtered = contacts.filter(c=>filterType==='ALL'||c.type===filterType);
  const unread = contacts.filter(c=>c.hasUnreadReply);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-100 font-sans text-gray-800">
        <aside className="bg-slate-900 text-white w-full md:w-64 p-6 flex flex-col shrink-0">
            <h1 className="text-xl font-bold mb-8">ImobiFlow</h1>
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 mb-4">
                <div className="text-xs font-bold text-slate-500 uppercase mb-2">Status do Servidor</div>
                <div className="flex justify-between items-center mb-2"><span>WhatsApp</span>{serverStatus?<span className="text-green-400 text-xs">● Online</span>:<button onClick={()=>setIsQRCodeOpen(true)} className="text-red-400 text-xs">● Conectar</button>}</div>
                {serverStatus && <button onClick={handleLogout} className="w-full text-xs bg-red-900/50 text-red-200 border border-red-900 rounded py-1 hover:bg-red-900">Desconectar</button>}
            </div>
            <div className={`p-4 rounded-xl border mb-4 ${settings?.automationActive?'bg-indigo-900/40 border-indigo-500':'bg-slate-800'}`}>
                <div className="flex justify-between items-center"><span className="text-xs font-bold text-slate-300">Automação</span><button onClick={toggleAutomation} className={`w-10 h-5 rounded-full relative ${settings?.automationActive?'bg-indigo-500':'bg-slate-600'}`}><div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${settings?.automationActive?'left-6':'left-1'}`}/></button></div>
            </div>
            <div className="mt-auto flex flex-col gap-2"><button onClick={()=>setIsSettingsOpen(true)} className="text-sm bg-slate-800 p-2 rounded">⚙️ Ajustes</button><span className="text-xs text-center text-gray-500">Sync: {lastSync}</span></div>
        </aside>

        <main className="flex-1 p-8 overflow-y-auto">
            <header className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Contatos</h2>
                <div className="flex gap-2">
                    <button onClick={()=>setIsImportOpen(true)} className="bg-white border px-4 py-2 rounded-full font-bold shadow-sm flex items-center gap-2 hover:bg-gray-50"><Icons.CloudDownload/> Importar</button>
                    <button onClick={()=>{setEditingContact(null);setIsModalOpen(true)}} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-2 rounded-full font-bold shadow-lg hover:scale-105 transition-all"><Icons.Plus/> Novo Contato</button>
                </div>
            </header>

            <div className="flex gap-2 mb-4">
                {['ALL',...Object.values(ContactType)].map(t => {
                    const typeContacts = contacts.filter(c => t === 'ALL' || c.type === t);
                    const total = typeContacts.length;
                    const waiting = typeContacts.filter(c => c.automationStage === 1 || c.automationStage === 2).length;
                    return (
                        <button key={t} onClick={()=>setFilterType(t)} className={`px-4 py-1 rounded-full text-sm font-bold flex items-center gap-2 ${filterType===t?'bg-blue-600 text-white':'bg-white border'}`}>
                            {t==='ALL'?'Todos':t}
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${filterType===t ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>({waiting} / {total})</span>
                        </button>
                    );
                })}
            </div>

            <div className="bg-white rounded-xl shadow border overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="p-4">Auto</th><th className="p-4">Nome</th><th className="p-4">Status</th><th className="p-4 text-right">Ações</th></tr></thead>
                    <tbody className="divide-y text-sm">
                        {filtered.map(c => {
                             const lastDate = new Date(c.lastContactDate||Date.now());
                             const nextDate = new Date(lastDate);
                             nextDate.setDate(lastDate.getDate() + c.followUpFrequencyDays);
                             
                             const daysWait = Math.floor((Date.now()-lastDate.getTime())/(1000*60*60*24));
                             const isAlert = c.automationStage === 3;
                             return (
                            <React.Fragment key={c.id}>
                                <tr className={`hover:bg-gray-50 ${c.hasUnreadReply?'bg-yellow-50':isAlert?'bg-red-50':''}`}>
                                    <td className="p-4"><button onClick={()=>persistContacts(contacts.map(x=>x.id===c.id?{...x,autoPilotEnabled:!c.autoPilotEnabled}:x))} className={`w-8 h-8 rounded-full flex items-center justify-center ${c.autoPilotEnabled!==false?'bg-green-100 text-green-600':'bg-gray-100 text-gray-400'}`} title={c.autoPilotEnabled!==false?'Pausar automação':'Ativar automação'}>{c.autoPilotEnabled!==false?<Icons.Pause/>:<Icons.Play/>}</button></td>
                                    <td className="p-4 font-bold">{c.name}<div className="text-xs font-normal text-gray-500">{c.type}</div>{c.hasUnreadReply && <div className="text-xs text-yellow-600 font-bold animate-pulse">🔔 Nova Mensagem</div>}</td>
                                    <td className="p-4">
                                        <div className="text-xs text-gray-700 font-medium">Último: {daysWait} dias atrás</div>
                                        <div className="text-[10px] text-gray-400 mb-1">Próximo: {nextDate.toLocaleDateString('pt-BR')}</div>
                                        
                                        {c.automationStage === 1 && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">● Aguardando (1)</span>}
                                        {c.automationStage === 2 && <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-bold">● Aguardando (2)</span>}
                                        {c.automationStage === 3 && <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-bold animate-pulse">● SEM RETORNO</span>}
                                    </td>
                                    <td className="p-4 text-right flex justify-end gap-2">
                                        {isAlert ? (
                                            <>
                                                <button onClick={()=>handleResetStage(c)} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold" title="Zerar ciclo e manter">Resetar</button>
                                                <button onClick={()=>setConfirmData({show:true, msg:'Enviar despedida e excluir?', action:()=>handleGoodbye(c,true)})} className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold" title="Finalizar e excluir">Despedir</button>
                                            </>
                                        ) : (
                                            <>
                                                <button onClick={()=>handleForceTest(c)} className="p-2 bg-yellow-50 text-yellow-600 rounded" title="Envio de mensagem agora"><Icons.Flash/></button>
                                                <button onClick={()=>{setChatContact(c)}} className="p-2 bg-green-50 text-green-600 rounded" title="Abrir Chat (Não marca lido)"><Icons.WhatsApp/></button>
                                                <button onClick={()=>{setSelectedId(c.id);generateFollowUpMessage(c,settings!,false).then(setGenMsg)}} className="p-2 bg-blue-50 text-blue-600 rounded" title="Gerar Mensagem Manual"><Icons.Message/></button>
                                                <button onClick={()=>{setEditingContact(c);setIsModalOpen(true)}} className="p-2 bg-gray-50 text-gray-600 rounded" title="Editar Contato"><Icons.Users/></button>
                                                <button onClick={()=>handleDelete(c.id)} className="p-2 bg-red-50 text-red-600 rounded" title="Excluir Contato"><Icons.Trash/></button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                                {selectedId===c.id && <tr className="bg-blue-50/50"><td colSpan={4} className="p-4"><div className="bg-white border p-4 rounded max-w-2xl mx-auto"><textarea className="w-full border rounded p-2 mb-2" rows={3} value={genMsg} onChange={e=>setGenMsg(e.target.value)}/><div className="flex justify-end gap-2"><button onClick={()=>setSelectedId(null)} className="px-3 py-1 bg-gray-200 rounded">Cancelar</button><button onClick={()=>sendManual(c)} disabled={sending} className="px-3 py-1 bg-blue-600 text-white rounded font-bold">Enviar</button></div></div></td></tr>}
                            </React.Fragment>
                        );})}
                    </tbody>
                </table>
            </div>
            
            {unread.length>0 && <button onClick={()=>setIsInboxOpen(true)} className="fixed bottom-6 right-6 bg-red-600 text-white p-4 rounded-full shadow-xl animate-bounce z-50"><Icons.Message/><span className="absolute -top-1 -right-1 bg-white text-red-600 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border">{unread.length}</span></button>}
            
            <ContactModal isOpen={isModalOpen} onClose={()=>setIsModalOpen(false)} onSave={handleSaveContact} initialContact={editingContact} settings={settings} defaultType={filterType!=='ALL'?(filterType as ContactType):ContactType.CLIENT}/>
            <ImportModal isOpen={isImportOpen} onClose={()=>setIsImportOpen(false)} serverUrl={settings?.serverUrl||''} existingContacts={contacts} onImport={handleImportContacts} settings={settings!}/>
            <QRCodeModal isOpen={isQRCodeOpen} onClose={()=>setIsQRCodeOpen(false)} onConnected={()=>{setServerStatus(true);setIsQRCodeOpen(false)}} serverUrl={settings?.serverUrl} onUrlChange={u=>persistSettings({...settings!,serverUrl:u})}/>
            <SettingsModal isOpen={isSettingsOpen} onClose={()=>setIsSettingsOpen(false)} settings={settings!} onSave={persistSettings}/>
            
            {/* INBOX MODAL */}
            {isInboxOpen && (
                <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col animate-in zoom-in-95">
                        <div className="p-4 border-b flex justify-between"><h3 className="font-bold">Inbox ({unread.length})</h3><button onClick={()=>setIsInboxOpen(false)}>✕</button></div>
                        <div className="p-4 overflow-y-auto space-y-3">
                            {unread.map(c=>(
                                <div key={c.id} className="border p-3 bg-yellow-50 rounded-lg">
                                    <div className="font-bold">{c.name}</div>
                                    <div className="text-sm my-2 italic text-gray-700">"{c.lastReplyContent||'Nova mensagem'}"</div>
                                    <div className="flex gap-2">
                                        {/* ABRIR CHAT: Fecha Inbox, Abre Chat. Não marca lido. */}
                                        <button onClick={()=>{setIsInboxOpen(false);setChatContact(c);}} className="flex-1 bg-green-600 text-white py-1 rounded text-xs font-bold" title="Abrir Chat sem marcar como lido">Chat</button>
                                        
                                        {/* ATUALIZAR: Fecha Inbox, Abre Edição. Salvar a edição marca como lido. */}
                                        <button onClick={()=>{setIsInboxOpen(false);handleUpdateContact(c);}} className="flex-1 bg-blue-600 text-white py-1 rounded text-xs font-bold" title="Editar obs e atualizar status">Atualizar</button>
                                        
                                        {/* FINALIZAR: Confirmação e Exclusão */}
                                        <button onClick={()=>{setIsInboxOpen(false);setConfirmData({show:true,msg:'Finalizar e excluir este contato?',action:()=>handleFinalizeContact(c)})}} className="flex-1 bg-red-600 text-white py-1 rounded text-xs font-bold" title="Excluir contato e remover notificação">Finalizar</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            
            {chatContact && <ChatModal contact={chatContact} onClose={handleCloseChat} serverUrl={settings?.serverUrl||''} />}
            {confirmData.show && <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center"><div className="bg-white p-6 rounded shadow-xl text-center"><p className="mb-4 font-bold">{confirmData.msg}</p><div className="flex gap-2 justify-center"><button onClick={()=>setConfirmData({show:false})} className="px-4 py-2 bg-gray-200 rounded">Cancelar</button><button onClick={()=>{confirmData.action();setConfirmData({show:false})}} className="px-4 py-2 bg-red-600 text-white rounded font-bold">Sim</button></div></div></div>}
            {toast && <div className={`fixed top-4 right-4 z-[80] px-4 py-2 rounded text-white font-bold ${toast.type==='success'?'bg-green-600':'bg-red-600'}`}>{toast.msg}</div>}
        </main>
    </div>
  );
};
export default App;