import { Redis } from '@upstash/redis'
import { neon } from '@neondatabase/serverless'
import crypto from 'crypto'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

function getSql() {
  return neon(process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_lNDe8b5XyPZm@ep-polished-base-a1z8144j-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require')
}

async function initDb() {
  const sql = getSql()
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      display_name VARCHAR(100),
      avatar_url VARCHAR(500),
      bio VARCHAR(300),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      prompt_slug VARCHAR(255) NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      username VARCHAR(50) NOT NULL,
      display_name VARCHAR(100),
      avatar_url VARCHAR(500),
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_comments_slug ON comments(prompt_slug)`
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'prompthub_salt_2026').digest('hex')
}

function generateUserToken(username) {
  return crypto.createHash('sha256').update(`${username}-${Date.now()}-user-session`).digest('hex')
}

export default async function handler(req, res) {
  const action = req.query.action || (req.method === 'POST' ? req.body?.action : null) || 'login'

  try {
    await initDb()
    const sql = getSql()

    // === REGISTER ===
    if (action === 'register') {
      if (req.method !== 'POST') return res.status(405).end()
      const { username, password, display_name } = req.body
      if (!username || !password) return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' })
      if (username.length < 3 || username.length > 30) return res.status(400).json({ success: false, message: 'Username harus 3-30 karakter' })
      if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ success: false, message: 'Username hanya boleh huruf, angka, dan underscore' })
      if (password.length < 6) return res.status(400).json({ success: false, message: 'Password minimal 6 karakter' })

      const existing = await sql`SELECT id FROM users WHERE LOWER(username) = LOWER(${username})`
      if (existing.length > 0) return res.status(409).json({ success: false, message: 'Username sudah digunakan' })

      const displayName = display_name?.trim() || username
      const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random&color=fff&bold=true&size=128`
      const passwordHash = hashPassword(password)

      const [user] = await sql`
        INSERT INTO users (username, password_hash, display_name, avatar_url)
        VALUES (${username}, ${passwordHash}, ${displayName}, ${avatarUrl})
        RETURNING id, username, display_name, avatar_url
      `

      const token = generateUserToken(username)
      await redis.setex(`user_session:${token}`, 60 * 60 * 24 * 30, JSON.stringify({ userId: user.id, username: user.username }))

      return res.status(200).json({
        success: true,
        token,
        user: { id: user.id, username: user.username, display_name: user.display_name, avatar_url: user.avatar_url }
      })
    }

    // === LOGIN (user) ===
    if (action === 'login' || action === undefined) {
      if (req.method !== 'POST') return res.status(405).end()
      const { username, password } = req.body

      // Admin login (backward compat - check Redis first)
      const redisUserData = await redis.hgetall(`user:${username}`)
      if (redisUserData && redisUserData.password === password) {
        return res.status(200).json({ success: true, token: 'admin-secret-key', isAdmin: true })
      }

      // Regular user login
      if (!username || !password) return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' })

      const users = await sql`SELECT * FROM users WHERE LOWER(username) = LOWER(${username})`
      if (users.length === 0) return res.status(401).json({ success: false, message: 'Username atau password salah' })

      const user = users[0]
      const passwordHash = hashPassword(password)
      if (user.password_hash !== passwordHash) return res.status(401).json({ success: false, message: 'Username atau password salah' })

      const token = generateUserToken(user.username)
      await redis.setex(`user_session:${token}`, 60 * 60 * 24 * 30, JSON.stringify({ userId: user.id, username: user.username }))

      return res.status(200).json({
        success: true,
        token,
        user: { id: user.id, username: user.username, display_name: user.display_name, avatar_url: user.avatar_url }
      })
    }

    // === GET PROFILE ===
    if (action === 'profile') {
      const token = req.headers.authorization || req.query.token
      if (!token) return res.status(401).json({ success: false, message: 'Token diperlukan' })

      const sessionData = await redis.get(`user_session:${token}`)
      if (!sessionData) return res.status(401).json({ success: false, message: 'Session tidak valid atau sudah expired' })

      const { userId } = typeof sessionData === 'string' ? JSON.parse(sessionData) : sessionData
      const users = await sql`SELECT id, username, display_name, avatar_url, bio, created_at FROM users WHERE id = ${userId}`
      if (users.length === 0) return res.status(404).json({ success: false, message: 'User tidak ditemukan' })

      return res.status(200).json({ success: true, user: users[0] })
    }

    // === UPDATE PROFILE ===
    if (action === 'update-profile') {
      if (req.method !== 'POST') return res.status(405).end()
      const token = req.headers.authorization
      if (!token) return res.status(401).json({ success: false, message: 'Token diperlukan' })

      const sessionData = await redis.get(`user_session:${token}`)
      if (!sessionData) return res.status(401).json({ success: false, message: 'Session tidak valid' })

      const { userId } = typeof sessionData === 'string' ? JSON.parse(sessionData) : sessionData
      const { display_name, bio, avatar_url } = req.body

      const updates = {}
      if (display_name !== undefined) updates.display_name = display_name.trim().substring(0, 100)
      if (bio !== undefined) updates.bio = bio.trim().substring(0, 300)
      if (avatar_url !== undefined) updates.avatar_url = avatar_url

      if (Object.keys(updates).length === 0) return res.status(400).json({ success: false, message: 'Tidak ada data yang diupdate' })

      const [updated] = await sql`
        UPDATE users SET 
          display_name = COALESCE(${updates.display_name ?? null}, display_name),
          bio = COALESCE(${updates.bio ?? null}, bio),
          avatar_url = COALESCE(${updates.avatar_url ?? null}, avatar_url)
        WHERE id = ${userId}
        RETURNING id, username, display_name, avatar_url, bio
      `

      return res.status(200).json({ success: true, user: updated })
    }

    // === LOGOUT ===
    if (action === 'logout') {
      const token = req.headers.authorization
      if (token) await redis.del(`user_session:${token}`)
      return res.status(200).json({ success: true })
    }

    return res.status(400).json({ success: false, message: 'Action tidak valid' })

  } catch (error) {
    console.error('❌ Error in login.js:', error)
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server: ' + error.message })
  }
}
