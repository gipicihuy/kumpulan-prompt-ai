import { getDb } from '../lib/mongodb'

const CONTRIBUTOR_DAILY_LIMIT = 10

async function verifySession(token) {
  if (!token) return null
  const db = await getDb()
  const session = await db.collection('sessions').findOne({ token })
  if (!session) return null
  if (session.expiresAt && new Date() > session.expiresAt) {
    await db.collection('sessions').deleteOne({ token })
    return null
  }
  const user = await db.collection('users').findOne({ username: session.username })
  return { username: session.username, role: user?.role || 'contributor' }
}

async function handleAdd(req, res, session) {
  const { slug, kategori, judul, description, isi, imageUrl, password, clientTimestamp } = req.body
  const { username, role } = session

  const db = await getDb()
  let currentCount = 0

  if (role === 'contributor') {
    const today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }).replace(/\//g, '-')
    const rateKey = `upload:${username}:${today}`
    const rateDoc = await db.collection('ratelimits').findOne({ key: rateKey })
    currentCount = rateDoc?.count || 0

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

    await db.collection('ratelimits').updateOne(
      { key: rateKey },
      { $set: { key: rateKey, count: currentCount + 1, expiresAt: midnightWIB } },
      { upsert: true }
    )
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

  const promptDoc = {
    slug,
    kategori: normalizedKategori,
    judul,
    isi,
    uploadedBy: username,
    createdAt,
    timestamp,
    isProtected: !!(password && password.trim()),
    password: password && password.trim() ? password.trim() : '',
    imageUrl: imageUrl || '',
    description: description || '',
  }

  await db.collection('prompts').updateOne(
    { slug },
    { $set: promptDoc },
    { upsert: true }
  )

  const remaining = role === 'contributor' ? CONTRIBUTOR_DAILY_LIMIT - (currentCount + 1) : null
  return res.status(200).json({ success: true, ...(remaining !== null && { remaining }) })
}

async function handleEdit(req, res, session) {
  const { slug, kategori, judul, description, isi, imageUrl, password } = req.body
  const { username, role } = session

  if (!slug || !judul || !isi)
    return res.status(400).json({ success: false, message: 'Data tidak lengkap (slug, judul, isi wajib)' })

  const db = await getDb()
  const oldData = await db.collection('prompts').findOne({ slug })
  if (!oldData)
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

  const updateDoc = {
    kategori: normalizedKategori,
    judul,
    isi,
    uploadedBy: oldData.uploadedBy || username,
    createdAt: hasChanges ? `${originalCreatedAt} (edited)` : originalCreatedAt,
    timestamp: oldData.timestamp || now.getTime(),
    updatedAt,
    description: description && description.trim() !== '' ? description : (oldData.description || ''),
    imageUrl: imageUrl && imageUrl.trim() !== '' ? imageUrl : (oldData.imageUrl || ''),
    isProtected: !!(password && password.trim()),
    password: password && password.trim() ? password.trim() : '',
  }

  await db.collection('prompts').updateOne({ slug }, { $set: updateDoc })

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

  const db = await getDb()
  const promptData = await db.collection('prompts').findOne({ slug })
  if (!promptData)
    return res.status(404).json({ success: false, message: 'Prompt tidak ditemukan' })

  await db.collection('prompts').deleteOne({ slug })
  await db.collection('analytics').deleteOne({ slug })
  await db.collection('prompt_sessions').deleteMany({ slug })

  return res.status(200).json({ success: true, message: 'Prompt berhasil dihapus!', deletedTitle: promptData.judul })
}

async function handleCheckSlug(req, res) {
  const { slug } = req.body
  if (!slug) return res.status(400).json({ success: false, message: 'Slug required' })

  const db = await getDb()
  const existing = await db.collection('prompts').findOne({ slug })
  if (existing) {
    return res.status(200).json({
      success: true,
      exists: true,
      existingData: {
        judul: existing.judul,
        kategori: existing.kategori,
        uploadedBy: existing.uploadedBy,
        createdAt: existing.createdAt,
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
      case 'add': return await handleAdd(req, res, session)
      case 'edit': return await handleEdit(req, res, session)
      case 'delete': return await handleDelete(req, res, session)
      case 'check-slug': return await handleCheckSlug(req, res)
      default: return res.status(400).json({ success: false, message: 'Action tidak valid' })
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server' })
  }
}
