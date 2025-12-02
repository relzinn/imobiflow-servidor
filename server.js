
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const cors = require('cors');

const app = express();
// Usa porta do ambiente ou 3001
const PORT = process.env.PORT || 3001;

// CORS Total para evitar bloqueios de localhost vs 127.0.0.1
app.use(cors({ origin: '*' }));
app.use(express.json());

// Estado do Sistema
let qrCodeData = null;
let clientStatus = 'initializing';
let isReady = false;

// Armazena últimas mensagens recebidas (chave = telefone)
const incomingActivity = {};

// Configuração do Cliente WhatsApp
const client = new Client({
    authStrategy: new LocalAuth({ clientId: "imobiflow-crm" }),
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

// --- Eventos do WhatsApp ---

client.on('qr', (qr) => {
    console.log('📱 QR Code Novo Gerado!');
    qrcodeTerminal.generate(qr, { small: true });
    
    qrcode.toDataURL(qr, (err, url) => {
        if (!err) {
            qrCodeData = url;
            clientStatus = 'qr_ready';
        }
    });
});

client.on('ready', () => {
    console.log('✅ WhatsApp Conectado!');
    isReady = true;
    clientStatus = 'ready';
    qrCodeData = null;
});

client.on('authenticated', () => {
    console.log('🔑 Autenticado com sucesso.');
    clientStatus = 'authenticated';
});

client.on('auth_failure', () => {
    console.error('❌ Falha na autenticação. Reiniciando...');
    clientStatus = 'error';
    isReady = false;
});

client.on('disconnected', async (reason) => {
    console.log('⚠️ Desconectado:', reason);
    isReady = false;
    clientStatus = 'disconnected';
    
    // Evita loop rápido de reinicialização
    try {
        await client.destroy();
    } catch(e) {}
    
    setTimeout(() => {
        console.log('🔄 Tentando reconectar...');
        client.initialize().catch(e => console.error(e));
    }, 5000);
});

// Escuta mensagens recebidas
client.on('message', async msg => {
    try {
        // Ignora mensagens de status ou grupos
        if(msg.isStatus || msg.from.includes('@g.us')) return;

        const fromNumber = msg.from.replace('@c.us', '');
        console.log(`📩 Nova mensagem de: ${fromNumber}`);
        
        // Registra atividade
        incomingActivity[fromNumber] = {
            timestamp: Date.now(),
            body: msg.body || "Nova mensagem"
        };
    } catch (e) {
        console.error("Erro ao processar mensagem", e);
    }
});

// --- API Endpoints ---

app.get('/status', (req, res) => {
    res.json({ 
        status: clientStatus,
        isReady: isReady 
    });
});

app.get('/qr', (req, res) => {
    res.json({ 
        qrCode: qrCodeData,
        ts: Date.now() // Cache busting
    });
});

app.get('/activity', (req, res) => {
    res.json(incomingActivity);
});

app.get('/clear', (req, res) => {
    for (let k in incomingActivity) delete incomingActivity[k];
    res.json({ success: true });
});

// Helper de formatação
function formatPhone(phone) {
    let p = phone.replace(/\D/g, '');
    // Se for Brasil (10 ou 11 digitos) e não tiver 55, adiciona
    if ((p.length === 10 || p.length === 11) && !p.startsWith('55')) {
        p = '55' + p;
    }
    return p;
}

app.post('/send', async (req, res) => {
    if (!isReady) return res.status(503).json({ error: 'WhatsApp não conectado' });
    
    const { phone, message } = req.body;
    const formatted = formatPhone(phone);
    const chatId = `${formatted}@c.us`;

    try {
        // Verifica se número existe
        const numberId = await client.getNumberId(chatId);
        if (!numberId) {
            return res.json({ success: false, error: 'Número não possui WhatsApp' });
        }

        await client.sendMessage(numberId._serialized, message);
        console.log(`📤 Enviado para ${formatted}`);
        res.json({ success: true });
    } catch (e) {
        console.error("Erro envio:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Inicializa
client.initialize().catch(e => console.error("Erro init:", e));

// Ouve em todos os IPs
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
