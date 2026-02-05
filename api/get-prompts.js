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
        
        // Fetch profile URL dari user
        let profileUrl = '';
        if (item.uploadedBy) {
          const userData = await redis.hgetall(`user:${item.uploadedBy}`);
          profileUrl = userData?.profileUrl || '';
        }
        
        return { 
          id: cleanId, 
          kategori: item.kategori || 'Lainnya',
          judul: item.judul || 'Tanpa Judul',
          isi: item.isi || '',
          uploadedBy: item.uploadedBy || 'Admin',
          createdAt: item.createdAt || '-',
          imageUrl: item.imageUrl || '',
          profileUrl: profileUrl,
          timestamp: parseInt(item.timestamp) || 0 // Ambil timestamp, default 0 untuk data lama
        }
      })
    )

    // SORTING: Urutkan berdasarkan timestamp dari yang TERBARU (descending)
    data.sort((a, b) => b.timestamp - a.timestamp)

    res.status(200).json({ success: true, data } )
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
}
