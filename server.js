
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Armazenamento em memória
let qrCodeData = null;
let isReady = false;
let clientStatus = 'initializing';

// Cache de últimas mensagens recebidas
const incomingActivity = {};

// Configuração robusta do Cliente
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "imobiflow-session"
    }),
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

// --- EVENTOS DO CLIENTE ---

client.on('qr', (qr) => {
    console.log('📱 QR Code recebido! Escaneie agora.');
    // Gera no terminal para facilitar (aparece nos logs do Render)
    qrcodeTerminal.generate(qr, { small: true });
    
    // Gera imagem para o site
    qrcode.toDataURL(qr, (err, url) => {
        qrCodeData = url;
        clientStatus = 'qr_ready';
    });
});

client.on('ready', () => {
    console.log('✅ WhatsApp Conectado e Pronto!');
    isReady = true;
    clientStatus = 'ready';
    qrCodeData = null;
});

client.on('authenticated', () => {
    console.log('🔑 Sessão Autenticada com sucesso!');
    clientStatus = 'authenticated';
    qrCodeData = null;
});

client.on('auth_failure', msg => {
    console.error('❌ Falha na autenticação:', msg);
    clientStatus = 'error';
    // Não reinicia automaticamente em falha de auth para evitar banimento ou loop
});

client.on('disconnected', async (reason) => {
    console.log('⚠️ WhatsApp desconectado:', reason);
    isReady = false;
    clientStatus = 'disconnected';
    
    // LÓGICA ANTI-LOOP DE REINICIALIZAÇÃO
    // 1. Destrói a instância atual para limpar memória e processos travados
    try {
        await client.destroy();
    } catch (e) {
        console.error('Erro ao destruir cliente (pode ser normal se já caiu):', e);
    }

    // 2. Espera 5 segundos antes de tentar reconectar (respirar)
    console.log('🔄 Reiniciando sistema em 10 segundos...');
    setTimeout(() => {
        console.log('🚀 Tentando inicializar novamente...');
        client.initialize().catch(e => console.error("Falha ao reinicializar:", e));
    }, 10000); // 10 segundos de delay
});

// ESCUTA MENSAGENS RECEBIDAS
client.on('message', async msg => {
    try {
        const fromNumber = msg.from.replace('@c.us', '');
        console.log(`[🔔 NOTIFICAÇÃO] Mensagem recebida de: ${fromNumber}`);
        
        // Armazena apenas que houve interação, sem o conteúdo (privacidade/segurança)
        incomingActivity[fromNumber] = {
            timestamp: Date.now(),
            body: "Nova mensagem recebida. Verifique o WhatsApp."
        };
    } catch (e) {
        console.error('Erro ao processar msg recebida', e);
    }
});

// Inicialização segura
try {
    client.initialize();
} catch (e) {
    console.error("Erro fatal na inicialização:", e);
}

// --- FUNÇÕES AUXILIARES ---

function formatPhoneNumber(phone) {
    let clean = phone.replace(/\D/g, '');
    // Se for celular SP (11 + 9 dígitos) ou fixo/outros estados
    if (clean.length >= 10 && clean.length <= 11) {
        clean = '55' + clean;
    }
    return clean;
}

// --- ROTAS DA API ---

app.get('/', (req, res) => {
    res.send('ImobiFlow Server está rodando! Acesse /scan para conectar.');
});

app.get('/status', (req, res) => {
    res.json({ 
        status: clientStatus,
        isReady: isReady 
    });
});

app.get('/qr', (req, res) => {
    res.json({ qrCode: qrCodeData });
});

app.get('/scan', (req, res) => {
    if (isReady) {
        return res.send(`
            <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: green;">Conectado! ✅</h1>
                <p>O robô já está ativo e pronto para uso.</p>
            </div>
        `);
    }
    if (!qrCodeData) {
        return res.send(`
            <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1>Iniciando... ⏳</h1>
                <p>Aguarde o QR Code ser gerado (pode levar até 20-30s na primeira vez)...</p>
                <p>Status atual: ${clientStatus}</p>
                <script>setTimeout(() => window.location.reload(), 5000);</script>
            </div>
        `);
    }
    res.send(`
        <div style="font-family: sans-serif; text-align: center; padding: 20px;">
            <h1>Escaneie para Conectar</h1>
            <img src="${qrCodeData}" style="width: 300px; height: 300px; border: 1px solid #ccc;" />
            <p>Abra o WhatsApp > Aparelhos Conectados > Conectar Aparelho</p>
            <p>Se já conectou, aguarde a atualização...</p>
            <script>setTimeout(() => window.location.reload(), 5000);</script>
        </div>
    `);
});

app.get('/clear', (req, res) => {
    for (const key in incomingActivity) {
        delete incomingActivity[key];
    }
    console.log('Histórico de notificações limpo via comando.');
    res.json({ success: true, message: 'Histórico limpo' });
});

app.get('/activity', (req, res) => {
    res.json(incomingActivity);
});

app.post('/send', async (req, res) => {
    const { phone, message } = req.body;

    if (!isReady) {
        return res.status(503).json({ error: 'WhatsApp client not ready' });
    }

    try {
        const formattedPhone = formatPhoneNumber(phone);
        const chatId = `${formattedPhone}@c.us`;
        
        // Verifica existência do número
        const contactId = await client.getNumberId(chatId);
        
        if (!contactId) {
            console.log(`[ERRO ENVIO] Número inválido/sem zap: ${formattedPhone}`);
            return res.status(404).json({ success: false, error: 'Número não possui WhatsApp válido.' });
        }
        
        await client.sendMessage(contactId._serialized, message);
        console.log(`[ENVIADA] Para: ${formattedPhone}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        res.status(500).json({ error: 'Failed to send message', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
