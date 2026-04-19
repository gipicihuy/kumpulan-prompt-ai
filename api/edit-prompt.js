import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

async function verifySession(token) {
  if (!token) return null
  const username = await redis.get(`session:${token}`)
  if (!username) return null
  const userData = await redis.hgetall(`user:${username}`)
  return { username, role: userData?.role || 'contributor' }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const session = await verifySession(req.headers.authorization)
  if (!session) return res.status(403).json({ success: false, message: 'Sesi tidak valid atau sudah expired' })

  const { slug, kategori, judul, description, isi, imageUrl, password } = req.body
  const { username, role } = session

  if (!slug || !judul || !isi) {
    return res.status(400).json({ success: false, message: 'Data tidak lengkap (slug, judul, isi wajib)' })
  }

  try {
    const oldData = await redis.hgetall(`prompt:${slug}`)

    if (!oldData || !oldData.judul) {
      return res.status(404).json({ success: false, message: 'Prompt tidak ditemukan' })
    }

    if (role !== 'admin' && oldData.uploadedBy !== username) {
      return res.status(403).json({ success: false, message: 'Kamu hanya bisa edit prompt milikmu sendiri' })
    }

    const normalizedKategori = (kategori || oldData.kategori || 'Lainnya').trim().toLowerCase()

    const hasChanges =
      judul !== oldData.judul ||
      isi !== oldData.isi ||
      normalizedKategori !== (oldData.kategori || '').toLowerCase() ||
      (description || '') !== (oldData.description || '') ||
      (imageUrl || '') !== (oldData.imageUrl || '') ||
      (password || '') !== (oldData.password || '')

    const now = new Date()
    const updatedAt =
      now.toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }) + ' WIB'

    const originalCreatedAt = (oldData.createdAt || '-').replace(/\s*\(edited\)$/g, '').trim()

    const promptData = {
      kategori: normalizedKategori,
      judul,
      isi,
      uploadedBy: oldData.uploadedBy || username,
      createdAt: hasChanges ? `${originalCreatedAt} (edited)` : originalCreatedAt,
      timestamp: parseInt(oldData.timestamp) || now.getTime(),
      updatedAt,
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

    return res.status(200).json({
      success: true,
      message: hasChanges ? 'Prompt berhasil diupdate!' : 'Tidak ada perubahan',
      slug,
    })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server' })
  }
}
