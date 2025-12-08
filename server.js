const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require("@google/genai");

console.log("🚀 Iniciando servidor ImobiFlow...");

// --- CONFIGURAÇÃO DA EQUIPE (TRANSPARENTE PARA O USUÁRIO) ---
const TEAM_GEMINI_API_KEY = "AIzaSy..."; // <--- COLE SUA CHAVE AQUI

const app = express();
const PORT = process.env.PORT || 3001;
const DB_FILE = path.join(__dirname, 'database.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

app.use(cors({ origin: '*' }));
app.use(express.json());

// --- IA CENTRALIZADA ---

async function generateAIMessage(contact, settings, stage = 0) {
    const agent = settings.agentName || "Seu Corretor";
    const agency = settings.agencyName || "nossa imobiliária";
    const tone = contact.messageTone || settings.messageTone || "Casual";

    if (!TEAM_GEMINI_API_KEY || TEAM_GEMINI_API_KEY.length < 20) {
        return generateTemplateFallback(contact, settings, stage);
    }

    try {
        const ai = new GoogleGenAI({ apiKey: TEAM_GEMINI_API_KEY });
        const modelId = "gemini-2.5-flash";

        const internalNotes = contact.notes ? `OBSERVAÇÃO INTERNA: "${contact.notes}"` : "Sem observações.";

        let stageContext = "Primeira mensagem de retomada de contato (Follow-up padrão).";
        if (stage === 1) { // Vai para tentativa 2
            stageContext = "SEGUNDA TENTATIVA (Cobrança suave). O cliente não respondeu a mensagem enviada há 2 dias. Pergunte educadamente se ele viu a mensagem anterior ou se ainda tem interesse, mas sem parecer desesperado.";
        } else if (stage === 99) { // Despedida
            stageContext = "MENSAGEM DE DESPEDIDA FINAL. O cliente não respondeu após várias tentativas. Agradeça, diga que vai encerrar o contato por enquanto para não incomodar, e deixe as portas abertas caso ele queira procurar no futuro.";
        }

        let specificStrategy = "";
        if (contact.type === 'Proprietário') {
            specificStrategy = "Proprietário de imóvel. Use a observação para citar o imóvel específico.";
        } else if (contact.type === 'Construtor') {
            specificStrategy = "Construtor. Pergunte sobre obras e novos terrenos.";
        } else {
            specificStrategy = "Cliente comprador. Relembre o perfil buscado.";
        }

        const prompt = `
          Você é ${agent}, da ${agency}.
          Escreva uma mensagem de WhatsApp para ${contact.name}.
          
          CONTEXTO: ${stageContext}
          PERFIL: ${contact.type}.
          ${internalNotes}
          ESTRATÉGIA: ${specificStrategy}
          
          INSTRUÇÕES:
          1. Use a observação para personalizar, mas NÃO diga "Vi na anotação".
          2. Tom de Voz: ${tone}.
          3. Curto e direto.
        `;

        const response = await ai.models.generateContent({
            model: modelId,
            contents: prompt,
        });

        return response.text.trim();

    } catch (error) {
        console.error("❌ Erro IA:", error.message);
        return generateTemplateFallback(contact, settings, stage);
    }
}

function generateTemplateFallback(contact, settings, stage = 0) {
    const agent = settings.agentName || "Seu Corretor";
    
    if (stage === 99) {
        return `Olá ${contact.name}, como não tivemos retorno, vou encerrar nosso contato por aqui para não incomodar. Se precisar de algo no futuro, estou à disposição!`;
    }

    if (stage === 1) { // Cobrança
        return `Olá ${contact.name}, conseguiu ver minha mensagem anterior? Gostaria apenas de confirmar se ainda tem interesse.`;
    }

    // Padrão
    let specificPart = "continuamos com o assunto";
    if (contact.type === 'Proprietário') specificPart = "seu imóvel ainda está disponível";
    if (contact.type === 'Construtor') specificPart = "temos novas oportunidades de áreas";
    if (contact.type === 'Cliente/Comprador') specificPart = "encontrei opções no seu perfil";
    
    // Inserção inteligente de notas se existirem (fallback manual)
    if (contact.notes && contact.notes.length < 50) {
       specificPart += ` (${contact.notes})`;
    }

    return `Olá ${contact.name}, aqui é ${agent}. Passando para saber se ${specificPart}. Podemos falar?`;
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
    try { if (!fs.existsSync(DB_FILE)) return []; return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { return []; }
}
function saveContacts(contacts) {
    try { fs.writeFileSync(DB_FILE, JSON.stringify(contacts, null, 2)); return true; } catch (e) { return false; }
}
function getSettings() {
    try { if (!fs.existsSync(SETTINGS_FILE)) return { automationActive: false }; return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch (e) { return { automationActive: false }; }
}
function saveSettings(s) { try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2)); } catch (e) {} }

