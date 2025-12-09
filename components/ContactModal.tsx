

import React, { useState, useEffect } from 'react';
import { Contact, ContactType, AppSettings, AutomationStage } from '../types';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (contact: Contact) => void;
  onValidate?: (contact: Contact) => string | null;
  initialContact?: Contact | null;
  settings: AppSettings | null;
  defaultType?: ContactType;
}

export const ContactModal: React.FC<ContactModalProps> = ({ isOpen, onClose, onSave, onValidate, initialContact, settings, defaultType }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState<ContactType>(ContactType.CLIENT);
  const [notes, setNotes] = useState('');
  const [lastContactDate, setLastContactDate] = useState('');
  const [frequencyDays, setFrequencyDays] = useState<number>(30);
  const [phoneError, setPhoneError] = useState('');
  const [messageTone, setMessageTone] = useState<string>(''); 

  // Novos Estados
  const [propertyType, setPropertyType] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [propertyValue, setPropertyValue] = useState('');
  const [hasExchange, setHasExchange] = useState(false);
  const [exchangeDescription, setExchangeDescription] = useState('');
  const [exchangeValue, setExchangeValue] = useState('');

  useEffect(() => {
    if (initialContact) {
      setName(initialContact.name);
      setPhone(initialContact.phone);
      setType(initialContact.type);
      setNotes(initialContact.notes);
      setLastContactDate(initialContact.lastContactDate.split('T')[0]);
      setFrequencyDays(initialContact.followUpFrequencyDays);
      setMessageTone(initialContact.messageTone || '');
      
      setPropertyType(initialContact.propertyType || '');
      setPropertyAddress(initialContact.propertyAddress || '');
      setPropertyValue(initialContact.propertyValue || '');
      setHasExchange(initialContact.hasExchange || false);
      setExchangeDescription(initialContact.exchangeDescription || '');
      setExchangeValue(initialContact.exchangeValue || '');
    } else {
      setName('');
      setPhone('');
      setType(defaultType || ContactType.CLIENT);
      setNotes('');
      setLastContactDate(new Date().toISOString().split('T')[0]);
      setMessageTone('');
      
      setPropertyType('');
      setPropertyAddress('');
      setPropertyValue('');
      setHasExchange(false);
      setExchangeDescription('');
      setExchangeValue('');
      
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

  const formatCurrency = (value: string) => {
      const clean = value.replace(/\D/g, '');
      if (!clean) return '';
      const number = parseFloat(clean) / 100;
      return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const handleCurrencyChange = (setter: (val: string) => void, value: string) => {
      setter(formatCurrency(value));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const formattedPhone = validateAndFormatPhone(phone);
    if (!formattedPhone.startsWith('55') || formattedPhone.length < 12) {
        setPhoneError('O número deve incluir DDI (55) + DDD + Número. Ex: 5511999999999');
        return;
    }

    const tempContact: Contact = {
      id: initialContact ? initialContact.id : (typeof crypto !== 'undefined' ? crypto.randomUUID() : Date.now().toString()),
      name,
      phone: formattedPhone,
      type,
      notes,
      lastContactDate,
      followUpFrequencyDays: frequencyDays,
      messageTone: messageTone || undefined,
      automationStage: initialContact?.automationStage ?? AutomationStage.IDLE,
      autoPilotEnabled: initialContact?.autoPilotEnabled ?? true,
      lastReplyTimestamp: initialContact?.lastReplyTimestamp,
      hasUnreadReply: false,
      
      propertyType: (type === ContactType.OWNER || type === ContactType.BUILDER) ? propertyType : undefined,
      propertyAddress: (type === ContactType.OWNER || type === ContactType.BUILDER) ? propertyAddress : undefined,
      propertyValue: (type === ContactType.OWNER || type === ContactType.BUILDER) ? propertyValue : undefined,
      hasExchange: (type === ContactType.CLIENT) ? hasExchange : undefined,
      exchangeDescription: (type === ContactType.CLIENT && hasExchange) ? exchangeDescription : undefined,
      exchangeValue: (type === ContactType.CLIENT && hasExchange) ? exchangeValue : undefined
    };

    if (onValidate) {
        const errorMsg = onValidate(tempContact);
        if (errorMsg) {
            setPhoneError(errorMsg);
            return;
        }
    }

    onSave(tempContact);
    onClose();
  };

  if (!isOpen) return null;

  const toneOptions = ['Casual', 'Formal', 'Persuasivo', 'Amigável', 'Consultivo', 'Urgente', 'Entusiasta', 'Elegante'];
  const isOwnerOrBuilder = type === ContactType.OWNER || type === ContactType.BUILDER;
  const isClient = type === ContactType.CLIENT;

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
                className={`w-full border rounded p-2 ${phoneError ? 'border-red-500 bg-red-50 text-red-700' : ''}`}
                value={phone} 
                onChange={e => {
                    setPhone(e.target.value.replace(/\D/g, ''));
                    setPhoneError('');
                }} 
            />
            {phoneError && <p className="text-xs text-red-600 font-bold mt-1 bg-red-50 p-1 rounded border border-red-100">{phoneError}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div>
                 <label className="block text-xs font-bold text-gray-500 mb-1">Tipo de Cliente</label>
                 <select className="w-full border rounded p-2" value={type} onChange={e => setType(e.target.value as ContactType)}>
                    {Object.values(ContactType).map(t => <option key={t} value={t}>{t}</option>)}
                 </select>
             </div>
             <div>
                 <label className="block text-xs font-bold text-gray-500 mb-1">Ciclo (Dias)</label>
                 <input type="number" className="w-full border rounded p-2" value={frequencyDays} onChange={e => setFrequencyDays(Number(e.target.value))} />
             </div>
          </div>

          {/* CAMPOS ESPECÍFICOS: PROPRIETÁRIO / CONSTRUTOR */}
          {isOwnerOrBuilder && (
            <div className="bg-slate-50 p-3 rounded border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-blue-600 uppercase">Dados do Imóvel</h4>
                
                <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1">Tipo do Imóvel</label>
                    <input className="w-full border rounded p-2 text-sm" placeholder="Ex: Apartamento, Casa, Terreno..." value={propertyType} onChange={e => setPropertyType(e.target.value)} />
                </div>

                <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1">Endereço / Condomínio</label>
                    <input className="w-full border rounded p-2 text-sm" placeholder="Ex: Rua das Flores, 123 - Ed. Solar" value={propertyAddress} onChange={e => setPropertyAddress(e.target.value)} />
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1">Valor Pretendido</label>
                    <input 
                        className="w-full border rounded p-2 text-sm font-mono text-green-700" 
                        placeholder="R$ 0,00" 
                        value={propertyValue} 
                        onChange={e => handleCurrencyChange(setPropertyValue, e.target.value)} 
                    />
                </div>
            </div>
          )}

          {/* CAMPOS ESPECÍFICOS: CLIENTE / COMPRADOR */}
          {isClient && (
            <div className="bg-slate-50 p-3 rounded border border-slate-200 space-y-3">
                <div className="flex items-center gap-2">
                    <input type="checkbox" id="hasExchange" checked={hasExchange} onChange={e => setHasExchange(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
                    <label htmlFor="hasExchange" className="text-sm font-bold text-gray-700 select-none">Possui Permuta?</label>
                </div>
                
                {hasExchange && (
                    <div className="animate-in slide-in-from-top-2 space-y-3 pl-2 border-l-2 border-blue-200">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 mb-1">Descrição da Permuta</label>
                            <input className="w-full border rounded p-2 text-sm" placeholder="Ex: Apto 2 dorms no Centro" value={exchangeDescription} onChange={e => setExchangeDescription(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 mb-1">Valor da Permuta</label>
                            <input 
                                className="w-full border rounded p-2 text-sm font-mono text-green-700" 
                                placeholder="R$ 0,00" 
                                value={exchangeValue} 
                                onChange={e => handleCurrencyChange(setExchangeValue, e.target.value)} 
                            />
                        </div>
                    </div>
                )}
            </div>
          )}
          
          <div>
             <label className="block text-xs font-bold text-gray-500 mb-1">Tom de Voz</label>
             <select className="w-full border rounded p-2" value={messageTone} onChange={e => setMessageTone(e.target.value)}>
                <option value="">Padrão (Usar Global)</option>
                {toneOptions.map(t => <option key={t} value={t}>{t}</option>)}
             </select>
          </div>
          
          <div>
             <label className="block text-xs font-bold text-gray-500 mb-1">Último Contato</label>
             <input type="date" className="w-full border rounded p-2" value={lastContactDate} onChange={e => setLastContactDate(e.target.value)} />
          </div>

          <div>
             <label className="block text-xs font-bold text-gray-500 mb-1">Observações Internas</label>
             <textarea 
                placeholder="Ex: Cliente prefere contato pela manhã..." 
                className={`w-full border rounded p-2 h-20 ${initialContact?.hasUnreadReply ? 'border-blue-500 bg-blue-50' : ''}`}
                value={notes} 
                onChange={e => setNotes(e.target.value)} 
             />
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