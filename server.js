require('dotenv').config(); // Carrega variáveis de ambiente do arquivo .env

// ==================================================================================
// 🚨 ÁREA DE CONFIGURAÇÃO RÁPIDA (PARA CORRIGIR ERRO DE CHAVE) 🚨
// ==================================================================================
const CHAVE_FIXA = ""; // <--- COLE SUA CHAVE AQUI DENTRO (Começa com AIzaSy...)
// ==================================================================================

console.log("🚀 Iniciando processo do servidor...");

const API_KEY = CHAVE_FIXA || process.env.API_KEY;
process.env.API_KEY = API_KEY;

if (API_KEY && API_KEY.length > 20) {
    console.log(`✅ API KEY CARREGADA: ${API_KEY.substring(0, 6)}...******`);
} else {
    console.error("❌ AVISO CRÍTICO: NENHUMA API KEY ENCONTRADA.");
}

const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require("@google/genai");
const { transform } = require('sucrase');

const app = express();
const PORT = process.env.PORT || 3001;
const DB_FILE = path.join(__dirname, 'database.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

app.use(cors({ origin: '*' }));
app.use(express.json());

// Log de requisições filtrado para não poluir
app.use((req, res, next) => {
    const quietEndpoints = ['/status', '/contacts', '/settings', '/qr', '/auth-status', '/whatsapp-contacts'];
    if (!quietEndpoints.includes(req.path)) {
        console.log(`📡 REQ: ${req.method} ${req.path}`);
    }
    next();
});

// --- COMPILAÇÃO JIT ---
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/qr' || req.path === '/status' || req.path === '/auth-status' || req.path === '/login' || req.path === '/recover-password') return next();
    let filePath = path.join(__dirname, req.path === '/' ? 'index.html' : req.path);
    let exists = fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    if (!exists && !req.path.includes('.')) {
         if (fs.existsSync(filePath + '.tsx')) { filePath += '.tsx'; exists = true; }
    }
    if (exists && (filePath.endsWith('.tsx') || filePath.endsWith('.ts'))) {
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

const getSettings = () => { try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch { return {}; } };
const saveSettings = (s) => fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
const getContacts = () => { try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { return []; } };
const saveContacts = (c) => fs.writeFileSync(DB_FILE, JSON.stringify(c, null, 2));

// --- WHATSAPP SETUP ---
let isReady = false;
let clientStatus = 'initializing';
let qrCodeData = null;

const client = new Client({
    authStrategy: new LocalAuth({ clientId: "imobiflow-crm-v2" }),
    puppeteer: { 
        headless: true, 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] 
    }
});

client.on('qr', qr => { 
    clientStatus = 'qr_ready';
    qrcode.toDataURL(qr, (err, url) => { qrCodeData = url; }); 
});
client.on('ready', () => { console.log('✅ WhatsApp Conectado e Pronto!'); isReady = true; clientStatus = 'ready'; qrCodeData = null; });
client.on('authenticated', () => { clientStatus = 'authenticated'; });
client.on('disconnected', () => { isReady = false; clientStatus = 'disconnected'; client.initialize(); });

// --- FUNÇÃO DE ENVIO REFORÇADA ---
async function sendWpp(phone, msg) {
    if (!isReady) {
        console.error(`❌ Falha no envio: WhatsApp desconectado (Status: ${clientStatus})`);
        return { success: false, error: 'WhatsApp Offline' };
    }
    try {
        let p = phone.replace(/\D/g, '');
        if ((p.length === 10 || p.length === 11) && !p.startsWith('55')) p = '55' + p;
        
        const chatId = `${p}@c.us`;
        console.log(`📤 Enviando para: ${chatId}...`);
        
        // Verifica se o número é válido no WA
        const numberId = await client.getNumberId(chatId);
        const target = numberId ? numberId._serialized : chatId;

        await client.sendMessage(target, msg);
        console.log(`✅ Sucesso: Mensagem entregue para ${target}`);
        return { success: true };
    } catch (e) {
        console.error(`❌ Erro técnico no envio:`, e.message);
        return { success: false, error: e.message };
    }
}

// --- ENDPOINTS ---
app.get('/status', (req, res) => res.json({ status: clientStatus, isReady: isReady }));
app.get('/qr', (req, res) => res.json({ qrCode: qrCodeData }));
app.get('/contacts', (req, res) => res.json(getContacts()));
app.post('/contacts', (req, res) => { saveContacts(req.body); res.json({success:true}); });
app.get('/settings', (req, res) => res.json(getSettings()));
app.post('/settings', (req, res) => { saveSettings(req.body); res.json({success:true}); });

app.post('/send', async (req, res) => { 
    const result = await sendWpp(req.body.phone, req.body.message); 
    if (result.success) return res.json({success:true});
    return res.status(500).json({success:false, error: result.error});
});

app.get('/auth-status', (req, res) => res.json({ configured: !!getSettings().password }));
app.post('/login', (req, res) => {
    if (getSettings().password === req.body.password) return res.json({ success: true });
    res.status(401).json({ success: false });
});

client.initialize();
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor na porta ${PORT}`));