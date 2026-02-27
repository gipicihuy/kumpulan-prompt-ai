import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export default async function handler(req, res) {
  // ✅ FIX: Ambil slug dari query (GET) atau body (POST) dengan benar
  const slug = req.method === 'GET' ? req.query.slug : req.body?.slug;

  if (!slug) {
    console.error('❌ Slug tidak ditemukan!', { method: req.method, query: req.query, body: req.body });
    return res.status(400).json({ success: false, message: 'Slug diperlukan' })
  }

  const analyticsKey = `analytics:${slug}`
  
  console.log(`📊 Analytics request: ${req.method} ${slug}`);

  try {
    // GET request - fetch analytics
    if (req.method === 'GET') {
      const analytics = await redis.hgetall(analyticsKey)

      return res.status(200).json({ 
        success: true,
        analytics: {
          views: parseInt(analytics?.views) || 0,
          copies: parseInt(analytics?.copies) || 0,
          downloads: parseInt(analytics?.downloads) || 0
        }
      })
    }

    // POST request - track analytics
    if (req.method === 'POST') {
      const { action } = req.body

      if (!action) {
        console.error('❌ Action tidak ditemukan!', req.body);
        return res.status(400).json({ success: false, message: 'Action diperlukan' })
      }

      // Validasi action
      const validActions = ['view', 'copy', 'download']
      if (!validActions.includes(action)) {
        console.error('❌ Action tidak valid:', action);
        return res.status(400).json({ success: false, message: 'Action tidak valid' })
      }

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

      console.log(`✅ Tracking ${action} for ${slug}`);

      // Increment field di Redis hash
      await redis.hincrby(analyticsKey, fieldToIncrement, 1)

      // Get updated analytics
      const analytics = await redis.hgetall(analyticsKey)

      console.log(`📈 Updated analytics for ${slug}:`, {
        views: parseInt(analytics?.views) || 0,
        copies: parseInt(analytics?.copies) || 0,
        downloads: parseInt(analytics?.downloads) || 0
      });

      return res.status(200).json({ 
        success: true,
        analytics: {
          views: parseInt(analytics?.views) || 0,
          copies: parseInt(analytics?.copies) || 0,
          downloads: parseInt(analytics?.downloads) || 0
        }
      })
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' })
  } catch (error) {
    console.error('❌ Error in analytics:', error)
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server', error: error.message })
  }
}
