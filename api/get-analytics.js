import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  }

  const { slug } = req.query

  if (!slug) {
    return res.status(400).json({ success: false, message: 'Slug diperlukan' })
  }

  try {
    // Key untuk analytics di Redis
    const analyticsKey = `analytics:${slug}`
    
    // Get analytics dari Redis
    const analytics = await redis.hgetall(analyticsKey)

    // Return dengan default 0 jika belum ada data
    return res.status(200).json({ 
      success: true,
      analytics: {
        views: parseInt(analytics.views) || 0,
        copies: parseInt(analytics.copies) || 0,
        downloads: parseInt(analytics.downloads) || 0
      }
    })
  } catch (error) {
    console.error('Error fetching analytics:', error)
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server' })
  }
}
