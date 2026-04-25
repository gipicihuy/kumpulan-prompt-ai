import { Redis } from '@upstash/redis'
import { MongoClient } from 'mongodb'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

const mongoUri = process.env.MONGODB_URI
const client = new MongoClient(mongoUri)

async function migrate() {
  await client.connect()
  const db = client.db()

  console.log('Connected to MongoDB')

  const collections = ['prompts', 'analytics', 'users', 'sessions', 'ratelimits', 'bruteforce', 'prompt_sessions']
  for (const col of collections) {
    try {
      await db.createCollection(col)
      console.log(`Collection ${col} created`)
    } catch {
      console.log(`Collection ${col} already exists`)
    }
  }

  await db.collection('prompts').createIndex({ slug: 1 }, { unique: true })
  await db.collection('analytics').createIndex({ slug: 1 }, { unique: true })
  await db.collection('users').createIndex({ username: 1 }, { unique: true })
  await db.collection('sessions').createIndex({ token: 1 }, { unique: true })
  await db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  await db.collection('bruteforce').createIndex({ key: 1 }, { unique: true })
  await db.collection('bruteforce').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  await db.collection('ratelimits').createIndex({ key: 1 }, { unique: true })
  await db.collection('ratelimits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  await db.collection('prompt_sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })

  console.log('Indexes created')

  console.log('Migrating prompts...')
  const promptKeys = await redis.keys('prompt:*')
  console.log(`Found ${promptKeys.length} prompts`)

  for (const key of promptKeys) {
    const slug = key.replace(/^prompt:/, '')
    const item = await redis.hgetall(key)
    if (!item || !item.judul) continue

    const doc = {
      slug,
      kategori: item.kategori || 'Lainnya',
      judul: item.judul || 'Tanpa Judul',
      description: item.description || '',
      isi: typeof item.isi === 'object' ? JSON.stringify(item.isi) : (item.isi || ''),
      uploadedBy: item.uploadedBy || 'Admin',
      createdAt: item.createdAt || '-',
      imageUrl: item.imageUrl || '',
      timestamp: parseInt(item.timestamp) || 0,
      isProtected: item.isProtected === 'true' || item.isProtected === true,
      password: item.password || '',
    }

    await db.collection('prompts').updateOne({ slug }, { $set: doc }, { upsert: true })
    console.log(`  Migrated prompt: ${slug}`)
  }

  console.log('Migrating analytics...')
  const analyticsKeys = await redis.keys('analytics:*')
  console.log(`Found ${analyticsKeys.length} analytics`)

  for (const key of analyticsKeys) {
    const slug = key.replace(/^analytics:/, '')
    const item = await redis.hgetall(key)
    if (!item) continue

    const doc = {
      slug,
      views: parseInt(item.views) || 0,
      copies: parseInt(item.copies) || 0,
      downloads: parseInt(item.downloads) || 0,
    }

    await db.collection('analytics').updateOne({ slug }, { $set: doc }, { upsert: true })
    console.log(`  Migrated analytics: ${slug}`)
  }

  console.log('Migrating users...')
  const userKeys = await redis.keys('user:*')
  console.log(`Found ${userKeys.length} users`)

  for (const key of userKeys) {
    const username = key.replace(/^user:/, '')
    const item = await redis.hgetall(key)
    if (!item) continue

    const doc = {
      username,
      password: item.password || '',
      role: item.role || 'contributor',
      profileUrl: item.profileUrl || '',
      bio: item.bio || '',
    }

    await db.collection('users').updateOne({ username }, { $set: doc }, { upsert: true })
    console.log(`  Migrated user: ${username}`)
  }

  console.log('\nMigration complete!')
  console.log(`Prompts: ${promptKeys.length}`)
  console.log(`Analytics: ${analyticsKeys.length}`)
  console.log(`Users: ${userKeys.length}`)

  await client.close()
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
