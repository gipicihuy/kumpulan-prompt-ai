import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  
  const { username, password } = req.body
  const userData = await redis.hgetall(`user:${username}`)

  if (userData && userData.password === password) {
    // ✅ TAMBAHKAN profileUrl di response
    return res.status(200).json({ 
      success: true, 
      token: 'admin-secret-key',
      profileUrl: userData.profileUrl || '' // ✅ FIX: Return profileUrl
    })
  }
  
  res.status(401).json({ success: false, message: 'Gagal Login' })
}
