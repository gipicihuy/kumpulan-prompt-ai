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
  return { username, role: userData?.role || 'contributor', profileUrl: userData?.profileUrl || '' }
}

async function handleGetPrompts(req, res) {
  const keys = await redis.keys('prompt:*')
  if (!keys || keys.length === 0) return res.status(200).json({ success: true, data: [] })

  const data = await Promise.all(
    keys.map(async (key) => {
      const item = await redis.hgetall(key)
      const cleanId = key.replace(/^prompt:/, '')

      let profileUrl = '', isAdmin = false
      if (item.uploadedBy) {
        const userData = await redis.hgetall(`user:${item.uploadedBy}`)
        profileUrl = userData?.profileUrl || ''
        isAdmin = userData?.role === 'admin'
      }

      const isProtected = item.isProtected === 'true' || item.isProtected === true
      const analyticsData = await redis.hgetall(`analytics:${cleanId}`)
      const analytics = {
        views:     parseInt(analyticsData?.views)     || 0,
        copies:    parseInt(analyticsData?.copies)    || 0,
        downloads: parseInt(analyticsData?.downloads) || 0,
      }

      return {
        id: cleanId,
        kategori:    item.kategori  || 'Lainnya',
        judul:       item.judul     || 'Tanpa Judul',
        description: isProtected ? '' : (item.description || ''),
        isi:         isProtected ? '🔒 This content is password protected' : (typeof item.isi === 'object' ? JSON.stringify(item.isi, null, 2) : (item.isi || '')),
        uploadedBy:  item.uploadedBy || 'Admin',
        createdAt:   item.createdAt  || '-',
        imageUrl:    item.imageUrl   || '',
        profileUrl,
        timestamp:   parseInt(item.timestamp) || 0,
        isProtected,
        isAdmin,
        analytics,
      }
    })
  )

  data.sort((a, b) => b.timestamp - a.timestamp)
  return res.status(200).json({ success: true, data })
}

async function handleGetAllPrompts(req, res) {
  const session = await verifySession(req.headers.authorization)
  if (!session) return res.status(403).json({ success: false, message: 'Sesi tidak valid atau sudah expired' })

  const { username, role, profileUrl } = session
  const keys = await redis.keys('prompt:*')

  if (!keys || keys.length === 0) {
    const payload = { success: true, data: [], profileUrl }
    if (role === 'contributor') {
      const today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }).replace(/\//g, '-')
      const stored = await redis.get(`ratelimit:upload:${username}:${today}`)
      payload.quotaUsed = parseInt(stored) || 0
      payload.quotaLimit = CONTRIBUTOR_DAILY_LIMIT
    }
    return res.status(200).json(payload)
  }

  const data = await Promise.all(
    keys.map(async (key) => {
      const item = await redis.hgetall(key)
      if (!item || !item.judul) return null
      if (role !== 'admin' && (item.uploadedBy || '').toLowerCase() !== username.toLowerCase()) return null

      const slug = key.replace(/^prompt:/, '')
      const analyticsData = await redis.hgetall(`analytics:${slug}`)
      const analytics = {
        views:     parseInt(analyticsData?.views)     || 0,
        copies:    parseInt(analyticsData?.copies)    || 0,
        downloads: parseInt(analyticsData?.downloads) || 0,
      }

      const uploaderData = await redis.hgetall(`user:${item.uploadedBy}`)

      return {
        slug,
        kategori:    item.kategori    || 'Lainnya',
        judul:       item.judul       || 'Tanpa Judul',
        description: item.description || '',
        isi:         item.isi         || '',
        uploadedBy:  item.uploadedBy  || username,
        createdAt:   item.createdAt   || '-',
        imageUrl:    item.imageUrl    || '',
        timestamp:   parseInt(item.timestamp) || 0,
        isProtected: item.isProtected === 'true' || item.isProtected === true,
        password:    item.password    || '',
        profileUrl:  uploaderData?.profileUrl || '',
        isAdmin:     uploaderData?.role === 'admin',
        analytics,
      }
    })
  )

  const filtered = data.filter(Boolean)
  filtered.sort((a, b) => b.timestamp - a.timestamp)

  const payload = { success: true, data: filtered, profileUrl }
  if (role === 'contributor') {
    const today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }).replace(/\//g, '-')
    const stored = await redis.get(`ratelimit:upload:${username}:${today}`)
    payload.quotaUsed = parseInt(stored) || 0
    payload.quotaLimit = CONTRIBUTOR_DAILY_LIMIT
  }

  return res.status(200).json(payload)
}

async function handleAnalytics(req, res) {
  const slug = req.method === 'GET' ? req.query.slug : req.body?.slug
  if (!slug) return res.status(400).json({ success: false, message: 'Slug diperlukan' })

  const analyticsKey = `analytics:${slug}`

  if (req.method === 'GET') {
    const analytics = await redis.hgetall(analyticsKey)
    return res.status(200).json({
      success: true,
      analytics: {
        views:     parseInt(analytics?.views)     || 0,
        copies:    parseInt(analytics?.copies)    || 0,
        downloads: parseInt(analytics?.downloads) || 0,
      },
    })
  }

  if (req.method === 'POST') {
    const { action } = req.body
    const fieldMap = { view: 'views', copy: 'copies', download: 'downloads' }
    if (!action || !fieldMap[action])
      return res.status(400).json({ success: false, message: 'Action tidak valid' })

    await redis.hincrby(analyticsKey, fieldMap[action], 1)
    const analytics = await redis.hgetall(analyticsKey)
    return res.status(200).json({
      success: true,
      analytics: {
        views:     parseInt(analytics?.views)     || 0,
        copies:    parseInt(analytics?.copies)    || 0,
        downloads: parseInt(analytics?.downloads) || 0,
      },
    })
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' })
}

export default async function handler(req, res) {
  const { action } = req.query

  try {
    switch (action) {
      case 'public':    return await handleGetPrompts(req, res)
      case 'all':       return await handleGetAllPrompts(req, res)
      case 'analytics': return await handleAnalytics(req, res)
      default:          return res.status(400).json({ success: false, message: 'Action tidak valid' })
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server', error: error.message })
  }
}
