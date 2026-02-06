import { Redis } from '@upstash/redis'
import crypto from 'crypto'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

// Generate secure session token
function generateSessionToken(slug) {
  return crypto.createHash('sha256')
    .update(`${slug}-${Date.now()}-${Math.random()}`)
    .digest('hex')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { slug, password } = req.body

  if (!slug || !password) {
    return res.status(400).json({ success: false, message: 'Slug dan password diperlukan' })
  }

  try {
    // Ambil data prompt dari Redis
    const promptData = await redis.hgetall(`prompt:${slug}`)

    if (!promptData || !promptData.judul) {
      return res.status(404).json({ success: false, message: 'Prompt tidak ditemukan' })
    }

    // Cek apakah prompt ini di-protect
    const isProtected = promptData.isProtected === 'true' || promptData.isProtected === true

    if (!isProtected) {
      return res.status(400).json({ success: false, message: 'Prompt ini tidak diproteksi' })
    }

    // Verifikasi password
    if (promptData.password === password.trim()) {
      // Password benar! Generate secure session token
      const sessionToken = generateSessionToken(slug)
      
      // Simpan session token di Redis dengan TTL 5 menit (300 detik)
      // Short-lived untuk keamanan lebih tinggi
      await redis.setex(`session:${slug}:${sessionToken}`, 300, 'valid')
      
      // Set session cookie (expire saat browser/tab ditutup)
      // Tidak pakai Max-Age = session cookie
      res.setHeader('Set-Cookie', [
        `prompt_session_${slug}=${sessionToken}; Path=/; HttpOnly; SameSite=Strict`,
      ])
      
      // Return success tanpa expose token
      return res.status(200).json({ 
        success: true,
        message: 'Password benar'
      })
    } else {
      // Password salah
      return res.status(401).json({ success: false, message: 'Password salah!' })
    }

  } catch (error) {
    console.error('Error verifying password:', error)
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server' })
  }
}
