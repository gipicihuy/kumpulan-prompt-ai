import { IncomingForm } from 'formidable'
import { readFile } from 'fs/promises'
import { fileTypeFromBuffer } from 'file-type'
import FormData from 'form-data'
import fetch from 'node-fetch'
import crypto from 'crypto'
import { Redis } from '@upstash/redis'

export const config = {
  api: {
    bodyParser: false,
  },
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

async function verifySession(token) {
  if (!token) return null
  const username = await redis.get(`session:${token}`)
  if (!username) return null
  const userData = await redis.hgetall(`user:${username}`)
  return { username, role: userData?.role || 'contributor' }
}

const uploadYupra = async (content) => {
  const { ext } = (await fileTypeFromBuffer(content)) || {}
  const filename = `${crypto.randomBytes(5).toString('hex')}.${ext || 'bin'}`
  const formData = new FormData()
  formData.append('files', content, filename)

  const response = await fetch('https://cdn.yupra.my.id/upload', {
    method: 'POST',
    body: formData,
    headers: {
      ...formData.getHeaders(),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  })

  const result = await response.json()
  if (!result.success || !result.files || result.files.length === 0) {
    throw new Error('Invalid response from cdn.yupra.my.id')
  }

  return `https://cdn.yupra.my.id${result.files[0].url}`
}

const uploadCatbox = async (content) => {
  const { ext } = (await fileTypeFromBuffer(content)) || {}
  const formData = new FormData()
  formData.append('fileToUpload', content, `${crypto.randomBytes(5).toString('hex')}.${ext || 'bin'}`)
  formData.append('reqtype', 'fileupload')

  const response = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: formData,
    headers: {
      ...formData.getHeaders(),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  })

  const result = await response.text()
  if (!result || !result.startsWith('http')) {
    throw new Error('Invalid response from catbox.moe')
  }

  return result
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  }

  const session = await verifySession(req.headers.authorization)
  if (!session) return res.status(403).json({ success: false, message: 'Sesi tidak valid atau sudah expired' })

  try {
    const form = new IncomingForm({ maxFileSize: 10 * 1024 * 1024, keepExtensions: true })

    const [, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err)
        else resolve([fields, files])
      })
    })

    const fileArray = files.file
    if (!fileArray || fileArray.length === 0) {
      return res.status(400).json({ success: false, message: 'Tidak ada file yang diupload' })
    }

    const fileBuffer = await readFile(fileArray[0].filepath)
    const fileType = await fileTypeFromBuffer(fileBuffer)

    if (!fileType || !fileType.mime.startsWith('image/')) {
      return res.status(400).json({ success: false, message: 'File harus berupa gambar (jpg, png, gif, webp)' })
    }

    let imageUrl
    try {
      imageUrl = await uploadYupra(fileBuffer)
    } catch {
      try {
        imageUrl = await uploadCatbox(fileBuffer)
      } catch (fallbackError) {
        return res.status(500).json({ success: false, message: 'Gagal mengupload ke semua layanan. Coba lagi nanti.' })
      }
    }

    return res.status(200).json({ success: true, imageUrl, message: 'Upload berhasil' })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Gagal mengupload gambar: ' + (error.message || 'Unknown error') })
  }
}
