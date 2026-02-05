import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export default async function handler(req, res) {
  const apiKeySecret = process.env.API_KEY_SECRET

  if (!apiKeySecret) {
    return res.status(500).json({ 
      success: false, 
      message: 'Server configuration error: API_KEY_SECRET not set' 
    })
  }

  const apiKey = req.headers['x-api-key']
  
  if (!apiKey || apiKey !== apiKeySecret) {
    return res.status(401).json({ 
      success: false, 
      message: 'Unauthorized - Invalid or missing API Key' 
    })
  }

  try {
    const keys = await redis.keys('prompt:*')
    
    if (!keys || keys.length === 0) {
      return res.status(200).json({ success: true, data: [] })
    }

    const data = await Promise.all(
      keys.map(async (key) => {
        const item = await redis.hgetall(key)
        const cleanId = key.replace(/^prompt:/, '')
        
        let profileUrl = ''
        if (item.uploadedBy) {
          const userData = await redis.hgetall(`user:${item.uploadedBy}`);
          profileUrl = userData?.profileUrl || ''
        }
        
        return { 
          id: cleanId, 
          kategori: item.kategori || 'Lainnya',
          judul: item.judul || 'Tanpa Judul',
          description: item.description || '',
          isi: item.isi || '',
          uploadedBy: item.uploadedBy || 'Admin',
          createdAt: item.createdAt || '-',
          imageUrl: item.imageUrl || '',
          profileUrl: profileUrl,
          timestamp: parseInt(item.timestamp) || 0
        }
      })
    )

    data.sort((a, b) => b.timestamp - a.timestamp)

    res.status(200).json({ success: true, data } )
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
}
