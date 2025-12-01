
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
// Agora armazena objeto: { timestamp: number, body: string }
const incomingActivity = {};

const client = new Client({
    authStrategy: new LocalAuth(),
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
    console.log('QR Code recebido! (Scan necessário)');
    qrcodeTerminal.generate(qr, { small: true });
    qrcode.toDataURL(qr, (err, url) => {
        qrCodeData = url;
        clientStatus = 'qr_ready';
    });
});

client.on('ready', () => {
    console.log('WhatsApp Conectado e Pronto!');
    isReady = true;
    clientStatus = 'ready';
    qrCodeData = null;
});

client.on('authenticated', () => {
    console.log('Sessão Autenticada!');
    clientStatus = 'authenticated';
});

client.on('disconnected', (reason) => {
    console.log('WhatsApp desconectado:', reason);
    isReady = false;
    clientStatus = 'disconnected';
    client.initialize();
});

// ESCUTA MENSAGENS RECEBIDAS
client.on('message', async msg => {
    try {
        const fromNumber = msg.from.replace('@c.us', '');
        // Log simplificado para garantir visibilidade do evento
        console.log(`[🔔 NOTIFICAÇÃO] Mensagem recebida de: ${fromNumber}`);
        
        // Armazena timestamp E conteúdo (mesmo que não usemos o texto na UI, guardamos para log)
        incomingActivity[fromNumber] = {
            timestamp: Date.now(),
            body: "Nova mensagem recebida. Verifique o WhatsApp." // Texto padrão para garantir privacidade/compatibilidade
        };
    } catch (e) {
        console.error('Erro ao processar msg recebida', e);
    }
});

client.initialize();

function formatPhoneNumber(phone) {
    let clean = phone.replace(/\D/g, '');
    if (clean.length === 10 || clean.length === 11) {
        clean = '55' + clean;
    }
    return clean;
}

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
                <p>Aguarde alguns segundos e recarregue a página.</p>
                <script>setTimeout(() => window.location.reload(), 3000);</script>
            </div>
        `);
    }
    res.send(`
        <div style="font-family: sans-serif; text-align: center; padding: 20px;">
            <h1>Escaneie para Conectar</h1>
            <img src="${qrCodeData}" style="width: 300px; height: 300px; border: 1px solid #ccc;" />
            <p>Abra o WhatsApp > Aparelhos Conectados > Conectar Aparelho</p>
        </div>
    `);
});

// Endpoint para limpar o histórico de notificações (útil para testes)
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
        
        // Verifica se o número existe no WhatsApp antes de enviar
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
