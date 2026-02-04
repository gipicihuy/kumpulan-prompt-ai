import { IncomingForm } from 'formidable';
import { readFile } from 'fs/promises';
import { fileTypeFromBuffer } from 'file-type';
import FormData from 'form-data';
import fetch from 'node-fetch';

// Disable bodyParser untuk formidable
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Upload to tmpfiles.org
 * @param {Buffer} content File Buffer
 * @return {Promise<string>}
 */
const uploadPomf = async (content) => {
  try {
    const { ext, mime } = (await fileTypeFromBuffer(content)) || {};
    const timestamp = Date.now();
    const formData = new FormData();
    formData.append("file", content, `nao_tomori-${timestamp}-upload.${ext || "bin"}`);
    
    const response = await fetch(
      "https://tmpfiles.org/api/v1/upload",
      {
        method: "POST",
        body: formData,
        headers: {
          ...formData.getHeaders(),
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
        },
      }
    );
    
    const result = await response.json();
    const match = /https?:\/\/tmpfiles\.org\/(.*)/.exec(result.data.url);
    
    if (!match) {
      throw new Error("Invalid URL format in response");
    }
    
    return `https://tmpfiles.org/dl/${match[1]}`;
  } catch (error) {
    console.error("Upload to tmpfiles.org failed:", error.message || error);
    throw error;
  }
};

/**
 * Upload to telegra.ph (fallback option)
 * @param {Buffer} buffer Image Buffer
 * @return {Promise<string>}
 */
async function uploadToTelegraph(buffer) {
  console.log("Uploading to telegra.ph...");
  try {
    const { ext } = await fileTypeFromBuffer(buffer);
    const form = new FormData();
    form.append('file', buffer, 'tmp.' + ext);
    
    const res = await fetch('https://telegra.ph/upload', {
      method: 'POST',
      body: form
    });
    
    const img = await res.json();
    
    if (img.error) throw new Error(img.error);
    console.log("Uploaded to telegra.ph successfully!");
    return 'https://telegra.ph' + img[0].src;
  } catch (error) {
    console.error("Upload to telegra.ph failed:", error.message || error);
    throw error;
  }
}

export default async function handler(req, res) {
  // Cek method
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  // Cek authorization
  const authHeader = req.headers.authorization;
  if (authHeader !== 'admin-secret-key') {
    return res.status(403).json({ success: false, message: 'Tidak diizinkan' });
  }

  try {
    // Parse form dengan formidable
    const form = new IncomingForm({
      maxFileSize: 10 * 1024 * 1024, // 10MB max
      keepExtensions: true,
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    // Ambil file pertama
    const fileArray = files.file;
    if (!fileArray || fileArray.length === 0) {
      return res.status(400).json({ success: false, message: 'Tidak ada file yang diupload' });
    }

    const file = fileArray[0];
    
    // Baca file sebagai buffer
    const fileBuffer = await readFile(file.filepath);

    // Validasi tipe file (hanya gambar)
    const fileType = await fileTypeFromBuffer(fileBuffer);
    if (!fileType || !fileType.mime.startsWith('image/')) {
      return res.status(400).json({ 
        success: false, 
        message: 'File harus berupa gambar (jpg, png, gif, webp)' 
      });
    }

    // Upload ke tmpfiles.org
    let imageUrl;
    try {
      imageUrl = await uploadPomf(fileBuffer);
    } catch (uploadError) {
      // Fallback ke telegra.ph jika tmpfiles gagal
      console.log('Tmpfiles failed, trying telegra.ph...');
      imageUrl = await uploadToTelegraph(fileBuffer);
    }

    return res.status(200).json({ 
      success: true, 
      imageUrl: imageUrl,
      message: 'Upload berhasil' 
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Gagal mengupload gambar: ' + error.message 
    });
  }
}
