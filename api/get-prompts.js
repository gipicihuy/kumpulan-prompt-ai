import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export default async function handler(req, res) {
  try {
    const keys = await redis.keys('prompt:*')
    
    if (!keys || keys.length === 0) {
      return res.status(200).json({ success: true, data: [] })
    }

    const data = await Promise.all(
      keys.map(async (key) => {
        const item = await redis.hgetall(key)
        const cleanId = key.replace(/^prompt:/, '')
        
        return { 
          id: cleanId, 
          kategori: item.kategori || 'Lainnya',
          judul: item.judul || 'Tanpa Judul',
          isi: item.isi || '',
          uploadedBy: item.uploadedBy || 'Admin',
          createdAt: item.createdAt || '-'
        }
      })
    )

    res.status(200).json({ success: true, data } )
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
}
