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

    // Update data - KEEP original timestamp, update createdAt untuk "edited" info
    const now = new Date()
    const updatedAt = now.toLocaleString('id-ID', { 
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    // ✅ Normalisasi data untuk perbandingan yang akurat
    const oldDescription = (oldData.description || '').trim()
    const newDescription = (description || '').trim()
    
    const oldImageUrl = (oldData.imageUrl || '').trim()
    // Jika imageUrl dari frontend kosong, gunakan old image
    const newImageUrl = (imageUrl && imageUrl.trim() !== '') ? imageUrl.trim() : oldImageUrl
    
    const oldPassword = (oldData.password || '').trim()
    const newPassword = (password || '').trim()
    
    const oldIsProtected = oldData.isProtected === 'true' || oldData.isProtected === true
    const newIsProtected = newPassword !== ''

    // Debug log
    console.log('🔍 Checking changes:')
    console.log('Judul:', oldData.judul, '→', judul, '=', oldData.judul === judul)
    console.log('Kategori:', oldData.kategori, '→', kategori, '=', oldData.kategori === kategori)
    console.log('Isi:', oldData.isi === isi ? 'SAME' : 'CHANGED')
    console.log('Description:', `"${oldDescription}"`, '→', `"${newDescription}"`, '=', oldDescription === newDescription)
    console.log('ImageUrl:', `"${oldImageUrl}"`, '→', `"${newImageUrl}"`, '=', oldImageUrl === newImageUrl)
    console.log('Password:', `"${oldPassword}"`, '→', `"${newPassword}"`, '=', oldPassword === newPassword)
    console.log('IsProtected:', oldIsProtected, '→', newIsProtected, '=', oldIsProtected === newIsProtected)

    const hasChanges = 
      oldData.judul !== judul ||
      oldData.kategori !== kategori ||
      oldData.isi !== isi ||
      oldDescription !== newDescription ||
      oldImageUrl !== newImageUrl ||
      oldPassword !== newPassword ||
      oldIsProtected !== newIsProtected

    console.log('✅ Has changes:', hasChanges)

    // ✅ Clean old createdAt dari "(edited)" jika ada
    const cleanCreatedAt = oldData.createdAt.replace(/ \(edited\)$/, '').trim()

    const promptData = {
      kategori: kategori || oldData.kategori,
      judul: judul,
      isi: isi,
      uploadedBy: oldData.uploadedBy || 'Admin',
      // ✅ HANYA tambahkan "(edited)" jika ADA PERUBAHAN
      createdAt: hasChanges ? cleanCreatedAt + ' (edited)' : oldData.createdAt,
      timestamp: parseInt(oldData.timestamp) || now.getTime(), // Keep original timestamp
      updatedAt: hasChanges ? updatedAt + ' WIB' : oldData.updatedAt // Only update if changed
    }

    // Optional fields - Always set to maintain consistency
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

    res.status(200).json({ 
      success: true,
      message: hasChanges ? 'Prompt berhasil diupdate!' : 'No changes detected',
      slug: slug,
      hasChanges: hasChanges
    })
  } catch (error) {
    console.error('❌ Error in edit-prompt:', error)
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server' })
  }
}
