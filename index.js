// ===============================
// XTREINO BOT PRO V3 - RAILWAY READY
// ===============================

// ===== IMPORTS =====
const baileys = require('@whiskeysockets/baileys')
const makeWASocket = baileys.default
const { useMultiFileAuthState, DisconnectReason } = baileys

const P = require('pino')
const cron = require('node-cron')
const fs = require('fs-extra')
const qrcode = require('qrcode-terminal')

const fetch = require('node-fetch')
global.fetch = fetch

// ===== CONFIG =====

// COLOQUE SEU NÚMERO AQUI
const ADM = ['5567999999999@s.whatsapp.net']

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

// ===== DB =====

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      db = fs.readJsonSync(DB_FILE)
    }
  } catch (err) {
    console.log('Erro ao carregar DB:', err)
  }
}

function saveDB() {
  try {
    fs.writeJsonSync(DB_FILE, db, { spaces: 2 })
  } catch (err) {
    console.log('Erro ao salvar DB:', err)
  }
}

// ===== FUNÇÕES =====

function isAdmin(sender) {
  return ADM.includes(sender)
}

function resetDB() {
  db = {
    slots: [],
    fila: [],
    banidos: [],
    aberto: true,
    idSala: '',
    senhaSala: '',
    grupoId: ''
  }
  saveDB()
}

// ===== BOT =====