// --- WHATSAPP SETUP ---

let qrCodeData = null;
let clientStatus = 'initializing';
let isReady = false;

const client = new Client({
    authStrategy: new LocalAuth({ clientId: "imobiflow-crm-v2" }),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--single-process', '--disable-gpu'] }
});

client.on('qr', (qr) => { qrcodeTerminal.generate(qr, { small: true }); qrcode.toDataURL(qr, (err, url) => { if (!err) { qrCodeData = url; clientStatus = 'qr_ready'; } }); });
client.on('ready', () => { console.log('✅ WhatsApp Conectado!'); isReady = true; clientStatus = 'ready'; qrCodeData = null; });
client.on('authenticated', () => { console.log('🔑 Autenticado!'); clientStatus = 'authenticated'; });
client.on('disconnected', async () => { isReady = false; clientStatus = 'disconnected'; try { await client.destroy(); } catch(e){} setTimeout(() => client.initialize().catch(console.error), 5000); });

client.on('message', async msg => {
    if(msg.isStatus || msg.from.includes('@g.us') || msg.fromMe) return;
    const fromNumber = msg.from.replace('@c.us', '');
    const contacts = getContacts();
    let updated = false;
    for (let c of contacts) {
        if (isSamePhone(c.phone, fromNumber)) {
            console.log(`🔔 Resposta de ${c.name}.`);
            c.hasUnreadReply = true;
            c.lastReplyContent = msg.body;
            c.lastReplyTimestamp = Date.now();
            c.automationStage = 0; // RESET
            c.lastContactDate = new Date().toISOString(); 
            updated = true;
        }
    }
    if (updated) saveContacts(contacts);
});

// --- MOTOR DE AUTOMAÇÃO ---

async function runAutomationCycle() {
    if (!isReady) return;
    const settings = getSettings();
    if (!settings.automationActive) return;

    console.log("🔄 Ciclo de Automação...");
    const contacts = getContacts();
    let changed = false;
    const now = Date.now();

    for (let c of contacts) {
        if (c.autoPilotEnabled === false) continue;
        if (c.hasUnreadReply) continue;
        
        // ESTÁGIO 0: IDLE -> ENVIA MSG 1
        if (c.automationStage === 0) {
            const lastDate = new Date(c.lastContactDate || now).getTime();
            const freqDays = c.followUpFrequencyDays || 30;
            const diffDays = (now - lastDate) / (1000 * 60 * 60 * 24);
            
            console.log(`🔎 ${c.name} (E0): ${diffDays.toFixed(1)}/${freqDays} dias.`);

            if (diffDays >= freqDays) {
                console.log(`⚡ Enviando MSG 1 para ${c.name}`);
                const msg = await generateAIMessage(c, settings, 0);
                if (await sendWpp(c.phone, msg)) {
                    c.automationStage = 1;
                    c.lastAutomatedMsgDate = new Date().toISOString();
                    c.lastContactDate = new Date().toISOString(); // Atualiza data último contato
                    changed = true;
                }
            }
        }
        // ESTÁGIO 1: ESPERANDO -> ENVIA MSG 2 (COBRANÇA) - 2 DIAS DEPOIS
        else if (c.automationStage === 1) {
            const lastAuto = new Date(c.lastAutomatedMsgDate).getTime();
            const diffDays = (now - lastAuto) / (1000 * 60 * 60 * 24);
            
            console.log(`🔎 ${c.name} (E1): Esperando há ${diffDays.toFixed(1)} dias.`);
            
            if (diffDays >= 2) {
                console.log(`⚡ Enviando MSG 2 (Cobrança) para ${c.name}`);
                const msg = await generateAIMessage(c, settings, 1);
                if (await sendWpp(c.phone, msg)) {
                    c.automationStage = 2;
                    c.lastAutomatedMsgDate = new Date().toISOString();
                    changed = true;
                }
            }
        }
        // ESTÁGIO 2: ESPERANDO -> ALERTA (SEM RETORNO) - 1 DIA DEPOIS
        else if (c.automationStage === 2) {
             const lastAuto = new Date(c.lastAutomatedMsgDate).getTime();
             const diffDays = (now - lastAuto) / (1000 * 60 * 60 * 24);
             
             if (diffDays >= 1) {
                 console.log(`⚠️ ${c.name}: Sem retorno. Marcando ALERTA.`);
                 c.automationStage = 3; // ALERTA
                 changed = true;
             }
        }
    }

    if (changed) saveContacts(contacts);
}

