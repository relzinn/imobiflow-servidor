
import React, { useState, useEffect } from 'react';
import { Contact, ContactType, AppSettings, AutomationStage } from '../types';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (contact: Contact) => void;
  initialContact?: Contact | null;
  settings: AppSettings | null;
}

export const ContactModal: React.FC<ContactModalProps> = ({ isOpen, onClose, onSave, initialContact, settings }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState<ContactType>(ContactType.CLIENT);
  const [notes, setNotes] = useState('');
  const [lastContactDate, setLastContactDate] = useState('');
  const [frequencyDays, setFrequencyDays] = useState<number>(30);

  useEffect(() => {
    if (initialContact) {
      setName(initialContact.name);
      setPhone(initialContact.phone);
      setType(initialContact.type);
      setNotes(initialContact.notes);
      setLastContactDate(initialContact.lastContactDate.split('T')[0]);
      setFrequencyDays(initialContact.followUpFrequencyDays);
    } else {
      setName('');
      setPhone('');
      setType(ContactType.CLIENT);
      setNotes('');
      setLastContactDate(new Date().toISOString().split('T')[0]);
      setFrequencyDays(settings?.defaultFrequencyClient || 30);
    }
  }, [initialContact, isOpen, settings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: initialContact ? initialContact.id : (typeof crypto !== 'undefined' ? crypto.randomUUID() : Date.now().toString()),
      name,
      phone,
      type,
      notes,
      lastContactDate,
      followUpFrequencyDays: frequencyDays,
      automationStage: initialContact?.automationStage ?? AutomationStage.IDLE,
      autoPilotEnabled: initialContact?.autoPilotEnabled ?? true,
      lastReplyTimestamp: initialContact?.lastReplyTimestamp,
      hasUnreadReply: initialContact?.hasUnreadReply
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in zoom-in-95">
        <h2 className="text-xl font-bold mb-4">{initialContact ? 'Editar' : 'Novo'} Contato</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input required placeholder="Nome" className="w-full border rounded p-2" value={name} onChange={e => setName(e.target.value)} />
          <input required placeholder="WhatsApp (Ex: 11999999999)" className="w-full border rounded p-2" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} />
          <div className="grid grid-cols-2 gap-4">
             <select className="border rounded p-2" value={type} onChange={e => setType(e.target.value as ContactType)}>
                {Object.values(ContactType).map(t => <option key={t} value={t}>{t}</option>)}
             </select>
             <input type="number" placeholder="Dias Ciclo" className="border rounded p-2" value={frequencyDays} onChange={e => setFrequencyDays(Number(e.target.value))} />
          </div>
          <input type="date" className="w-full border rounded p-2" value={lastContactDate} onChange={e => setLastContactDate(e.target.value)} />
          <textarea placeholder="Notas..." className="w-full border rounded p-2" value={notes} onChange={e => setNotes(e.target.value)} />
          <div className="flex justify-end gap-2">
             <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 rounded">Cancelar</button>
             <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded font-bold">Salvar</button>
          </div>
        </form>
      </div>
    </div>
  );
};
