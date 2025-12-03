import React, { useState, useEffect } from 'react';
import { Contact, ContactType, AppSettings, AutomationStage } from '../types';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (contact: Contact) => void;
  initialContact?: Contact | null;
  settings: AppSettings | null;
  defaultType?: ContactType;
}

export const ContactModal: React.FC<ContactModalProps> = ({ isOpen, onClose, onSave, initialContact, settings, defaultType }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState<ContactType>(ContactType.CLIENT);
  const [notes, setNotes] = useState('');
  const [lastContactDate, setLastContactDate] = useState('');
  const [frequencyDays, setFrequencyDays] = useState<number>(30);
  const [phoneError, setPhoneError] = useState('');
  const [messageTone, setMessageTone] = useState<string>(''); // Vazio = Padrão

  useEffect(() => {
    if (initialContact) {
      setName(initialContact.name);
      setPhone(initialContact.phone);
      setType(initialContact.type);
      setNotes(initialContact.notes);
      setLastContactDate(initialContact.lastContactDate.split('T')[0]);
      setFrequencyDays(initialContact.followUpFrequencyDays);
      setMessageTone(initialContact.messageTone || '');
    } else {
      setName('');
      setPhone('');
      setType(defaultType || ContactType.CLIENT);
      setNotes('');
      setLastContactDate(new Date().toISOString().split('T')[0]);
      setMessageTone('');
      
      const targetType = defaultType || ContactType.CLIENT;
      if (settings) {
          if (targetType === ContactType.OWNER) setFrequencyDays(settings.defaultFrequencyOwner);
          else if (targetType === ContactType.BUILDER) setFrequencyDays(settings.defaultFrequencyBuilder);
          else setFrequencyDays(settings.defaultFrequencyClient);
      } else {
          setFrequencyDays(30);
      }
    }
    setPhoneError('');
  }, [initialContact, isOpen, settings, defaultType]);

  const validateAndFormatPhone = (input: string) => {
      let clean = input.replace(/\D/g, '');
      if (clean.length === 10 || clean.length === 11) {
          clean = '55' + clean;
      }
      return clean;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const formattedPhone = validateAndFormatPhone(phone);
    if (!formattedPhone.startsWith('55') || formattedPhone.length < 12) {
        setPhoneError('O número deve incluir DDI (55) + DDD + Número. Ex: 5511999999999');
        return;
    }

    onSave({
      id: initialContact ? initialContact.id : (typeof crypto !== 'undefined' ? crypto.randomUUID() : Date.now().toString()),
      name,
      phone: formattedPhone,
      type,
      notes,
      lastContactDate,
      followUpFrequencyDays: frequencyDays,
      messageTone: messageTone || undefined, // Se vazio, não salva
      automationStage: initialContact?.automationStage ?? AutomationStage.IDLE,
      autoPilotEnabled: initialContact?.autoPilotEnabled ?? true,
      lastReplyTimestamp: initialContact?.lastReplyTimestamp,
      hasUnreadReply: false 
    });
    onClose();
  };

  if (!isOpen) return null;

  const toneOptions = ['Casual', 'Formal', 'Persuasivo', 'Amigável', 'Consultivo', 'Urgente', 'Entusiasta', 'Elegante'];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">{initialContact ? 'Editar' : 'Novo'} Contato</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Nome</label>
            <input required placeholder="Nome do Cliente" className="w-full border rounded p-2" value={name} onChange={e => setName(e.target.value)} />
          </div>
          
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">WhatsApp (Obrigatório 55)</label>
            <input 
                required 
                placeholder="5511999999999" 
                className={`w-full border rounded p-2 ${phoneError ? 'border-red-500 bg-red-50' : ''}`}
                value={phone} 
                onChange={e => {
                    setPhone(e.target.value.replace(/\D/g, ''));
                    setPhoneError('');
                }} 
            />
            {phoneError && <p className="text-xs text-red-500 mt-1">{phoneError}</p>}
            <p className="text-[10px] text-gray-400 mt-1">O sistema adicionará '55' automaticamente se você esquecer.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div>
                 <label className="block text-xs font-bold text-gray-500 mb-1">Tipo</label>
                 <select className="w-full border rounded p-2" value={type} onChange={e => setType(e.target.value as ContactType)}>
                    {Object.values(ContactType).map(t => <option key={t} value={t}>{t}</option>)}
                 </select>
             </div>
             <div>
                 <label className="block text-xs font-bold text-gray-500 mb-1">Ciclo (Dias)</label>
                 <input type="number" className="w-full border rounded p-2" value={frequencyDays} onChange={e => setFrequencyDays(Number(e.target.value))} />
             </div>
          </div>
          
          <div>
             <label className="block text-xs font-bold text-gray-500 mb-1">Tom de Voz</label>
             <select className="w-full border rounded p-2" value={messageTone} onChange={e => setMessageTone(e.target.value)}>
                <option value="">Padrão (Usar Global)</option>
                {toneOptions.map(t => <option key={t} value={t}>{t}</option>)}
             </select>
             <p className="text-[10px] text-gray-400 mt-1">Define como a IA fala com este contato específico.</p>
          </div>
          
          <div>
             <label className="block text-xs font-bold text-gray-500 mb-1">Último Contato</label>
             <input type="date" className="w-full border rounded p-2" value={lastContactDate} onChange={e => setLastContactDate(e.target.value)} />
          </div>

          <div>
             <label className="block text-xs font-bold text-gray-500 mb-1">Observações Internas</label>
             <textarea 
                placeholder="Ex: Procura apto 3 quartos, reclamou do preço, quer vista pro mar..." 
                className="w-full border rounded p-2 h-24" 
                value={notes} 
                onChange={e => setNotes(e.target.value)} 
             />
             <p className="text-[10px] text-gray-400 mt-1">Essa informação é interna. A IA usará apenas como contexto.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
             <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200">Cancelar</button>
             <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700">Salvar</button>
          </div>
        </form>
      </div>
    </div>
  );
};