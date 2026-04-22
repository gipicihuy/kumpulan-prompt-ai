import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

const CONTRIBUTOR_DAILY_LIMIT = 10

async function verifySession(token) {
  if (!token) return null
  const username = await redis.get(`session:${token}`)
  if (!username) return null
  const userData = await redis.hgetall(`user:${username}`)
  return { username, role: userData?.role || 'contributor' }
}

async function handleAdd(req, res, session) {
  const { slug, kategori, judul, description, isi, imageUrl, password, clientTimestamp } = req.body
  const { username, role } = session

  let currentCount = 0

  if (role === 'contributor') {
    const today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }).replace(/\//g, '-')
    const rateLimitKey = `ratelimit:upload:${username}:${today}`
    const stored = await redis.get(rateLimitKey)
    currentCount = parseInt(stored) || 0

    if (currentCount >= CONTRIBUTOR_DAILY_LIMIT) {
      return res.status(429).json({
        success: false,
        message: `Batas upload harian tercapai (${CONTRIBUTOR_DAILY_LIMIT}/hari). Coba lagi besok!`,
        remaining: 0,
      })
    }

    const now = new Date()
    const jakartaOffset = 7 * 60 * 60 * 1000
    const nowWIB = new Date(now.getTime() + jakartaOffset)
    const midnightWIB = new Date(nowWIB)
    midnightWIB.setUTCHours(17, 0, 0, 0)
    if (nowWIB.getUTCHours() >= 17) midnightWIB.setUTCDate(midnightWIB.getUTCDate() + 1)
    const ttlSeconds = Math.floor((midnightWIB - now) / 1000)
    await redis.setex(rateLimitKey, ttlSeconds, currentCount + 1)
  }

  const timestamp = clientTimestamp || Date.now()
  const now = new Date(timestamp)
  const createdAt =
    now.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }) + ' WIB'

  const normalizedKategori = (kategori || 'Lainnya').trim().toLowerCase()
  const promptData = {
    kategori: normalizedKategori, judul, isi,
    uploadedBy: username, createdAt, timestamp,
  }

  if (description) promptData.description = description
  if (imageUrl) promptData.imageUrl = imageUrl

  if (password && password.trim() !== '') {
    promptData.password = password.trim()
    promptData.isProtected = true
  } else {
    promptData.isProtected = false
  }

  await redis.hset(`prompt:${slug}`, promptData)

  const remaining = role === 'contributor' ? CONTRIBUTOR_DAILY_LIMIT - (currentCount + 1) : null
  return res.status(200).json({ success: true, ...(remaining !== null && { remaining }) })
}

async function handleEdit(req, res, session) {
  const { slug, kategori, judul, description, isi, imageUrl, password } = req.body
  const { username, role } = session

  if (!slug || !judul || !isi)
    return res.status(400).json({ success: false, message: 'Data tidak lengkap (slug, judul, isi wajib)' })

  const oldData = await redis.hgetall(`prompt:${slug}`)
  if (!oldData || !oldData.judul)
    return res.status(404).json({ success: false, message: 'Prompt tidak ditemukan' })

  if (role !== 'admin' && oldData.uploadedBy !== username)
    return res.status(403).json({ success: false, message: 'Kamu hanya bisa edit prompt milikmu sendiri' })

  const normalizedKategori = (kategori || oldData.kategori || 'Lainnya').trim().toLowerCase()

  const hasChanges =
    judul !== oldData.judul || isi !== oldData.isi ||
    normalizedKategori !== (oldData.kategori || '').toLowerCase() ||
    (description || '') !== (oldData.description || '') ||
    (imageUrl || '') !== (oldData.imageUrl || '') ||
    (password || '') !== (oldData.password || '')

  const now = new Date()
  const updatedAt =
    now.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }) + ' WIB'

  const originalCreatedAt = (oldData.createdAt || '-').replace(/\s*\(edited\)$/g, '').trim()

  const promptData = {
    kategori: normalizedKategori, judul, isi,
    uploadedBy: oldData.uploadedBy || username,
    createdAt: hasChanges ? `${originalCreatedAt} (edited)` : originalCreatedAt,
    timestamp: parseInt(oldData.timestamp) || now.getTime(),
    updatedAt,
  }

  if (description && description.trim() !== '') promptData.description = description
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
}

async function handleDelete(req, res, session) {
  if (session.role !== 'admin')
    return res.status(403).json({ success: false, message: 'Hanya admin yang bisa menghapus prompt' })

  const { slug } = req.body
  if (!slug) return res.status(400).json({ success: false, message: 'Slug diperlukan' })

  const promptData = await redis.hgetall(`prompt:${slug}`)
  if (!promptData || !promptData.judul)
    return res.status(404).json({ success: false, message: 'Prompt tidak ditemukan' })

  await redis.del(`prompt:${slug}`)
  await redis.del(`analytics:${slug}`)

  const sessionKeys = await redis.keys(`session:${slug}:*`)
  if (sessionKeys && sessionKeys.length > 0) {
    for (const key of sessionKeys) await redis.del(key)
  }

  return res.status(200).json({ success: true, message: 'Prompt berhasil dihapus!', deletedTitle: promptData.judul })
}

async function handleCheckSlug(req, res) {
  const { slug } = req.body
  if (!slug) return res.status(400).json({ success: false, message: 'Slug required' })

  const existingPrompt = await redis.hgetall(`prompt:${slug}`)
  if (existingPrompt && existingPrompt.judul) {
    return res.status(200).json({
      success: true, exists: true,
      existingData: {
        judul: existingPrompt.judul,
        kategori: existingPrompt.kategori,
        uploadedBy: existingPrompt.uploadedBy,
        createdAt: existingPrompt.createdAt,
      },
    })
  }

  return res.status(200).json({ success: true, exists: false })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { action } = req.query
  const session = await verifySession(req.headers.authorization)
  if (!session) return res.status(403).json({ success: false, message: 'Sesi tidak valid atau sudah expired' })

  try {
    switch (action) {
      case 'add':        return await handleAdd(req, res, session)
      case 'edit':       return await handleEdit(req, res, session)
      case 'delete':     return await handleDelete(req, res, session)
      case 'check-slug': return await handleCheckSlug(req, res)
      default:           return res.status(400).json({ success: false, message: 'Action tidak valid' })
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server' })
  }
}
