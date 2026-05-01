// ===== IMPORTS =====
const baileys = require('@whiskeysockets/baileys')
const makeWASocket = baileys.default
const { useMultiFileAuthState, DisconnectReason } = baileys
const P = require('pino')
const cron = require('node-cron')
const fs = require('fs-extra')

global.fetch = require('node-fetch')

// ===== CONFIG =====
const ADM = ['SEU_NUMERO@s.whatsapp.net']
const DB_FILE = './db.json'

// ===== ESTADO =====
let db = {
  slots: [],
  fila: [],
  banidos: [],
  aberto: true,
  idSala: '',
  senhaSala: '',
  grupoId: ''
}

// ===== SALVAR / CARREGAR =====
function loadDB() {
  if (fs.existsSync(DB_FILE)) {
    db = fs.readJsonSync(DB_FILE)
  }
}

function saveDB() {
  fs.writeJsonSync(DB_FILE, db, { spaces: 2 })
}

// ===== FUNÇÕES =====
function isAdmin(sender) {
  return ADM.includes(sender)
}

// ===== BOT =====
async function startBot() {
  loadDB()

  const { state, saveCreds } = await useMultiFileAuthState('session')

  const sock = makeWASocket({
    logger: P({ level: 'silent' }),
    auth: state
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) console.log('📱 ESCANEIE O QR')

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) startBot()
    }

    if (connection === 'open') {
      console.log('✅ ONLINE')
    }
  })

  // ===== CRON =====
  cron.schedule('30 19 * * *', () => {
    db.aberto = true
    saveDB()
    if (db.grupoId) sock.sendMessage(db.grupoId, { text: '✅ INSCRIÇÕES ABERTAS' })
  })

  cron.schedule('58 19 * * *', () => {
    db.aberto = false

    let removidos = db.slots.filter(s => !s.confirm)
    db.slots = db.slots.filter(s => s.confirm)

    removidos.forEach(r => db.banidos.push(r.nome))
    saveDB()

    if (db.grupoId) {
      sock.sendMessage(db.grupoId, {
        text: `❌ AUSENTES:\n${removidos.map(r => r.nome).join('\n') || 'Nenhum'}`
      })
    }
  })

  cron.schedule('0 20 * * *', () => {
    if (db.grupoId) {
      sock.sendMessage(db.grupoId, {
        text: `🚀 GO!\nID: ${db.idSala}\nSENHA: ${db.senhaSala}`
      })
    }
  })

  // ===== MENSAGENS =====
  sock.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages[0]
      if (!msg.message) return

      const from = msg.key.remoteJid
      const sender = msg.key.participant || from

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text

      if (!text || !text.startsWith('!')) return

      // ID GRUPO
      if (text === '!idgrupo') {
        return sock.sendMessage(from, { text: from })
      }

      // DEFINIR GRUPO
      if (text === '!setgrupo' && isAdmin(sender)) {
        db.grupoId = from
        saveDB()
        return sock.sendMessage(from, { text: '✅ Grupo definido' })
      }

      // SALA
      if (text.startsWith('!sala') && isAdmin(sender)) {
        let args = text.split(' ')
        db.idSala = args[1]
        db.senhaSala = args[2]
        saveDB()
        return sock.sendMessage(from, { text: '🎮 Sala definida' })
      }

      // LINE
      if (text.startsWith('!line')) {
        if (!db.aberto) return

        let nome = text.replace('!line', '').trim()

        if (!nome) return
        if (db.banidos.includes(nome)) return
        if (db.slots.find(s => s.nome === nome)) return

        if (db.slots.length < 12) {
          db.slots.push({ nome, confirm: false, dono: sender })
        } else {
          db.fila.push({ nome, dono: sender })
        }

        saveDB()
        return sock.sendMessage(from, { text: '✅ INSCRITO' })
      }

      // CHECK
      if (text === '!check') {
        let team = db.slots.find(s => s.dono === sender)
        if (!team) return

        team.confirm = true
        saveDB()

        return sock.sendMessage(from, { text: '✅ CONFIRMADO' })
      }

      // SLOTS
      if (text === '!slots') {
        let lista = db.slots.map((s, i) =>
          `${i + 1}. ${s.nome} ${s.confirm ? '✅' : '❌'}`
        ).join('\n')

        return sock.sendMessage(from, { text: lista || 'Vazio' })
      }

      // BAN
      if (text.startsWith('!ban') && isAdmin(sender)) {
        let num = parseInt(text.split(' ')[2])
        if (!num || !db.slots[num - 1]) return

        let removido = db.slots.splice(num - 1, 1)[0]
        db.banidos.push(removido.nome)

        if (db.fila.length > 0) {
          let novo = db.fila.shift()
          db.slots.push({ ...novo, confirm: false })
        }

        saveDB()
        return sock.sendMessage(from, { text: '🚫 BANIDO' })
      }

      // RESET
      if (text === '!reset' && isAdmin(sender)) {
        db = { slots: [], fila: [], banidos: [], aberto: true, idSala: '', senhaSala: '', grupoId: '' }
        saveDB()
        return sock.sendMessage(from, { text: '♻️ RESETADO' })
      }

    } catch (e) {
      console.log(e)
    }
  })
}

startBot()
