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
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  }

  const session = await verifySession(req.headers.authorization)
  if (!session) return res.status(403).json({ success: false, message: 'Sesi tidak valid atau sudah expired' })

  const { slug } = req.body

  if (!slug) {
    return res.status(400).json({ success: false, message: 'Slug required' })
  }

  try {
    const existingPrompt = await redis.hgetall(`prompt:${slug}`)

    if (existingPrompt && existingPrompt.judul) {
      return res.status(200).json({
        success: true,
        exists: true,
        existingData: {
          judul: existingPrompt.judul,
          kategori: existingPrompt.kategori,
          uploadedBy: existingPrompt.uploadedBy,
          createdAt: existingPrompt.createdAt,
        },
      })
    }

    return res.status(200).json({ success: true, exists: false })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server' })
  }
}
