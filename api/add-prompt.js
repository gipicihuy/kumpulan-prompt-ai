import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const authHeader = req.headers.authorization
  if (authHeader !== 'admin-secret-key') {
    return res.status(403).json({ message: 'Tidak diizinkan' })
  }

  const { slug, kategori, judul, isi, adminName } = req.body
  const createdAt = new Date().toLocaleString('id-ID', { 
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  await redis.hset(`prompt:${slug}`, { 
    kategori, 
    judul, 
    isi, 
    uploadedBy: adminName || 'Admin',
    createdAt: createdAt + ' WIB'
  })

  res.status(200).json({ success: true })
}
