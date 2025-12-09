
require('dotenv').config(); // Carrega variáveis de ambiente do arquivo .env

// ==================================================================================
// 🚨 ÁREA DE CONFIGURAÇÃO RÁPIDA (PARA CORRIGIR ERRO DE CHAVE) 🚨
// ==================================================================================
// Se você não estiver conseguindo usar o arquivo .env, COLE SUA CHAVE ABAIXO:
const CHAVE_FIXA = ""; // <--- COLE SUA CHAVE AQUI DENTRO (Começa com AIzaSy...)
// ==================================================================================

console.log("🚀 Iniciando processo do servidor...");

// Define a chave final (Prioridade: Chave Fixa > Variável de Ambiente)
const API_KEY = CHAVE_FIXA || process.env.API_KEY;

// Garante que o processo tenha acesso à chave
process.env.API_KEY = API_KEY;

// Validação visual no log
if (API_KEY && API_KEY.length > 20) {
    console.log(`✅ API KEY CARREGADA: ${API_KEY.substring(0, 6)}...******`);
} else {
    console.error("❌ AVISO CRÍTICO: NENHUMA API KEY ENCONTRADA.");
    console.error("👉 Edite o arquivo server.js e cole sua chave na variável 'CHAVE_FIXA' nas primeiras linhas.");
}

try {
    require.resolve('express');
} catch (e) {
    console.error("❌ ERRO CRÍTICO: A dependência 'express' não foi encontrada.");
    process.exit(1);
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

console.log("✅ Dependências carregadas com sucesso.");

const app = express();
const PORT = process.env.PORT || 3001;
const DB_FILE = path.join(__dirname, 'database.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

app.use(cors({ origin: '*' }));
app.use(express.json());

// Log de requisições para depuração
app.use((req, res, next) => {
    if (!req.path.endsWith('.js') && !req.path.endsWith('.css') && !req.path.endsWith('.ico')) {
        console.log(`📡 REQ: ${req.method} ${req.path}`);
    }
    next();
});

// --- MIDDLEWARE DE COMPILAÇÃO JIT (JUST-IN-TIME) ---
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/qr' || req.path === '/status' || req.path === '/auth-status' || req.path === '/login') return next();
    
    let filePath = path.join(__dirname, req.path);
    if (req.path === '/') filePath = path.join(__dirname, 'index.html');
    
    let exists = fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    if (!exists && !req.path.includes('.')) {
         if (fs.existsSync(filePath + '.tsx')) { filePath += '.tsx'; exists = true; }
         else if (fs.existsSync(filePath + '.ts')) { filePath += '.ts'; exists = true; }
    }

    if (exists && (filePath.endsWith('.tsx') || filePath.endsWith('.ts'))) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const compiled = transform(content, {
                transforms: ['typescript', 'jsx'],
                jsxRuntime: 'classic', 
                production: false
            }).code;

            res.setHeader('Content-Type', 'application/javascript');
            return res.send(compiled);
        } catch (e) {
            console.error(`❌ Erro ao compilar ${filePath}:`, e);
            return res.status(500).send(`console.error("Erro de compilação no servidor: ${e.message}")`);
        }
    }
    next();
});

app.use(express.static(__dirname));

// --- MIDDLEWARE DE AUTENTICAÇÃO ---
const authMiddleware = (req, res, next) => {
    const publicRoutes = ['/status', '/qr', '/auth-status', '/login', '/logout', '/'];
    if (publicRoutes.includes(req.path)) return next();

    const settings = getSettings();
    const token = req.headers['x-access-token'];

    if (!settings.password) return next();
    if (token === settings.password) return next();

    console.warn(`⛔ Acesso Negado (401) em ${req.path}. Token recebido: ${token ? 'SIM (Inválido)' : 'NÃO'}`);
    return res.status(401).json({ error: 'Unauthorized' });
};

app.use(authMiddleware);

