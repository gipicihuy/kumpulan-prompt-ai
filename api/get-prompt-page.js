import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

// Helper function untuk parse cookies
function parseCookies(cookieHeader) {
  const cookies = {}
  if (!cookieHeader) return cookies
  
  cookieHeader.split(';').forEach(cookie => {
    const [name, value] = cookie.trim().split('=')
    if (name && value) {
      cookies[name] = value
    }
  })
  return cookies
}

export default async function handler(req, res) {
  // Ambil slug dari request
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

    // Cek apakah prompt ini diproteksi dengan password
    const isProtected = promptData.isProtected === 'true' || promptData.isProtected === true;

    // Fetch profile URL dari user
    let profileUrl = '';
    if (promptData.uploadedBy) {
      const userData = await redis.hgetall(`user:${promptData.uploadedBy}`);
      profileUrl = userData?.profileUrl || '';
    }

    // Fetch analytics data - FIX NULL HANDLING!
    const analyticsKey = `analytics:${slug}`
    const analyticsData = await redis.hgetall(analyticsKey)
    
    // Safe default values kalau analytics belum ada
    const analytics = {
      views: analyticsData && analyticsData.views ? parseInt(analyticsData.views) : 0,
      copies: analyticsData && analyticsData.copies ? parseInt(analyticsData.copies) : 0,
      downloads: analyticsData && analyticsData.downloads ? parseInt(analyticsData.downloads) : 0
    }

    // Jika diproteksi
    if (isProtected) {
      // Parse cookies dari request
      const cookies = parseCookies(req.headers.cookie)
      const sessionToken = cookies[`prompt_session_${slug}`]
      
      if (!sessionToken) {
        // Tidak ada session cookie, tampilkan halaman password input
        return res.status(200).send(renderPasswordPage(slug, promptData, profileUrl));
      }
      
      // Ada session token, validate di Redis
      const sessionKey = `session:${slug}:${sessionToken}`
      const isValidSession = await redis.get(sessionKey)
      
      if (isValidSession === 'valid') {
        // Session valid! Tampilkan halaman normal
        return res.status(200).send(renderNormalPage(slug, promptData, profileUrl, analytics));
      } else {
        // Session invalid/expired, hapus cookie dan tampilkan password page
        res.setHeader('Set-Cookie', [
          `prompt_session_${slug}=; Path=/; Max-Age=0`,
        ])
        return res.status(200).send(renderPasswordPage(slug, promptData, profileUrl));
      }
    }

    // Jika tidak diproteksi, tampilkan halaman normal
    return res.status(200).send(renderNormalPage(slug, promptData, profileUrl, analytics));
    
  } catch (error) {
    console.error('❌ Error in get-prompt-page:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Error - AI Prompt Hub</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
          <style>
              body { 
                  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
                  background: linear-gradient(to bottom, #0f0f0f 0%, #1a1a1a 100%);
                  color: #e5e5e5;
                  min-height: 100vh;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  padding: 1rem;
              }
          </style>
      </head>
      <body>
          <div class="max-w-lg mx-auto bg-gradient-to-br from-[#1a1a1a] to-[#1f1f1f] border border-red-900/50 p-8 rounded-xl text-center shadow-xl">
              <i class="fa-solid fa-exclamation-triangle text-red-500 text-5xl mb-4 block"></i>
              <h2 class="text-red-400 font-bold text-2xl uppercase mb-4">Internal Server Error</h2>
              <p class="text-gray-400 text-sm mb-6 font-mono">${error.message}</p>
              <a href="/" class="inline-block bg-gradient-to-r from-gray-200 to-white text-black px-6 py-3 rounded-lg text-sm font-bold uppercase hover:from-gray-300 hover:to-gray-100 transition-all shadow-lg hover:shadow-xl">
                  <i class="fa-solid fa-home mr-2"></i>Back to Home
              </a>
          </div>
      </body>
      </html>
    `);
  }
}

// Fungsi untuk render halaman password input
function renderPasswordPage(slug, promptData, profileUrl = '') {
  const pageTitle = `${promptData.judul} - AI Prompt Hub`;
  const metaDescription = promptData.description || 'Prompt ini diproteksi dengan password';
  const metaImage = promptData.imageUrl || 'https://cdn.yupra.my.id/yp/xihcb4th.jpg';

  // Render profile picture seperti di detail view
  const profilePicHtml = profileUrl && profileUrl.trim() !== '' 
    ? `<img src="${profileUrl}" class="profile-pic" alt="${promptData.uploadedBy}">`
    : `<div class="profile-pic-placeholder rounded-full bg-[#252525] flex items-center justify-center border border-[#444]">
         <i class="fa-solid fa-user text-sm text-gray-500"></i>
       </div>`;

  return `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle}</title>
    
    <!-- Meta tags -->
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="AI Prompt Hub">
    <meta property="og:title" content="${pageTitle}">
    <meta property="og:description" content="${metaDescription}">
    <meta property="og:image" content="${metaImage}">
    <meta name="description" content="${metaDescription}">
    
    <link rel="icon" type="image/jpeg" href="https://cdn.yupra.my.id/yp/xihcb4th.jpg">
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    
    <!-- ✅ Notyf CSS -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/notyf@3/notyf.min.css">
    
    <style>
        body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
            background: linear-gradient(to bottom, #0f0f0f 0%, #1a1a1a 100%);
            color: #e5e5e5;
            min-height: 100vh;
        }
        header {
            background: rgba(26, 26, 26, 0.8);
            backdrop-filter: blur(10px);
            border-bottom: 1px solid #2a2a2a;
        }
        .password-container {
            background: linear-gradient(135deg, #1a1a1a 0%, #1f1f1f 100%);
            border: 1px solid #2a2a2a;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        }
        input { 
            background-color: #1a1a1a !important; 
            border-color: #2a2a2a !important;
            transition: all 0.3s ease;
        }
        input:focus { 
            border-color: #444 !important; 
            background-color: #1f1f1f !important;
            box-shadow: 0 0 0 3px rgba(68, 68, 68, 0.1);
        }
        .btn-primary {
            background: linear-gradient(135deg, #e5e5e5 0%, #f5f5f5 100%);
            transition: all 0.3s ease;
        }
        .btn-primary:hover {
            background: linear-gradient(135deg, #f5f5f5 0%, #ffffff 100%);
            box-shadow: 0 4px 12px rgba(229, 229, 229, 0.2);
            transform: translateY(-1px);
        }
        .btn-primary:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
        .back-btn {
            transition: all 0.3s ease;
        }
        .back-btn:hover {
            color: #e5e5e5;
            transform: translateX(-2px);
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
        .lock-icon-large {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
            border: 2px solid #333;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 1.5rem;
        }
        .toggle-password-btn {
            cursor: pointer;
            user-select: none;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            transition: color 0.2s ease;
        }
        .toggle-password-btn i {
            display: flex;
            align-items: center;
            justify-content: center;
        }
    </style>
</head>
<body>
    <header class="sticky top-0 z-10 shadow-lg">
        <div class="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
            <a href="/" class="back-btn text-gray-400 font-bold text-xs flex items-center gap-2">
                <i class="fa-solid fa-arrow-left text-xs"></i> KEMBALI
            </a>
            <h1 class="text-xs font-bold text-gray-500 uppercase tracking-widest">Protected Content</h1>
        </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 py-6">
        <!-- Header Info - sama seperti detail view -->
        <div class="mb-5 border-l-2 border-gray-400 pl-3">
            <span class="text-xs font-bold px-2 py-0.5 bg-gradient-to-r from-gray-200 to-white text-black rounded uppercase border border-gray-300">
                ${promptData.kategori || 'Lainnya'}
            </span>
            <h2 class="text-xl font-bold text-white mt-3 uppercase tracking-tight leading-tight flex items-center gap-2">
                ${promptData.judul}
                <i class="fa-solid fa-lock text-yellow-500 text-base"></i>
            </h2>
            <div class="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                <div class="flex items-center gap-2">
                    ${profilePicHtml}
                    <span class="font-semibold text-white">Prompt by <span class="text-gray-300">@${promptData.uploadedBy || 'Admin'}</span></span>
                </div>
                <div class="flex items-center gap-1">
                    <i class="fa-solid fa-clock text-gray-300 text-[10px]"></i>
                    <span class="text-white text-[11px]">${promptData.createdAt || '-'}</span>
                </div>
            </div>
        </div>

        <!-- Password Form Container -->
        <div class="password-container rounded-lg overflow-hidden">
            <!-- Lock Icon Section -->
            <div class="p-8 text-center border-b border-[#2a2a2a]">
                <div class="lock-icon-large rounded-full">
                    <i class="fa-solid fa-lock text-3xl text-yellow-500"></i>
                </div>
                <h3 class="text-lg font-bold text-white mb-2 uppercase tracking-tight">Password Required</h3>
                <p class="text-sm text-gray-400 leading-relaxed max-w-md mx-auto">
                    This content is password protected. Please enter the password to view the full prompt.
                </p>
            </div>

            <!-- Password Form -->
            <div class="p-8">
                <form id="passwordForm" class="space-y-5 max-w-md mx-auto">
                    <div>
                        <label class="text-sm font-bold text-gray-400 uppercase mb-2 block flex items-center gap-2">
                            <i class="fa-solid fa-key text-xs"></i>
                            Enter Password
                        </label>
                        <div class="relative">
                            <input 
                                type="password" 
                                id="passwordInput" 
                                placeholder="••••••••" 
                                required 
                                class="w-full p-4 pr-12 rounded-xl border outline-none text-white text-base"
                                autocomplete="off"
                            >
                            <button 
                                type="button" 
                                id="togglePasswordBtn" 
                                onclick="togglePasswordVisibility()"
                                class="toggle-password-btn absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-all"
                                title="Show/Hide Password"
                            >
                                <i class="fa-solid fa-eye text-sm"></i>
                            </button>
                        </div>
                    </div>
                    <button type="submit" class="w-full btn-primary text-black font-bold py-4 rounded-xl uppercase tracking-widest text-sm">
                        <i class="fa-solid fa-unlock mr-2"></i>Unlock Prompt
                    </button>
                </form>
            </div>

            <!-- Footer Info -->
            <div class="px-8 pb-8 pt-4 border-t border-[#2a2a2a]">
                <div class="bg-[#0f0f0f] rounded-lg p-4 border border-[#2a2a2a]">
                    <p class="text-xs text-gray-400 text-center mb-2">
                        <i class="fa-solid fa-info-circle mr-1 text-gray-300"></i>
                        Don't have the password?
                    </p>
                    <p class="text-xs text-white text-center font-semibold">
                        Contact <span class="text-gray-300">@${promptData.uploadedBy}</span> for access
                    </p>
                </div>
            </div>
        </div>
    </main>

    <!-- ✅ Notyf JS -->
    <script src="https://cdn.jsdelivr.net/npm/notyf@3/notyf.min.js"></script>
    
    <script>
        // ✅ Initialize Notyf dengan minimal config - gunakan default styling
        const notyf = new Notyf({
            duration: 3000,
            position: {
                x: 'right',
                y: 'top',
            },
            ripple: true,
            dismissible: true
        });

        // Toggle password visibility
        function togglePasswordVisibility() {
            const passwordInput = document.getElementById('passwordInput');
            const toggleBtn = document.getElementById('togglePasswordBtn');
            const icon = toggleBtn.querySelector('i');
            
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
                toggleBtn.setAttribute('title', 'Hide Password');
            } else {
                passwordInput.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
                toggleBtn.setAttribute('title', 'Show Password');
            }
        }

        document.getElementById('passwordForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const btn = this.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Verifying...';
            btn.disabled = true;

            const password = document.getElementById('passwordInput').value;

            try {
                const response = await fetch('/api/verify-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        slug: '${slug}',
                        password: password
                    })
                });

                const result = await response.json();

                if (result.success) {
                    // ✅ Password benar! Gunakan default success notification
                    notyf.success('Access granted! Redirecting...');
                    
                    // Redirect setelah 1 detik
                    setTimeout(() => {
                        window.location.href = '/prompt/${slug}';
                    }, 1000);
                } else {
                    // ✅ Password salah - gunakan default error notification
                    notyf.error(result.message || 'Incorrect password');
                    document.getElementById('passwordInput').value = '';
                    document.getElementById('passwordInput').focus();
                }
            } catch (error) {
                console.error('Error:', error);
                notyf.error('An error occurred. Please try again.');
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        });

        // Auto focus ke input password
        document.getElementById('passwordInput').focus();
    </script>
</body>
</html>`;
}

// Fungsi untuk render halaman normal (tanpa password) - DENGAN ANALYTICS TRACKING
function renderNormalPage(slug, promptData, profileUrl = '', analytics = { views: 0, copies: 0, downloads: 0 }) {
  const metaDescription = promptData.description && promptData.description.trim() !== ''
    ? promptData.description
    : (promptData.isi || '').substring(0, 150) + '...';
  
  const metaImage = promptData.imageUrl && promptData.imageUrl.trim() !== ''
    ? promptData.imageUrl
    : 'https://cdn.yupra.my.id/yp/xihcb4th.jpg';
  
  const pageTitle = `${promptData.judul} - AI Prompt Hub`;

  // Helper function untuk format number
  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  return `<!DOCTYPE html>
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
    
    <!-- ✅ Notyf CSS -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/notyf@3/notyf.min.css">
    
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

        /* Fullscreen Modal */
        .fullscreen-modal {
            position: fixed;
            inset: 0;
            background: rgba(15, 15, 15, 0.98);
            backdrop-filter: blur(8px);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
        }
        
        .fullscreen-image-wrapper {
            position: relative;
            max-width: 100%;
            max-height: 100%;
        }
        
        .fullscreen-modal img {
            max-width: 100%;
            max-height: 100vh;
            object-fit: contain;
            border-radius: 8px;
        }
        
        .fullscreen-close {
            position: absolute;
            top: 1rem;
            right: 1rem;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .fullscreen-close:hover {
            transform: scale(1.1);
        }
        
        .fullscreen-close:active {
            transform: scale(0.95);
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
                
                <!-- Analytics Section -->
                <div class="mt-3 flex flex-wrap gap-3">
                    <div class="flex items-center gap-1.5" title="Total Views">
                        <i class="fa-solid fa-eye text-[11px] text-gray-400"></i>
                        <span id="viewsCount" class="text-xs font-bold text-gray-300">${formatNumber(analytics.views)}</span>
                    </div>
                    <div class="flex items-center gap-1.5" title="Total Copies">
                        <i class="fa-solid fa-copy text-[11px] text-gray-400"></i>
                        <span id="copiesCount" class="text-xs font-bold text-gray-300">${formatNumber(analytics.copies)}</span>
                    </div>
                    <div class="flex items-center gap-1.5" title="Total Downloads">
                        <i class="fa-solid fa-download text-[11px] text-gray-400"></i>
                        <span id="downloadsCount" class="text-xs font-bold text-gray-300">${formatNumber(analytics.downloads)}</span>
                    </div>
                </div>
            </div>
            
            ${promptData.description && promptData.description.trim() !== '' ? `
            <div class="mb-5">
                <h3 class="text-base font-extrabold text-white mb-2">
                    Description
                </h3>
                <hr class="border-0 h-px bg-[#2a2a2a] mb-2">
                <p class="text-sm text-gray-300 leading-relaxed mb-3" style="white-space: pre-line;">${promptData.description}</p>
                <hr class="border-0 h-px bg-[#2a2a2a]">
            </div>
            ` : ''}

            ${promptData.imageUrl && promptData.imageUrl.trim() !== '' ? `
            <div class="mb-5">
                <div class="image-container rounded-lg overflow-hidden relative">
                    <img src="${promptData.imageUrl}" class="w-full h-auto max-h-64 object-contain" alt="${promptData.judul}">
                    <button onclick="openFullscreen('${promptData.imageUrl}')" class="absolute bottom-3 right-3 w-9 h-9 flex items-center justify-center transition-all hover:scale-110 active:scale-95" title="Fullscreen">
                        <img src="/assets/open_in_full.svg" class="w-6 h-6" alt="Fullscreen">
                    </button>
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
                    <div class="text-xs font-bold text-white uppercase tracking-wider absolute left-1/2 -translate-x-1/2">
                        Prompt
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

    <!-- Fullscreen Modal -->
    <div id="fullscreenModal" class="hidden fullscreen-modal" onclick="closeFullscreen(event)">
        <div class="fullscreen-image-wrapper">
            <img id="fullscreenImage" src="" alt="Fullscreen">
            <button class="fullscreen-close" onclick="closeFullscreen(event)">
                <img src="/assets/close.svg" class="w-6 h-6" alt="Close">
            </button>
        </div>
    </div>

    <!-- ✅ Notyf JS -->
    <script src="https://cdn.jsdelivr.net/npm/notyf@3/notyf.min.js"></script>
    
    <script>
        const promptData = ${JSON.stringify({
          judul: promptData.judul,
          isi: promptData.isi,
          slug: slug
        })};
        
        // ✅ Initialize Notyf dengan minimal config - gunakan default styling
        const notyf = new Notyf({
            duration: 2500,
            position: {
                x: 'right',
                y: 'top',
            },
            ripple: true,
            dismissible: true
        });
        
        // Format number helper
        function formatNumber(num) {
            if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
            if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
            return num.toString();
        }
        
        // Update analytics display
        function updateAnalyticsDisplay(analytics) {
            document.getElementById('viewsCount').innerText = formatNumber(analytics.views);
            document.getElementById('copiesCount').innerText = formatNumber(analytics.copies);
            document.getElementById('downloadsCount').innerText = formatNumber(analytics.downloads);
        }
        
        // Track analytics
        async function trackAnalytics(action) {
            try {
                const response = await fetch('/api/analytics', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ slug: promptData.slug, action })
                });
                const result = await response.json();
                if (result.success && result.analytics) {
                    updateAnalyticsDisplay(result.analytics);
                }
            } catch (error) {
                console.error('Error tracking analytics:', error);
            }
        }
        
        // Track view after 2 seconds
        setTimeout(() => {
            trackAnalytics('view');
        }, 2000);
        
        // Copy button
        document.getElementById('copyCodeBtn').onclick = async () => {
            navigator.clipboard.writeText(promptData.isi);
            await trackAnalytics('copy');
            // ✅ Gunakan default success notification
            notyf.success('Copied to clipboard!');
        };
        
        // Download button
        document.getElementById('downloadBtn').onclick = async () => {
            const blob = new Blob([promptData.isi], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = \`\${promptData.judul.replace(/[^a-zA-Z0-9]/g, '_')}.txt\`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            await trackAnalytics('download');
            // ✅ Gunakan default success notification
            notyf.success('Downloaded successfully!');
        };

        // Fullscreen functions
        function openFullscreen(imageUrl) {
            const modal = document.getElementById('fullscreenModal');
            const img = document.getElementById('fullscreenImage');
            img.src = imageUrl;
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }

        function closeFullscreen(event) {
            if (event) event.stopPropagation();
            const modal = document.getElementById('fullscreenModal');
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        }

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeFullscreen();
            }
        });
    </script>
</body>
</html>`;
}
