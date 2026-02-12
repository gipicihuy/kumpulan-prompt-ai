import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export default async function handler(req, res) {
  // ADMIN ONLY
  const authHeader = req.headers.authorization
  if (authHeader !== 'admin-secret-key') {
    return res.status(403).json({ success: false, message: 'Tidak diizinkan' })
  }

  try {
    const keys = await redis.keys('prompt:*')
    
    if (!keys || keys.length === 0) {
      return res.status(200).json({ success: true, data: [] })
    }

    const data = await Promise.all(
      keys.map(async (key) => {
        const item = await redis.hgetall(key)
        const slug = key.replace(/^prompt:/, '')
        
        // Fetch analytics
        const analyticsKey = `analytics:${slug}`
        const analyticsData = await redis.hgetall(analyticsKey)
        
        const analytics = {
          views: analyticsData && analyticsData.views ? parseInt(analyticsData.views) : 0,
          copies: analyticsData && analyticsData.copies ? parseInt(analyticsData.copies) : 0,
          downloads: analyticsData && analyticsData.downloads ? parseInt(analyticsData.downloads) : 0
        }
        
        return {
          slug: slug, // Important untuk edit/delete
          kategori: item.kategori || 'Lainnya',
          judul: item.judul || 'Tanpa Judul',
          description: item.description || '',
          isi: item.isi || '',
          uploadedBy: item.uploadedBy || 'Admin',
          createdAt: item.createdAt || '-',
          imageUrl: item.imageUrl || '',
          timestamp: parseInt(item.timestamp) || 0,
          isProtected: item.isProtected === 'true' || item.isProtected === true,
          password: item.password || '', // EXPOSE password untuk admin saja!
          analytics: analytics
        }
      })
    )

    // Sort by newest first
    data.sort((a, b) => b.timestamp - a.timestamp)

    res.status(200).json({ success: true, data })
  } catch (error) {
    console.error('❌ Error in get-all-prompts:', error)
    res.status(500).json({ success: false, error: error.message })
  }
}
