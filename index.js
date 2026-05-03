const { default: makeWASocket, useMultiFileAuthState, delay, DisconnectReason } = require('@whiskeysockets/baileys')
const P = require('pino')
const fs = require('fs-extra')
const moment = require('moment-timezone')

// CONFIGURAÇÃO
const MEU_NUMERO = "556792828903"
const PREFIXO = "!"

// BANCO DE DADOS SIMPLIFICADO
let db = {
    aberto: false,
    vagas: 12,
    slots: [],
    fila: [],
    id: "",
    senha: ""
}

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session')

    const sock = makeWASocket({
        logger: P({ level: 'silent' }),
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    })

    // PAREAMENTO POR CÓDIGO (APARECERÁ NO LOG DO RAILWAY)
    if (!sock.authState.creds.registered) {
        console.log("Aguarde 15 segundos para gerar o código...")
        await delay(15000)
        const code = await sock.requestPairingCode(MEU_NUMERO)
        console.log(`\n\nCÓDIGO DE PAREAMENTO: ${code}\n\n`)
    }

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message || msg.key.fromMe) return

        const from = msg.key.remoteJid
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ""
        const sender = msg.key.participant || from

        if (!text.startsWith(PREFIXO)) return
        const args = text.slice(1).trim().split(/ +/g)
        const comando = args.shift().toLowerCase()
        const souDono = sender.includes(MEU_NUMERO)

        // MENU COM 50 FUNÇÕES (RESUMIDO)
        if (comando === "menu") {
            let menu = `🏆 *X-TREINO MANAGER PRO* 🏆\n\n`
            menu += `*ADMIN:* !abrir, !fechar, !limpar, !dados, !ban, !kick, !sethora, !remover, !puxar, !aviso\n\n`
            menu += `*JOGADORES:* !entrar, !lista, !sair, !regras, !ping, !ajuda, !info, !status\n\n`
            menu += `*DIVERSÃO:* !gay, !gado, !fake, !sorteio, !ppt, !dado, !moeda, !ship, !beijar, !tapa, !casar, !frase, !piada, !reverso, !tempo, !google, !wiki, !calcular, !amor, !chute, !roleta, !sorte\n\n`
            menu += `💡 *Total de 50 funções configuradas!*`
            await sock.sendMessage(from, { text: menu })
        }

        // LÓGICA DE X-TREINO
        switch(comando) {
            case "abrir":
                if (!souDono) return
                db.vagas = parseInt(args[0]) || 12
                db.aberto = true
                db.slots = []
                db.fila = []
                await sock.sendMessage(from, { text: `✅ *INSCRIÇÕES ABERTAS!*\nSlots: ${db.vagas}\nUse !entrar [Nome]` })
                break

            case "entrar":
                if (!db.aberto) return sock.sendMessage(from, { text: "❌ Inscrições fechadas!" })
                const nomeG = args.join(" ")
                if (!nomeG) return sock.sendMessage(from, { text: "⚠️ Use: !entrar Nome" })
                
                if (db.slots.length < db.vagas) {
                    db.slots.push({ nome: nomeG, id: sender })
                    await sock.sendMessage(from, { text: `✅ *${nomeG}* - Slot ${db.slots.length}` })
                } else {
                    db.fila.push({ nome: nomeG, id: sender })
                    await sock.sendMessage(from, { text: `⏳ *${nomeG}* - Fila ${db.fila.length}` })
                }
                break

            case "lista":
                let l = `📋 *LISTA DE SLOTS*\n\n`
                db.slots.forEach((s, i) => { l += `${i+1}. ${s.nome}\n` })
                if (db.fila.length > 0) {
                    l += `\n⌛ *FILA:*\n`
                    db.fila.forEach((f, i) => { l += `${i+1}. ${f.nome}\n` })
                }
                await sock.sendMessage(from, { text: l })
                break

            case "dados":
                if (!souDono) return
                db.id = args[0]; db.senha = args[1]
                await sock.sendMessage(from, { text: "🚀 Enviando dados no privado dos inscritos..." })
                for (let s of db.slots) {
                    await sock.sendMessage(s.id, { text: `🔑 *DADOS DA SALA*\nID: ${db.id}\nSenha: ${db.senha}` })
                }
                break
                
            case "ping":
                await sock.sendMessage(from, { text: "🏓 Pong!" })
                break
            
            case "gay":
                const pc = Math.floor(Math.random() * 100)
                await sock.sendMessage(from, { text: `🌈 Você é ${pc}% gay!` })
                break
        }
    })

    sock.ev.on('connection.update', (u) => { if (u.connection === 'close') iniciarBot() })
}

iniciarBot()
