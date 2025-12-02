
import React from 'react';
import { AppSettings } from '../types';
import { Icons } from '../constants';

interface StrategyWizardProps {
  onComplete: (settings: AppSettings) => void;
}

export const StrategyWizard: React.FC<StrategyWizardProps> = ({ onComplete }) => {
  const [step, setStep] = React.useState(1);
  const [name, setName] = React.useState('');
  // API Key removida do fluxo visual
  const [tone, setTone] = React.useState<AppSettings['messageTone']>('Casual');
  
  const [daysOwner, setDaysOwner] = React.useState(60);
  const [daysBuilder, setDaysBuilder] = React.useState(30);
  const [daysClient, setDaysClient] = React.useState(15);

  const [integrationMode, setIntegrationMode] = React.useState<'browser' | 'server'>('browser');
  const [serverUrl, setServerUrl] = React.useState('http://localhost:3001');

  const [waMode, setWaMode] = React.useState<'web' | 'app'>('web');
  const [connectionVerified, setConnectionVerified] = React.useState(false);

  const testConnection = () => {
    const text = encodeURIComponent("Olá! Esta é uma mensagem de teste do ImobiFlow.");
    let url = '';
    if (waMode === 'app') {
      url = `whatsapp://send?text=${text}`;
    } else {
      url = `https://web.whatsapp.com/send?text=${text}`;
    }
    window.open(url, '_blank');
  };

  const handleFinish = () => {
    onComplete({
      agentName: name,
      apiKey: '', // Sem API Key
      messageTone: tone,
      defaultFrequencyOwner: daysOwner,
      defaultFrequencyBuilder: daysBuilder,
      defaultFrequencyClient: daysClient,
      integrationMode: integrationMode,
      serverUrl: integrationMode === 'server' ? serverUrl : undefined,
      preferredWhatsappMode: waMode,
      whatsappConnected: connectionVerified
    });
  };

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);

  return (
    <div className="fixed inset-0 bg-slate-900 bg-opacity-95 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 my-8 transition-all duration-300">
        
        <div className="flex gap-2 mb-8">
          {[1, 2, 3].map(i => (
            <div key={i} className={`h-2 flex-1 rounded-full ${i <= step ? 'bg-blue-600' : 'bg-gray-200'}`} />
          ))}
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">
            {step === 1 && "1. Sua Identidade & Estilo"}
            {step === 2 && "2. Ciclos de Follow-up"}
            {step === 3 && "3. Configurar WhatsApp"}
          </h1>
        </div>

        <div className="min-h-[300px]">
          {/* STEP 1: Identity & Tone