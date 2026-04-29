import { getDb } from '../lib/mongodb.js'
import { readFileSync } from 'fs'
import { join } from 'path'

export const config = {
  maxDuration: 60,
}

export default async function handler(req, res) {
  if (req.headers['x-migrate-secret'] !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ success: false, message: 'Forbidden' })
  }

  const { type } = req.query // 'prompts' | 'analytics' | 'users'
  if (!type) {
    return res.status(400).json({ success: false, message: 'Tambah ?type=prompts atau analytics atau users' })
  }

  const db = await getDb()
  const log = []

  try {
    const filePath = join(process.cwd(), 'prompthub.json')
    const raw = JSON.parse(readFileSync(filePath, 'utf8'))
    const data = raw.databases['0']

    for (const [key, val] of Object.entries(data)) {
      if (type === 'prompts' && key.startsWith('prompt:')) {
        const slug = key.replace('prompt:', '')
        if (!val.judul) continue
        await db.collection('prompts').updateOne(
          { slug },
          { $set: {
            slug,
            kategori: val.kategori || 'Lainnya',
            judul: val.judul,
            description: val.description || '',
            isi: val.isi || '',
            uploadedBy: val.uploadedBy || 'Admin',
            createdAt: val.createdAt || '-',
            imageUrl: val.imageUrl || '',
            timestamp: parseInt(val.timestamp) || 0,
            isProtected: val.isProtected === 'true' || val.isProtected === true,
            password: val.password || '',
          }},
          { upsert: true }
        )
        log.push(slug)

      } else if (type === 'analytics' && key.startsWith('analytics:')) {
        const slug = key.replace('analytics:', '')
        await db.collection('analytics').updateOne(
          { slug },
          { $set: {
            slug,
            views: parseInt(val.views) || 0,
            copies: parseInt(val.copies) || 0,
            downloads: parseInt(val.downloads) || 0,
          }},
          { upsert: true }
        )
        log.push(slug)

      } else if (type === 'users' && key.startsWith('user:')) {
        const username = key.replace('user:', '')
        await db.collection('users').updateOne(
          { username },
          { $set: {
            username,
            password: val.password || '',
            role: val.role || 'contributor',
            profileUrl: val.profileUrl || '',
            bio: val.bio || '',
          }},
          { upsert: true }
        )
        log.push(username)
      }
    }

    return res.status(200).json({ success: true, type, migrated: log.length, log })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
}