console.log(`🔧 Configurando servidor na porta ${PORT}...`);

// --- IA CENTRALIZADA ---

async function generateAIMessage(contact, settings, stage = 0) {
    const agent = settings.agentName || "Seu Corretor";
    const agency = settings.agencyName || "Imobiliária";
    const tone = contact.messageTone || settings.messageTone || "Casual";

    if (!API_KEY || API_KEY.length < 10) {
        console.error("❌ ERRO IA: Chave de API inválida ou ausente.");
        return generateTemplateFallback(contact, settings, stage);
    }

    console.log(`🤖 SOLICITANDO IA PARA: ${contact.name} | TIPO: ${contact.type}`);

    try {
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        const modelId = "gemini-2.5-flash"; 

        const internalNotes = contact.notes ? `MOTIVO/OBSERVAÇÃO DO CLIENTE: "${contact.notes}"` : "Sem observações específicas (apenas follow-up de rotina).";

        let context = "Retomada de contato.";
        if (stage === 1) context = "Cobrança amigável (sem resposta anterior).";
        if (stage === 99) context = "Despedida profissional.";

        const prompt = `
          Você é ${agent}, corretor da ${agency}.
          Escreva uma mensagem de WhatsApp para ${contact.name} (${contact.type}).
          
          CONTEXTO DO CLIENTE:
          ${internalNotes}
          
          OBJETIVO: ${context}
          
          REGRAS OBRIGATÓRIAS:
          1. Use um tom ${tone}.
          2. SE houver uma observação acima (como "procura apto" ou "imovel rua X"), VOCÊ DEVE MENCIONAR ISSO NA PERGUNTA. É proibido ignorar a observação.
          3. Se não houver observação, pergunte genericamente se ainda busca imóveis.
          4. Seja breve (máximo 3 linhas).
          5. Não use hashtags.
        `;

        const response = await ai.models.generateContent({
            model: modelId,
            contents: [
                {
                    role: 'user',
                    parts: [{ text: prompt }]
                }
            ],
            config: {
                temperature: 0.6,
                // DESATIVA FILTROS DE SEGURANÇA QUE BLOQUEIAM VENDAS/IMÓVEIS
                safetySettings: [
                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
                ]
            }
        });
        
        const generatedText = response.text ? response.text.trim() : null;
        
        if (generatedText && generatedText.length > 5) {
            console.log("✨ IA SUCESSO:", generatedText.substring(0, 50) + "...");
            return generatedText;
        } else {
            console.error("⚠️ Resposta IA vazia ou inválida.");
            throw new Error("Resposta Vazia");
        }

    } catch (error) {
        console.error("❌ FALHA CRÍTICA IA:");
        // Loga o erro completo para debug real
        console.error(JSON.stringify(error, null, 2));
        
        return generateTemplateFallback(contact, settings, stage);
    }
}

