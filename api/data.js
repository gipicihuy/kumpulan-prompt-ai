import { getDb } from '../lib/mongodb.js'

const CONTRIBUTOR_DAILY_LIMIT = 10

async function verifySession(token) {
  if (!token) return null
  const db = await getDb()
  const session = await db.collection('sessions').findOne({ token })
  if (!session) return null
  const user = await db.collection('users').findOne({ username: session.username })
  return { username: session.username, role: user?.role || 'contributor', profileUrl: user?.profileUrl || '' }
}

async function handleGetPrompts(req, res) {
  const db = await getDb()

  const [prompts, allUsers, allAnalytics] = await Promise.all([
    db.collection('prompts').find({}, { projection: { password: 0 } }).toArray(),
    db.collection('users').find({}, { projection: { username: 1, profileUrl: 1, role: 1 } }).toArray(),
    db.collection('analytics').find({}).toArray(),
  ])

  if (!prompts || prompts.length === 0) return res.status(200).json({ success: true, data: [] })

  const userMap = {}
  for (const u of allUsers) userMap[u.username] = u

  const analyticsMap = {}
  for (const a of allAnalytics) analyticsMap[a.slug] = a

  const data = prompts.map((item) => {
    const user = item.uploadedBy ? userMap[item.uploadedBy] : null
    const isProtected = item.isProtected === true
    const ana = analyticsMap[item.slug] || {}

    return {
      id: item.slug,
      kategori: item.kategori || 'Lainnya',
      judul: item.judul || 'Tanpa Judul',
      description: isProtected ? '' : (item.description || ''),
      isi: isProtected ? '🔒 This content is password protected' : (item.isi || ''),
      uploadedBy: item.uploadedBy || 'Admin',
      createdAt: item.createdAt || '-',
      imageUrl: item.imageUrl || '',
      profileUrl: user?.profileUrl || '',
      timestamp: item.timestamp || 0,
      isProtected,
      isAdmin: user?.role === 'admin' || false,
      analytics: {
        views: ana.views || 0,
        copies: ana.copies || 0,
        downloads: ana.downloads || 0,
      },
    }
  })

  data.sort((a, b) => b.timestamp - a.timestamp)

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=59')
  return res.status(200).json({ success: true, data })
}

async function handleGetAllPrompts(req, res) {
  const session = await verifySession(req.headers.authorization)
  if (!session) return res.status(403).json({ success: false, message: 'Sesi tidak valid atau sudah expired' })

  const { username, role, profileUrl } = session
  const db = await getDb()

  const query = role === 'admin' ? {} : { uploadedBy: { $regex: new RegExp(`^${username}$`, 'i') } }

  const [prompts, allUsers, allAnalytics] = await Promise.all([
    db.collection('prompts').find(query).toArray(),
    db.collection('users').find({}, { projection: { username: 1, profileUrl: 1, role: 1 } }).toArray(),
    db.collection('analytics').find({}).toArray(),
  ])

  const userMap = {}
  for (const u of allUsers) userMap[u.username] = u

  const analyticsMap = {}
  for (const a of allAnalytics) analyticsMap[a.slug] = a

  const data = prompts
    .filter(item => item.judul)
    .map((item) => {
      const uploaderUser = userMap[item.uploadedBy]
      const ana = analyticsMap[item.slug] || {}

      return {
        slug: item.slug,
        kategori: item.kategori || 'Lainnya',
        judul: item.judul || 'Tanpa Judul',
        description: item.description || '',
        isi: item.isi || '',
        uploadedBy: item.uploadedBy || username,
        createdAt: item.createdAt || '-',
        imageUrl: item.imageUrl || '',
        timestamp: item.timestamp || 0,
        isProtected: item.isProtected === true,
        password: item.password || '',
        profileUrl: uploaderUser?.profileUrl || '',
        isAdmin: uploaderUser?.role === 'admin' || false,
        analytics: {
          views: ana.views || 0,
          copies: ana.copies || 0,
          downloads: ana.downloads || 0,
        },
      }
    })

  data.sort((a, b) => b.timestamp - a.timestamp)

  const payload = { success: true, data, profileUrl }

  if (role === 'contributor') {
    const today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }).replace(/\//g, '-')
    const rateDoc = await db.collection('ratelimits').findOne({ key: `upload:${username}:${today}` })
    payload.quotaUsed = rateDoc?.count || 0
    payload.quotaLimit = CONTRIBUTOR_DAILY_LIMIT
  }

  return res.status(200).json(payload)
}

async function handleAnalytics(req, res) {
  const slug = req.method === 'GET' ? req.query.slug : req.body?.slug
  if (!slug) return res.status(400).json({ success: false, message: 'Slug diperlukan' })

  const db = await getDb()

  if (req.method === 'GET') {
    const doc = await db.collection('analytics').findOne({ slug })
    return res.status(200).json({
      success: true,
      analytics: {
        views: doc?.views || 0,
        copies: doc?.copies || 0,
        downloads: doc?.downloads || 0,
      },
    })
  }

  if (req.method === 'POST') {
    const { action } = req.body
    const fieldMap = { view: 'views', copy: 'copies', download: 'downloads' }
    if (!action || !fieldMap[action])
      return res.status(400).json({ success: false, message: 'Action tidak valid' })

    const field = fieldMap[action]
    await db.collection('analytics').updateOne(
      { slug },
      { $inc: { [field]: 1 } },
      { upsert: true }
    )

    const doc = await db.collection('analytics').findOne({ slug })
    return res.status(200).json({
      success: true,
      analytics: {
        views: doc?.views || 0,
        copies: doc?.copies || 0,
        downloads: doc?.downloads || 0,
      },
    })
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' })
}

export default async function handler(req, res) {
  const { action } = req.query

  try {
    switch (action) {
      case 'public': return await handleGetPrompts(req, res)
      case 'all': return await handleGetAllPrompts(req, res)
      case 'analytics': return await handleAnalytics(req, res)
      default: return res.status(400).json({ success: false, message: 'Action tidak valid' })
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server', error: error.message })
  }
}
