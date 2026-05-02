const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const QRCode = require('qrcode')
const fs = require('fs-extra')

// ===== BANCO =====
const DB_FILE = './db.json'

let db = {
  slots: [],
  fila: [],
  aberto: true,
  idSala: '',
  senhaSala: '',
  ranking: {}
}

function loadDB() {
  if (fs.existsSync(DB_FILE)) db = fs.readJsonSync(DB_FILE)
}
function saveDB() {
  fs.writeJsonSync(DB_FILE, db, { spaces: 2 })
}

// ===== CONFIG =====
const ADM = ['SEU_NUMERO@s.whatsapp.net']
const isAdmin = (sender) => ADM.includes(sender)

// ===== BOT =====
async function startBot() {
  loadDB()

  const { state, saveCreds } = await useMultiFileAuthState('session')

  const sock = makeWASocket({
    logger: P({ level: 'silent' }),
    auth: state
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, qr }) => {
    if (qr) {
      console.log('📱 ESCANEIE O QR:')
      console.log(await QRCode.toDataURL(qr))
    }
    if (connection === 'open') {
      console.log('✅ BOT ONLINE')
    }
  })

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

      // ===== MENU =====
      if (text === '!menu') {
        return sock.sendMessage(from, {
          text:
`🤖 MENU X-TREINO

📌 INSCRIÇÃO
!line nome
!slots
!fila
!sair

📌 PRESENÇA
!check
!presenca

📌 SALA
!sala ID SENHA
!go

📌 ADMIN
!abrir
!fechar
!ban slot X
!reset

📌 RANKING
!kill nome X
!ranking`
        })
      }

      // ===== LINE =====
      if (text.startsWith('!line')) {
        if (!db.aberto) return

        let nome = text.replace('!line', '').trim()
        if (!nome) return

        if (db.slots.length < 12) {
          db.slots.push({ nome, dono: sender, confirm: false })
          saveDB()
          return sock.sendMessage(from, { text: `✅ SLOT ${db.slots.length}` })
        } else {
          db.fila.push({ nome, dono: sender })
          saveDB()
          return sock.sendMessage(from, { text: `🕒 Fila ${db.fila.length}` })
        }
      }

      // ===== SLOTS =====
      if (text === '!slots') {
        let lista = db.slots.map((s, i) =>
          `${i + 1}. ${s.nome} ${s.confirm ? '✅' : '❌'}`
        ).join('\n')
        return sock.sendMessage(from, { text: lista || 'Vazio' })
      }

      // ===== FILA =====
      if (text === '!fila') {
        let lista = db.fila.map((f, i) => `${i + 1}. ${f.nome}`).join('\n')
        return sock.sendMessage(from, { text: lista || 'Fila vazia' })
      }

      // ===== CHECK =====
      if (text === '!check') {
        let team = db.slots.find(s => s.dono === sender)
        if (!team) return
        team.confirm = true
        saveDB()
        return sock.sendMessage(from, { text: '✅ Confirmado' })
      }

      // ===== PRESENÇA =====
      if (text === '!presenca') {
        let ok = db.slots.filter(s => s.confirm).map(s => s.nome)
        let no = db.slots.filter(s => !s.confirm).map(s => s.nome)

        return sock.sendMessage(from, {
          text:
`✅ CONFIRMADOS:
${ok.join('\n') || 'Nenhum'}

❌ AUSENTES:
${no.join('\n') || 'Nenhum'}`
        })
      }

      // ===== BAN =====
      if (text.startsWith('!ban') && isAdmin(sender)) {
        let num = parseInt(text.split(' ')[2])
        if (!num || !db.slots[num - 1]) return

        let removido = db.slots.splice(num - 1, 1)[0]

        if (db.fila.length > 0) {
          let novo = db.fila.shift()
          db.slots.push({ ...novo, confirm: false })
        }

        saveDB()
        return sock.sendMessage(from, { text: `🚫 ${removido.nome}` })
      }

      // ===== SALA =====
      if (text.startsWith('!sala') && isAdmin(sender)) {
        let args = text.split(' ')
        db.idSala = args[1]
        db.senhaSala = args[2]
        saveDB()

        return sock.sendMessage(from, {
          text: `🎮 Sala:\nID: ${db.idSala}\nSenha: ${db.senhaSala}`
        })
      }

      // ===== GO =====
      if (text === '!go') {
        return sock.sendMessage(from, {
          text: `🚀 GO\nID: ${db.idSala}\nSenha: ${db.senhaSala}`
        })
      }

      // ===== RANKING =====
      if (text.startsWith('!kill')) {
        let args = text.split(' ')
        let nome = args[1]
        let pontos = parseInt(args[2])

        if (!db.ranking[nome]) db.ranking[nome] = 0
        db.ranking[nome] += pontos

        saveDB()
        return sock.sendMessage(from, { text: `+${pontos} kills ${nome}` })
      }

      if (text === '!ranking') {
        let lista = Object.entries(db.ranking)
          .sort((a, b) => b[1] - a[1])
          .map(([n, p], i) => `${i + 1}. ${n} - ${p}`)
          .join('\n')

        return sock.sendMessage(from, { text: lista || 'Sem dados' })
      }

    } catch (e) {
      console.log(e)
    }
  })
}

startBot()