async function startBot() {
  loadDB()

  const { state, saveCreds } = await useMultiFileAuthState('session')

  const sock = makeWASocket({
    logger: P({ level: 'silent' }),
    auth: state,
    printQRInTerminal: false
  })

  sock.ev.on('creds.update', saveCreds)

  // ===== CONEXÃO =====

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log('\n📱 ESCANEIE O QR CODE ABAIXO:\n')
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut

      console.log('❌ Conexão fechada')

      if (shouldReconnect) {
        console.log('🔁 Reconectando...')
        startBot()
      }
    }

    if (connection === 'open') {
      console.log('✅ BOT ONLINE COM SUCESSO')
    }
  })

  // ===============================
  // CRON AUTOMÁTICO
  // ===============================

  // 19:30 abre inscrições
  cron.schedule('30 19 * * *', async () => {
    db.aberto = true
    saveDB()

    if (db.grupoId) {
      await sock.sendMessage(db.grupoId, {
        text: '✅ INSCRIÇÕES ABERTAS!\n\nUse: !line NomeDaSuaLine'
      })
    }

    console.log('✅ Inscrições abertas')
  })

  // 19:58 fecha e remove faltantes
  cron.schedule('58 19 * * *', async () => {
    db.aberto = false

    const removidos = db.slots.filter(s => !s.confirm)
    db.slots = db.slots.filter(s => s.confirm)

    removidos.forEach(r => {
      if (!db.banidos.includes(r.nome)) {
        db.banidos.push(r.nome)
      }
    })

    saveDB()

    if (db.grupoId) {
      await sock.sendMessage(db.grupoId, {
        text:
          `❌ AUSENTES REMOVIDOS:\n\n${
            removidos.length
              ? removidos.map(r => `• ${r.nome}`).join('\n')
              : 'Nenhum'
          }`
      })
    }

    console.log('❌ Fechamento realizado')
  })

  // 20:00 envia sala
  cron.schedule('0 20 * * *', async () => {
    if (db.grupoId) {
      await sock.sendMessage(db.grupoId, {
        text:
          `🚀 GO TREINO!\n\n` +
          `🎮 ID: ${db.idSala || 'Não definido'}\n` +
          `🔐 SENHA: ${db.senhaSala || 'Não definida'}`
      })
    }

    console.log('🚀 Sala enviada')
  })

  // ===============================
  // MENSAGENS
  // ===============================

  sock.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages[0]
      if (!msg.message) return

      const from = msg.key.remoteJid
      const sender = msg.key.participant || from

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ''

      if (!text.startsWith('!')) return

      console.log(`📩 ${sender}: ${text}`)

      // ===============================
      // !idgrupo
      // ===============================

      if (text === '!idgrupo') {
        return await sock.sendMessage(from, {
          text: `📌 ID DO GRUPO:\n${from}`
        })
      }

      // ===============================
      // !setgrupo
      // ===============================

      if (text === '!setgrupo' && isAdmin(sender)) {
        db.grupoId = from
        saveDB()

        return await sock.sendMessage(from, {
          text: '✅ Grupo principal definido com sucesso'
        })
      }

      // ===============================
      // !sala ID SENHA
      // ===============================

      if (text.startsWith('!sala') && isAdmin(sender)) {
        const args = text.split(' ')

        if (!args[1] || !args[2]) {
          return await sock.sendMessage(from, {
            text: 'Use:\n!sala ID SENHA'
          })
        }

        db.idSala = args[1]
        db.senhaSala = args[2]

        saveDB()

        return await sock.sendMessage(from, {
          text: '🎮 Sala configurada com sucesso'
        })
      }

      // ===============================
      // !line Nome
      // ===============================

      if (text.startsWith('!line')) {
        if (!db.aberto) {
          return await sock.sendMessage(from, {
            text: '❌ Inscrições fechadas'
          })
        }

        const nome = text.replace('!line', '').trim()

        if (!nome) {
          return await sock.sendMessage(from, {
            text: 'Use:\n!line NomeDaLine'
          })
        }

        if (db.banidos.includes(nome)) {
          return await sock.sendMessage(from, {
            text: '🚫 Sua line está banida'
          })
        }

        if (db.slots.find(s => s.nome === nome)) {
          return await sock.sendMessage(from, {
            text: '⚠️ Essa line já está inscrita'
          })
        }

        if (db.fila.find(s => s.nome === nome)) {
          return await sock.sendMessage(from, {
            text: '⚠️ Essa line já está na fila'
          })
        }

        if (db.slots.length < 12) {
          db.slots.push({
            nome,
            confirm: false,
            dono: sender
          })

          saveDB()

          return await sock.sendMessage(from, {
            text: '✅ INSCRITO NOS SLOTS'
          })
        } else {
          db.fila.push({
            nome,
            dono: sender
          })

          saveDB()

          return await sock.sendMessage(from, {
            text: '🕐 Adicionado à FILA DE ESPERA'
          })
        }
      }

      // ===============================
      // !check
      // ===============================

      if (text === '!check') {
        const team = db.slots.find(s => s.dono === sender)

        if (!team) {
          return await sock.sendMessage(from, {
            text: '❌ Você não está nos slots'
          })
        }

        team.confirm = true
        saveDB()

        return await sock.sendMessage(from, {
          text: '✅ PRESENÇA CONFIRMADA'
        })
      }

      // ===============================
      // !slots
      // ===============================

      if (text === '!slots') {
        const lista = db.slots.length
          ? db.slots.map((s, i) =>
              `${i + 1}. ${s.nome} ${s.confirm ? '✅' : '❌'}`
            ).join('\n')
          : 'Nenhum slot ocupado'

        return await sock.sendMessage(from, {
          text: `📋 SLOTS:\n\n${lista}`
        })
      }

      // ===============================
      // !fila
      // ===============================

      if (text === '!fila') {
        const lista = db.fila.length
          ? db.fila.map((s, i) =>
              `${i + 1}. ${s.nome}`
            ).join('\n')
          : 'Fila vazia'

        return await sock.sendMessage(from, {
          text: `🕐 FILA:\n\n${lista}`
        })
      }

      // ===============================
      // !ban 3
      // ===============================

      if (text.startsWith('!ban') && isAdmin(sender)) {
        const num = parseInt(text.split(' ')[1])

        if (!num || !db.slots[num - 1]) {
          return await sock.sendMessage(from, {
            text: 'Use:\n!ban número'
          })
        }

        const removido = db.slots.splice(num - 1, 1)[0]

        if (!db.banidos.includes(removido.nome)) {
          db.banidos.push(removido.nome)
        }

        if (db.fila.length > 0) {
          const novo = db.fila.shift()

          db.slots.push({
            ...novo,
            confirm: false
          })
        }

        saveDB()

        return await sock.sendMessage(from, {
          text: `🚫 ${removido.nome} foi banido`
        })
      }

      // ===============================
      // !reset
      // ===============================

      if (text === '!reset' && isAdmin(sender)) {
        resetDB()

        return await sock.sendMessage(from, {
          text: '♻️ BOT RESETADO COM SUCESSO'
        })
      }

    } catch (err) {
      console.log('ERRO:', err)
    }
  })
}

startBot()
