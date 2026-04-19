import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const authHeader = req.headers.authorization
  if (authHeader !== 'RgumiU6yl%SX29I2') {
    return res.status(403).json({ success: false, message: 'Tidak diizinkan' })
  }

  const { slug, kategori, judul, description, isi, imageUrl, password, editorName } = req.body

  if (!slug || !judul || !isi) {
    return res.status(400).json({ success: false, message: 'Data tidak lengkap (slug, judul, isi wajib)' })
  }

  try {
    const oldData = await redis.hgetall(`prompt:${slug}`)

    if (!oldData || !oldData.judul) {
      return res.status(404).json({ success: false, message: 'Prompt tidak ditemukan' })
    }

    const userData = await redis.hgetall(`user:${editorName}`)
    const role = userData?.role || 'contributor'

    if (role !== 'admin' && oldData.uploadedBy !== editorName) {
      return res.status(403).json({ success: false, message: 'Kamu hanya bisa edit prompt milikmu sendiri' })
    }

    const normalizedKategori = (kategori || oldData.kategori || 'Lainnya').trim().toLowerCase()

    const hasChanges = (
      judul !== oldData.judul ||
      isi !== oldData.isi ||
      normalizedKategori !== (oldData.kategori || '').toLowerCase() ||
      (description || '') !== (oldData.description || '') ||
      (imageUrl || '') !== (oldData.imageUrl || '') ||
      (password || '') !== (oldData.password || '')
    )

    const now = new Date()
    const updatedAt = now.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    let originalCreatedAt = oldData.createdAt || '-'
    originalCreatedAt = originalCreatedAt.replace(/\s*\(edited\)$/g, '').trim()

    const promptData = {
      kategori: normalizedKategori,
      judul: judul,
      isi: isi,
      uploadedBy: oldData.uploadedBy || 'Admin',
      createdAt: hasChanges ? `${originalCreatedAt} (edited)` : originalCreatedAt,
      timestamp: parseInt(oldData.timestamp) || now.getTime(),
      updatedAt: updatedAt + ' WIB'
    }

    if (description && description.trim() !== '') {
      promptData.description = description
    }

    if (imageUrl && imageUrl.trim() !== '') {
      promptData.imageUrl = imageUrl
    } else if (oldData.imageUrl) {
      promptData.imageUrl = oldData.imageUrl
    }

    if (password && password.trim() !== '') {
      promptData.password = password.trim()
      promptData.isProtected = true
    } else if (oldData.isProtected === 'true' || oldData.isProtected === true) {
      promptData.password = ''
      promptData.isProtected = false
    } else {
      promptData.isProtected = false
    }

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
