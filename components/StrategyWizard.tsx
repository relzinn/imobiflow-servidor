import React from 'react';
import { AppSettings } from '../types';

interface StrategyWizardProps {
  onComplete: (settings: AppSettings) => void;
}

export const StrategyWizard: React.FC<StrategyWizardProps> = ({ onComplete }) => {
  const [step, setStep] = React.useState(1);
  const [name, setName] = React.useState('');
  const [agency, setAgency] = React.useState('');
  const [tone, setTone] = React.useState<AppSettings['messageTone']>('Casual');
  const [days, setDays] = React.useState({ owner: 60, builder: 30, client: 15 });
  const [serverUrl, setServerUrl] = React.useState('https://ameer-uncondensational-lemuel.ngrok-free.dev');

  const handleFinish = () => {
    onComplete({
      agentName: name,
      agencyName: agency || "Imobiliária",
      messageTone: tone,
      defaultFrequencyOwner: days.owner,
      defaultFrequencyBuilder: days.builder,
      defaultFrequencyClient: days.client,
      integrationMode: 'server',
      serverUrl: serverUrl,
      preferredWhatsappMode: 'app', 
      whatsappConnected: false,
      automationActive: false
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-8">
        <div className="mb-6">
           <h1 className="text-2xl font-bold mb-2">ImobiFlow</h1>
           <div className="h-1 bg-gray-100 rounded overflow-hidden">
               <div className="h-full bg-blue-600 transition-all duration-300" style={{width: `${step * 33.3}%`}}></div>
           </div>
        </div>

        {step === 1 && (
            <div className="space-y-4">
                <h3 className="font-bold">1. Identidade</h3>
                <div><label className="text-xs font-bold text-gray-500 uppercase">Seu Nome</label><input placeholder="Ex: João Silva" className="w-full border p-3 rounded" value={name} onChange={e => setName(e.target.value)} /></div>
                <div><label className="text-xs font-bold text-gray-500 uppercase">Imobiliária</label><input placeholder="Ex: ImobiFlow Negócios" className="w-full border p-3 rounded" value={agency} onChange={e => setAgency(e.target.value)} /></div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Tom de Voz</label>
                    <select className="w-full border p-3 rounded" value={tone} onChange={e => setTone(e.target.value as any)}>
                        <option value="Casual">Casual</option><option value="Formal">Formal</option><option value="Amigável">Amigável</option><option value="Persuasivo">Persuasivo</option>
                        <option value="Consultivo">Consultivo</option><option value="Elegante">Elegante</option><option value="Urgente">Urgente</option><option value="Entusiasta">Entusiasta</option>
                    </select>
                </div>
                <button onClick={() => setStep(2)} disabled={!name} className="w-full bg-blue-600 text-white p-3 rounded font-bold mt-4 disabled:opacity-50">Próximo</button>
            </div>
        )}

        {step === 2 && (
            <div className="space-y-4">
                <h3 className="font-bold">2. Frequência (Dias)</h3>
                <div><label>Proprietários</label><input type="number" className="w-full border p-2 rounded" value={days.owner} onChange={e => setDays({...days, owner: Number(e.target.value)})} /></div>
                <div><label>Construtores</label><input type="number" className="w-full border p-2 rounded" value={days.builder} onChange={e => setDays({...days, builder: Number(e.target.value)})} /></div>
                <div><label>Clientes</label><input type="number" className="w-full border p-2 rounded" value={days.client} onChange={e => setDays({...days, client: Number(e.target.value)})} /></div>
                <div className="flex gap-2 mt-4">
                    <button onClick={() => setStep(1)} className="flex-1 bg-gray-200 p-3 rounded font-bold">Voltar</button>
                    <button onClick={() => setStep(3)} className="flex-1 bg-blue-600 text-white p-3 rounded font-bold">Próximo</button>
                </div>
            </div>
        )}

        {step === 3 && (
            <div className="space-y-4">
                <h3 className="font-bold">3. Conexão</h3>
                <p className="text-sm text-gray-600">Insira o endereço do seu servidor de automação.</p>
                <input placeholder="URL do Servidor" className="w-full border p-2 rounded text-sm" value={serverUrl} onChange={e => setServerUrl(e.target.value)} />
                <div className="flex gap-2 mt-4">
                    <button onClick={() => setStep(2)} className="flex-1 bg-gray-200 p-3 rounded font-bold">Voltar</button>
                    <button onClick={handleFinish} className="flex-1 bg-green-600 text-white p-3 rounded font-bold">Concluir</button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};