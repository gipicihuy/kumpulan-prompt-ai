import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const authHeader = req.headers.authorization
  if (authHeader !== 'admin-secret-key') {
    return res.status(403).json({ success: false, message: 'Tidak diizinkan' })
  }

  const { slug, kategori, judul, description, isi, imageUrl, password } = req.body

  if (!slug || !judul || !isi) {
    return res.status(400).json({ success: false, message: 'Data tidak lengkap (slug, judul, isi wajib)' })
  }

  try {
    // Ambil data lama untuk timestamp preservation
    const oldData = await redis.hgetall(`prompt:${slug}`)
    
    if (!oldData || !oldData.judul) {
      return res.status(404).json({ success: false, message: 'Prompt tidak ditemukan' })
    }

    // CEK APAKAH ADA PERUBAHAN
    const hasChanges = (
      judul !== oldData.judul ||
      isi !== oldData.isi ||
      (kategori || oldData.kategori) !== oldData.kategori ||
      (description || '') !== (oldData.description || '') ||
      (imageUrl || '') !== (oldData.imageUrl || '') ||
      (password || '') !== (oldData.password || '')
    )

    // Update data - KEEP original timestamp
    const now = new Date()
    const updatedAt = now.toLocaleString('id-ID', { 
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    // Ambil original createdAt (tanpa suffix "(edited)")
    let originalCreatedAt = oldData.createdAt || '-'
    // Hapus semua "(edited)" yang mungkin sudah ada
    originalCreatedAt = originalCreatedAt.replace(/\s*\(edited\)$/g, '').trim()

    const promptData = {
      kategori: kategori || oldData.kategori,
      judul: judul,
      isi: isi,
      uploadedBy: oldData.uploadedBy || 'Admin',
      // HANYA tambahkan (edited) jika BENAR-BENAR ada perubahan
      createdAt: hasChanges ? `${originalCreatedAt} (edited)` : originalCreatedAt,
      timestamp: parseInt(oldData.timestamp) || now.getTime(), // Keep original timestamp
      updatedAt: updatedAt + ' WIB' // Track last edit time
    }

    // Optional fields
    if (description && description.trim() !== '') {
      promptData.description = description
    }

    if (imageUrl && imageUrl.trim() !== '') {
      promptData.imageUrl = imageUrl
    } else if (oldData.imageUrl) {
      promptData.imageUrl = oldData.imageUrl // Keep old image if no new one
    }

    // Password handling
    if (password && password.trim() !== '') {
      promptData.password = password.trim()
      promptData.isProtected = true
    } else if (oldData.isProtected === 'true' || oldData.isProtected === true) {
      // Jika dulu protected tapi sekarang password di-kosongkan
      promptData.password = ''
      promptData.isProtected = false
    } else {
      promptData.isProtected = false
    }

    // Save to Redis
    await redis.hset(`prompt:${slug}`, promptData)

    res.status(200).json({ 
      success: true,
      message: hasChanges ? 'Prompt berhasil diupdate!' : 'Tidak ada perubahan',
      slug: slug
    })
  } catch (error) {
    console.error('❌ Error in edit-prompt:', error)
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server' })
  }
}
