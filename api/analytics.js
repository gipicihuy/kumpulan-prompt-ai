import { Redis } from '@upstash/redis'
import { neon } from '@neondatabase/serverless'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

function getSql() {
  return neon(process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_lNDe8b5XyPZm@ep-polished-base-a1z8144j-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require')
}

async function getUserFromToken(token) {
  if (!token) return null
  const sessionData = await redis.get(`user_session:${token}`)
  if (!sessionData) return null
  return typeof sessionData === 'string' ? JSON.parse(sessionData) : sessionData
}

export default async function handler(req, res) {
  const action = req.query.action

  // === COMMENTS: GET ===
  if (action === 'get-comments') {
    const { slug } = req.query
    if (!slug) return res.status(400).json({ success: false, message: 'Slug diperlukan' })
    try {
      const sql = getSql()
      const comments = await sql`
        SELECT id, username, display_name, avatar_url, content, created_at
        FROM comments
        WHERE prompt_slug = ${slug}
        ORDER BY created_at DESC
        LIMIT 50
      `
      return res.status(200).json({ success: true, comments })
    } catch (error) {
      console.error('❌ Error get comments:', error)
      return res.status(500).json({ success: false, message: 'Gagal mengambil komentar' })
    }
  }

  // === COMMENTS: POST ===
  if (action === 'post-comment') {
    if (req.method !== 'POST') return res.status(405).end()
    const { slug, content } = req.body
    const token = req.headers.authorization
    if (!slug || !content) return res.status(400).json({ success: false, message: 'Slug dan konten diperlukan' })
    if (!content.trim() || content.trim().length < 1) return res.status(400).json({ success: false, message: 'Komentar tidak boleh kosong' })
    if (content.trim().length > 500) return res.status(400).json({ success: false, message: 'Komentar maksimal 500 karakter' })

    const session = await getUserFromToken(token)
    if (!session) return res.status(401).json({ success: false, message: 'Login terlebih dahulu untuk berkomentar' })

    try {
      const sql = getSql()
      // Get user details
      const users = await sql`SELECT id, username, display_name, avatar_url FROM users WHERE id = ${session.userId}`
      if (users.length === 0) return res.status(404).json({ success: false, message: 'User tidak ditemukan' })
      const user = users[0]

      const [comment] = await sql`
        INSERT INTO comments (prompt_slug, user_id, username, display_name, avatar_url, content)
        VALUES (${slug}, ${user.id}, ${user.username}, ${user.display_name}, ${user.avatar_url}, ${content.trim()})
        RETURNING id, username, display_name, avatar_url, content, created_at
      `
      return res.status(200).json({ success: true, comment })
    } catch (error) {
      console.error('❌ Error post comment:', error)
      return res.status(500).json({ success: false, message: 'Gagal mengirim komentar' })
    }
  }

  // === COMMENTS: DELETE (own comment or admin) ===
  if (action === 'delete-comment') {
    if (req.method !== 'POST') return res.status(405).end()
    const { commentId } = req.body
    const token = req.headers.authorization
    if (!commentId) return res.status(400).json({ success: false, message: 'Comment ID diperlukan' })

    // Check if admin
    const isAdmin = token === 'admin-secret-key'
    
    if (!isAdmin) {
      const session = await getUserFromToken(token)
      if (!session) return res.status(401).json({ success: false, message: 'Login diperlukan' })
      try {
        const sql = getSql()
        const deleted = await sql`DELETE FROM comments WHERE id = ${commentId} AND user_id = ${session.userId} RETURNING id`
        if (deleted.length === 0) return res.status(403).json({ success: false, message: 'Tidak bisa menghapus komentar ini' })
        return res.status(200).json({ success: true })
      } catch (error) {
        return res.status(500).json({ success: false, message: 'Gagal menghapus komentar' })
      }
    } else {
      try {
        const sql = getSql()
        await sql`DELETE FROM comments WHERE id = ${commentId}`
        return res.status(200).json({ success: true })
      } catch (error) {
        return res.status(500).json({ success: false, message: 'Gagal menghapus komentar' })
      }
    }
  }

  // ======= ORIGINAL ANALYTICS LOGIC =======
  const slug = req.method === 'GET' ? req.query.slug : req.body?.slug

  if (!slug) {
    console.error('❌ Slug tidak ditemukan!', { method: req.method, query: req.query, body: req.body })
    return res.status(400).json({ success: false, message: 'Slug diperlukan' })
  }

  const analyticsKey = `analytics:${slug}`
  console.log(`📊 Analytics request: ${req.method} ${slug}`)

  try {
    if (req.method === 'GET') {
      const analytics = await redis.hgetall(analyticsKey)
      return res.status(200).json({
        success: true,
        analytics: {
          views: parseInt(analytics?.views) || 0,
          copies: parseInt(analytics?.copies) || 0,
          downloads: parseInt(analytics?.downloads) || 0
        }
      })
    }

    if (req.method === 'POST') {
      const { action: analyticsAction } = req.body
      if (!analyticsAction) {
        console.error('❌ Action tidak ditemukan!', req.body)
        return res.status(400).json({ success: false, message: 'Action diperlukan' })
      }

      const validActions = ['view', 'copy', 'download']
      if (!validActions.includes(analyticsAction)) {
        console.error('❌ Action tidak valid:', analyticsAction)
        return res.status(400).json({ success: false, message: 'Action tidak valid' })
      }

      let fieldToIncrement = ''
      switch (analyticsAction) {
        case 'view': fieldToIncrement = 'views'; break
        case 'copy': fieldToIncrement = 'copies'; break
        case 'download': fieldToIncrement = 'downloads'; break
      }

      console.log(`✅ Tracking ${analyticsAction} for ${slug}`)
      await redis.hincrby(analyticsKey, fieldToIncrement, 1)
      const analytics = await redis.hgetall(analyticsKey)

      return res.status(200).json({
        success: true,
        analytics: {
          views: parseInt(analytics?.views) || 0,
          copies: parseInt(analytics?.copies) || 0,
          downloads: parseInt(analytics?.downloads) || 0
        }
      })
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' })
  } catch (error) {
    console.error('❌ Error in analytics:', error)
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server', error: error.message })
  }
}
