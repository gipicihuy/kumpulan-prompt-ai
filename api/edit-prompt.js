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

    // ✅ FIX: Normalisasi semua data dengan konsisten
    const oldJudul = (oldData.judul || '').trim()
    const newJudul = (judul || '').trim()
    
    const oldKategori = (oldData.kategori || '').trim()
    const newKategori = (kategori || '').trim()
    
    const oldIsi = (oldData.isi || '').trim()
    const newIsi = (isi || '').trim()
    
    const oldDescription = (oldData.description || '').trim()
    const newDescription = (description || '').trim()
    
    const oldImageUrl = (oldData.imageUrl || '').trim()
    const newImageUrl = (imageUrl && imageUrl.trim() !== '') ? imageUrl.trim() : oldImageUrl
    
    const oldPassword = (oldData.password || '').trim()
    const newPassword = (password || '').trim()
    
    const oldIsProtected = oldData.isProtected === 'true' || oldData.isProtected === true
    const newIsProtected = newPassword !== ''

    // ✅ FIX: Pengecekan perubahan yang AKURAT
    const hasChanges = 
      oldJudul !== newJudul ||
      oldKategori !== newKategori ||
      oldIsi !== newIsi ||
      oldDescription !== newDescription ||
      oldImageUrl !== newImageUrl ||
      oldPassword !== newPassword ||
      oldIsProtected !== newIsProtected

    console.log('🔍 Edit Check:', {
      hasChanges,
      judul: oldJudul === newJudul ? 'SAME' : 'CHANGED',
      kategori: oldKategori === newKategori ? 'SAME' : 'CHANGED',
      isi: oldIsi === newIsi ? 'SAME' : 'CHANGED',
      description: oldDescription === newDescription ? 'SAME' : 'CHANGED',
      imageUrl: oldImageUrl === newImageUrl ? 'SAME' : 'CHANGED',
      password: oldPassword === newPassword ? 'SAME' : 'CHANGED',
      isProtected: oldIsProtected === newIsProtected ? 'SAME' : 'CHANGED'
    })

    // ✅ Clean old createdAt dari "(edited)" jika ada
    const baseCreatedAt = oldData.createdAt.replace(/ \(edited\)$/i, '').trim()

    const promptData = {
      kategori: newKategori,
      judul: newJudul,
      isi: newIsi,
      uploadedBy: oldData.uploadedBy || 'Admin',
      // ✅ HANYA tambahkan "(edited)" jika ADA PERUBAHAN
      createdAt: hasChanges ? baseCreatedAt + ' (edited)' : oldData.createdAt,
      timestamp: parseInt(oldData.timestamp) || now.getTime(),
      updatedAt: hasChanges ? updatedAt + ' WIB' : (oldData.updatedAt || '')
    }

    // Optional fields dengan normalisasi
    promptData.description = newDescription
    promptData.imageUrl = newImageUrl

    // Password handling
    if (newPassword !== '') {
      promptData.password = newPassword
      promptData.isProtected = true
    } else {
      promptData.password = ''
      promptData.isProtected = false
    }

    // Save to Redis
    await redis.hset(`prompt:${slug}`, promptData)

    const message = hasChanges ? 'Prompt berhasil diupdate!' : 'No changes detected'
    
    res.status(200).json({ 
      success: true,
      message: message,
      slug: slug,
      hasChanges: hasChanges
    })
  } catch (error) {
    console.error('❌ Error in edit-prompt:', error)
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server: ' + error.message })
  }
}
