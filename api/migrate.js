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

  const { type } = req.query
  if (!type) {
    return res.status(400).json({ success: false, message: 'Tambah ?type=prompts atau analytics atau users' })
  }

  const db = await getDb()

  try {
    const filePath = join(process.cwd(), 'prompthub.json')
    const raw = JSON.parse(readFileSync(filePath, 'utf8'))
    const data = raw.databases['0']

    const docs = []

    for (const [key, val] of Object.entries(data)) {
      if (type === 'prompts' && key.startsWith('prompt:')) {
        const slug = key.replace('prompt:', '')
        if (!val.judul) continue
        docs.push({
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
        })
      } else if (type === 'analytics' && key.startsWith('analytics:')) {
        const slug = key.replace('analytics:', '')
        docs.push({
          slug,
          views: parseInt(val.views) || 0,
          copies: parseInt(val.copies) || 0,
          downloads: parseInt(val.downloads) || 0,
        })
      } else if (type === 'users' && key.startsWith('user:')) {
        const username = key.replace('user:', '')
        docs.push({
          username,
          password: val.password || '',
          role: val.role || 'contributor',
          profileUrl: val.profileUrl || '',
          bio: val.bio || '',
        })
      }
    }

    // Bulk upsert
    const collection = db.collection(type)
    const idField = type === 'users' ? 'username' : 'slug'
    const ops = docs.map(doc => ({
      updateOne: {
        filter: { [idField]: doc[idField] },
        update: { $set: doc },
        upsert: true,
      }
    }))

    const result = await collection.bulkWrite(ops, { ordered: false })

    return res.status(200).json({
      success: true,
      type,
      migrated: docs.length,
      upserted: result.upsertedCount,
      modified: result.modifiedCount,
    })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
}
