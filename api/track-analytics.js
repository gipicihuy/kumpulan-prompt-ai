import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  }

  const { slug, action } = req.body

  if (!slug || !action) {
    return res.status(400).json({ success: false, message: 'Slug dan action diperlukan' })
  }

  // Validasi action
  const validActions = ['view', 'copy', 'download']
  if (!validActions.includes(action)) {
    return res.status(400).json({ success: false, message: 'Action tidak valid' })
  }

  try {
    // Key untuk analytics di Redis
    const analyticsKey = `analytics:${slug}`
    
    // Increment counter sesuai action
    let fieldToIncrement = ''
    switch(action) {
      case 'view':
        fieldToIncrement = 'views'
        break
      case 'copy':
        fieldToIncrement = 'copies'
        break
      case 'download':
        fieldToIncrement = 'downloads'
        break
    }

    // Increment field di Redis hash
    await redis.hincrby(analyticsKey, fieldToIncrement, 1)

    // Get updated analytics
    const analytics = await redis.hgetall(analyticsKey)

    return res.status(200).json({ 
      success: true,
      analytics: {
        views: parseInt(analytics.views) || 0,
        copies: parseInt(analytics.copies) || 0,
        downloads: parseInt(analytics.downloads) || 0
      }
    })
  } catch (error) {
    console.error('Error tracking analytics:', error)
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server' })
  }
}
