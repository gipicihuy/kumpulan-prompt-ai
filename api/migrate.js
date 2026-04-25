import { Redis } from '@upstash/redis'
import { getDb } from '../lib/mongodb.js'

export default async function handler(req, res) {
  const db = await getDb()
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  })

  const log = []

  for (const key of await redis.keys('prompt:*')) {
    const slug = key.replace(/^prompt:/, '')
    const item = await redis.hgetall(key)
    if (!item?.judul) continue
    await db.collection('prompts').updateOne({ slug }, { $set: { slug, kategori: item.kategori || 'Lainnya', judul: item.judul, description: item.description || '', isi: item.isi || '', uploadedBy: item.uploadedBy || 'Admin', createdAt: item.createdAt || '-', imageUrl: item.imageUrl || '', timestamp: parseInt(item.timestamp) || 0, isProtected: item.isProtected === 'true', password: item.password || '' } }, { upsert: true })
    log.push(`prompt:${slug}`)
  }

  for (const key of await redis.keys('analytics:*')) {
    const slug = key.replace(/^analytics:/, '')
    const item = await redis.hgetall(key)
    if (!item) continue
    await db.collection('analytics').updateOne({ slug }, { $set: { slug, views: parseInt(item.views) || 0, copies: parseInt(item.copies) || 0, downloads: parseInt(item.downloads) || 0 } }, { upsert: true })
    log.push(`analytics:${slug}`)
  }

  for (const key of await redis.keys('user:*')) {
    const username = key.replace(/^user:/, '')
    const item = await redis.hgetall(key)
    if (!item) continue
    await db.collection('users').updateOne({ username }, { $set: { username, password: item.password || '', role: item.role || 'contributor', profileUrl: item.profileUrl || '', bio: item.bio || '' } }, { upsert: true })
    log.push(`user:${username}`)
  }

  return res.status(200).json({ success: true, migrated: log })
}
