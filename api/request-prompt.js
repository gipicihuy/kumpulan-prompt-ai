export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { judul, kategori, isi } = req.body

  if (!judul || !kategori || !isi) {
    return res.status(400).json({ success: false, message: 'Data tidak lengkap' })
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID

  if (!BOT_TOKEN || !CHAT_ID) {
    console.error('Missing Telegram credentials in environment variables')
    return res.status(500).json({ success: false, message: 'Server configuration error' })
  }

  const message = `🆕 *PROMPT REQUEST BARU*

📝 *Judul:* ${judul}
🏷 *Kategori:* ${kategori}

📄 *Isi Prompt:*
\`\`\`
${isi}
\`\`\``

  try {
    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: message,
          parse_mode: 'Markdown'
        })
      }
    )

    const result = await telegramResponse.json()

    if (result.ok) {
      return res.status(200).json({ success: true, message: 'Request berhasil dikirim!' })
    } else {
      console.error('Telegram API error:', result)
      return res.status(500).json({ success: false, message: 'Gagal mengirim ke Telegram' })
    }
  } catch (error) {
    console.error('Error sending to Telegram:', error)
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server' })
  }
}
