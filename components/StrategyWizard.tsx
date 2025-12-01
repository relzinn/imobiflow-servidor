
import React from 'react';
import { AppSettings } from '../types';
import { Icons } from '../constants';

interface StrategyWizardProps {
  onComplete: (settings: AppSettings) => void;
}

export const StrategyWizard: React.FC<StrategyWizardProps> = ({ onComplete }) => {
  const [step, setStep] = React.useState(1);
  const [name, setName] = React.useState('');
  const [apiKey, setApiKey] = React.useState('');
  const [tone, setTone] = React.useState<AppSettings['messageTone']>('Casual');
  
  // Separate states for each contact type frequency
  const [daysOwner, setDaysOwner] = React.useState(60);
  const [daysBuilder, setDaysBuilder] = React.useState(30);
  const [daysClient, setDaysClient] = React.useState(15);

  // Integration Settings
  const [integrationMode, setIntegrationMode] = React.useState<'browser' | 'server'>('browser');
  // Default to Localhost for local development
  const [serverUrl, setServerUrl] = React.useState('http://localhost:3001');

  // Connection states
  const [waMode, setWaMode] = React.useState<'web' | 'app'>('web'); // For browser mode
  const [connectionVerified, setConnectionVerified] = React.useState(false); // For both modes

  const testConnection = () => {
    // Browser Mode Test
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
      apiKey: apiKey,
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
        
        {/* Progress Bar */}
        <div className="flex gap-2 mb-8">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className={`h-2 flex-1 rounded-full ${i <= step ? 'bg-blue-600' : 'bg-gray-200'}`} />
          ))}
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">
            {step === 1 && "1. Sua Identidade"}
            {step === 2 && "2. Inteligência Artificial"}
            {step === 3 && "3. Ciclos de Follow-up"}
            {step === 4 && "4. Configurar WhatsApp"}
          </h1>
        </div>

        <div className="min-h-[300px]">
          {/* STEP 1: Identity */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <label className="block text-sm text-gray-700 mb-1">Como você gosta de ser chamado nas mensagens?</label>
              <input 
                autoFocus
                required
                placeholder="Ex: João da Silva Imóveis"
                className="w-full p-4 text-lg rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="text-sm text-gray-500">Este nome será usado na assinatura das mensagens automáticas.</p>
            </div>
          )}

          {/* STEP 2: AI Config */}
          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">Chave de API do Google Gemini</label>
                <input 
                  type="password"
                  required
                  placeholder="Cole sua chave aqui (AIza...)"
                  className="w-full p-3 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-2">
                  Necessário para gerar mensagens. Obtenha grátis em: <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-blue-600 underline">Google AI Studio</a>.
                </p>
              </div>

              <div>
                  <p className="text-sm text-gray-600 mb-4">Escolha a personalidade da sua IA:</p>
                  <div className="grid grid-cols-2 gap-4">
                    {['Formal', 'Casual', 'Persuasivo', 'Amigável'].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTone(t as any)}
                        className={`p-4 rounded-xl border-2 text-left transition-all hover:scale-[1.02] ${
                          tone === t 
                            ? 'bg-purple-50 border-purple-600 text-purple-900' 
                            : 'bg-white text-gray-600 border-gray-100 hover:border-purple-200'
                        }`}
                      >
                        <div className="font-bold text-lg mb-1">{t}</div>
                        <div className="text-xs opacity-70">
                          {t === 'Formal' && "Prezado(a), gostaria de verificar..."}
                          {t === 'Casual' && "Oi! Tudo bem? Passando pra saber..."}
                          {t === 'Persuasivo' && "Oportunidade única passando..."}
                          {t === 'Amigável' && "Olá amigo, como estão as coisas?"}
                        </div>
                      </button>
                    ))}
                  </div>
              </div>
            </div>
          )}

          {/* STEP 3: Frequency */}
          {step === 3 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <p className="text-sm text-gray-600 mb-6">A cada quantos dias devemos contatar cada perfil?</p>
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-32 font-bold text-gray-700">Proprietários</div>
                  <input 
                    type="range" min="15" max="120" step="5"
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    value={daysOwner} onChange={(e) => setDaysOwner(Number(e.target.value))}
                  />
                  <div className="w-16 text-right font-mono font-bold text-blue-600">{daysOwner}d</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-32 font-bold text-gray-700">Construtores</div>
                  <input 
                    type="range" min="7" max="60" step="1"
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                    value={daysBuilder} onChange={(e) => setDaysBuilder(Number(e.target.value))}
                  />
                  <div className="w-16 text-right font-mono font-bold text-purple-600">{daysBuilder}d</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-32 font-bold text-gray-700">Clientes</div>
                  <input 
                    type="range" min="3" max="45" step="1"
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600"
                    value={daysClient} onChange={(e) => setDaysClient(Number(e.target.value))}
                  />
                  <div className="w-16 text-right font-mono font-bold text-green-600">{daysClient}d</div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: WhatsApp Connection */}
          {step === 4 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="mb-6 space-y-4">
                <p className="text-sm font-medium text-gray-700">Escolha o método de envio:</p>
                
                {/* Method 1: Browser (Default) */}
                <label className={`block p-4 rounded-xl border-2 cursor-pointer transition-all ${integrationMode === 'browser' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex items-center gap-3">
                    <input 
                      type="radio" 
                      name="integration"
                      checked={integrationMode === 'browser'}
                      onChange={() => {
                        setIntegrationMode('browser');
                        setConnectionVerified(false);
                      }}
                      className="w-5 h-5 text-blue-600"
                    />
                    <div className="flex-1">
                      <div className="font-bold text-gray-800">Modo Navegador (Padrão)</div>
                      <p className="text-xs text-gray-500 mt-1">Usa o WhatsApp instalado no computador ou Web. Requer 1 clique para enviar.</p>
                    </div>
                  </div>
                  
                  {integrationMode === 'browser' && (
                     <div className="mt-4 pt-4 border-t border-blue-100 animate-in fade-in">
                        <p className="text-xs text-blue-800 mb-2">Preferência de abertura:</p>
                        <div className="flex gap-2">
                           <button onClick={() => setWaMode('app')} className={`flex-1 text-xs py-2 rounded border ${waMode === 'app' ? 'bg-white border-blue-400 font-bold' : 'border-transparent'}`}>App Desktop</button>
                           <button onClick={() => setWaMode('web')} className={`flex-1 text-xs py-2 rounded border ${waMode === 'web' ? 'bg-white border-blue-400 font-bold' : 'border-transparent'}`}>Whatsapp Web</button>
                        </div>
                        <button 
                          onClick={() => { testConnection(); setConnectionVerified(true); }}
                          className="w-full mt-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700"
                        >
                          Testar e Validar
                        </button>
                     </div>
                  )}
                </label>

                {/* Method 2: Server Automation */}
                <label className={`block p-4 rounded-xl border-2 cursor-pointer transition-all ${integrationMode === 'server' ? 'border-emerald-600 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex items-center gap-3">
                    <input 
                      type="radio" 
                      name="integration"
                      checked={integrationMode === 'server'}
                      onChange={() => {
                        setIntegrationMode('server');
                        setConnectionVerified(false);
                      }}
                      className="w-5 h-5 text-emerald-600"
                    />
                    <div className="flex-1">
                      <div className="font-bold text-gray-800 flex items-center gap-2">
                         Modo Automação (API)
                         <span className="bg-emerald-200 text-emerald-900 text-[10px] px-2 rounded-full uppercase">Local</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Conecta ao seu servidor local (server.js). Envio automático.</p>
                    </div>
                  </div>

                  {integrationMode === 'server' && (
                     <div className="mt-4 pt-4 border-t border-emerald-100 animate-in fade-in">
                        <label className="block text-xs font-bold text-emerald-800 mb-1">URL do Servidor API</label>
                        <input 
                          type="url"
                          value={serverUrl}
                          onChange={(e) => setServerUrl(e.target.value)}
                          placeholder="http://localhost:3001"
                          className="w-full p-2 border border-emerald-300 rounded bg-white text-sm"
                        />
                        <button 
                          onClick={() => setConnectionVerified(true)}
                          className="w-full mt-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700"
                        >
                          Confirmar Configuração
                        </button>
                     </div>
                  )}
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
          {step > 1 ? (
            <button 
              onClick={prevStep}
              className="px-6 py-3 text-gray-500 hover:text-gray-800 font-medium"
            >
              Voltar
            </button>
          ) : <div></div>}
          
          {step < 4 ? (
            <button 
              onClick={nextStep}
              disabled={step === 1 ? !name : (step === 2 && !apiKey)}
              className="bg-slate-800 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              Próximo <span className="text-xl">→</span>
            </button>
          ) : (
            <button 
              onClick={handleFinish}
              disabled={!connectionVerified}
              className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-200"
            >
              Iniciar Sistema ImobiFlow
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
