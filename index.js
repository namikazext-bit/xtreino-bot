const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const qrcode = require('qrcode-terminal')

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('session')

  const sock = makeWASocket({
    logger: P({ level: 'silent' }),
    auth: state
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, qr } = update

    if (qr) {
      console.log('📱 ESCANEIE O QR ABAIXO:')
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'open') {
      console.log('✅ BOT CONECTADO')
    }
  })
}

startBot()
