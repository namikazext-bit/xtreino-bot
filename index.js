const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay // Adicionado para dar tempo ao socket
} = require('@whiskeysockets/baileys')
const P = require('pino')
const fs = require('fs-extra')

// ===== BANCO =====
const DB_FILE = './db.json'
let db = { slots: [], fila: [], aberto: true, idSala: '', senhaSala: '', ranking: {} }

function loadDB() { if (fs.existsSync(DB_FILE)) db = fs.readJsonSync(DB_FILE) }
function saveDB() { fs.writeJsonSync(DB_FILE, db, { spaces: 2 }) }

// ===== CONFIG =====
const ADM = ['55XXXXXXXXXXX@s.whatsapp.net'] // Coloque seu número aqui
const meuNumero = "55XXXXXXXXXXX" // Seu número (apenas números) para o pareamento

// ===== BOT =====
async function startBot() {
  loadDB()

  const { state, saveCreds } = await useMultiFileAuthState('session')

  const sock = makeWASocket({
    logger: P({ level: 'silent' }),
    auth: state,
    // ESSENCIAL para pareamento por código:
    browser: ["Ubuntu", "Chrome", "20.0.04"] 
  })

  // LÓGICA DE PAREAMENTO POR NÚMERO
  if (!sock.authState.creds.registered) {
    await delay(5000) // Espera 5 segundos para o socket estabilizar
    try {
      const code = await sock.requestPairingCode(meuNumero)
      console.log(`\n=========================================`)
      console.log(`📱 SEU CÓDIGO DE PAREAMENTO: ${code}`)
      console.log(`=========================================\n`)
    } catch (err) {
      console.error("Erro ao gerar código de pareamento:", err)
    }
  }

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection }) => {
    if (connection === 'open') {
      console.log('✅ BOT ONLINE')
    }
    if (connection === 'close') {
      console.log('❌ Conexão encerrada, reiniciando...')
      startBot()
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages[0]
      if (!msg.message || msg.key.fromMe) return // Evita responder a si mesmo

      const from = msg.key.remoteJid
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ""

      if (!text.startsWith('!')) return
      
      // Sua lógica de comandos aqui...
      console.log(`Comando recebido: ${text} de ${from}`)

    } catch (e) {
      console.log("Erro no processamento de mensagem:", e)
    }
  })
}

startBot()
