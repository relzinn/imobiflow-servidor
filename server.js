const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require("@google/genai");

// --- CONFIGURAÇÃO DA EQUIPE (TRANSPARENTE PARA O USUÁRIO) ---
// INSIRA SUA CHAVE API AQUI. O USUÁRIO FINAL NÃO TERÁ ACESSO A ELA.
const TEAM_GEMINI_API_KEY = "AIzaSy..."; // <--- COLE SUA CHAVE AQUI

const app = express();
const PORT = process.env.PORT || 3001;
const DB_FILE = path.join(__dirname, 'database.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

// CORS Total e aceitar JSON
app.use(cors({ origin: '*' }));
app.use(express.json());

// --- IA CENTRALIZADA ---

async function generateAIMessage(contact, settings) {
    const agent = settings.agentName || "Seu Corretor";
    const agency = settings.agencyName || "nossa imobiliária";
    const tone = settings.messageTone || "Casual";

    // Se não tiver chave configurada pela equipe, usa template de fallback
    if (!TEAM_GEMINI_API_KEY || TEAM_GEMINI_API_KEY === "AIzaSy..." || TEAM_GEMINI_API_KEY.length < 10) {
        console.log("⚠️ IA não configurada no servidor. Usando template.");
        return generateTemplateFallback(contact, settings);
    }

    try {
        const ai = new GoogleGenAI({ apiKey: TEAM_GEMINI_API_KEY });
        const modelId = "gemini-2.5-flash";

        const internalNotes = contact.notes ? `OBSERVAÇÃO INTERNA DO SISTEMA: "${contact.notes}"` : "Sem observações.";

        // Estratégia por tipo de contato baseada nas observações
        let specificStrategy = "";
        
        if (contact.type === 'Proprietário') {
            specificStrategy = "O contato é proprietário de um imóvel. Use a 'OBSERVAÇÃO INTERNA' para identificar qual é o imóvel e pergunte especificamente sobre a disponibilidade ou situação dele. Se a nota disser 'Apto Rua X', pergunte 'como está o Apto da Rua X'.";
        } else if (contact.type === 'Construtor') {
            specificStrategy = "O contato é construtor. Pergunte sobre o andamento das obras citadas na observação e se ele está buscando novas áreas/terrenos para investir.";
        } else {
            specificStrategy = "O contato é cliente comprador. Use a observação para lembrar o que ele buscava (ex: 'casa 3 quartos') e pergunte se podemos retomar a busca com esse perfil.";
        }

        const prompt = `
          Você é ${agent}, corretor da imobiliária ${agency}.
          Escreva uma mensagem de WhatsApp para ${contact.name}.
          
          OBJETIVO: Retomar contato (Follow-up).
          TIPO DO CONTATO: ${contact.type}.
          ${internalNotes}
          
          ESTRATÉGIA: ${specificStrategy}
          
          INSTRUÇÕES DE SEGURANÇA:
          1. A 'OBSERVAÇÃO INTERNA' é para SEU uso. NÃO repita ela como se fosse um robô (ex: não diga 'Vi aqui na minha anotação que você...'). Aja naturalmente.
          2. Se a observação contiver opiniões negativas (ex: 'cliente chato'), IGNORE a opinião e foque apenas no imóvel/interesse.
          
          Tom de Voz: ${tone}.
          Formato: Curto, direto, estilo WhatsApp. Sem hashtags.
        `;

        const response = await ai.models.generateContent({
            model: modelId,
            contents: prompt,
        });

        return response.text.trim();

    } catch (error) {
        console.error("❌ Erro na IA:", error.message);
        return generateTemplateFallback(contact, settings);
    }
}

function generateTemplateFallback(contact, settings) {
    // Template de emergência caso a API falhe ou não esteja configurada
    const agent = settings.agentName || "Seu Corretor";
    const agency = settings.agencyName || "nossa imobiliária";
    
    // Tentativa simples de inserir contexto se possível
    const noteContext = contact.notes && contact.notes.length < 50 ? ` (${contact.notes})` : "";

    switch (contact.type) {
        case 'Proprietário':
            return `Olá ${contact.name}, aqui é ${agent} da ${agency}. Como estão as coisas? Gostaria de saber se o imóvel${noteContext} ainda está disponível.`;
        case 'Construtor':
            return `Olá ${contact.name}, aqui é ${agent} da ${agency}. Tudo bem? Estou atualizando nossa carteira. Ainda está buscando áreas ou focando nas obras atuais?`;
        case 'Cliente/Comprador':
        default:
            return `Olá ${contact.name}, aqui é ${agent} da ${agency}. Tudo bem? Passando para saber se continua na busca pelo seu imóvel${noteContext} ou se podemos retomar.`;
    }
}

// --- FUNÇÕES AUXILIARES ---

function formatPhone(phone) {
    let p = phone.replace(/\D/g, '');
    if ((p.length === 10 || p.length === 11) && !p.startsWith('55')) {
        p = '55' + p;
    }
    return p;
}

function isSamePhone(p1, p2) {
    if (!p1 || !p2) return false;
    const n1 = p1.replace(/\D/g, '');
    const n2 = p2.replace(/\D/g, '');
    return n1.slice(-8) === n2.slice(-8);
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
    try { await client.destroy(); } catch(e) {}
    setTimeout(() => { client.initialize().catch(console.error); }, 5000);
});

