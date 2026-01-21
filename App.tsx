import React, { useState, useEffect, useMemo } from 'react';
import { ContactModal } from './components/ContactModal';
import { QRCodeModal } from './components/QRCodeModal';
import { Icons } from './constants';
import { Contact, AppSettings, ContactType } from './types';
import { generateFollowUpMessage } from './services/geminiService';

const App: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [serverStatus, setServerStatus] = useState({ isReady: false, status: 'initializing' });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQRCodeOpen, setIsQRCodeOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [genMsg, setGenMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Controle de Abas
  const [activeCategory, setActiveCategory] = useState<'all' | ContactType>('all');
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const [sRes, cRes] = await Promise.all([
          fetch(`/settings`),
          fetch(`/contacts`)
        ]);
        if (sRes.ok) setSettings(await sRes.json());
        if (cRes.ok) setContacts(await cRes.json());
      } catch (e) { console.error("Erro no carregamento:", e); }
      setLoading(false);
    };
    init();

    const interval = setInterval(() => {
      fetch(`/status`)
        .then(r => r.json())
        .then(setServerStatus)
        .catch(() => setServerStatus({ isReady: false, status: 'offline' }));
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const persistContacts = async (list: Contact[]) => {
    setContacts(list);
    await fetch(`/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(list)
    });
  };

  const handleSaveContact = (contact: Contact) => {
    const newList = contacts.some(c => c.id === contact.id)
      ? contacts.map(c => c.id === contact.id ? contact : c)
      : [...contacts, contact];
    persistContacts(newList);
    setIsModalOpen(false);
    setEditingContact(null);
  };

  const handleSyncAndGenerate = async (c: Contact) => {
    if (!settings) return;
    setSelectedId(c.id);
    setGenMsg("Consultando WhatsApp...");

    try {
      const res = await fetch(`/sync-last-message/${c.phone}`);
      if (res.ok) {
        const data = await res.json();
        if (data.timestamp) {
          const waDate = new Date(data.timestamp);
          const currentSysDate = new Date(c.lastContactDate);

          if (waDate > currentSysDate) {
            const updated = { ...c, lastContactDate: waDate.toISOString().split('T')[0] };
            const newList = contacts.map(x => x.id === c.id ? updated : x);
            setContacts(newList);
            persistContacts(newList);
            
            const nextDate = new Date(updated.lastContactDate);
            nextDate.setDate(nextDate.getDate() + updated.followUpFrequencyDays);
            if (new Date() < nextDate) {
              setGenMsg(`Sincronizado! Conversa manual em ${waDate.toLocaleDateString()} detectada. O ciclo foi reiniciado.`);
              return;
            }
          }
        }
      }
    } catch (e) { console.error(e); }

    setGenMsg("IA redigindo mensagem...");
    const msg = await generateFollowUpMessage(c, settings);
    setGenMsg(msg);
  };

  const handleSend = async (c: Contact) => {
    if (!genMsg.trim() || genMsg.startsWith("Sincronizado!")) return;
    setSending(true);
    try {
      const res = await fetch(`/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: c.phone, message: genMsg })
      });
      if (res.ok) {
        const updated = { ...c, lastContactDate: new Date().toISOString().split('T')[0] };
        persistContacts(contacts.map(x => x.id === c.id ? updated : x));
        setSelectedId(null);
        alert("Enviado!");
      } else { alert("Erro ao enviar."); }
    } catch (e) { alert("Erro de conexão."); }
    setSending(false);
  };

  const metrics = useMemo(() => {
    const overdue = contacts.filter(c => {
      const next = new Date(c.lastContactDate);
      next.setDate(next.getDate() + c.followUpFrequencyDays);
      return new Date() > next;
    }).length;

    return {
      total: contacts.length,
      overdue,
      clients: contacts.filter(c => c.type === ContactType.CLIENT).length,
      owners: contacts.filter(c => c.type === ContactType.OWNER).length,
      builders: contacts.filter(c => c.type === ContactType.BUILDER).length
    };
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm);
      const matchesCategory = activeCategory === 'all' || c.type === activeCategory;
      
      let matchesOverdue = true;
      if (showOverdueOnly) {
        const next = new Date(c.lastContactDate);
        next.setDate(next.getDate() + c.followUpFrequencyDays);
        matchesOverdue = new Date() > next;
      }

      return matchesSearch && matchesCategory && matchesOverdue;
    });
  }, [contacts, searchTerm, activeCategory, showOverdueOnly]);

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-slate-900">
      <div className="text-center animate-pulse">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-blue-200 font-bold uppercase text-[10px] tracking-widest">ImobiFlow Intelligence</p>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* SIDEBAR */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-900 text-white">
        <div className="p-8">
          <h1 className="text-2xl font-black tracking-tighter flex items-center gap-2">
            <Icons.Flash /> ImobiFlow
          </h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-2">
          <button onClick={() => {setActiveCategory('all'); setShowOverdueOnly(false);}} className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeCategory === 'all' && !showOverdueOnly ? 'bg-blue-600' : 'text-slate-400 hover:bg-slate-800'}`}>
            <Icons.Users /> Dashboard
          </button>
          <button onClick={() => setShowOverdueOnly(true)} className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-bold transition-all ${showOverdueOnly ? 'bg-amber-600' : 'text-slate-400 hover:bg-slate-800'}`}>
            <Icons.Clock /> Follow-up Atrasado
            {metrics.overdue > 0 && <span className="ml-auto bg-white/20 text-[10px] px-2 py-0.5 rounded-full">{metrics.overdue}</span>}
          </button>
        </nav>

        <div className="p-6">
          <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
            <div className="flex justify-between items-center mb-3">
              <p className="text-[10px] font-black text-slate-500 uppercase">Status WA</p>
              <span className={`w-2 h-2 rounded-full ${serverStatus.isReady ? 'bg-green-500' : 'bg-red-500'}`}></span>
            </div>
            {!serverStatus.isReady && (
              <button onClick={() => setIsQRCodeOpen(true)} className="w-full bg-blue-600 py-2 rounded-lg text-xs font-bold hover:bg-blue-500 transition-colors">Conectar</button>
            )}
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 md:p-10 max-w-6xl mx-auto">
          
          {/* MÉTRICAS SUPERIORES */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
              <p className="text-slate-400 text-[10px] font-black uppercase mb-1">Total</p>
              <h2 className="text-2xl font-black text-slate-900">{metrics.total}</h2>
            </div>
            <div className="bg-blue-50 p-5 rounded-3xl shadow-sm border border-blue-100">
              <p className="text-blue-500 text-[10px] font-black uppercase mb-1">Clientes</p>
              <h2 className="text-2xl font-black text-blue-900">{metrics.clients}</h2>
            </div>
            <div className="bg-emerald-50 p-5 rounded-3xl shadow-sm border border-emerald-100">
              <p className="text-emerald-500 text-[10px] font-black uppercase mb-1">Proprietários</p>
              <h2 className="text-2xl font-black text-emerald-900">{metrics.owners}</h2>
            </div>
            <div className="bg-indigo-50 p-5 rounded-3xl shadow-sm border border-indigo-100">
              <p className="text-indigo-500 text-[10px] font-black uppercase mb-1">Construtores</p>
              <h2 className="text-2xl font-black text-indigo-900">{metrics.builders}</h2>
            </div>
          </div>

          {/* BARRA DE PESQUISA E AÇÃO */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
            <div className="flex items-center gap-4 w-full md:w-auto">
                <h3 className="text-xl font-black text-slate-800">Meus Contatos</h3>
                <button onClick={() => { setEditingContact(null); setIsModalOpen(true); }} className="bg-slate-900 text-white p-2 rounded-full hover:scale-105 transition-transform">
                   <Icons.Plus />
                </button>
            </div>
            <div className="relative w-full md:w-96">
              <input 
                className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-3 text-sm outline-none focus:ring-4 focus:ring-blue-50 shadow-sm transition-all"
                placeholder="Pesquisar por nome ou celular..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              <div className="absolute right-4 top-3 text-slate-300"><Icons.Search /></div>
            </div>
          </div>

          {/* IDENTIFICADORES DE CATEGORIA (TABS) */}
          <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
            {[
              { id: 'all', label: 'Todos', color: 'slate' },
              { id: ContactType.CLIENT, label: 'Clientes', color: 'blue' },
              { id: ContactType.OWNER, label: 'Proprietários', color: 'emerald' },
              { id: ContactType.BUILDER, label: 'Construtores', color: 'indigo' }
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveCategory(tab.id as any)}
                className={`px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all border-2
                  ${activeCategory === tab.id 
                    ? `bg-white border-${tab.color}-500 text-${tab.color}-600 shadow-md` 
                    : `bg-transparent border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-100`}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* LISTAGEM DE CONTATOS */}
          <div className="grid grid-cols-1 gap-4">
            {filteredContacts.length === 0 ? (
              <div className="bg-white rounded-3xl p-20 text-center border-2 border-dashed border-slate-200">
                <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">Nenhum registro nesta categoria</p>
              </div>
            ) : (
              filteredContacts.map(c => {
                const nextDate = new Date(c.lastContactDate);
                nextDate.setDate(nextDate.getDate() + c.followUpFrequencyDays);
                const isOverdue = new Date() > nextDate;
                
                // Estilo baseado no tipo
                const typeStyle = c.type === ContactType.CLIENT ? 'blue' : c.type === ContactType.OWNER ? 'emerald' : 'indigo';

                return (
                  <div key={c.id} className={`bg-white rounded-3xl border transition-all overflow-hidden ${isOverdue ? 'border-amber-200 shadow-amber-50 shadow-lg' : 'border-slate-100 hover:border-slate-200 hover:shadow-md'}`}>
                    <div className="p-6">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex gap-4">
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-inner bg-${typeStyle}-50 text-${typeStyle}-600`}>
                            {c.type === ContactType.CLIENT ? '🤝' : c.type === ContactType.OWNER ? '🏠' : '🏗️'}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                                <h4 className="font-extrabold text-slate-900 text-lg leading-tight">{c.name}</h4>
                                {isOverdue && <span className="bg-amber-100 text-amber-700 text-[8px] font-black px-2 py-0.5 rounded-full uppercase">Atrasado</span>}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                               <span className={`text-[10px] font-black uppercase text-${typeStyle}-600 tracking-tighter`}>{c.type}</span>
                               <span className="text-[10px] font-bold text-slate-400">Fone: {c.phone}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 w-full md:w-auto">
                          <button onClick={() => handleSyncAndGenerate(c)} className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl transition-all font-bold text-xs ${isOverdue ? 'bg-amber-500 text-white shadow-lg shadow-amber-100' : 'bg-slate-50 text-slate-500 hover:bg-slate-900 hover:text-white'}`}>
                            <Icons.Flash /> {isOverdue ? 'Follow-up' : 'Sugestão'}
                          </button>
                          <button onClick={() => { setEditingContact(c); setIsModalOpen(true); }} className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-slate-200 transition-all">
                            <Icons.Pencil />
                          </button>
                        </div>
                      </div>

                      {/* DETALHES DO IMÓVEL / INTERESSE */}
                      <div className="mt-4 flex flex-wrap gap-2">
                        {c.propertyType && <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-lg text-[10px] font-bold"># {c.propertyType}</span>}
                        {c.propertyValue && <span className="bg-green-50 text-green-700 px-3 py-1 rounded-lg text-[10px] font-bold">Valor: {c.propertyValue}</span>}
                        {c.hasExchange && <span className="bg-purple-50 text-purple-700 px-3 py-1 rounded-lg text-[10px] font-bold">🔄 Permuta Pendente</span>}
                        <span className="ml-auto text-[10px] font-bold text-slate-300 uppercase">Último: {new Date(c.lastContactDate).toLocaleDateString()}</span>
                      </div>

                      {selectedId === c.id && (
                        <div className="mt-6 pt-6 border-t border-slate-50 animate-in slide-in-from-top-4">
                          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 mb-4">
                             <label className="text-[10px] font-black text-blue-600 uppercase mb-2 block">Minuta Estratégica</label>
                             <textarea 
                                className="w-full bg-transparent border-none p-0 text-sm min-h-[140px] outline-none font-medium text-slate-700 leading-relaxed resize-none"
                                value={genMsg}
                                onChange={e => setGenMsg(e.target.value)}
                             />
                          </div>
                          <div className="flex justify-end gap-3">
                            <button onClick={() => setSelectedId(null)} className="px-6 py-2 text-xs font-bold text-slate-400 hover:text-slate-600">Fechar</button>
                            <button 
                              onClick={() => handleSend(c)} 
                              disabled={sending || genMsg.includes("Sincronizado")}
                              className="bg-green-600 text-white px-8 py-3 rounded-2xl text-xs font-bold hover:bg-green-700 shadow-lg shadow-green-100 disabled:opacity-50 transition-all flex items-center gap-2"
                            >
                              {sending ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Icons.WhatsApp />}
                              Enviar para WhatsApp
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

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
        onConnected={() => setIsQRCodeOpen(false)}
        serverUrl={settings?.serverUrl || ''}
      />
    </div>
  );
};

export default App;