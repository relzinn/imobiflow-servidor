import React, { useState, useEffect, useMemo } from 'react';
import { ContactModal } from './components/ContactModal';
import { QRCodeModal } from './components/QRCodeModal';
import { ImportModal } from './components/ImportModal';
import { Icons } from './constants';
import { Contact, AppSettings, ContactType } from './types';
import { generateFollowUpMessage } from './services/geminiService';

const App: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [serverStatus, setServerStatus] = useState({ isReady: false, status: 'initializing' });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQRCodeOpen, setIsQRCodeOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [genMsg, setGenMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Controle de Filtros
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

    // Polling de status mais agressivo para conexão WhatsApp (5s)
    const interval = setInterval(() => {
      fetch(`/status?t=${Date.now()}`)
        .then(r => r.json())
        .then(setServerStatus)
        .catch(() => setServerStatus({ isReady: false, status: 'offline' }));
    }, 5000);
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

  const handleBulkImport = (newContacts: Contact[]) => {
    const newList = [...contacts, ...newContacts];
    persistContacts(newList);
    setIsImportOpen(false);
  };

  const handleSyncAndGenerate = async (c: Contact) => {
    if (!settings) return;
    setSelectedId(c.id);
    setGenMsg("Sincronizando WhatsApp...");

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
              setGenMsg(`Sincronizado! Identificamos uma conversa manual recente (${waDate.toLocaleDateString()}). O ciclo de follow-up foi reiniciado.`);
              return;
            }
          }
        }
      }
    } catch (e) { console.error(e); }

    setGenMsg("Inteligência Artificial redigindo mensagem...");
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
        alert("Mensagem enviada com sucesso!");
      } else { alert("Erro ao enviar. Verifique o status do WhatsApp."); }
    } catch (e) { alert("Erro de conexão com o servidor."); }
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
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="font-bold text-slate-500 text-sm tracking-widest uppercase">Inicializando Painel ImobiFlow</p>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC]">
      {/* BARRA LATERAL (SIDEBAR) */}
      <aside className="hidden md:flex flex-col w-72 bg-white border-r border-slate-200 shadow-sm z-10">
        <div className="p-8 pb-10">
          <h1 className="text-2xl font-black text-slate-900 tracking-tighter flex items-center gap-2">
            <Icons.Flash /> ImobiFlow
          </h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Gestão de Real Estate</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scrollbar">
          <p className="text-[10px] font-black text-slate-400 uppercase px-4 mb-2">Principal</p>
          <button onClick={() => {setActiveCategory('all'); setShowOverdueOnly(false);}} className={`flex items-center gap-3 w-full px-4 py-3.5 rounded-2xl text-sm font-bold transition-all ${activeCategory === 'all' && !showOverdueOnly ? 'sidebar-item-active' : 'text-slate-500 hover:bg-slate-50'}`}>
            <Icons.Users /> Painel Geral
          </button>
          <button onClick={() => setShowOverdueOnly(true)} className={`flex items-center gap-3 w-full px-4 py-3.5 rounded-2xl text-sm font-bold transition-all ${showOverdueOnly ? 'bg-amber-500 text-white shadow-lg shadow-amber-100' : 'text-slate-500 hover:bg-slate-50'}`}>
            <Icons.Clock /> Follow-up Atrasado
            {metrics.overdue > 0 && <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full ${showOverdueOnly ? 'bg-white/20' : 'bg-amber-100 text-amber-600'}`}>{metrics.overdue}</span>}
          </button>

          <div className="pt-8 pb-2">
            <p className="text-[10px] font-black text-slate-400 uppercase px-4 mb-2">Configurações</p>
            <button onClick={() => setIsQRCodeOpen(true)} className="flex items-center gap-3 w-full px-4 py-3.5 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all">
              <Icons.WhatsApp /> Status WhatsApp
              <span className={`ml-auto w-2 h-2 rounded-full ${serverStatus.isReady ? 'bg-green-500' : 'bg-red-500'}`}></span>
            </button>
          </div>
        </nav>

        <div className="p-6">
          <div className="bg-slate-900 rounded-3xl p-6 text-white relative overflow-hidden group">
            <div className="relative z-10">
              <p className="text-xs font-bold text-slate-400 mb-1">Dica de IA</p>
              <p className="text-[11px] leading-relaxed text-slate-300 font-medium">Mantenha seu WhatsApp conectado para que eu possa sincronizar suas últimas respostas.</p>
            </div>
            <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
               <Icons.Flash />
            </div>
          </div>
        </div>
      </aside>

      {/* ÁREA PRINCIPAL */}
      <main className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-6 md:p-12 max-w-6xl mx-auto">
          
          {/* CABEÇALHO DE AÇÕES */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
            <div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                {showOverdueOnly ? 'Follow-up Pendente' : activeCategory === 'all' ? 'Dashboard Geral' : activeCategory}
              </h2>
              <p className="text-sm font-medium text-slate-400 mt-1">Gerencie seus leads e proprietários com auxílio de IA.</p>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <button onClick={() => setIsImportOpen(true)} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-600 px-5 py-3 rounded-2xl font-bold text-xs hover:bg-slate-50 transition-all shadow-sm">
                <Icons.CloudDownload /> Importar
              </button>
              <button onClick={() => { setEditingContact(null); setIsModalOpen(true); }} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-2xl font-bold text-xs hover:bg-slate-800 transition-all shadow-lg shadow-slate-200">
                <Icons.Plus /> Novo Registro
              </button>
            </div>
          </div>

          {/* IDENTIFICADORES DE CATEGORIA (CARDS TABS) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {[
              { id: ContactType.CLIENT, label: 'Clientes', count: metrics.clients, color: 'blue', icon: '🤝' },
              { id: ContactType.OWNER, label: 'Proprietários', count: metrics.owners, color: 'emerald', icon: '🏠' },
              { id: ContactType.BUILDER, label: 'Construtores', count: metrics.builders, color: 'indigo', icon: '🏗️' }
            ].map(cat => (
              <button 
                key={cat.id}
                onClick={() => {setActiveCategory(cat.id); setShowOverdueOnly(false);}}
                className={`text-left p-6 rounded-[2rem] border-2 transition-all group ${
                  activeCategory === cat.id 
                  ? `bg-white border-${cat.color}-500 shadow-xl shadow-${cat.color}-100 scale-[1.02]` 
                  : 'bg-white border-transparent hover:border-slate-100 hover:shadow-lg'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl bg-${cat.color}-50 text-${cat.color}-600 group-hover:scale-110 transition-transform`}>
                    {cat.icon}
                  </div>
                  <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest ${activeCategory === cat.id ? `bg-${cat.color}-500 text-white` : 'bg-slate-100 text-slate-400'}`}>
                    {cat.count} REGISTROS
                  </span>
                </div>
                <h4 className={`text-xl font-black ${activeCategory === cat.id ? `text-${cat.color}-600` : 'text-slate-800'}`}>{cat.label}</h4>
                <p className="text-xs font-bold text-slate-400 mt-1">Ver todos os registros desta categoria</p>
              </button>
            ))}
          </div>

          {/* BARRA DE PESQUISA */}
          <div className="relative mb-8">
            <input 
              className="w-full bg-white border border-slate-200 rounded-[1.5rem] px-6 py-4 text-sm font-medium outline-none focus:ring-4 focus:ring-slate-100 shadow-sm transition-all"
              placeholder="Pesquisar por nome, telefone ou interesse..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <div className="absolute right-6 top-4 text-slate-300">
               <Icons.Search />
            </div>
          </div>

          {/* LISTA DE CONTATOS */}
          <div className="space-y-4">
            {filteredContacts.length === 0 ? (
              <div className="bg-white rounded-[2rem] p-20 text-center border-2 border-dashed border-slate-200">
                <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">Nenhum registro encontrado nesta visão</p>
              </div>
            ) : (
              filteredContacts.map(c => {
                const nextDate = new Date(c.lastContactDate);
                nextDate.setDate(nextDate.getDate() + c.followUpFrequencyDays);
                const isOverdue = new Date() > nextDate;
                const typeStyle = c.type === ContactType.CLIENT ? 'blue' : c.type === ContactType.OWNER ? 'emerald' : 'indigo';

                return (
                  <div key={c.id} className={`bg-white rounded-[2rem] border transition-all overflow-hidden ${isOverdue ? 'border-amber-200 shadow-amber-50 shadow-lg' : 'border-slate-100 hover:border-slate-200 hover:shadow-md'}`}>
                    <div className="p-8">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div className="flex gap-5">
                          <div className={`w-16 h-16 rounded-3xl flex items-center justify-center text-2xl shadow-inner bg-${typeStyle}-50 text-${typeStyle}-600 font-bold`}>
                            {c.type === ContactType.CLIENT ? '🤝' : c.type === ContactType.OWNER ? '🏠' : '🏗️'}
                          </div>
                          <div>
                            <div className="flex items-center gap-3">
                                <h4 className="font-extrabold text-slate-900 text-xl leading-tight">{c.name}</h4>
                                {isOverdue && <span className="bg-amber-100 text-amber-600 text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-tighter shadow-sm border border-amber-200">Atrasado</span>}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                               <span className={`text-[10px] font-black uppercase text-${typeStyle}-600 tracking-widest`}>{c.type}</span>
                               <span className="text-xs font-bold text-slate-400">{c.phone}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 w-full md:w-auto">
                          <button onClick={() => handleSyncAndGenerate(c)} className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-2xl transition-all font-bold text-xs ${isOverdue ? 'bg-amber-500 text-white shadow-lg shadow-amber-100 hover:bg-amber-600' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
                            <Icons.Flash /> {isOverdue ? 'Gerar Follow-up' : 'Sugerir Mensagem'}
                          </button>
                          <button onClick={() => { setEditingContact(c); setIsModalOpen(true); }} className="p-3.5 bg-slate-100 text-slate-400 rounded-2xl hover:bg-slate-200 transition-all">
                            <Icons.Pencil />
                          </button>
                        </div>
                      </div>

                      {/* DETALHES RÁPIDOS */}
                      <div className="mt-6 flex flex-wrap items-center gap-3">
                        {c.propertyType && <span className="bg-slate-50 text-slate-600 border border-slate-100 px-4 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-tight">#{c.propertyType}</span>}
                        {c.propertyValue && <span className="bg-green-50 text-green-700 border border-green-100 px-4 py-1.5 rounded-xl text-[10px] font-bold tracking-tight">💰 {c.propertyValue}</span>}
                        {c.hasExchange && <span className="bg-purple-50 text-purple-700 border border-purple-100 px-4 py-1.5 rounded-xl text-[10px] font-bold tracking-tight">🔄 Permuta</span>}
                        <div className="ml-auto flex items-center gap-2">
                           <Icons.Clock />
                           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Próximo: {nextDate.toLocaleDateString()}</span>
                        </div>
                      </div>

                      {/* ÁREA DE MENSAGEM GERADA */}
                      {selectedId === c.id && (
                        <div className="mt-8 pt-8 border-t border-slate-50 animate-in slide-in-from-top-6 duration-500">
                          <div className="flex items-center justify-between mb-4">
                            <label className="text-[11px] font-black text-blue-600 uppercase tracking-widest block">Sugestão Estratégica</label>
                            <span className="text-[10px] font-bold text-slate-300">Pressione Enter para enviar</span>
                          </div>
                          <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 focus-within:ring-4 focus-within:ring-blue-50 transition-all">
                             <textarea 
                                className="w-full bg-transparent border-none p-0 text-sm min-h-[160px] outline-none font-medium text-slate-700 leading-relaxed resize-none custom-scrollbar"
                                value={genMsg}
                                onChange={e => setGenMsg(e.target.value)}
                                autoFocus
                             />
                          </div>
                          <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setSelectedId(null)} className="px-8 py-3 text-xs font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest">Descartar</button>
                            <button 
                              onClick={() => handleSend(c)} 
                              disabled={sending || genMsg.startsWith("Sincronizado!")}
                              className="bg-green-600 text-white px-10 py-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-green-700 shadow-xl shadow-green-100 disabled:opacity-50 transition-all flex items-center gap-3"
                            >
                              {sending ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Icons.WhatsApp />}
                              Enviar p/ WhatsApp
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

      {/* MODAIS */}
      <ContactModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSaveContact} 
        initialContact={editingContact} 
        settings={settings}
      />

      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImport={handleBulkImport}
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