import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { slug, password } = req.body

  if (!slug || !password) {
    return res.status(400).json({ success: false, message: 'Slug dan password diperlukan' })
  }

  try {
    // Ambil data prompt dari Redis
    const promptData = await redis.hgetall(`prompt:${slug}`)

    if (!promptData || !promptData.judul) {
      return res.status(404).json({ success: false, message: 'Prompt tidak ditemukan' })
    }

    // Cek apakah prompt ini di-protect
    const isProtected = promptData.isProtected === 'true' || promptData.isProtected === true

    if (!isProtected) {
      return res.status(400).json({ success: false, message: 'Prompt ini tidak diproteksi' })
    }

    // Verifikasi password
    if (promptData.password === password.trim()) {
      // Password benar, kembalikan data lengkap
      return res.status(200).json({ 
        success: true, 
        data: {
          judul: promptData.judul,
          kategori: promptData.kategori,
          description: promptData.description || '',
          isi: promptData.isi,
          uploadedBy: promptData.uploadedBy,
          createdAt: promptData.createdAt,
          imageUrl: promptData.imageUrl || ''
        }
      })
    } else {
      // Password salah
      return res.status(401).json({ success: false, message: 'Password salah!' })
    }

  } catch (error) {
    console.error('Error verifying password:', error)
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server' })
  }
}
