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
  
  // Filtros
  const [activeCategory, setActiveCategory] = useState<'all' | ContactType>('all');

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
            persistContacts(contacts.map(x => x.id === c.id ? updated : x));
            
            const nextDate = new Date(updated.lastContactDate);
            nextDate.setDate(nextDate.getDate() + updated.followUpFrequencyDays);
            if (new Date() < nextDate) {
              setGenMsg(`Sincronizado! Identificamos uma resposta em ${waDate.toLocaleDateString()}. Ciclo reiniciado.`);
              return;
            }
          }
        }
      }
    } catch (e) { console.error(e); }

    setGenMsg("IA analisando perfil e redigindo...");
    const msg = await generateFollowUpMessage(c, settings);
    setGenMsg(msg);
  };

  const handleSend = async (c: Contact) => {
    if (!genMsg.trim() || genMsg.includes("Sincronizado")) return;
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
        alert("Enviado com sucesso!");
      } else { 
        const err = await res.json();
        alert("Erro no envio: " + (err.error || "Tente novamente")); 
      }
    } catch (e) { alert("Erro de rede."); }
    setSending(false);
  };

  const metrics = useMemo(() => ({
    total: contacts.length,
    clients: contacts.filter(c => c.type === ContactType.CLIENT).length,
    owners: contacts.filter(c => c.type === ContactType.OWNER).length,
    builders: contacts.filter(c => c.type === ContactType.BUILDER).length
  }), [contacts]);

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm);
      const matchesCategory = activeCategory === 'all' || c.type === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [contacts, searchTerm, activeCategory]);

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50 font-bold text-slate-400">CARREGANDO IMOBIFLOW...</div>;

  return (
    <div className="flex h-screen bg-[#F8FAFC]">
      {/* SIDEBAR */}
      <aside className="hidden md:flex flex-col w-72 bg-white border-r border-slate-100 p-8 shadow-sm">
        <div className="mb-12">
          <h1 className="text-2xl font-black text-slate-900 tracking-tighter flex items-center gap-2">
            <Icons.Flash /> ImobiFlow
          </h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Gestão Imobiliária</p>
        </div>
        <nav className="space-y-2 flex-1">
          <button onClick={() => setActiveCategory('all')} className={`flex items-center gap-3 w-full px-5 py-3.5 rounded-2xl text-sm font-bold transition-all ${activeCategory === 'all' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}>
            <Icons.Users /> Dashboard Geral
          </button>
          <button onClick={() => setIsQRCodeOpen(true)} className="flex items-center gap-3 w-full px-5 py-3.5 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50">
             <Icons.WhatsApp /> Status WhatsApp
             <span className={`ml-auto w-2 h-2 rounded-full ${serverStatus.isReady ? 'bg-green-500' : 'bg-red-500'}`}></span>
          </button>
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-12">
        <div className="max-w-6xl mx-auto">
          {/* HEADER ROW */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
            <div>
              <h2 className="text-4xl font-black text-slate-900 tracking-tight">Dashboard Geral</h2>
              <p className="text-slate-400 font-medium mt-1">Gerencie seus leads e proprietários com auxílio de IA.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setIsImportOpen(true)} className="flex items-center gap-2 bg-white border border-slate-200 px-6 py-3 rounded-2xl font-bold text-sm text-slate-600 shadow-sm hover:bg-slate-50 transition-all">
                <Icons.CloudDownload /> Importar
              </button>
              <button onClick={() => { setEditingContact(null); setIsModalOpen(true); }} className="flex items-center gap-2 bg-[#0F172A] text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all">
                <Icons.Plus /> Novo Registro
              </button>
            </div>
          </div>

          {/* CATEGORY CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {[
              { id: ContactType.CLIENT, label: 'Clientes', count: metrics.clients, icon: '🤝', color: 'blue' },
              { id: ContactType.OWNER, label: 'Proprietários', count: metrics.owners, icon: '🏠', color: 'emerald' },
              { id: ContactType.BUILDER, label: 'Construtores', count: metrics.builders, icon: '🏗️', color: 'indigo' }
            ].map(cat => (
              <button 
                key={cat.id} 
                onClick={() => setActiveCategory(cat.id)}
                className={`bg-white p-8 rounded-[2.5rem] text-left border-2 transition-all group ${activeCategory === cat.id ? 'card-category-active' : 'border-transparent hover:border-slate-100 shadow-sm'}`}
              >
                <div className="flex justify-between items-start mb-6">
                  <div className={`w-14 h-14 rounded-[1.25rem] bg-slate-50 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform`}>{cat.icon}</div>
                  <span className="bg-slate-50 text-slate-400 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-tighter">{cat.count} REGISTROS</span>
                </div>
                <h3 className="text-2xl font-black text-slate-900">{cat.label}</h3>
                <p className="text-xs font-bold text-slate-400 mt-1">Ver todos os registros desta categoria</p>
              </button>
            ))}
          </div>

          {/* SEARCH BAR */}
          <div className="relative mb-8">
            <input 
              className="w-full bg-white border border-slate-200 rounded-3xl px-8 py-5 text-sm font-medium outline-none focus:ring-4 focus:ring-blue-50 shadow-sm transition-all"
              placeholder="Pesquisar por nome, telefone ou interesse..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <div className="absolute right-8 top-5 text-slate-300"><Icons.Search /></div>
          </div>

          {/* CONTACT LIST */}
          <div className="space-y-4">
            {filteredContacts.length === 0 ? (
              <div className="bg-white rounded-[2.5rem] p-20 text-center border-2 border-dashed border-slate-200">
                <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">Nenhum registro encontrado</p>
              </div>
            ) : (
              filteredContacts.map(c => {
                const nextDate = new Date(c.lastContactDate);
                nextDate.setDate(nextDate.getDate() + (c.followUpFrequencyDays || 15));
                
                return (
                  <div key={c.id} className="bg-white rounded-[2rem] border border-slate-100 p-8 shadow-sm hover:shadow-md transition-all">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                      <div className="flex gap-6 items-center">
                        <div className="w-16 h-16 rounded-3xl bg-blue-50 flex items-center justify-center text-2xl">
                          {c.type === ContactType.CLIENT ? '🤝' : c.type === ContactType.OWNER ? '🏠' : '🏗️'}
                        </div>
                        <div>
                          <h4 className="text-2xl font-extrabold text-slate-900 tracking-tight">{c.name}</h4>
                          <div className="flex items-center gap-4 mt-1">
                            <span className="text-[10px] font-black text-blue-600 uppercase tracking-tighter">{c.type}</span>
                            <span className="text-xs font-bold text-slate-400 tracking-tight">{c.phone}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 w-full md:w-auto">
                        <button onClick={() => handleSyncAndGenerate(c)} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[#0F172A] text-white px-8 py-3.5 rounded-2xl font-bold text-sm shadow-xl shadow-slate-200">
                          <Icons.Flash /> Sugerir Mensagem
                        </button>
                        <button onClick={() => { setEditingContact(c); setIsModalOpen(true); }} className="p-4 bg-slate-50 text-slate-400 rounded-2xl hover:bg-slate-100 transition-all">
                          <Icons.Pencil />
                        </button>
                      </div>
                    </div>

                    <div className="mt-8 flex justify-end items-center gap-2 text-slate-300">
                       <Icons.Clock />
                       <span className="text-[10px] font-black uppercase tracking-widest">Próximo: {nextDate.toLocaleDateString()}</span>
                    </div>

                    {/* SUGGESTION DRAWER */}
                    {selectedId === c.id && (
                      <div className="mt-8 pt-8 border-t border-slate-50 animate-in slide-in-from-top-4">
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-3">Redação da IA</p>
                        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 mb-6">
                           <textarea 
                             className="w-full bg-transparent border-none text-sm font-medium leading-relaxed outline-none min-h-[120px] resize-none"
                             value={genMsg}
                             onChange={e => setGenMsg(e.target.value)}
                           />
                        </div>
                        <div className="flex justify-end gap-3">
                           <button onClick={() => setSelectedId(null)} className="px-6 py-2 text-xs font-bold text-slate-400 uppercase">Cancelar</button>
                           <button 
                             onClick={() => handleSend(c)}
                             disabled={sending || genMsg.includes("Sincronizando")}
                             className="bg-green-600 text-white px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-green-100 hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                           >
                             {sending ? 'Enviando...' : <><Icons.WhatsApp /> Enviar p/ WhatsApp</>}
                           </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      {/* MODALS */}
      <ContactModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveContact} initialContact={editingContact} settings={settings} />
      <ImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} onImport={handleBulkImport} />
      <QRCodeModal isOpen={isQRCodeOpen} onClose={() => setIsQRCodeOpen(false)} onConnected={() => setIsQRCodeOpen(false)} serverUrl={settings?.serverUrl || ''} />
    </div>
  );
};

export default App;