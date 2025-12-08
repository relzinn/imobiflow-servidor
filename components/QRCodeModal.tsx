
import React, { useState, useEffect } from 'react';
import { Icons } from '../constants';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected: () => void;
  serverUrl?: string;
  onUrlChange?: (newUrl: string) => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ isOpen, onClose, onConnected, serverUrl = 'https://followimob.squareweb.app', onUrlChange }) => {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'qr' | 'success' | 'error'>('loading');
  const [tempUrl, setTempUrl] = useState(serverUrl);

  useEffect(() => {
    setTempUrl(serverUrl);
  }, [serverUrl]);

  useEffect(() => {
    if (!isOpen) return;

    setStatus('loading');
    setQrCode(null);

    const interval = setInterval(async () => {
      try {
        const url = serverUrl.replace(/\/$/, ''); // Remove barra final
        const headers = { 'ngrok-skip-browser-warning': 'true' }; // Headers para ngrok
        
        // 1. Checa Status
        const statusRes = await fetch(`${url}/status?t=${Date.now()}`, { headers }); // Anti-cache
        if (!statusRes.ok) throw new Error("Erro de rede");
        
        const statusData = await statusRes.json();

        if (statusData.isReady) {
           setStatus('success');
           clearInterval(interval);
           setTimeout(() => {
             onConnected();
             onClose();
           }, 1500);
           return;
        }

        // 2. Se não estiver pronto, busca QR
        if (statusData.status === 'qr_ready') {
           const qrRes = await fetch(`${url}/qr?t=${Date.now()}`, { headers });
           const qrData = await qrRes.json();
           if (qrData.qrCode) {
              setQrCode(qrData.qrCode);
              setStatus('qr');
           }
        }

      } catch (e) {
         console.error("Erro conexão:", e);
         setStatus('error');
         // Não paramos o intervalo, pois o servidor pode subir a qualquer momento
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isOpen, serverUrl]);

  const handleUpdateUrl = () => {
    if (onUrlChange && tempUrl) {
       onUrlChange(tempUrl);
       setStatus('loading');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/95 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95">
        <div className="flex justify-between items-center mb-6">
           <h3 className="font-bold text-lg text-gray-800">Conectar WhatsApp</h3>
           <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl min-h-[250px] flex flex-col items-center justify-center p-4 relative">
            
            {status === 'loading' && (
               <div className="text-center">
                  <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-gray-500 text-sm">Buscando servidor...</p>
                  <p className="text-xs text-gray-400 mt-2 font-mono bg-gray-200 px-2 py-1 rounded break-all">{serverUrl}</p>
               </div>
            )}

            {status === 'error' && (
               <div className="text-center w-full">
                  <span className="text-3xl mb-2 block">🔌</span>
                  <p className="font-bold text-gray-800 mb-1">Falha na Conexão</p>
                  <p className="text-xs text-gray-500 mb-4">O servidor não respondeu em {serverUrl}</p>
                  
                  <div className="text-left w-full bg-white p-3 rounded border border-gray-200 shadow-sm">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Corrigir Endereço</label>
                      <input 
                        className="w-full border-b border-gray-300 py-1 text-sm outline-none focus:border-blue-500"
                        value={tempUrl}
                        onChange={(e) => setTempUrl(e.target.value)}
                        placeholder="https://..."
                      />
                      <button 
                        onClick={handleUpdateUrl}
                        className="mt-3 w-full bg-blue-600 text-white text-xs font-bold py-2 rounded hover:bg-blue-700"
                      >
                        Salvar e Tentar
                      </button>
                  </div>
               </div>
            )}

            {status === 'qr' && qrCode && (
               <div className="text-center">
                  <img src={qrCode} alt="QR Code" className="w-48 h-48 object-contain mx-auto" />
                  <p className="text-xs text-gray-400 mt-2 animate-pulse">Escaneie com seu celular</p>
               </div>
            )}

            {status === 'success' && (
               <div className="text-center">
                  <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
                  <p className="font-bold text-green-700">Conectado!</p>
               </div>
            )}
        </div>
      </div>
    </div>
  );
};
