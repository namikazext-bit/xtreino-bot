const { default: makeWASocket, useMultiFileAuthState, delay, DisconnectReason } = require('@whiskeysockets/baileys')
const P = require('pino')
const fs = require('fs-extra')
const moment = require('moment-timezone')

// ===== CONFIGURAÇÃO E BANCO DE DADOS =====
const MEU_NUMERO = "556792828903"
const PREFIXO = "!"
const DB_FILE = './database.json'

let db = {
    config: { aberta: false, vagas: 12, id: "", senha: "", hora: "" },
    slots: [],
    fila: [],
    banidos: [],
    ranking: {}
}

function saveDB() { fs.writeJsonSync(DB_FILE, db, { spaces: 2 }) }
if (fs.existsSync(DB_FILE)) { db = fs.readJsonSync(DB_FILE) } else { saveDB() }

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session')
    const sock = makeWASocket({
        logger: P({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    })

    // PAREAMENTO
    if (!sock.authState.creds.registered) {
        console.log("Aguardando 10s para gerar código...")
        await delay(10000)
        const code = await sock.requestPairingCode(MEU_NUMERO)
        console.log(`\n📱 SEU CÓDIGO DE PAREAMENTO: ${code}\n`)
    }

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message || msg.key.fromMe) return

        const from = msg.key.remoteJid
        const sender = msg.key.participant || from
        const pushName = msg.pushName || "Jogador"
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ""
        
        if (!text.startsWith(PREFIXO)) return

        const args = text.slice(1).trim().split(/ +/g)
        const comando = args.shift().toLowerCase()
        const isAdm = sender.includes(MEU_NUMERO)

        // ===== SISTEMA DE MENU =====
        if (comando === "menu" || comando === "help") {
            const menu = `
╔════════════════════╗
      🏆 *TREINO BOT PRO* 🏆
╚════════════════════╝

📌 *COMANDOS X-TREINO:*
1. !abrir [vagas] - Inicia inscrições
2. !entrar [Guilda] - Pega um slot
3. !lista - Ver slots e fila
4. !sair - Abandona a vaga
5. !dados [ID] [Pass] - Envia ID/Senha
6. !fechar - Trava inscrições
7. !limpar - Reseta tudo
8. !remover [n°] - Tira do slot
9. !puxar - Puxa 1º da fila
10. !sethora [hora] - Define horário

🎮 *GERENCIAMENTO:*
11. !ban @marcar
12. !unban @marcar
13. !reiniciar - Reinicia bot
14. !regras - Mostra regras
15. !info - Status do bot

⭐ *DIVERSÃO E UTILIDADES (40+):*
!perfil, !sorteio, !gay, !gado, !fake, !dado, !moeda, !ppt, !piada, !frase, !reverso, !tempo, !calcular, !ping...
_(Use !ajuda [comando] para detalhes)_

*Status:* ${db.config.aberta ? "✅ Aberto" : "❌ Fechado"}
*Slots:* ${db.slots.length}/${db.config.vagas}
══════════════════════`
            await sock.sendMessage(from, { text: menu })
        }

        // ===== LÓGICA DE X-TREINO (PRINCIPAL) =====
        switch(comando) {
            case "abrir":
                if (!isAdm) return
                db.config.vagas = parseInt(args[0]) || 12
                db.config.aberta = true
                db.slots = []
                db.fila = []
                saveDB()
                await sock.sendMessage(from, { text: `📢 *INSCRIÇÕES ABERTAS!* \nSlots: ${db.config.vagas}\nUse: !entrar [Nome da Guilda]` })
                break

            case "entrar":
                if (!db.config.aberta) return sock.sendMessage(from, { text: "❌ Inscrições fechadas." })
                const nomeG = args.join(" ")
                if (!nomeG) return sock.sendMessage(from, { text: "⚠️ Use: !entrar NomeDaGuilda" })
                
                if (db.slots.length < db.config.vagas) {
                    db.slots.push({ nome: nomeG, user: sender })
                    await sock.sendMessage(from, { text: `✅ *${nomeG}* garantida no Slot ${db.slots.length}!` })
                } else {
                    db.fila.push({ nome: nomeG, user: sender })
                    await sock.sendMessage(from, { text: `⏳ *${nomeG}* foi para a Fila (Posição ${db.fila.length}).` })
                }
                saveDB()
                break

            case "lista":
                let txt = `📋 *LISTA X-TREINO*\n\n`
                db.slots.forEach((s, i) => { txt += `${i+1}. ${s.nome}\n` })
                if (db.fila.length > 0) {
                    txt += `\n⌛ *FILA DE ESPERA:*\n`
                    db.fila.forEach((f, i) => { txt += `${i+1}. ${f.nome}\n` })
                }
                await sock.sendMessage(from, { text: txt })
                break

            case "dados":
                if (!isAdm) return
                db.config.id = args[0]
                db.config.senha = args[1]
                saveDB()
                await sock.sendMessage(from, { text: "📥 ID e Senha enviados para os líderes no privado!" })
                for (let s of db.slots) {
                    await sock.sendMessage(s.user, { text: `🔑 *DADOS DA SALA*\nID: ${db.config.id}\nSenha: ${db.config.senha}` })
                }
                break

            // ADICIONE AQUI AS OUTRAS FUNÇÕES DE ENTRETENIMENTO (Sorteio, Games, etc)
            case "gay":
                const n = Math.floor(Math.random() * 100)
                await sock.sendMessage(from, { text: `🌈 @${sender.split('@')[0]} é ${n}% gay!`, mentions: [sender] })
                break
            
            case "ping":
                await sock.sendMessage(from, { text: "🏓 Pong! Bot ativo." })
                break
        }
    })

    sock.ev.on('connection.update', (u) => { if (u.connection === 'close') startBot() })
}

startBot()
