
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
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

// CORS Total
app.use(cors({ origin: '*' }));
app.use(express.json());

// --- FUNÇÕES AUXILIARES ---

// Formata telefone para padrão WhatsApp (55 + DDD + Num)
function formatPhone(phone) {
    let p = phone.replace(/\D/g, '');
    // Se tiver 10 ou 11 dígitos, assume BR e poe 55
    if ((p.length === 10 || p.length === 11) && !p.startsWith('55')) {
        p = '55' + p;
    }
    return p;
}

// Gera mensagem baseada em templates (Lógica portada do Frontend para Backend)
function generateTemplateMessage(contact, settings) {
    const agent = settings.agentName || "Seu Corretor";
    const agency = settings.agencyName || "nossa imobiliária";
    
    // Simples motor de templates para rodar 24/7 sem API Key
    switch (contact.type) {
        case 'Proprietário':
            return `Olá ${contact.name}, aqui é ${agent} da ${agency}. Como estão as coisas? Gostaria de saber se o imóvel ainda está disponível para venda ou se houve alguma mudança. Abraço!`;
        case 'Construtor':
            return `Olá ${contact.name}, aqui é ${agent} da ${agency}. Tudo bem? Estou atualizando nossa carteira de áreas e lembrei de você. Ainda está buscando novos terrenos na região?`;
        case 'Cliente/Comprador':
        default:
            return `Olá ${contact.name}, aqui é ${agent} da ${agency}. Tudo bem? Passando para saber se continua na busca pelo seu imóvel ou se podemos retomar a pesquisa com novas opções.`;
    }
}

// --- BANCO DE DADOS ---

function getContacts() {
    try {
        if (!fs.existsSync(DB_FILE)) return [];
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) { return []; }
}

function saveContacts(contacts) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(contacts, null, 2));
        return true;
    } catch (e) { return false; }
}

function getSettings() {
    try {
        if (!fs.existsSync(SETTINGS_FILE)) return { automationActive: false };
        return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    } catch (e) { return { automationActive: false }; }
}

function saveSettings(s) {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
    } catch (e) {}
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
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--single-process', '--disable-gpu'
        ]
    }
});

client.on('qr', (qr) => {
    console.log('📱 QR Code Novo Gerado!');
    qrcodeTerminal.generate(qr, { small: true });
    qrcode.toDataURL(qr, (err, url) => {
        if (!err) { qrCodeData = url; clientStatus = 'qr_ready'; }
    });
});

client.on('ready', () => {
    console.log('✅ WhatsApp Conectado!');
    isReady = true;
    clientStatus = 'ready';
    qrCodeData = null;
});

client.on('authenticated', () => { clientStatus = 'authenticated'; });

client.on('disconnected', async (reason) => {
    console.log('⚠️ Desconectado:', reason);
    isReady = false;
    clientStatus = 'disconnected';
    try { await client.destroy(); } catch(e) {}
    setTimeout(() => { client.initialize().catch(console.error); }, 5000);
});

client.on('message', async msg => {
    if(msg.isStatus || msg.from.includes('@g.us') || msg.fromMe) return;
    const fromNumber = msg.from.replace('@c.us', '');
    console.log(`📩 Nova mensagem de: ${fromNumber}`);
    incomingActivity[fromNumber] = { timestamp: Date.now(), body: msg.body || "Nova mensagem" };
});

// --- MOTOR DE AUTOMAÇÃO (BACKGROUND) ---

async function runAutomationCycle() {
    if (!isReady) return;
    
    const settings = getSettings();
    if (!settings.automationActive) return;

    console.log("🔄 Rodando ciclo de automação...");
    const contacts = getContacts();
    let changed = false;
    const now = Date.now();

    for (let c of contacts) {
        // Regras de Automação
        if (c.autoPilotEnabled === false || c.hasUnreadReply) continue;
        
        // Apenas estágio IDLE (Pendente) é processado automaticamente pelo tempo
        if (c.automationStage === 0) { // IDLE
            const lastDate = new Date(c.lastContactDate).getTime();
            const daysPassed = (now - lastDate) / (1000 * 60 * 60 * 24);
            
            if (daysPassed >= c.followUpFrequencyDays) {
                console.log(`⚡ Disparando automação para ${c.name}`);
                
                const msg = generateTemplateMessage(c, settings);
                const chatId = `${formatPhone(c.phone)}@c.us`;
                
                try {
                    // Envio Seguro
                    const numberId = await client.getNumberId(chatId);
                    const target = numberId ? numberId._serialized : chatId;
                    await client.sendMessage(target, msg);
                    
                    // Atualiza Estado
                    c.lastAutomatedMsgDate = new Date().toISOString();
                    c.lastContactDate = new Date().toISOString();
                    c.automationStage = 1; // WAITING_REPLY_1
                    changed = true;
                } catch (e) {
                    console.error(`Erro ao enviar para ${c.name}:`, e.message);
                }
                
                // Pequena pausa para evitar bloqueio
                await new Promise(r => setTimeout(r, 5000));
            }
        }
    }

    if (changed) saveContacts(contacts);
}

// Roda o ciclo a cada 60 minutos (ajustável)
setInterval(runAutomationCycle, 60 * 60 * 1000);
// Roda uma verificação rápida 10s após ligar
setTimeout(runAutomationCycle, 10000);

// --- ENDPOINTS ---

app.get('/status', (req, res) => {
    res.json({ status: clientStatus, isReady: isReady });
});

app.get('/qr', (req, res) => res.json({ qrCode: qrCodeData, ts: Date.now() }));

// CHAT AO VIVO
app.get('/chat/:phone', async (req, res) => {
    if (!isReady) return res.status(503).json({ error: 'Offline' });
    try {
        const phone = formatPhone(req.params.phone);
        const chatId = `${phone}@c.us`;
        const chat = await client.getChatById(chatId);
        const messages = await chat.fetchMessages({ limit: 50 });
        
        const history = messages.map(m => ({
            id: m.id.id,
            fromMe: m.fromMe,
            body: m.body,
            timestamp: m.timestamp
        }));
        
        res.json(history);
    } catch (e) {
        // Se chat não existe, retorna vazio sem erro
        res.json([]);
    }
});

app.post('/toggle-automation', (req, res) => {
    const s = getSettings();
    s.automationActive = req.body.active;
    saveSettings(s);
    if (s.automationActive) runAutomationCycle(); // Força ciclo imediato
    res.json({ success: true, active: s.automationActive });
});

// Outros Endpoints mantidos...
app.get('/activity', (req, res) => res.json(incomingActivity));
app.get('/clear', (req, res) => { for (let k in incomingActivity) delete incomingActivity[k]; res.json({success:true}); });
app.get('/contacts', (req, res) => res.json(getContacts()));
app.post('/contacts', (req, res) => { if(saveContacts(req.body)) res.json({success:true}); else res.status(500).json({error:'Erro'}); });
app.get('/settings', (req, res) => res.json(getSettings()));
app.post('/settings', (req, res) => { saveSettings(req.body); res.json({success:true}); });

app.post('/send', async (req, res) => {
    if (!isReady) return res.status(503).json({ error: 'WhatsApp Offline' });
    const { phone, message } = req.body;
    const chatId = `${formatPhone(phone)}@c.us`;
    try {
        const numberId = await client.getNumberId(chatId);
        await client.sendMessage(numberId ? numberId._serialized : chatId, message);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

client.initialize().catch(console.error);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor ImobiFlow rodando em porta ${PORT}`);
    console.log('🤖 Automação de Background: ATIVA');
});
