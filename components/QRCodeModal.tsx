
import React, { useState, useEffect } from 'react';
import { Icons } from '../constants';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected: () => void;
  serverUrl?: string;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ isOpen, onClose, onConnected, serverUrl = 'https://imobiflow-bot.onrender.com' }) => {
  const [qrCodeImage, setQrCodeImage] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'qr' | 'success' | 'error'>('loading');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;

    if (isOpen) {
      setStatus('loading');
      setQrCodeImage(null);
      
      const checkStatus = async () => {
        try {
          // Check Status
          const statusRes = await fetch(`${serverUrl}/status`);
          const statusData = await statusRes.json();

          if (statusData.isReady || statusData.status === 'ready') {
             setStatus('success');
             clearInterval(intervalId);
             setTimeout(() => {
                 onConnected();
                 onClose();
             }, 1500);
             return;
          }

          // If not ready, get QR
          if (statusData.status === 'qr_ready' || statusData.status === 'initializing') {
              const qrRes = await fetch(`${serverUrl}/qr`);
              const qrData = await qrRes.json();
              
              if (qrData.qrCode) {
                  setQrCodeImage(qrData.qrCode);
                  setStatus('qr');
              }
          }
        } catch (error) {
           console.error("Erro ao conectar com servidor:", error);
           setStatus('error');
        }
      };

      // Poll every 2 seconds
      checkStatus(); // Initial call
      intervalId = setInterval(checkStatus, 2000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isOpen, serverUrl, retryCount]);

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    setStatus('loading');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/90 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center animate-in zoom-in-95 duration-200">
        
        <div className="flex justify-end">
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="mb-6">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icons.WhatsApp />
          </div>
          <h2 className="text-xl font-bold text-gray-800">Conectar WhatsApp</h2>
          <p className="text-sm text-gray-500 mt-2">
            Servidor de Automação
          </p>
        </div>

        <div className="flex flex-col items-center justify-center min-h-[250px] bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 mb-6 relative overflow-hidden p-4">
            
            {status === 'loading' && (
                <div className="text-center">
                    <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-sm text-gray-600 font-medium">Buscando QR Code...</p>
                    <p className="text-xs text-gray-400 mt-2">Certifique-se que o server.js está rodando</p>
                </div>
            )}

            {status === 'error' && (
                <div className="text-center">
                    <div className="text-red-500 mb-2">⚠️</div>
                    <p className="text-sm text-gray-800 font-bold mb-2">Servidor Offline</p>
                    <p className="text-xs text-gray-500 mb-4">
                        Não foi possível conectar em {serverUrl}
                    </p>
                    <button 
                        onClick={handleRetry}
                        className="text-xs bg-gray-200 hover:bg-gray-300 px-3 py-2 rounded text-gray-700 font-medium"
                    >
                        Tentar Novamente
                    </button>
                </div>
            )}

            {status === 'qr' && qrCodeImage && (
                <div className="relative animate-in fade-in">
                    <img src={qrCodeImage} alt="QR Code WhatsApp" className="w-48 h-48 object-contain" />
                    <p className="text-xs text-center text-gray-400 mt-2">Atualiza automaticamente</p>
                </div>
            )}

            {status === 'success' && (
                <div className="text-center animate-in zoom-in duration-300">
                    <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center text-white mx-auto mb-4 shadow-lg shadow-green-200">
                        <Icons.Check />
                    </div>
                    <p className="font-bold text-gray-800">Conectado com Sucesso!</p>
                </div>
            )}
        </div>

        {status === 'qr' && (
            <div className="text-sm text-left space-y-2 text-gray-600 bg-blue-50 p-4 rounded-lg">
                <p>1. Abra o WhatsApp no celular</p>
                <p>2. Vá em <strong>Aparelhos Conectados</strong></p>
                <p>3. Escaneie o QR Code acima</p>
            </div>
        )}
      </div>
    </div>
  );
};
