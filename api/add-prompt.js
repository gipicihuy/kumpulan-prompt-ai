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
  
  // ✅ FIX: Gunakan Date.now() langsung untuk timestamp yang AKURAT
  const timestamp = Date.now() // UTC timestamp standar dalam milliseconds
  
  // Buat createdAt string untuk display (WIB)
  const now = new Date(timestamp)
  const createdAt = now.toLocaleString('id-ID', { 
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  // Data yang akan disimpan
  const promptData = { 
    kategori, 
    judul, 
    isi, 
    uploadedBy: adminName || 'Admin',
    createdAt: createdAt + ' WIB',
    timestamp: timestamp // ✅ Timestamp UTC untuk sorting dan timeAgo calculation
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

  console.log(`✅ Creating prompt with timestamp: ${timestamp} (${createdAt} WIB)`);

  await redis.hset(`prompt:${slug}`, promptData)

  res.status(200).json({ success: true })
}
