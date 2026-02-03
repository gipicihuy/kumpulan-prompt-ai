import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const { id, kategori, judul, isi } = req.body

    if (!id || !kategori || !judul || !isi) {
      return res.status(400).json({ message: 'Missing fields' })
    }

    await redis.hset(`prompt:${id}`, {
      kategori,
      judul,
      isi
    })

    res.status(200).json({ success: true, message: 'Data berhasil disimpan' })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
}
