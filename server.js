require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { transform } = require('sucrase');

const app = express();
const PORT = process.env.PORT || 80;
const DB_FILE = path.join(__dirname, 'database.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

app.use(cors());
app.use(express.json());

// --- MOTOR JIT COMPILER ---
app.get('*', (req, res, next) => {
    const apiRoutes = ['/status', '/qr', '/contacts', '/settings', '/send', '/sync-last-message', '/auth-status'];
    if (apiRoutes.some(r => req.path.startsWith(r))) return next();

    let filePath = path.join(__dirname, req.path === '/' ? 'index.html' : req.path);
    if (!fs.existsSync(filePath) && !req.path.includes('.')) {
        if (fs.existsSync(filePath + '.tsx')) filePath += '.tsx';
        else if (fs.existsSync(filePath + '.ts')) filePath += '.ts';
    }

    if (fs.existsSync(filePath) && (filePath.endsWith('.tsx') || filePath.endsWith('.ts'))) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const compiled = transform(content, { transforms: ['typescript', 'jsx'], jsxRuntime: 'classic' }).code;
            res.setHeader('Content-Type', 'application/javascript');
            return res.send(compiled);
        } catch (e) { return res.status(500).send(`console.error("${e.message}")`); }
    }
    next();
});

app.use(express.static(__dirname));

const getSettings = () => { try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch { return { agentName: 'Corretor' }; } };
const getContacts = () => { try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { return []; } };
const saveContacts = (c) => fs.writeFileSync(DB_FILE, JSON.stringify(c, null, 2));

// --- WHATSAPP SETUP ---
let isReady = false;
let clientStatus = 'initializing';
let qrCodeData = null;

const client = new Client({
    authStrategy: new LocalAuth({ 
        clientId: "imobiflow-v3",
        dataPath: './.wwebjs_auth'
    }),
    // Versão alpha que NÃO tem o erro de markedUnread
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1012170943-alpha.html',
    },
    puppeteer: { 
        headless: true,
        bypassCSP: true, 
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage', 
            '--disable-gpu',
            '--disable-extensions',
            '--disable-popup-blocking'
        ],
        // User Agent moderno para evitar bloqueios
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
});

client.on('qr', qr => { 
    clientStatus = 'qr_ready'; 
    qrcode.toDataURL(qr, (err, url) => { qrCodeData = url; }); 
    console.log('📡 Novo QR Code gerado.');
});

client.on('ready', () => { 
    isReady = true; 
    clientStatus = 'ready'; 
    qrCodeData = null; 
    console.log('✅ WhatsApp Conectado e Estável!'); 
});

client.on('disconnected', (reason) => { 
    isReady = false; 
    clientStatus = 'disconnected'; 
    console.log('❌ WhatsApp Desconectado:', reason);
    setTimeout(() => client.initialize().catch(() => {}), 5000);
});

// --- ENDPOINTS ---
app.get('/status', (req, res) => res.json({ status: clientStatus, isReady }));
app.get('/qr', (req, res) => res.json({ qrCode: qrCodeData }));
app.get('/contacts', (req, res) => res.json(getContacts()));
app.post('/contacts', (req, res) => { saveContacts(req.body); res.json({success:true}); });
app.get('/settings', (req, res) => res.json(getSettings()));

app.get('/sync-last-message/:phone', async (req, res) => {
    if (!isReady) return res.status(503).json({ error: 'WhatsApp não conectado' });
    try {
        let phone = req.params.phone.replace(/\D/g, '');
        if (!phone.startsWith('55')) phone = '55' + phone;
        
        const numberId = await client.getNumberId(phone);
        if (!numberId) return res.json({ timestamp: null });

        // Tenta obter o chat de forma segura
        const chat = await client.getChatById(numberId._serialized).catch(() => null);
        
        if (chat) {
            // Usa markSeen se disponível, mas ignora erros internos
            if (typeof chat.markSeen === 'function') {
                try { await chat.markSeen(); } catch (e) {}
            }

            const messages = await chat.fetchMessages({ limit: 1 });
            if (messages && messages.length > 0) {
                return res.json({ timestamp: messages[0].timestamp * 1000 });
            }
        }
        res.json({ timestamp: null });
    } catch (e) { 
        console.error("Erro silencioso no sync:", e.message);
        res.status(500).json({ error: e.message }); 
    }
});

app.post('/send', async (req, res) => {
    if (!isReady) return res.status(503).json({success:false, error: 'WhatsApp desconectado.'});
    
    try {
        let phone = req.body.phone.replace(/\D/g, '');
        if (!phone.startsWith('55')) phone = '55' + phone;

        const numberId = await client.getNumberId(phone);
        if (!numberId) {
            return res.status(404).json({success:false, error: 'Número não registrado no WhatsApp.'});
        }

        // O envio direto via client é mais resistente ao erro 'markedUnread'
        const result = await client.sendMessage(numberId._serialized, req.body.message);
        
        console.log(`✅ Mensagem enviada para ${phone}`);
        res.json({success:true, id: result.id.id});
    } catch (e) { 
        console.error(`❌ Erro crítico no envio:`, e.message);
        // Se o erro for o maldito markedUnread, avisar o usuário de forma clara
        const errorMsg = e.message.includes('markedUnread') 
            ? 'Erro de compatibilidade do WhatsApp Web. Tente reiniciar o servidor.' 
            : e.message;
        res.status(500).json({success:false, error: errorMsg}); 
    }
});

client.initialize().catch(err => {
    console.error("Falha ao inicializar o WhatsApp:", err.message);
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 ImobiFlow Ativo e Monitorando porta ${PORT}`));