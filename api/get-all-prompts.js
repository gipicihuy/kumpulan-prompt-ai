import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

async function verifySession(token) {
  if (!token) return null
  const username = await redis.get(`session:${token}`)
  if (!username) return null
  const userData = await redis.hgetall(`user:${username}`)
  return { username, role: userData?.role || 'contributor', profileUrl: userData?.profileUrl || '' }
}

const CONTRIBUTOR_DAILY_LIMIT = 10

export default async function handler(req, res) {
  const session = await verifySession(req.headers.authorization)
  if (!session) return res.status(403).json({ success: false, message: 'Sesi tidak valid atau sudah expired' })

  const { username, role, profileUrl } = session

  try {
    const keys = await redis.keys('prompt:*')

    if (!keys || keys.length === 0) {
      const payload = { success: true, data: [], profileUrl }
      if (role === 'contributor') {
        const today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }).replace(/\//g, '-')
        const stored = await redis.get(`ratelimit:upload:${username}:${today}`)
        payload.quotaUsed = parseInt(stored) || 0
        payload.quotaLimit = CONTRIBUTOR_DAILY_LIMIT
      }
      return res.status(200).json(payload)
    }

    const data = await Promise.all(
      keys.map(async (key) => {
        const item = await redis.hgetall(key)
        if (!item || !item.judul) return null

        if (role !== 'admin' && (item.uploadedBy || '').toLowerCase() !== username.toLowerCase()) return null

        const slug = key.replace(/^prompt:/, '')
        const analyticsData = await redis.hgetall(`analytics:${slug}`)

        const analytics = {
          views: parseInt(analyticsData?.views) || 0,
          copies: parseInt(analyticsData?.copies) || 0,
          downloads: parseInt(analyticsData?.downloads) || 0,
        }

        return {
          slug,
          kategori: item.kategori || 'Lainnya',
          judul: item.judul || 'Tanpa Judul',
          description: item.description || '',
          isi: item.isi || '',
          uploadedBy: item.uploadedBy || username,
          createdAt: item.createdAt || '-',
          imageUrl: item.imageUrl || '',
          timestamp: parseInt(item.timestamp) || 0,
          isProtected: item.isProtected === 'true' || item.isProtected === true,
          password: item.password || '',
          analytics,
        }
      })
    )

    const filtered = data.filter(Boolean)
    filtered.sort((a, b) => b.timestamp - a.timestamp)

    const payload = { success: true, data: filtered, profileUrl }

    if (role === 'contributor') {
      const today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }).replace(/\//g, '-')
      const stored = await redis.get(`ratelimit:upload:${username}:${today}`)
      payload.quotaUsed = parseInt(stored) || 0
      payload.quotaLimit = CONTRIBUTOR_DAILY_LIMIT
    }

    return res.status(200).json(payload)
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
}
