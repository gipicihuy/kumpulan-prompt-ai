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
  return { username, role: userData?.role || 'contributor' }
}

export default async function handler(req, res) {
  const session = await verifySession(req.headers.authorization)
  if (!session) return res.status(403).json({ success: false, message: 'Sesi tidak valid atau sudah expired' })
  if (session.role !== 'admin') return res.status(403).json({ success: false, message: 'Hanya admin yang diizinkan' })

  try {
    const keys = await redis.keys('prompt:*')

    if (!keys || keys.length === 0) {
      return res.status(200).json({ success: true, data: [] })
    }

    const data = await Promise.all(
      keys.map(async (key) => {
        const item = await redis.hgetall(key)
        const slug = key.replace(/^prompt:/, '')
        const analyticsData = await redis.hgetall(`analytics:${slug}`)

        const analytics = {
          views: analyticsData?.views ? parseInt(analyticsData.views) : 0,
          copies: analyticsData?.copies ? parseInt(analyticsData.copies) : 0,
          downloads: analyticsData?.downloads ? parseInt(analyticsData.downloads) : 0,
        }

        return {
          slug,
          kategori: item.kategori || 'Lainnya',
          judul: item.judul || 'Tanpa Judul',
          description: item.description || '',
          isi: item.isi || '',
          uploadedBy: item.uploadedBy || 'Admin',
          createdAt: item.createdAt || '-',
          imageUrl: item.imageUrl || '',
          timestamp: parseInt(item.timestamp) || 0,
          isProtected: item.isProtected === 'true' || item.isProtected === true,
          password: item.password || '',
          analytics,
        }
      })
    )

    data.sort((a, b) => b.timestamp - a.timestamp)

    return res.status(200).json({ success: true, data })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
}
