import React, { useState } from 'react';
import { Contact, ContactType, AutomationStage } from '../types';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (contacts: Contact[]) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onImport }) => {
  const [importText, setImportText] = useState('');
  const [isParsing, setIsParsing] = useState(false);

  const handleImport = () => {
    setIsParsing(true);
    const lines = importText.split('\n').filter(line => line.trim() !== '');
    const newContacts: Contact[] = [];

    lines.forEach(line => {
      // Formato esperado: Nome;Telefone;Tipo (Opcional)
      const parts = line.split(';');
      if (parts.length >= 2) {
        let phone = parts[1].replace(/\D/g, '');
        if (phone.length === 10 || phone.length === 11) phone = '55' + phone;

        let type = ContactType.CLIENT;
        if (parts[2]) {
          const t = parts[2].toLowerCase();
          if (t.includes('prop') || t.includes('dono')) type = ContactType.OWNER;
          else if (t.includes('const')) type = ContactType.BUILDER;
        }

        newContacts.push({
          id: (typeof crypto !== 'undefined' ? crypto.randomUUID() : Date.now().toString() + Math.random()),
          name: parts[0].trim(),
          phone: phone,
          type: type,
          notes: 'Importado em massa.',
          lastContactDate: new Date().toISOString().split('T')[0],
          followUpFrequencyDays: type === ContactType.CLIENT ? 15 : 30,
          automationStage: AutomationStage.IDLE,
          autoPilotEnabled: true,
          hasUnreadReply: false
        });
      }
    });

    onImport(newContacts);
    setImportText('');
    setIsParsing(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-[2rem] shadow-2xl max-w-lg w-full p-8 animate-in zoom-in-95 duration-300">
        <h2 className="text-2xl font-black text-slate-900 mb-2">Importar Contatos</h2>
        <p className="text-sm font-medium text-slate-500 mb-6">Cole os dados no formato: <code className="bg-slate-100 px-2 py-1 rounded text-slate-800 font-bold">Nome;Telefone;Tipo</code></p>
        
        <textarea 
          placeholder="Exemplo:&#10;João Silva;11999998888;Cliente&#10;Maria Clara;11988887777;Proprietário"
          className="w-full h-64 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-medium outline-none focus:ring-4 focus:ring-blue-50 transition-all resize-none mb-6"
          value={importText}
          onChange={e => setImportText(e.target.value)}
        />

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-3 text-xs font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest">Cancelar</button>
          <button 
            onClick={handleImport}
            disabled={!importText.trim() || isParsing}
            className="bg-slate-900 text-white px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 disabled:opacity-50 transition-all"
          >
            {isParsing ? 'Processando...' : 'Processar Agora'}
          </button>
        </div>
      </div>
    </div>
  );
};