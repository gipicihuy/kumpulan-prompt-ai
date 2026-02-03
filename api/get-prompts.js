import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export default async function handler(req, res) {
  try {
    const keys = await redis.keys('prompt:*')
    
    if (keys.length === 0) {
      return res.status(200).json({ success: true, data: [] })
    }

    const data = await Promise.all(
      keys.map(async (key) => {
        const item = await redis.hgetall(key)
        return { 
          id: key.split(':')[1], 
          kategori: item.kategori,
          judul: item.judul,
          isi: item.isi 
        }
      })
    )

    res.status(200).json({ success: true, data })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
}
