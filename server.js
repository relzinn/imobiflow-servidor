
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DB_FILE = path.join(__dirname, 'database.json');

// CORS Total
app.use(cors({ origin: '*' }));
app.use(express.json());

// --- BANCO DE DADOS (ARQUIVO JSON) ---

// Inicializa DB se não existir
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([]));
}

function getContacts() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

function saveContacts(contacts) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(contacts, null, 2));
        return true;
    } catch (e) {
        console.error("Erro ao salvar DB:", e);
        return false;
    }
}

// --- WHATSAPP SETUP ---

let qrCodeData = null;
let clientStatus = 'initializing';
let isReady = false;
const incomingActivity = {};

const client = new Client({
    authStrategy: new LocalAuth({ clientId: "imobiflow-crm-v2" }),
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
    console.log('🔑 Autenticado.');
    clientStatus = 'authenticated';
});

client.on('disconnected', async (reason) => {
    console.log('⚠️ Desconectado:', reason);
    isReady = false;
    clientStatus = 'disconnected';
    try { await client.destroy(); } catch(e) {}
    setTimeout(() => {
        console.log('🔄 Reconectando...');
        client.initialize().catch(e => console.error(e));
    }, 5000);
});

client.on('message', async msg => {
    try {
        // Ignora Status, Grupos e MENSAGENS ENVIADAS PELO PRÓPRIO USUÁRIO
        if(msg.isStatus || msg.from.includes('@g.us') || msg.fromMe) return;

        const fromNumber = msg.from.replace('@c.us', '');
        console.log(`📩 Nova mensagem de: ${fromNumber}`);
        
        incomingActivity[fromNumber] = {
            timestamp: Date.now(),
            body: msg.body || "Nova mensagem"
        };
    } catch (e) {
        console.error("Erro msg:", e);
    }
});

// --- API ENDPOINTS ---

// Status e QR
app.get('/status', (req, res) => {
    res.json({ status: clientStatus, isReady: isReady });
});

app.get('/qr', (req, res) => {
    res.json({ qrCode: qrCodeData, ts: Date.now() });
});

// Atividade (Polling de respostas)
app.get('/activity', (req, res) => {
    res.json(incomingActivity);
});

// Limpar Atividade
app.get('/clear', (req, res) => {
    for (let k in incomingActivity) delete incomingActivity[k];
    res.json({ success: true });
});

// CRUD Contatos
app.get('/contacts', (req, res) => {
    const data = getContacts();
    res.json(data);
});

app.post('/contacts', (req, res) => {
    const contacts = req.body;
    if (saveContacts(contacts)) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: 'Falha ao salvar no disco' });
    }
});

// Envio de Mensagem
function formatPhone(phone) {
    let p = phone.replace(/\D/g, '');
    if ((p.length === 10 || p.length === 11) && !p.startsWith('55')) {
        p = '55' + p;
    }
    return p;
}

app.post('/send', async (req, res) => {
    if (!isReady) return res.status(503).json({ error: 'WhatsApp Offline' });
    
    const { phone, message } = req.body;
    const formatted = formatPhone(phone);
    const chatId = `${formatted}@c.us`;

    try {
        const numberId = await client.getNumberId(chatId);
        if (!numberId) {
            // Tenta enviar mesmo assim se não validar (fallback)
            await client.sendMessage(chatId, message);
        } else {
            await client.sendMessage(numberId._serialized, message);
        }
        console.log(`📤 Enviado para ${formatted}`);
        res.json({ success: true });
    } catch (e) {
        console.error("Erro envio:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

client.initialize().catch(e => console.error("Erro init:", e));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📂 Banco de dados: ${DB_FILE}`);
});
