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
  if (req.method !== 'POST') return res.status(405).end()

  const session = await verifySession(req.headers.authorization)
  if (!session) return res.status(403).json({ success: false, message: 'Sesi tidak valid atau sudah expired' })
  if (session.role !== 'admin') return res.status(403).json({ success: false, message: 'Hanya admin yang bisa menghapus prompt' })

  const { slug } = req.body

  if (!slug) {
    return res.status(400).json({ success: false, message: 'Slug diperlukan' })
  }

  try {
    const promptData = await redis.hgetall(`prompt:${slug}`)

    if (!promptData || !promptData.judul) {
      return res.status(404).json({ success: false, message: 'Prompt tidak ditemukan' })
    }

    await redis.del(`prompt:${slug}`)
    await redis.del(`analytics:${slug}`)

    const sessionKeys = await redis.keys(`session:${slug}:*`)
    if (sessionKeys && sessionKeys.length > 0) {
      for (const key of sessionKeys) {
        await redis.del(key)
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Prompt berhasil dihapus!',
      deletedTitle: promptData.judul,
    })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server' })
  }
}
