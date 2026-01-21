import React, { useState, useEffect, useRef } from 'react';
import { StrategyWizard } from './components/StrategyWizard';
import { ContactModal } from './components/ContactModal';
import { QRCodeModal } from './components/QRCodeModal';
import { Icons } from './constants';
import { AppSettings, Contact, ContactType, AutomationStage, ChatMessage } from './types';
import { generateFollowUpMessage } from './services/geminiService';

const generateId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`;

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

const LoginScreen: React.FC<{ onLogin: (pass: string) => void, onRecover: () => void, error: string }> = ({ onLogin, onRecover, error }) => {
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
                <div className="mt-4 text-center">
                    <button onClick={onRecover} className="text-xs text-blue-600 hover:underline">Esqueci a senha</button>
                </div>
            </div>
        </div>
    );
};

const App: React.FC = () => {
  const [viewState, setViewState] = useState<'loading'|'wizard'|'login'|'dashboard'>('loading');
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
  const [genMsg, setGenMsg] = useState('');
  const [selectedId, setSelectedId] = useState<string|null>(null);
  const [sending, setSending] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const getServerUrl = () => (localStorage.getItem('imobiflow_server_url') || 'https://followimob.squareweb.app').replace(/\/$/, '');
  const getHeaders = () => ({ 'Content-Type': 'application/json', 'x-access-token': authToken });

  useEffect(() => {
      fetch(`${getServerUrl()}/auth-status`).then(r => r.json()).then(data => {
          if (!data.configured) setViewState('wizard');
          else if (authToken) {
              fetch(`${getServerUrl()}/settings`, { headers: getHeaders() })
                  .then(r => r.ok ? r.json() : Promise.reject())
                  .then(d => { setSettings(d); setViewState('dashboard'); fetchContacts(); })
                  .catch(() => setViewState('login'));
          } else setViewState('login');
      }).catch(() => setViewState('wizard'));
  }, []);

  const fetchContacts = () => fetch(`${getServerUrl()}/contacts`, { headers: getHeaders() }).then(r => r.json()).then(setContacts);
  const persistContacts = async (list: Contact[]) => { setContacts(list); await fetch(`${getServerUrl()}/contacts`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(list) }); };

  const sendManual = async (c: Contact) => {
      if (!genMsg.trim()) return;
      setSending(true);
      try {
          const res = await fetch(`${getServerUrl()}/send`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ phone: c.phone, message: genMsg }) });
          if (!res.ok) throw new Error('Falha no envio');
          setToast({ msg: 'Enviado!', type: 'success' });
          const updated = { ...c, lastContactDate: new Date().toISOString(), automationStage: AutomationStage.IDLE };
          await persistContacts(contacts.map(x => x.id === c.id ? updated : x));
          setSelectedId(null); setGenMsg('');
      } catch (e) {
          setToast({ msg: 'Erro: WhatsApp Desconectado ou Número Inválido', type: 'error' });
      } finally { setSending(false); }
  };

  useEffect(() => {
      if (viewState === 'dashboard') {
          const i = setInterval(() => {
              fetch(`${getServerUrl()}/status`).then(r => r.json()).then(d => setServerStatus(d.isReady));
              fetchContacts();
          }, 5000);
          return () => clearInterval(i);
      }
  }, [viewState]);

  if(viewState==='loading') return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">Carregando...</div>;
  if(viewState==='wizard') return <StrategyWizard onComplete={() => window.location.reload()}/>;
  if(viewState==='login') return <LoginScreen onLogin={p => { localStorage.setItem('imobiflow_auth', p); window.location.reload(); }} onRecover={() => alert('Veja os logs do servidor')} error={loginError} />;

  const filtered = contacts.filter(c => filterType === 'ALL' || c.type === filterType);
  const unread = contacts.filter(c => c.hasUnreadReply);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#F8F9FA] text-slate-800">
        <aside className="bg-[#0F172A] text-slate-400 w-full md:w-64 flex flex-col p-6 shrink-0">
            <div className="flex items-center gap-3 mb-8 text-white font-bold text-xl"><Icons.Flash /> ImobiFlow</div>
            <div className={`p-3 rounded-xl border mb-6 flex items-center justify-between ${serverStatus ? 'bg-green-900/20 border-green-500/50' : 'bg-red-900/20 border-red-500/50'}`}>
                <span className="text-xs font-bold">{serverStatus ? 'WhatsApp Online' : 'Desconectado'}</span>
                {!serverStatus && <button onClick={() => setIsQRCodeOpen(true)} className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded">Conectar</button>}
            </div>
            <nav className="space-y-2">
                <button className="w-full flex items-center gap-3 px-3 py-2 text-white bg-slate-800 rounded-lg"><Icons.Users /> Contatos</button>
                <button onClick={() => setIsSettingsOpen(true)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-800 rounded-lg"><Icons.Pencil /> Ajustes</button>
            </nav>
        </aside>

        <main className="flex-1 p-8 overflow-y-auto">
            <header className="flex justify-between items-center mb-8">
                <div><h1 className="text-2xl font-bold">Contatos</h1><p className="text-slate-400">Gerencie seu follow-up</p></div>
                <button onClick={() => { setEditingContact(null); setIsModalOpen(true); }} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2"><Icons.Plus /> Novo Contato</button>
            </header>

            <div className="space-y-4">
                {filtered.map(c => (
                    <div key={c.id} className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm hover:border-blue-200 transition-all relative">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold ${getColorFromInitial(c.name)}`}>{getInitials(c.name)}</div>
                                <div><h3 className="font-bold text-slate-800">{c.name}</h3><p className="text-xs text-slate-400 uppercase">{c.type}</p></div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => { setSelectedId(c.id); generateFollowUpMessage(c, settings!).then(setGenMsg); }} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"><Icons.Flash /></button>
                                <button onClick={() => { setChatContact(c); }} className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100"><Icons.WhatsApp /></button>
                                <button onClick={() => { setEditingContact(c); setIsModalOpen(true); }} className="p-2 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100"><Icons.Pencil /></button>
                            </div>
                        </div>

                        {selectedId === c.id && (
                            <div className="mt-4 p-4 bg-slate-50 rounded-lg border animate-in slide-in-from-top-2">
                                <textarea className="w-full border rounded-lg p-3 text-sm mb-2" rows={3} value={genMsg} onChange={e=>setGenMsg(e.target.value)} />
                                <div className="flex justify-end gap-2">
                                    <button onClick={()=>setSelectedId(null)} className="text-xs font-bold text-slate-500">Cancelar</button>
                                    <button onClick={()=>sendManual(c)} disabled={sending} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50">{sending?'Enviando...':'Enviar Agora'}</button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            
            {toast && <div className={`fixed top-6 right-6 z-[100] px-6 py-3 rounded-xl text-white font-bold shadow-2xl animate-in slide-in-from-right-10 ${toast.type==='success'?'bg-slate-800':'bg-red-600'}`}>{toast.msg}</div>}
            
            <ContactModal isOpen={isModalOpen} onClose={()=>setIsModalOpen(false)} onSave={c => { persistContacts(contacts.some(x=>x.id===c.id)?contacts.map(x=>x.id===c.id?c:x):[...contacts, c]); setIsModalOpen(false); }} settings={settings} />
            <QRCodeModal isOpen={isQRCodeOpen} onClose={()=>setIsQRCodeOpen(false)} onConnected={()=>{setServerStatus(true);setIsQRCodeOpen(false)}} serverUrl={getServerUrl()} />
        </main>
    </div>
  );
};
export default App;