import crypto from 'crypto'
import { getDb } from '../lib/mongodb'

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
    const db = await getDb()
    const promptData = await db.collection('prompts').findOne({ slug })

    if (!promptData) {
      return res.status(404).json({ success: false, message: 'Prompt tidak ditemukan' })
    }

    if (!promptData.isProtected) {
      return res.status(400).json({ success: false, message: 'Prompt ini tidak diproteksi' })
    }

    if (promptData.password === password.trim()) {
      const sessionToken = generateSessionToken(slug)
      const expiresAt = new Date(Date.now() + 60 * 1000)

      await db.collection('prompt_sessions').insertOne({
        slug,
        token: sessionToken,
        expiresAt,
        createdAt: new Date(),
      })

      res.setHeader('Set-Cookie', [
        `prompt_session_${slug}=${sessionToken}; Path=/; HttpOnly; SameSite=Strict`,
      ])

      return res.status(200).json({ success: true, message: 'Password benar' })
    } else {
      return res.status(401).json({ success: false, message: 'Password salah!' })
    }
  } catch (error) {
    console.error('Error verifying password:', error)
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server' })
  }
}
