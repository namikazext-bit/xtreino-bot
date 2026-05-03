const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    DisconnectReason 
} = require('@whiskeysockets/baileys')
const P = require('pino')
const fs = require('fs-extra')

// ===== BANCO DE DADOS =====
const DB_FILE = './db.json'
let db = { slots: [], fila: [], aberto: true, idSala: '', senhaSala: '', ranking: {} }

function loadDB() { 
    if (fs.existsSync(DB_FILE)) db = fs.readJsonSync(DB_FILE) 
}
function saveDB() { 
    fs.writeJsonSync(DB_FILE, db, { spaces: 2 }) 
}

// ===== CONFIGURAÇÃO =====
const MEU_NUMERO = "556792828903" // Seu número configurado corretamente
const ADMS = ['556792828903@s.whatsapp.net'] // Você como administrador

async function startBot() {
    loadDB()

    // Garante que a pasta de sessão existe
    if (!fs.existsSync('./session')) {
        fs.mkdirSync('./session')
    }

    const { state, saveCreds } = await useMultiFileAuthState('session')

    const sock = makeWASocket({
        logger: P({ level: 'silent' }),
        auth: state,
        // Necessário para o pareamento por número funcionar
        browser: ["Ubuntu", "Chrome", "20.0.04"] 
    })

    // ===== LÓGICA DE PAREAMENTO =====
    if (!sock.authState.creds.registered) {
        console.log(`[!] Solicitando código de pareamento para: ${MEU_NUMERO}`)
        
        // Delay para garantir conexão com os servidores do WhatsApp
        await delay(10000) 

        try {
            const code = await sock.requestPairingCode(MEU_NUMERO)
            console.log(`\n=========================================`)
            console.log(`📱 SEU CÓDIGO DE PAREAMENTO: ${code}`)
            console.log(`=========================================\n`)
        } catch (err) {
            console.error("Erro ao gerar código de pareamento:", err)
        }
    }

    // Salvar credenciais quando atualizadas
    sock.ev.on('creds.update', saveCreds)

    // Gerenciar conexão
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update

        if (connection === 'open') {
            console.log('✅ BOT ONLINE E CONECTADO NO WHATSAPP!')
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('[!] Conexão fechada. Tentando reconectar:', shouldReconnect)
            if (shouldReconnect) startBot()
        }
    })

    // ===== PROCESSAMENTO DE MENSAGENS =====
    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const msg = messages[0]
            if (!msg.message || msg.key.fromMe) return

            const from = msg.key.remoteJid
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ""

            if (!text.startsWith('!')) return

            // Exemplo de comando
            if (text === '!status') {
                await sock.sendMessage(from, { text: 'Bot está operando normalmente! 🚀' })
            }

            // Sua lógica de Slots/Fila/Ranking entra aqui...

        } catch (e) {
            console.log("Erro ao processar mensagem:", e)
        }
    })
}

// Iniciar o bot
startBot()
