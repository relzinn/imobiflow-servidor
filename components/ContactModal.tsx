
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

  const getDefaultDaysForType = (t: ContactType): number => {
    if (!settings) return 30;
    switch (t) {
      case ContactType.OWNER: return settings.defaultFrequencyOwner;
      case ContactType.BUILDER: return settings.defaultFrequencyBuilder;
      case ContactType.CLIENT: return settings.defaultFrequencyClient;
      default: return 30;
    }
  };

  useEffect(() => {
    if (initialContact) {
      setName(initialContact.name);
      setPhone(initialContact.phone);
      setType(initialContact.type);
      setNotes(initialContact.notes);
      setLastContactDate(initialContact.lastContactDate.split('T')[0]);
      setFrequencyDays(initialContact.followUpFrequencyDays);
    } else {
      resetForm();
    }
  }, [initialContact, isOpen, settings]);

  const resetForm = () => {
    setName('');
    setPhone('');
    const defaultType = ContactType.CLIENT;
    setType(defaultType);
    setNotes('');
    setLastContactDate(new Date().toISOString().split('T')[0]);
    setFrequencyDays(getDefaultDaysForType(defaultType));
  };

  const handleTypeChange = (newType: ContactType) => {
    setType(newType);
    if (!initialContact) {
      setFrequencyDays(getDefaultDaysForType(newType));
    }
  };

  const formatDisplayPhone = (val: string) => {
    // Apenas visual: remove não-números
    return val.replace(/\D/g, '');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: initialContact ? initialContact.id : crypto.randomUUID(),
      name,
      phone,
      type,
      notes,
      lastContactDate,
      followUpFrequencyDays: frequencyDays,
      automationStage: initialContact ? initialContact.automationStage : AutomationStage.IDLE,
      lastAutomatedMsgDate: initialContact?.lastAutomatedMsgDate,
      autoPilotEnabled: initialContact ? initialContact.autoPilotEnabled : true, // Default true for new
      lastReplyContent: initialContact?.lastReplyContent,
      lastReplyTimestamp: initialContact?.lastReplyTimestamp,
      hasUnreadReply: initialContact?.hasUnreadReply
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">{initialContact ? 'Editar Contato' : 'Novo Contato'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Nome</label>
            <input 
              required
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">WhatsApp</label>
            <div className="relative">
                <input 
                required
                type="tel"
                placeholder="Ex: 5511999999999"
                className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 pl-2"
                value={phone}
                onChange={(e) => setPhone(formatDisplayPhone(e.target.value))}
                />
                <p className="text-xs text-gray-400 mt-1">Digite apenas números (com DDD)</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Perfil</label>
              <select 
                className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                value={type}
                onChange={(e) => handleTypeChange(e.target.value as ContactType)}
              >
                {Object.values(ContactType).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Ciclo (dias)</label>
              <input 
                type="number"
                min="1"
                className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                value={frequencyDays}
                onChange={(e) => setFrequencyDays(Number(e.target.value))}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Data Último Contato</label>
            <input 
              type="date"
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              value={lastContactDate}
              onChange={(e) => setLastContactDate(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Observações (Contexto para IA)</label>
            <textarea 
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              rows={3}
              placeholder="Ex: Apartamento Jardins, quer vender rápido..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
