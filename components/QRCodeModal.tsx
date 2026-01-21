import React, { useState, useEffect } from 'react';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected: () => void;
  serverUrl?: string;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ isOpen, onClose, onConnected, serverUrl = 'https://followimob.squareweb.app' }) => {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'qr' | 'success' | 'error'>('loading');

  useEffect(() => {
    if (!isOpen) return;

    setStatus('loading');
    setQrCode(null);

    const interval = setInterval(async () => {
      try {
        const url = serverUrl.replace(/\/$/, '');
        const res = await fetch(`${url}/status?t=${Date.now()}`, { 
          headers: { 'ngrok-skip-browser-warning': 'true' } 
        });
        
        if (!res.ok) throw new Error();
        const data = await res.json();

        if (data.isReady) {
          setStatus('success');
          clearInterval(interval);
          setTimeout(() => {
            onConnected();
            onClose();
          }, 1500);
        } else if (data.status === 'qr_ready') {
          const qrRes = await fetch(`${url}/qr?t=${Date.now()}`);
          const qrData = await qrRes.json();
          if (qrData.qrCode) {
            setQrCode(qrData.qrCode);
            setStatus('qr');
          }
        }
      } catch (e) {
        setStatus('error');
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isOpen, serverUrl]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 z-[100]">
      <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full p-10 animate-in zoom-in-95">
        <div className="flex justify-between items-center mb-8">
           <h3 className="font-black text-2xl text-slate-900 tracking-tight text-center w-full">WhatsApp Connection</h3>
        </div>

        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] min-h-[300px] flex flex-col items-center justify-center p-6 text-center">
            {status === 'loading' && (
               <div className="space-y-4">
                  <div className="animate-spin w-10 h-10 border-4 border-slate-900 border-t-transparent rounded-full mx-auto"></div>
                  <p className="text-slate-500 font-bold text-sm">Consultando Servidor...</p>
               </div>
            )}

            {status === 'qr' && qrCode && (
               <div className="space-y-6">
                  <div className="bg-white p-4 rounded-[1.5rem] shadow-sm inline-block">
                    <img src={qrCode} alt="QR Code" className="w-48 h-48 object-contain" />
                  </div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest animate-pulse italic">Abra o WhatsApp > Aparelhos Conectados</p>
               </div>
            )}

            {status === 'success' && (
               <div className="space-y-4">
                  <div className="w-16 h-16 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto text-3xl shadow-lg shadow-green-100">✓</div>
                  <p className="font-black text-green-600 text-lg uppercase tracking-widest">Conectado com Sucesso!</p>
               </div>
            )}

            {status === 'error' && (
               <div className="space-y-4">
                  <div className="text-4xl">🔌</div>
                  <p className="font-bold text-slate-800">Servidor Offline</p>
                  <p className="text-xs font-medium text-slate-400">Verifique se o seu servidor backend em Square Cloud está ativo.</p>
                  <button onClick={onClose} className="mt-4 px-6 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl">Fechar</button>
               </div>
            )}
        </div>
      </div>
    </div>
  );
};