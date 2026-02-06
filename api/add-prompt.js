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

  const { slug, kategori, judul, description, isi, adminName, imageUrl, password } = req.body
  const now = new Date()
  const createdAt = now.toLocaleString('id-ID', { 
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
  const timestamp = now.getTime() // Timestamp numerik untuk sorting

  // Data yang akan disimpan
  const promptData = { 
    kategori, 
    judul, 
    isi, 
    uploadedBy: adminName || 'Admin',
    createdAt: createdAt + ' WIB',
    timestamp: timestamp // Tambahkan timestamp untuk sorting
  }

  // Tambahkan description jika ada
  if (description) {
    promptData.description = description
  }

  // Tambahkan imageUrl jika ada
  if (imageUrl) {
    promptData.imageUrl = imageUrl
  }

  // Tambahkan password jika ada
  if (password && password.trim() !== '') {
    promptData.password = password.trim()
    promptData.isProtected = true
  } else {
    promptData.isProtected = false
  }

  await redis.hset(`prompt:${slug}`, promptData)

  res.status(200).json({ success: true })
}