async function sendWpp(phone, msg) {
    try {
        const chatId = `${formatPhone(phone)}@c.us`;
        const numberId = await client.getNumberId(chatId);
        await client.sendMessage(numberId ? numberId._serialized : chatId, msg);
        return true;
    } catch (e) {
        console.error("Erro envio:", e.message);
        return false;
    }
}

setInterval(runAutomationCycle, 10 * 60 * 1000); 
setTimeout(runAutomationCycle, 10000);

// --- ENDPOINTS ---

app.get('/status', (req, res) => res.json({ status: clientStatus, isReady: isReady }));
app.get('/qr', (req, res) => res.json({ qrCode: qrCodeData }));
app.get('/contacts', (req, res) => res.json(getContacts()));
app.post('/contacts', (req, res) => { saveContacts(req.body); res.json({success:true}); });
app.get('/settings', (req, res) => res.json(getSettings()));
app.post('/settings', (req, res) => { saveSettings(req.body); res.json({success:true}); });

app.get('/trigger-automation', (req, res) => { runAutomationCycle(); res.json({success:true}); });
app.post('/generate-message', async (req, res) => {
    const msg = await generateAIMessage(req.body.contact, req.body.settings);
    res.json({ message: msg });
});

app.post('/toggle-automation', (req, res) => {
    const s = getSettings(); s.automationActive = req.body.active; saveSettings(s);
    if(s.automationActive) setTimeout(runAutomationCycle, 1000);
    res.json({success:true});
});

app.post('/send', async (req, res) => { await sendWpp(req.body.phone, req.body.message); res.json({success:true}); });

app.post('/goodbye', async (req, res) => {
    const { contactId, sendMsg } = req.body;
    const contacts = getContacts();
    const contact = contacts.find(c => c.id === contactId);
    if (contact && sendMsg) {
        const msg = await generateAIMessage(contact, getSettings(), 99);
        await sendWpp(contact.phone, msg);
    }
    const newContacts = contacts.filter(c => c.id !== contactId);
    saveContacts(newContacts);
    res.json({success:true});
});

app.post('/logout', async (req, res) => {
    try {
        await client.logout();
    } catch (e) { console.error("Logout error", e); }
    try { await client.destroy(); } catch(e){}
    client.initialize();
    isReady = false;
    clientStatus = 'initializing';
    res.json({success:true});
});

app.get('/chat/:phone', async (req, res) => {
    if (!isReady) return res.json([]);
    try {
        const chat = await client.getChatById(`${formatPhone(req.params.phone)}@c.us`);
        const msgs = await chat.fetchMessages({ limit: 50 });
        res.json(msgs.map(m => ({ id: m.id.id, fromMe: m.fromMe, body: m.body, timestamp: m.timestamp })));
    } catch { res.json([]); }
});

app.get('/whatsapp-contacts', async (req, res) => {
    if (!isReady) return res.status(503).json({ error: 'Offline' });
    try {
        const chats = await client.getChats();
        const unique = [];
        const seen = new Set();
        for(const c of chats) {
            if(!c.isGroup && !seen.has(c.id.user)) {
                seen.add(c.id.user);
                const lastMsgTime = c.timestamp; 
                unique.push({ name: c.name || c.id.user, phone: c.id.user, timestamp: lastMsgTime });
            }
        }
        res.json(unique);
    } catch (e) { res.status(500).json({error: e.message}); }
});

client.initialize().catch(console.error);
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor ImobiFlow na porta ${PORT}`));