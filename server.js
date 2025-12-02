
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Permitir qualquer origem e métodos (CORS Total para evitar bloqueio local)
app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json());

// Armazenamento em memória
let qrCodeData = null;
let isReady = false;
let clientStatus = 'initializing';

// Cache de últimas mensagens recebidas
const incomingActivity = {};

// Configuração robusta do Cliente
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "imobiflow-session"
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', 
            '--disable-gpu'
        ]
    }
});

// --- EVENTOS DO CLIENTE ---

client.on('qr', (qr) => {
    console.log('📱 QR Code recebido! Escaneie agora.');
    qrcodeTerminal.generate(qr, { small: true });
    
    qrcode.toDataURL(qr, (err, url) => {
        qrCodeData = url;
        clientStatus = 'qr_ready';
    });
});

client.on('ready', () => {
    console.log('✅ WhatsApp Conectado e Pronto!');
    isReady = true;
    clientStatus = 'ready';
    qrCodeData = null;
});

client.on('authenticated', () => {
    console.log('🔑 Sessão Autenticada com sucesso!');
    clientStatus = 'authenticated';
    qrCodeData = null;
});

client.on('auth_failure', msg => {
    console.error('❌ Falha na autenticação:', msg);
    clientStatus = 'error';
});

client.on('disconnected', async (reason) => {
    console.log('⚠️ WhatsApp desconectado:', reason);
    isReady = false;
    clientStatus = 'disconnected';
    
    // ANTI-LOOP: Destrói cliente antigo e aguarda antes de reiniciar
    try {
        await client.destroy();
    } catch (e) {
        console.error('Erro ao destruir cliente:', e);
    }

    console.log('🔄 Aguardando 5 segundos para reiniciar...');
    setTimeout(() => {
        console.log('🚀 Tentando inicializar novamente...');
        client.initialize().catch(e => console.error("Falha ao reinicializar:", e));
    }, 5000);
});

// ESCUTA MENSAGENS RECEBIDAS
client.on('message', async msg => {
    try {
        const fromNumber = msg.from.replace('@c.us', '');
        console.log(`[🔔 NOTIFICAÇÃO] Mensagem recebida de: ${fromNumber}`);
        
        incomingActivity[fromNumber] = {
            timestamp: Date.now(),
            body: "Nova mensagem recebida. Verifique o WhatsApp."
        };
    } catch (e) {
        console.error('Erro ao processar msg recebida', e);
    }
});

// Inicialização segura
try {
    client.initialize();
} catch (e) {
    console.error("Erro fatal na inicialização:", e);
}

// --- FUNÇÕES AUXILIARES ---

function formatPhoneNumber(phone) {
    let clean = phone.replace(/\D/g, '');
    if (clean.length >= 10 && clean.length <= 11) {
        clean = '55' + clean;
    }
    return clean;
}

// --- ROTAS DA API ---

app.get('/', (req, res) => {
    res.send('ImobiFlow Server está rodando! Acesse /scan para conectar.');
});

app.get('/status', (req, res) => {
    res.json({ 
        status: clientStatus,
        isReady: isReady 
    });
});

app.get('/qr', (req, res) => {
    // Adiciona timestamp para evitar cache
    res.json({ qrCode: qrCodeData, ts: Date.now() });
});

app.get('/scan', (req, res) => {
    if (isReady) {
        return res.send('<h1 style="color:green">Conectado! ✅</h1>');
    }
    if (!qrCodeData) {
        return res.send(`<h1>Carregando... ⏳</h1><p>Status: ${clientStatus}</p><script>setTimeout(()=>window.location.reload(),3000)</script>`);
    }
    res.send(`<img src="${qrCodeData}" /><p>Escaneie no WhatsApp</p><script>setTimeout(()=>window.location.reload(),3000)</script>`);
});

app.get('/clear', (req, res) => {
    for (const key in incomingActivity) delete incomingActivity[key];
    res.json({ success: true });
});

app.get('/activity', (req, res) => {
    res.json(incomingActivity);
});

app.post('/send', async (req, res) => {
    const { phone, message } = req.body;

    if (!isReady) return res.status(503).json({ error: 'WhatsApp client not ready' });

    try {
        const formattedPhone = formatPhoneNumber(phone);
        const chatId = `${formattedPhone}@c.us`;
        
        const contactId = await client.getNumberId(chatId);
        
        if (!contactId) {
            console.log(`[ERRO ENVIO] Número inválido: ${formattedPhone}`);
            return res.status(404).json({ success: false, error: 'Número inválido.' });
        }
        
        await client.sendMessage(contactId._serialized, message);
        console.log(`[ENVIADA] Para: ${formattedPhone}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao enviar:', error);
        res.status(500).json({ error: 'Failed to send' });
    }
});

// Escuta em 0.0.0.0 para garantir acesso externo/local correto
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
