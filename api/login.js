import { Redis } from '@upstash/redis'
import crypto from 'crypto'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

const MAX_ATTEMPTS = 5
const LOCKOUT_SECONDS = 15 * 60

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const token = req.headers.authorization
    if (!token) return res.status(401).json({ success: false, message: 'No token' })
    const username = await redis.get(`session:${token}`)
    if (!username) return res.status(401).json({ success: false, message: 'Sesi tidak valid atau sudah expired' })
    const userData = await redis.hgetall(`user:${username}`)
    const role = userData?.role || 'contributor'
    return res.status(200).json({ success: true, username, role })
  }

  if (req.method === 'DELETE') {
    const token = req.headers.authorization
    if (token) await redis.del(`session:${token}`)
    return res.status(200).json({ success: true })
  }

  if (req.method !== 'POST') return res.status(405).end()

  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' })
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
  const lockKey = `brute:${ip}:${username}`
  const attempts = parseInt(await redis.get(lockKey)) || 0

  if (attempts >= MAX_ATTEMPTS) {
    const ttl = await redis.ttl(lockKey)
    const menit = Math.ceil(ttl / 60)
    return res.status(429).json({
      success: false,
      message: `Terlalu banyak percobaan login. Coba lagi dalam ${menit} menit.`,
    })
  }

  const userData = await redis.hgetall(`user:${username}`)

  if (!userData || userData.password !== password) {
    await redis.setex(lockKey, LOCKOUT_SECONDS, attempts + 1)
    const remaining = MAX_ATTEMPTS - (attempts + 1)
    return res.status(401).json({
      success: false,
      message: remaining > 0
        ? `Gagal Login. ${remaining} percobaan tersisa sebelum akun dikunci sementara.`
        : 'Gagal Login. Akun dikunci 15 menit.',
    })
  }

  await redis.del(lockKey)

  const sessionToken = crypto.randomBytes(32).toString('hex')
  await redis.setex(`session:${sessionToken}`, 60 * 60 * 24, username)

  return res.status(200).json({
    success: true,
    token: sessionToken,
    role: userData.role || 'contributor',
    username,
  })
}