function generateTemplateFallback(contact, settings, stage = 0) {
    console.warn("⚠️ Usando Template Padrão (Fallback Ativado).");
    const agent = settings.agentName || "Corretor";
    
    if (stage === 99) return `Olá ${contact.name}, encerro nosso contato por enquanto. Se precisar, estou à disposição!`;
    if (stage === 1) return `Olá ${contact.name}, conseguiu ver minha mensagem anterior?`;

    let subject = "continuamos com o assunto";
    if (contact.type === 'Proprietário') subject = "seu imóvel ainda está disponível";
    if (contact.type === 'Construtor') subject = "temos novas oportunidades";
    if (contact.type === 'Cliente/Comprador') subject = "ainda busca opções no seu perfil";
    
    return `Olá ${contact.name}, aqui é ${agent}. Passando para saber se ${subject}. Podemos falar?`;
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
let lastQrCode = '';

console.log("📲 Iniciando cliente WhatsApp...");
const client = new Client({
    authStrategy: new LocalAuth({ clientId: "imobiflow-crm-v2" }),
    puppeteer: { 
        headless: true, 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--single-process', '--disable-gpu'] 
    }
});

client.on('qr', (qr) => { 
    if (qr === lastQrCode) return;
    lastQrCode = qr;
    console.log("🔹 Novo QR Code gerado.");
    qrcodeTerminal.generate(qr, { small: true }); 
    qrcode.toDataURL(qr, (err, url) => { if (!err) { qrCodeData = url; clientStatus = 'qr_ready'; } }); 
});

client.on('ready', () => { console.log('✅ WhatsApp Pronto!'); isReady = true; clientStatus = 'ready'; qrCodeData = null; });
client.on('authenticated', () => { console.log('🔑 Autenticado!'); clientStatus = 'authenticated'; });
client.on('auth_failure', () => clientStatus = 'error');
client.on('disconnected', async () => { 
    console.log('⚠️ Desconectado. Reconectando...'); 
    isReady = false; clientStatus = 'disconnected'; 
    try { await client.destroy(); } catch(e){} 
    setTimeout(() => client.initialize(), 5000); 
});

client.on('message', async msg => {
    if(msg.isStatus || msg.from.includes('@g.us') || msg.fromMe) return;
    const fromNumber = msg.from.replace('@c.us', '');
    const contacts = getContacts();
    let updated = false;
    for (let c of contacts) {
        if (isSamePhone(c.phone, fromNumber)) {
            c.hasUnreadReply = true;
            c.lastReplyContent = msg.body;
            c.lastReplyTimestamp = Date.now();
            c.automationStage = 0; 
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

    const contacts = getContacts();
    let changed = false;
    const now = Date.now();

    for (let c of contacts) {
        if (c.autoPilotEnabled === false || c.hasUnreadReply) continue;
        
        let shouldSend = false;
        let stageToSend = 0;

        if (c.automationStage === 0) {
            const lastDate = new Date(c.lastContactDate || now).getTime();
            const freqDays = c.followUpFrequencyDays || 30;
            if ((now - lastDate) / (86400000) >= freqDays) { shouldSend = true; stageToSend = 0; }
        } else if (c.automationStage === 1) {
            const lastAuto = new Date(c.lastAutomatedMsgDate).getTime();
            if ((now - lastAuto) / (86400000) >= 2) { shouldSend = true; stageToSend = 1; }
        } else if (c.automationStage === 2) {
             const lastAuto = new Date(c.lastAutomatedMsgDate).getTime();
             if ((now - lastAuto) / (86400000) >= 1) { c.automationStage = 3; changed = true; }
        }

        if (shouldSend) {
            const msg = await generateAIMessage(c, settings, stageToSend);
            if (await sendWpp(c.phone, msg)) {
                c.automationStage = stageToSend + 1;
                c.lastAutomatedMsgDate = new Date().toISOString();
                c.lastContactDate = new Date().toISOString();
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
    } catch (e) { return false; }
}

setInterval(runAutomationCycle, 600000); // 10 min

// --- ENDPOINTS ---

app.get('/auth-status', (req, res) => res.json({ configured: !!(getSettings().agentName && getSettings().password) }));
app.post('/login', (req, res) => {
    const s = getSettings();
    if (s.password && s.password === req.body.password) return res.json({ success: true });
    return res.status(401).json({ success: false });
});

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

app.post('/send', async (req, res) => { 
    await sendWpp(req.body.phone, req.body.message); 
    res.json({success:true}); 
});

app.post('/logout', async (req, res) => {
    try { await client.logout(); } catch (e) {}
    client.initialize();
    isReady = false; clientStatus = 'initializing';
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
                unique.push({ name: c.name || c.id.user, phone: c.id.user, timestamp: c.timestamp });
            }
        }
        res.json(unique);
    } catch (e) { res.status(500).json({error: e.message}); }
});

client.initialize().catch(err => console.error("❌ Erro fatal:", err));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
