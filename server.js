require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require("@google/genai");
const { transform } = require('sucrase');

const app = express();
const PORT = process.env.PORT || 80; // Porta padrão Square Cloud
const DB_FILE = path.join(__dirname, 'database.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

app.use(cors());
app.use(express.json());

// Logger inteligente: ignora requisições de status/qr para não poluir o terminal
app.use((req, res, next) => {
    const noisyPaths = ['/status', '/qr', '/auth-status'];
    if (!noisyPaths.includes(req.path)) {
        console.log(`📡 REQ: ${req.method} ${req.path}`);
    }
    next();
});

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
    authStrategy: new LocalAuth({ clientId: "imobiflow-v3" }),
    puppeteer: { 
        headless: true, 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] 
    }
});

client.on('qr', qr => { clientStatus = 'qr_ready'; qrcode.toDataURL(qr, (err, url) => { qrCodeData = url; }); });
client.on('ready', () => { isReady = true; clientStatus = 'ready'; qrCodeData = null; console.log('✅ WhatsApp Conectado e Pronto!'); });
client.on('disconnected', () => { isReady = false; clientStatus = 'disconnected'; client.initialize(); });

// --- ENDPOINTS ---
app.get('/status', (req, res) => res.json({ status: clientStatus, isReady }));
app.get('/qr', (req, res) => res.json({ qrCode: qrCodeData }));
app.get('/contacts', (req, res) => res.json(getContacts()));
app.post('/contacts', (req, res) => { saveContacts(req.body); res.json({success:true}); });
app.get('/settings', (req, res) => res.json(getSettings()));

app.get('/sync-last-message/:phone', async (req, res) => {
    if (!isReady) return res.status(503).json({ error: 'WhatsApp não conectado' });
    try {
        const phone = req.params.phone.replace(/\D/g, '');
        const chatId = `${phone.startsWith('55') ? phone : '55' + phone}@c.us`;
        const chat = await client.getChatById(chatId);
        const messages = await chat.fetchMessages({ limit: 1 });
        if (messages.length > 0) {
            return res.json({ timestamp: messages[0].timestamp * 1000 });
        }
        res.json({ timestamp: null });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/send', async (req, res) => {
    if (!isReady) return res.status(500).json({success:false, error: 'WhatsApp offline'});
    try {
        const p = req.body.phone.replace(/\D/g, '');
        const target = `${p.startsWith('55') ? p : '55'+p}@c.us`;
        await client.sendMessage(target, req.body.message);
        res.json({success:true});
    } catch (e) { res.status(500).json({success:false, error: e.message}); }
});

client.initialize().catch(err => console.error("Erro na inicialização do WhatsApp:", err));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 ImobiFlow Servidor na porta ${PORT}`));