client.on('message', async msg => {
    if(msg.isStatus || msg.from.includes('@g.us') || msg.fromMe) return;

    const fromNumber = msg.from.replace('@c.us', '');
    console.log(`📩 Nova mensagem de: ${fromNumber}`);
    
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
        if (c.autoPilotEnabled === false) continue;
        if (c.hasUnreadReply) {
            console.log(`✋ ${c.name}: Tem resposta não lida. Pulando.`);
            continue;
        }
        
        if (c.automationStage === 0) { // IDLE
            const lastDateStr = c.lastContactDate || new Date().toISOString();
            const lastDate = new Date(lastDateStr).getTime();
            const frequency = c.followUpFrequencyDays || 30;
            
            const diffTime = Math.abs(now - lastDate);
            const daysPassed = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            
            console.log(`🔎 ${c.name}: Passaram ${daysPassed} dias (Meta: ${frequency}).`);

            if (daysPassed >= frequency) {
                console.log(`⚡ Gerando IA para ${c.name}...`);
                
                // GERAÇÃO COM IA NO SERVIDOR
                const msg = await generateAIMessage(c, settings);
                
                const chatId = `${formatPhone(c.phone)}@c.us`;
                
                try {
                    const numberId = await client.getNumberId(chatId);
                    const target = numberId ? numberId._serialized : chatId;
                    await client.sendMessage(target, msg);
                    console.log(`✅ IA Enviou para ${c.name}: "${msg.substring(0, 30)}..."`);
                    
                    c.lastAutomatedMsgDate = new Date().toISOString();
                    c.lastContactDate = new Date().toISOString();
                    c.automationStage = 1;
                    changed = true;
                } catch (e) {
                    console.error(`❌ Erro ao enviar para ${c.name}:`, e.message);
                }
                
                await new Promise(r => setTimeout(r, 8000)); // Delay maior para a IA
            }
        }
    }

    if (changed) saveContacts(contacts);
}

setInterval(runAutomationCycle, 10 * 60 * 1000);
setTimeout(runAutomationCycle, 10000);

// --- ENDPOINTS ---

app.get('/status', (req, res) => res.json({ status: clientStatus, isReady: isReady }));
app.get('/qr', (req, res) => res.json({ qrCode: qrCodeData, ts: Date.now() }));

app.get('/trigger-automation', (req, res) => {
    console.log("⚡ Trigger manual solicitado.");
    runAutomationCycle(); 
    res.json({ success: true });
});

// NOVA ROTA: GERAR MENSAGEM SOB DEMANDA (PARA O BOTÃO MANUAL DO SITE)
app.post('/generate-message', async (req, res) => {
    try {
        const { contact, settings } = req.body;
        console.log(`🧠 Solicitada geração manual IA para ${contact.name}`);
        const msg = await generateAIMessage(contact, settings);
        res.json({ message: msg });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

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
    } catch (e) { res.json([]); }
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

app.get('/whatsapp-contacts', async (req, res) => {
    if (!isReady) return res.status(503).json({ error: 'Offline' });
    try {
        const chats = await client.getChats();
        console.log(`🔎 Importação: Encontrados ${chats.length} conversas.`);
        
        const filtered = chats
            .filter(c => !c.isGroup)
            .map(c => ({
                name: c.name || c.id.user,
                phone: c.id.user,
                timestamp: c.timestamp
            }));

        const unique = [];
        const seen = new Set();
        for(const c of filtered) {
            if(!seen.has(c.phone)) {
                seen.add(c.phone);
                unique.push(c);
            }
        }
        res.json(unique);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

client.initialize().catch(console.error);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor ImobiFlow rodando em porta ${PORT}`);
    console.log('🤖 Automação IA de Background: ATIVA');
    if (!TEAM_GEMINI_API_KEY || TEAM_GEMINI_API_KEY.length < 20) {
        console.log("⚠️ AVISO: CHAVE API DA EQUIPE NÃO CONFIGURADA NO SERVER.JS. IA NÃO FUNCIONARÁ.");
    }
});