import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export default async function handler(req, res) {
  // Ambil slug dari query parameter
  const { slug } = req.query;
  
  if (!slug) {
    return res.status(404).send('Slug not found');
  }

  try {
    // Fetch data prompt dari Redis
    const promptData = await redis.hgetall(`prompt:${slug}`);
    
    if (!promptData || !promptData.judul) {
      return res.status(404).send('Prompt not found');
    }

    // Buat meta description dari description atau isi prompt
    const metaDescription = promptData.description && promptData.description.trim() !== ''
      ? promptData.description
      : (promptData.isi || '').substring(0, 150) + '...';
    
    // Gunakan imageUrl jika ada, kalau tidak pakai default
    const metaImage = promptData.imageUrl && promptData.imageUrl.trim() !== ''
      ? promptData.imageUrl
      : 'https://cdn.yupra.my.id/yp/xihcb4th.jpg';
    
    const pageTitle = `${promptData.judul} - AI Prompt Hub`;
    
    // Fetch profile URL dari user
    let profileUrl = '';
    if (promptData.uploadedBy) {
      const userData = await redis.hgetall(`user:${promptData.uploadedBy}`);
      profileUrl = userData?.profileUrl || '';
    }

    // Render HTML dengan meta tags yang sudah terisi
    const html = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle}</title>
    
    <!-- Meta tags untuk preview WhatsApp/Social Media -->
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="AI Prompt Hub">
    <meta property="og:title" content="${pageTitle}">
    <meta property="og:description" content="${metaDescription}">
    <meta property="og:image" content="${metaImage}">
    <meta name="description" content="${metaDescription}">
    
    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${pageTitle}">
    <meta name="twitter:description" content="${metaDescription}">
    <meta name="twitter:image" content="${metaImage}">
    
    <link rel="icon" type="image/jpeg" href="https://cdn.yupra.my.id/yp/xihcb4th.jpg">
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/izitoast@1.4.0/dist/css/iziToast.min.css">
    <script src="https://cdn.jsdelivr.net/npm/izitoast@1.4.0/dist/js/iziToast.min.js"></script>
    <style>
        body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
            background: linear-gradient(to bottom, #0f0f0f 0%, #1a1a1a 100%);
            color: #e5e5e5;
            min-height: 100vh;
        }
        .carbon-dots span { width: 10px; height: 10px; display: inline-block; background: #fff; }
        
        header {
            background: rgba(26, 26, 26, 0.8);
            backdrop-filter: blur(10px);
            border-bottom: 1px solid #2a2a2a;
        }
        
        .code-container {
            background: linear-gradient(135deg, #1a1a1a 0%, #1f1f1f 100%);
            border: 1px solid #2a2a2a;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        }
        
        .code-header {
            background: linear-gradient(135deg, #252525 0%, #2a2a2a 100%);
            border-bottom: 1px solid #2a2a2a;
        }
        
        .btn-icon {
            transition: all 0.3s ease;
            color: #888;
        }
        .btn-icon:hover {
            color: #e5e5e5;
            transform: scale(1.05);
        }
        
        .back-btn {
            transition: all 0.3s ease;
        }
        .back-btn:hover {
            color: #e5e5e5;
            transform: translateX(-2px);
        }
        
        .image-container {
            border: 1px solid #2a2a2a;
            background: linear-gradient(135deg, #1a1a1a 0%, #1f1f1f 100%);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        }
        
        .profile-pic {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            object-fit: cover;
            border: 1px solid #444;
        }
        
        .profile-pic-placeholder {
            width: 32px;
            height: 32px;
        }
    </style>
</head>
<body>
    <header class="sticky top-0 z-10 shadow-lg">
        <div class="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
            <a href="/" class="back-btn text-gray-400 font-bold text-xs flex items-center gap-2">
                <i class="fa-solid fa-arrow-left text-xs"></i> KEMBALI
            </a>
            <h1 class="text-xs font-bold text-gray-500 uppercase tracking-widest">Detail View</h1>
        </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 py-6">
        <div id="detailContent">
            <div class="mb-5 border-l-2 border-gray-400 pl-3">
                <span class="text-xs font-bold px-2 py-0.5 bg-gradient-to-r from-gray-200 to-white text-black rounded uppercase border border-gray-300">${promptData.kategori || 'Lainnya'}</span>
                <h2 class="text-xl font-bold text-white mt-3 uppercase tracking-tight leading-tight">${promptData.judul}</h2>
                <div class="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                    <div class="flex items-center gap-2">
                        <div>
                            ${profileUrl && profileUrl.trim() !== '' 
                                ? `<img src="${profileUrl}" class="profile-pic" alt="${promptData.uploadedBy || 'Admin'}">`
                                : `<div class="profile-pic-placeholder rounded-full bg-[#252525] flex items-center justify-center border border-[#444]">
                                     <i class="fa-solid fa-user text-sm text-gray-500"></i>
                                   </div>`
                            }
                        </div>
                        <span class="font-semibold text-white">Prompt by <span class="text-gray-300">@${promptData.uploadedBy || 'Admin'}</span></span>
                    </div>
                    <div class="flex items-center gap-1">
                        <i class="fa-solid fa-clock text-gray-300 text-[10px]"></i>
                        <span class="text-white text-[11px]">${promptData.createdAt || '-'}</span>
                    </div>
                </div>
            </div>
            
            ${promptData.description && promptData.description.trim() !== '' ? `
            <div class="mb-5">
                <h3 class="text-base font-extrabold text-white mb-2">
                    Description
                </h3>
                <hr class="border-0 h-px bg-[#2a2a2a] mb-2">
                <p class="text-sm text-gray-300 leading-relaxed mb-3">${promptData.description}</p>
                <hr class="border-0 h-px bg-[#2a2a2a]">
            </div>
            ` : ''}

            ${promptData.imageUrl && promptData.imageUrl.trim() !== '' ? `
            <div class="mb-5">
                <div class="image-container rounded-lg overflow-hidden">
                    <img src="${promptData.imageUrl}" class="w-full h-auto max-h-64 object-contain" alt="${promptData.judul}">
                </div>
            </div>
            ` : ''}

            <div class="code-container rounded-lg overflow-hidden mb-6">
                <div class="code-header px-4 py-2.5 flex justify-between items-center relative">
                    <div class="carbon-dots flex gap-1.5">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                    <div class="text-[10px] font-mono text-gray-400 uppercase tracking-wider absolute left-1/2 -translate-x-1/2">
                        ${slug}.txt
                    </div>
                    <div class="flex gap-3 items-center">
                        <button id="copyCodeBtn" title="Copy Prompt" class="btn-icon text-sm">
                            <i class="fa-solid fa-copy"></i>
                        </button>
                        <button id="downloadBtn" title="Download as .txt" class="btn-icon text-sm">
                            <i class="fa-solid fa-download"></i>
                        </button>
                    </div>
                </div>
                <div class="p-4 overflow-x-auto">
                    <pre><code class="text-gray-300 leading-relaxed whitespace-pre-wrap text-xs block font-mono">${promptData.isi || ''}</code></pre>
                </div>
            </div>
        </div>
    </main>

    <script>
        const promptData = ${JSON.stringify({
          judul: promptData.judul,
          isi: promptData.isi,
          slug: slug
        })};
        
        document.getElementById('copyCodeBtn').onclick = () => {
            navigator.clipboard.writeText(promptData.isi);
            iziToast.success({
                title: 'Berhasil!',
                message: 'Prompt berhasil disalin ke clipboard',
                position: 'topRight',
                timeout: 2000,
                backgroundColor: '#10b981',
                titleColor: '#fff',
                messageColor: '#fff',
                iconColor: '#fff',
                progressBarColor: '#059669'
            });
        };
        
        document.getElementById('downloadBtn').onclick = () => {
            const blob = new Blob([promptData.isi], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = \`\${promptData.judul.replace(/[^a-zA-Z0-9]/g, '_')}.txt\`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            iziToast.success({
                title: 'Download!',
                message: 'File berhasil didownload',
                position: 'topRight',
                timeout: 2000,
                backgroundColor: '#10b981',
                titleColor: '#fff',
                messageColor: '#fff',
                iconColor: '#fff',
                progressBarColor: '#059669'
            });
        };
    </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Internal Server Error');
  }
}
