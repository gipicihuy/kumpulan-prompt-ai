import { Redis } from '@upstash/redis'
import crypto from 'crypto'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

const MAX_ATTEMPTS = 5
const LOCKOUT_SECONDS = 15 * 60

async function verifySession(token) {
  if (!token) return null
  const username = await redis.get(`session:${token}`)
  if (!username) return null
  const userData = await redis.hgetall(`user:${username}`)
  return { username, role: userData?.role || 'contributor' }
}

async function handleLogin(req, res) {
  const { username, password } = req.body
  if (!username || !password)
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' })

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
  const lockKey = `brute:${ip}:${username}`
  const attempts = parseInt(await redis.get(lockKey)) || 0

  if (attempts >= MAX_ATTEMPTS) {
    const ttl = await redis.ttl(lockKey)
    return res.status(429).json({
      success: false,
      message: `Terlalu banyak percobaan login. Coba lagi dalam ${Math.ceil(ttl / 60)} menit.`,
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

async function handleVerify(req, res) {
  const token = req.headers.authorization
  if (!token) return res.status(401).json({ success: false, message: 'No token' })

  const username = await redis.get(`session:${token}`)
  if (!username) return res.status(401).json({ success: false, message: 'Sesi tidak valid atau sudah expired' })

  const userData = await redis.hgetall(`user:${username}`)
  return res.status(200).json({
    success: true,
    username,
    role: userData?.role || 'contributor',
  })
}

async function handleLogout(req, res) {
  const token = req.headers.authorization
  if (token) await redis.del(`session:${token}`)
  return res.status(200).json({ success: true })
}

async function handleUpdateBio(req, res) {
  const session = await verifySession(req.headers.authorization)
  if (!session) return res.status(403).json({ success: false, message: 'Sesi tidak valid atau sudah expired' })

  const { bio } = req.body
  if (bio && bio.length > 150)
    return res.status(400).json({ success: false, message: 'Bio maksimal 150 karakter' })

  await redis.hset(`user:${session.username}`, { bio: bio ? bio.trim() : '' })
  return res.status(200).json({ success: true, message: 'Bio berhasil diupdate!' })
}

async function handleGetProfile(req, res) {
  const { username } = req.query
  if (!username) return res.status(400).json({ success: false, message: 'Username diperlukan' })

  const userData = await redis.hgetall(`user:${username}`)
  if (!userData) return res.status(404).json({ success: false, message: 'User tidak ditemukan' })

  return res.status(200).json({
    success: true,
    profile: {
      username,
      profileUrl: userData.profileUrl || '',
      bio:        userData.bio        || '',
      role:       userData.role       || 'contributor',
    },
  })
}

export default async function handler(req, res) {
  const { action } = req.query

  try {
    if (!action) {
      if (req.method === 'GET')    return await handleVerify(req, res)
      if (req.method === 'DELETE') return await handleLogout(req, res)
      if (req.method === 'POST')   return await handleLogin(req, res)
      return res.status(405).end()
    }

    switch (action) {
      case 'login':      return await handleLogin(req, res)
      case 'logout':     return await handleLogout(req, res)
      case 'verify':     return await handleVerify(req, res)
      case 'update-bio': return await handleUpdateBio(req, res)
      case 'profile':    return await handleGetProfile(req, res)
      default:           return res.status(400).json({ success: false, message: 'Action tidak valid' })
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server' })
  }
}
