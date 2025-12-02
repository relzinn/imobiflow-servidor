
import React from 'react';
import { AppSettings } from '../types';

interface StrategyWizardProps {
  onComplete: (settings: AppSettings) => void;
}

export const StrategyWizard: React.FC<StrategyWizardProps> = ({ onComplete }) => {
  const [step, setStep] = React.useState(1);
  const [name, setName] = React.useState('');
  const [tone, setTone] = React.useState<AppSettings['messageTone']>('Casual');
  const [days, setDays] = React.useState({ owner: 60, builder: 30, client: 15 });
  const [integration, setIntegration] = React.useState<'browser' | 'server'>('browser');
  const [serverUrl, setServerUrl] = React.useState('http://localhost:3001');

  const handleFinish = () => {
    onComplete({
      agentName: name,
      apiKey: '',
      messageTone: tone,
      defaultFrequencyOwner: days.owner,
      defaultFrequencyBuilder: days.builder,
      defaultFrequencyClient: days.client,
      integrationMode: integration,
      serverUrl: integration === 'server' ? serverUrl : undefined,
      preferredWhatsappMode: 'web',
      whatsappConnected: false
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-8">
        <div className="mb-6">
           <h1 className="text-2xl font-bold mb-2">Configuração Inicial</h1>
           <div className="h-1 bg-gray-100 rounded overflow-hidden">
               <div className="h-full bg-blue-600 transition-all duration-300" style={{width: `${step * 33.3}%`}}></div>
           </div>
        </div>

        {step === 1 && (
            <div className="space-y-4">
                <h3 className="font-bold">1. Identidade</h3>
                <input placeholder="Seu Nome / Apelido" className="w-full border p-3 rounded" value={name} onChange={e => setName(e.target.value)} />
                <select className="w-full border p-3 rounded" value={tone} onChange={e => setTone(e.target.value as any)}>
                    <option value="Casual">Casual</option>
                    <option value="Formal">Formal</option>
                </select>
                <button onClick={() => setStep(2)} disabled={!name} className="w-full bg-blue-600 text-white p-3 rounded font-bold mt-4 disabled:opacity-50">Próximo</button>
            </div>
        )}

        {step === 2 && (
            <div className="space-y-4">
                <h3 className="font-bold">2. Frequência de Contato (Dias)</h3>
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
                <h3 className="font-bold">3. Integração</h3>
                <div className="space-y-2">
                    <button onClick={() => setIntegration('browser')} className={`w-full p-3 rounded border text-left ${integration === 'browser' ? 'border-blue-500 bg-blue-50' : ''}`}>
                        <strong>Modo Navegador (Simples)</strong><br/><span className="text-xs">Abre janelas do WhatsApp Web.</span>
                    </button>
                    <button onClick={() => setIntegration('server')} className={`w-full p-3 rounded border text-left ${integration === 'server' ? 'border-blue-500 bg-blue-50' : ''}`}>
                        <strong>Modo Automação (Servidor)</strong><br/><span className="text-xs">Envia em segundo plano (requer instalação).</span>
                    </button>
                </div>
                {integration === 'server' && (
                    <input placeholder="URL do Servidor" className="w-full border p-2 rounded text-sm" value={serverUrl} onChange={e => setServerUrl(e.target.value)} />
                )}
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
