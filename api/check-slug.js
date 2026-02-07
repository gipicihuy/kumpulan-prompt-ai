import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  }

  const authHeader = req.headers.authorization
  if (authHeader !== 'admin-secret-key') {
    return res.status(403).json({ success: false, message: 'Tidak diizinkan' })
  }

  const { slug } = req.body

  if (!slug) {
    return res.status(400).json({ success: false, message: 'Slug required' })
  }

  try {
    // Cek apakah prompt dengan slug ini sudah ada
    const existingPrompt = await redis.hgetall(`prompt:${slug}`)
    
    if (existingPrompt && existingPrompt.judul) {
      // Prompt sudah ada
      return res.status(200).json({ 
        success: true, 
        exists: true,
        existingData: {
          judul: existingPrompt.judul,
          kategori: existingPrompt.kategori,
          uploadedBy: existingPrompt.uploadedBy,
          createdAt: existingPrompt.createdAt
        }
      })
    } else {
      // Prompt belum ada, aman untuk digunakan
      return res.status(200).json({ 
        success: true, 
        exists: false 
      })
    }
  } catch (error) {
    console.error('Check slug error:', error)
    return res.status(500).json({ 
      success: false, 
      message: 'Terjadi kesalahan server' 
    })
  }
}
