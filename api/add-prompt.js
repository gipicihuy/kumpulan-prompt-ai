import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

const CONTRIBUTOR_DAILY_LIMIT = 10

async function verifySession(token) {
  if (!token) return null
  const username = await redis.get(`session:${token}`)
  if (!username) return null
  const userData = await redis.hgetall(`user:${username}`)
  return { username, role: userData?.role || 'contributor' }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const session = await verifySession(req.headers.authorization)
  if (!session) return res.status(403).json({ success: false, message: 'Sesi tidak valid atau sudah expired' })

  const { slug, kategori, judul, description, isi, imageUrl, password, clientTimestamp } = req.body
  const { username, role } = session

  let currentCount = 0

  if (role === 'contributor') {
    const today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }).replace(/\//g, '-')
    const rateLimitKey = `ratelimit:upload:${username}:${today}`
    const stored = await redis.get(rateLimitKey)
    currentCount = parseInt(stored) || 0

    if (currentCount >= CONTRIBUTOR_DAILY_LIMIT) {
      return res.status(429).json({
        success: false,
        message: `Batas upload harian tercapai (${CONTRIBUTOR_DAILY_LIMIT}/hari). Coba lagi besok!`,
        remaining: 0,
      })
    }

    const now = new Date()
    const jakartaOffset = 7 * 60 * 60 * 1000
    const nowWIB = new Date(now.getTime() + jakartaOffset)
    const midnightWIB = new Date(nowWIB)
    midnightWIB.setUTCHours(17, 0, 0, 0)
    if (nowWIB.getUTCHours() >= 17) midnightWIB.setUTCDate(midnightWIB.getUTCDate() + 1)
    const ttlSeconds = Math.floor((midnightWIB - now) / 1000)
    await redis.setex(rateLimitKey, ttlSeconds, currentCount + 1)
  }

  const timestamp = clientTimestamp || Date.now()
  const now = new Date(timestamp)
  const createdAt =
    now.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' WIB'

  const normalizedKategori = (kategori || 'Lainnya').trim().toLowerCase()

  const promptData = {
    kategori: normalizedKategori,
    judul,
    isi,
    uploadedBy: username,
    createdAt,
    timestamp,
  }

  if (description) promptData.description = description
  if (imageUrl) promptData.imageUrl = imageUrl

  if (password && password.trim() !== '') {
    promptData.password = password.trim()
    promptData.isProtected = true
  } else {
    promptData.isProtected = false
  }

  await redis.hset(`prompt:${slug}`, promptData)

  const remaining = role === 'contributor' ? CONTRIBUTOR_DAILY_LIMIT - (currentCount + 1) : null

  return res.status(200).json({
    success: true,
    ...(remaining !== null && { remaining }),
  })
}
