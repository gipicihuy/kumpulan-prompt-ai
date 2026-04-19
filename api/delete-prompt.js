import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const authHeader = req.headers.authorization
  if (authHeader !== 'RgumiU6yl%SX29I2') {
    return res.status(403).json({ success: false, message: 'Tidak diizinkan' })
  }

  const { slug, deleterName } = req.body

  if (!slug) {
    return res.status(400).json({ success: false, message: 'Slug diperlukan' })
  }

  try {
    const promptData = await redis.hgetall(`prompt:${slug}`)

    if (!promptData || !promptData.judul) {
      return res.status(404).json({ success: false, message: 'Prompt tidak ditemukan' })
    }

    const userData = await redis.hgetall(`user:${deleterName}`)
    const role = userData?.role || 'contributor'

    if (role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Hanya admin yang bisa menghapus prompt' })
    }

    await redis.del(`prompt:${slug}`)
    await redis.del(`analytics:${slug}`)

    const sessionKeys = await redis.keys(`session:${slug}:*`)
    if (sessionKeys && sessionKeys.length > 0) {
      for (const key of sessionKeys) {
        await redis.del(key)
      }
    }

    res.status(200).json({
      success: true,
      message: 'Prompt berhasil dihapus!',
      deletedTitle: promptData.judul
    })
  } catch (error) {
    console.error('❌ Error in delete-prompt:', error)
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server' })
  }
}
