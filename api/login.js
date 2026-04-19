import { Redis } from '@upstash/redis'
import crypto from 'crypto'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' })
  }

  const userData = await redis.hgetall(`user:${username}`)

  if (!userData || userData.password !== password) {
    return res.status(401).json({ success: false, message: 'Gagal Login' })
  }

  const sessionToken = crypto.randomBytes(32).toString('hex')
  await redis.setex(`session:${sessionToken}`, 60 * 60 * 24, username)

  return res.status(200).json({
    success: true,
    token: sessionToken,
    role: userData.role || 'contributor',
  })
}
