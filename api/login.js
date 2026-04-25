import crypto from 'crypto'
import { getDb } from '../lib/mongodb'

const MAX_ATTEMPTS = 5
const LOCKOUT_SECONDS = 15 * 60

async function verifySession(token) {
  if (!token) return null
  const db = await getDb()
  const session = await db.collection('sessions').findOne({ token })
  if (!session) return null
  if (session.expiresAt && new Date() > session.expiresAt) {
    await db.collection('sessions').deleteOne({ token })
    return null
  }
  const user = await db.collection('users').findOne({ username: session.username })
  return { username: session.username, role: user?.role || 'contributor' }
}

async function handleLogin(req, res) {
  const { username, password } = req.body
  if (!username || !password)
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' })

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
  const db = await getDb()

  const lockKey = `brute:${ip}:${username}`
  const lockDoc = await db.collection('bruteforce').findOne({ key: lockKey })
  const attempts = lockDoc?.attempts || 0

  if (lockDoc && lockDoc.expiresAt && new Date() > lockDoc.expiresAt) {
    await db.collection('bruteforce').deleteOne({ key: lockKey })
  } else if (attempts >= MAX_ATTEMPTS) {
    const ttlMs = lockDoc.expiresAt ? lockDoc.expiresAt - new Date() : LOCKOUT_SECONDS * 1000
    const ttlMin = Math.ceil(ttlMs / 1000 / 60)
    return res.status(429).json({
      success: false,
      message: `Terlalu banyak percobaan login. Coba lagi dalam ${ttlMin} menit.`,
    })
  }

  const user = await db.collection('users').findOne({ username })
  if (!user || user.password !== password) {
    const newAttempts = attempts + 1
    const expiresAt = new Date(Date.now() + LOCKOUT_SECONDS * 1000)
    await db.collection('bruteforce').updateOne(
      { key: lockKey },
      { $set: { key: lockKey, attempts: newAttempts, expiresAt } },
      { upsert: true }
    )
    const remaining = MAX_ATTEMPTS - newAttempts
    return res.status(401).json({
      success: false,
      message: remaining > 0
        ? `Gagal Login. ${remaining} percobaan tersisa sebelum akun dikunci sementara.`
        : 'Gagal Login. Akun dikunci 15 menit.',
    })
  }

  await db.collection('bruteforce').deleteOne({ key: lockKey })

  const sessionToken = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  await db.collection('sessions').insertOne({
    token: sessionToken,
    username,
    expiresAt,
    createdAt: new Date(),
  })

  return res.status(200).json({
    success: true,
    token: sessionToken,
    role: user.role || 'contributor',
    username,
  })
}

async function handleVerify(req, res) {
  const token = req.headers.authorization
  if (!token) return res.status(401).json({ success: false, message: 'No token' })

  const db = await getDb()
  const session = await db.collection('sessions').findOne({ token })
  if (!session) return res.status(401).json({ success: false, message: 'Sesi tidak valid atau sudah expired' })
  if (session.expiresAt && new Date() > session.expiresAt) {
    await db.collection('sessions').deleteOne({ token })
    return res.status(401).json({ success: false, message: 'Sesi tidak valid atau sudah expired' })
  }

  const user = await db.collection('users').findOne({ username: session.username })
  return res.status(200).json({
    success: true,
    username: session.username,
    role: user?.role || 'contributor',
  })
}

async function handleLogout(req, res) {
  const token = req.headers.authorization
  if (token) {
    const db = await getDb()
    await db.collection('sessions').deleteOne({ token })
  }
  return res.status(200).json({ success: true })
}

async function handleUpdateBio(req, res) {
  const session = await verifySession(req.headers.authorization)
  if (!session) return res.status(403).json({ success: false, message: 'Sesi tidak valid atau sudah expired' })

  const { bio } = req.body
  if (bio && bio.length > 150)
    return res.status(400).json({ success: false, message: 'Bio maksimal 150 karakter' })

  const db = await getDb()
  await db.collection('users').updateOne(
    { username: session.username },
    { $set: { bio: bio ? bio.trim() : '' } }
  )
  return res.status(200).json({ success: true, message: 'Bio berhasil diupdate!' })
}

async function handleGetProfile(req, res) {
  const { username } = req.query
  if (!username) return res.status(400).json({ success: false, message: 'Username diperlukan' })

  const db = await getDb()
  const user = await db.collection('users').findOne({ username })
  if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan' })

  return res.status(200).json({
    success: true,
    profile: {
      username,
      profileUrl: user.profileUrl || '',
      bio: user.bio || '',
      role: user.role || 'contributor',
    },
  })
}

export default async function handler(req, res) {
  const { action } = req.query

  try {
    if (!action) {
      if (req.method === 'GET') return await handleVerify(req, res)
      if (req.method === 'DELETE') return await handleLogout(req, res)
      if (req.method === 'POST') return await handleLogin(req, res)
      return res.status(405).end()
    }

    switch (action) {
      case 'login': return await handleLogin(req, res)
      case 'logout': return await handleLogout(req, res)
      case 'verify': return await handleVerify(req, res)
      case 'update-bio': return await handleUpdateBio(req, res)
      case 'profile': return await handleGetProfile(req, res)
      default: return res.status(400).json({ success: false, message: 'Action tidak valid' })
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server' })
  }
}
