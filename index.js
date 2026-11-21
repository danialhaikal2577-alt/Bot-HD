const { default: makeWASocket, useMultiFileAuthState, downloadMediaMessage } = require('@whiskeysockets/baileys')
const pino = require('pino')
const fs = require('fs')
const { exec } = require('child_process')
const sharp = require('sharp')

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('session')
  const sock = makeWASocket({ logger: pino({ level: 'silent' }), auth: state })
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0]
    if (!m.message || m.key.fromMe) return
    const from = m.key.remoteJid
    const msg = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || m.message.videoMessage?.caption || m.message.documentMessage?.caption || ''
    const text = msg.trim().toLowerCase()
    const reply = (t) => sock.sendMessage(from, { text: t }, { quoted: m })

    if (text === '.menu') {
      return reply(`🤖 *BOT HD - MENU*\n\n.menu - menu\n.media - HD kan video\n.hd - HD kan gambar`)
    }

    if (text === '.media') {
      return reply(`🎬 Silakan kirim video dalam bentuk Dokumen (Document), bukan sebagai video biasa di WhatsApp.\n\n📌 Cara ini membantu menjaga kualitas video agar tidak terlalu terkompresi.\n\n✨ Bot akan memproses dan mengirimkan kembali video HD.`)
    }

    if (text === '.hd' && m.message.imageMessage) {
      await reply('Tengah HD kan gambar, jap...')
      try {
        let buffer = await downloadMediaMessage(m, 'buffer', {})
        let hd = await sharp(buffer).sharpen().modulate({ brightness: 1.05, saturation: 1.15 }).toBuffer()
        return await sock.sendMessage(from, { image: hd, caption: 'Dah HD! 🔥' }, { quoted: m })
      } catch (e) { return reply('Gagal HD gambar.') }
    }

    if (m.message.documentMessage) {
      const fileName = m.message.documentMessage.fileName || ''
      const isVideo = fileName.endsWith('.mp4') || fileName.endsWith('.mov') || m.message.documentMessage.mimetype?.includes('video')
      if (!isVideo) return
      await reply('Dah terima dokumen. Tengah proses jadi HD, tunggu jap...')
      try {
        let buffer = await downloadMediaMessage(m, 'buffer', {})
        fs.writeFileSync('input.mp4', buffer)
        const cmd = `ffmpeg -y -i input.mp4 -vf "scale=1080:1920:flags=lanczos,unsharp=5:5:1.2:5:5:0.0,eq=contrast=1.12:brightness=0.04:saturation=1.18" -c:v libx264 -preset medium -crf 18 -c:a aac -b:a 128k output.mp4`
        exec(cmd, async (err) => {
          if (err) return reply('Gagal proses video.')
          let out = fs.readFileSync('output.mp4')
          await sock.sendMessage(from, { document: out, mimetype: 'video/mp4', fileName: 'video-HD.mp4' }, { quoted: m })
          await reply('Siap! 🔥 Save ni, post kat Status + tekan HD.')
          fs.unlinkSync('input.mp4'); fs.unlinkSync('output.mp4')
        })
      } catch (e) { return reply('Error.') }
    }
  })
}
start()
