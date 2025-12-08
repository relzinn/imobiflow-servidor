
import React from 'react';
import { AppSettings } from '../types';

interface StrategyWizardProps {
  onComplete: (settings: AppSettings) => void;
}

export const StrategyWizard: React.FC<StrategyWizardProps> = ({ onComplete }) => {
  const [step, setStep] = React.useState(1);
  const [name, setName] = React.useState('');
  const [agency, setAgency] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [tone, setTone] = React.useState<AppSettings['messageTone']>('Casual');
  const [days, setDays] = React.useState({ owner: 60, builder: 30, client: 15 });
  const [serverUrl, setServerUrl] = React.useState('https://followimob.squareweb.app');

  const handleFinish = () => {
    onComplete({
      agentName: name,
      agencyName: agency || "Imobiliária",
      password: password, // Salva a senha definida
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
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-8 animate-in fade-in zoom-in-95 duration-300">
        <div className="mb-6">
           <h1 className="text-2xl font-bold mb-2 text-slate-800">ImobiFlow <span className="text-blue-600">Setup</span></h1>
           <div className="h-1 bg-gray-100 rounded overflow-hidden">
               <div className="h-full bg-blue-600 transition-all duration-300" style={{width: `${step * 25}%`}}></div>
           </div>
        </div>

        {step === 1 && (
            <div className="space-y-4">
                <h3 className="font-bold text-lg">1. Identidade</h3>
                <p className="text-sm text-gray-500">Como a IA deve se apresentar aos seus clientes?</p>
                <div><label className="text-xs font-bold text-gray-500 uppercase">Seu Nome</label><input placeholder="Ex: João Silva" className="w-full border p-3 rounded focus:border-blue-500 outline-none" value={name} onChange={e => setName(e.target.value)} /></div>
                <div><label className="text-xs font-bold text-gray-500 uppercase">Nome da Imobiliária</label><input placeholder="Ex: ImobiFlow Negócios" className="w-full border p-3 rounded focus:border-blue-500 outline-none" value={agency} onChange={e => setAgency(e.target.value)} /></div>
                
                <button onClick={() => setStep(2)} disabled={!name} className="w-full bg-blue-600 text-white p-3 rounded-lg font-bold mt-4 disabled:opacity-50 hover:bg-blue-700 transition-colors">Próximo</button>
            </div>
        )}

        {step === 2 && (
            <div className="space-y-4">
                <h3 className="font-bold text-lg">2. Segurança</h3>
                <p className="text-sm text-gray-500">Crie uma senha para proteger o acesso ao seu painel.</p>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Definir Senha de Acesso</label>
                    <input type="password" placeholder="Sua senha segura" className="w-full border p-3 rounded focus:border-blue-500 outline-none" value={password} onChange={e => setPassword(e.target.value)} />
                </div>
                
                <div className="flex gap-2 mt-4">
                    <button onClick={() => setStep(1)} className="flex-1 bg-gray-100 text-gray-700 p-3 rounded-lg font-bold hover:bg-gray-200">Voltar</button>
                    <button onClick={() => setStep(3)} disabled={!password || password.length < 4} className="flex-1 bg-blue-600 text-white p-3 rounded-lg font-bold disabled:opacity-50 hover:bg-blue-700">Próximo</button>
                </div>
            </div>
        )}

        {step === 3 && (
            <div className="space-y-4">
                <h3 className="font-bold text-lg">3. Estratégia</h3>
                <p className="text-sm text-gray-500">Defina o tom de voz e a frequência de contato.</p>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Tom de Voz da IA</label>
                    <select className="w-full border p-3 rounded focus:border-blue-500 outline-none" value={tone} onChange={e => setTone(e.target.value as any)}>
                        <option value="Casual">Casual (Mais relaxado)</option><option value="Formal">Formal (Mais sério)</option><option value="Amigável">Amigável (Próximo)</option><option value="Persuasivo">Persuasivo (Vendas)</option>
                        <option value="Consultivo">Consultivo (Especialista)</option><option value="Elegante">Elegante (Alto padrão)</option><option value="Urgente">Urgente (Escassez)</option><option value="Entusiasta">Entusiasta (Energético)</option>
                    </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <div><label className="text-xs font-bold text-gray-500">Proprietários</label><input type="number" className="w-full border p-2 rounded" value={days.owner} onChange={e => setDays({...days, owner: Number(e.target.value)})} /></div>
                    <div><label className="text-xs font-bold text-gray-500">Construtores</label><input type="number" className="w-full border p-2 rounded" value={days.builder} onChange={e => setDays({...days, builder: Number(e.target.value)})} /></div>
                    <div><label className="text-xs font-bold text-gray-500">Clientes</label><input type="number" className="w-full border p-2 rounded" value={days.client} onChange={e => setDays({...days, client: Number(e.target.value)})} /></div>
                </div>
                <div className="flex gap-2 mt-4">
                    <button onClick={() => setStep(2)} className="flex-1 bg-gray-100 text-gray-700 p-3 rounded-lg font-bold hover:bg-gray-200">Voltar</button>
                    <button onClick={() => setStep(4)} className="flex-1 bg-blue-600 text-white p-3 rounded-lg font-bold hover:bg-blue-700">Próximo</button>
                </div>
            </div>
        )}

        {step === 4 && (
            <div className="space-y-4">
                <h3 className="font-bold text-lg">4. Conexão</h3>
                <p className="text-sm text-gray-500">Confirme o endereço do servidor.</p>
                <input placeholder="URL do Servidor" className="w-full border p-2 rounded text-sm bg-gray-50" value={serverUrl} onChange={e => setServerUrl(e.target.value)} />
                <div className="flex gap-2 mt-4">
                    <button onClick={() => setStep(3)} className="flex-1 bg-gray-100 text-gray-700 p-3 rounded-lg font-bold hover:bg-gray-200">Voltar</button>
                    <button onClick={handleFinish} className="flex-1 bg-green-600 text-white p-3 rounded-lg font-bold hover:bg-green-700 shadow-lg shadow-green-200">Finalizar Setup</button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};
