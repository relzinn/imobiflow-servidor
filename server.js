
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

// CORS Total e aceitar JSON
app.use(cors({ origin: '*' }));
app.use(express.json());

// --- FUNÇÕES AUXILIARES ---

function formatPhone(phone) {
    let p = phone.replace(/\D/g, '');
    if ((p.length === 10 || p.length === 11) && !p.startsWith('55')) {
        p = '55' + p;
    }
    return p;
}

// Comparação flexível de telefones (com/sem 55, com/sem 9)
function isSamePhone(p1, p2) {
    if (!p1 || !p2) return false;
    const n1 = p1.replace(/\D/g, '');
    const n2 = p2.replace(/\D/g, '');
    // Pega os últimos 8 dígitos (garante unicidade sem depender de DDD/DDI)
    return n1.slice(-8) === n2.slice(-8);
}

function generateTemplateMessage(contact, settings) {
    const agent = settings.agentName || "Seu Corretor";
    const agency = settings.agencyName || "nossa imobiliária";
    
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

// Configuração para rodar no Render (Linux) e Local
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
        if (!err) { qrCodeData = url; clientStatus = 'qr_ready'; }
    });
});

client.on('ready', () => {
    console.log('✅ WhatsApp Conectado!');
    isReady = true;
    clientStatus = 'ready';
    qrCodeData = null;
});

client.on('authenticated', () => { 
    console.log('🔑 Autenticado com sucesso!');
    clientStatus = 'authenticated'; 
});

client.on('disconnected', async (reason) => {
    console.log('⚠️ Desconectado:', reason);
    isReady = false;
    clientStatus = 'disconnected';
    // Reconexão graciosa
    try { await client.destroy(); } catch(e) {}
    setTimeout(() => { client.initialize().catch(console.error); }, 5000);
});

client.on('message', async msg => {
    // Ignora mensagens de status, grupos ou enviadas por mim mesmo (via celular/web)
    if(msg.isStatus || msg.from.includes('@g.us') || msg.fromMe) return;

    const fromNumber = msg.from.replace('@c.us', '');
    console.log(`📩 Nova mensagem de: ${fromNumber}`);
    
    // --- LÓGICA DE NOTIFICAÇÃO NO SERVIDOR ---
    const contacts = getContacts();
    let updated = false;

    for (let c of contacts) {
        if (isSamePhone(c.phone, fromNumber)) {
            console.log(`🔔 Contato identificado: ${c.name}. Marcando como não lida.`);
            c.hasUnreadReply = true;
            c.lastReplyContent = msg.body;
            c.lastReplyTimestamp = Date.now();
            updated = true;
        }
    }

    if (updated) {
        saveContacts(contacts);
    } else {
        console.log(`❓ Mensagem de ${fromNumber} não pertence a nenhum contato cadastrado.`);
    }
});

// --- MOTOR DE AUTOMAÇÃO (BACKGROUND) ---

async function runAutomationCycle() {
    if (!isReady) {
        console.log("⏳ Automação aguardando conexão do WhatsApp...");
        return;
    }
    
    const settings = getSettings();
    if (!settings.automationActive) {
        console.log("zzz Automação pausada nas configurações.");
        return;
    }

    console.log("🔄 Rodando ciclo de automação...");
    const contacts = getContacts();
    let changed = false;
    const now = Date.now();

    for (let c of contacts) {
        // Pula se automação desligada para o contato ou se tem resposta não lida
        if (c.autoPilotEnabled === false) continue;
        if (c.hasUnreadReply) {
            console.log(`✋ ${c.name}: Tem resposta não lida. Pulando.`);
            continue;
        }
        
        // Apenas estágio IDLE (Pendente) é processado automaticamente pelo tempo
        if (c.automationStage === 0) { // IDLE
            const lastDateStr = c.lastContactDate || new Date().toISOString();
            const lastDate = new Date(lastDateStr).getTime();
            const frequency = c.followUpFrequencyDays || 30; // Default 30 dias
            
            const diffTime = Math.abs(now - lastDate);
            const daysPassed = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            
            console.log(`🔎 ${c.name}: Passaram ${daysPassed} dias (Meta: ${frequency}). Status: ${daysPassed >= frequency ? 'VENCIDO (Enviar)' : 'NO PRAZO (Aguardar)'}`);

            if (daysPassed >= frequency) {
                console.log(`⚡ Disparando mensagem para ${c.name}...`);
                
                const msg = generateTemplateMessage(c, settings);
                const chatId = `${formatPhone(c.phone)}@c.us`;
                
                try {
                    const numberId = await client.getNumberId(chatId);
                    const target = numberId ? numberId._serialized : chatId;
                    await client.sendMessage(target, msg);
                    console.log(`✅ Mensagem enviada para ${c.name}`);
                    
                    // Atualiza Estado
                    c.lastAutomatedMsgDate = new Date().toISOString();
                    c.lastContactDate = new Date().toISOString(); // Atualiza data para evitar loop
                    c.automationStage = 1; // WAITING_REPLY_1
                    changed = true;
                } catch (e) {
                    console.error(`❌ Erro ao enviar para ${c.name}:`, e.message);
                }
                
                await new Promise(r => setTimeout(r, 5000)); // Pausa entre envios
            }
        }
    }

    if (changed) saveContacts(contacts);
}

// Roda o ciclo a cada 10 minutos
setInterval(runAutomationCycle, 10 * 60 * 1000);
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
        res.json([]);
    }
});

app.post('/toggle-automation', (req, res) => {
    const s = getSettings();
    s.automationActive = req.body.active;
    saveSettings(s);
    if (s.automationActive) setTimeout(runAutomationCycle, 1000);
    res.json({ success: true, active: s.automationActive });
});

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

// Endpoint para Importar Contatos do WhatsApp
app.get('/whatsapp-contacts', async (req, res) => {
    if (!isReady) return res.status(503).json({ error: 'Offline' });
    try {
        // CORREÇÃO: Usamos getChats() em vez de getContacts() para evitar erros do WWebJS
        const chats = await client.getChats();
        console.log(`🔎 Importação: Encontrados ${chats.length} conversas.`);
        
        // Filtra grupos e mapeia
        const filtered = chats
            .filter(c => !c.isGroup)
            .map(c => ({
                name: c.name || c.id.user,
                phone: c.id.user
            }));

        // Remove duplicatas
        const unique = [];
        const seen = new Set();
        for(const c of filtered) {
            if(!seen.has(c.phone)) {
                seen.add(c.phone);
                unique.push(c);
            }
        }
            
        console.log(`✅ Importação: ${unique.length} contatos válidos processados.`);
        res.json(unique);
    } catch (e) {
        console.error("Erro importação:", e);
        res.status(500).json({ error: e.message });
    }
});

client.initialize().catch(console.error);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor ImobiFlow rodando em porta ${PORT}`);
    console.log('🤖 Automação de Background: ATIVA (Verificando a cada 10min)');
});
