import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const authHeader = req.headers.authorization
  if (authHeader !== 'admin-secret-key') {
    return res.status(403).json({ success: false, message: 'Tidak diizinkan' })
  }

  const { slug } = req.body

  if (!slug) {
    return res.status(400).json({ success: false, message: 'Slug diperlukan' })
  }

  try {
    // Check if prompt exists
    const promptData = await redis.hgetall(`prompt:${slug}`)
    
    if (!promptData || !promptData.judul) {
      return res.status(404).json({ success: false, message: 'Prompt tidak ditemukan' })
    }

    // Delete prompt data
    await redis.del(`prompt:${slug}`)
    
    // Delete associated analytics
    await redis.del(`analytics:${slug}`)
    
    // Delete session tokens if any
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
