import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

function parseCookies(cookieHeader) {
  const cookies = {}
  if (!cookieHeader) return cookies
  cookieHeader.split(';').forEach(cookie => {
    const [name, value] = cookie.trim().split('=')
    if (name && value) cookies[name] = value
  })
  return cookies
}

function linkify(text) {
  if (!text) return '';
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return escaped.replace(/(https?:\/\/[^\s<>"]+)/g, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="description-link">${url}</a>`;
  });
}

const THEME_CSS = `
    :root, [data-theme="dark"] {
        --bg-base:        #0f0f0f;
        --bg-surface:     #1a1a1a;
        --bg-surface2:    #1f1f1f;
        --bg-surface3:    #252525;
        --border:         #2a2a2a;
        --border-hover:   #444;
        --text-primary:   #e5e5e5;
        --text-secondary: #9ca3af;
        --text-muted:     #6b7280;
        --header-bg:      rgba(26,26,26,0.8);
        --input-bg:       #1a1a1a;
        --input-focus:    #1f1f1f;
        --code-bg-from:   #1a1a1a;
        --code-bg-to:     #1f1f1f;
        --code-hdr-from:  #252525;
        --code-hdr-to:    #2a2a2a;
        --shadow:         rgba(0,0,0,0.4);
    }
    [data-theme="light"] {
        --bg-base:        #f4f4f5;
        --bg-surface:     #ffffff;
        --bg-surface2:    #f9f9f9;
        --bg-surface3:    #f0f0f0;
        --border:         #e4e4e7;
        --border-hover:   #a1a1aa;
        --text-primary:   #18181b;
        --text-secondary: #52525b;
        --text-muted:     #71717a;
        --header-bg:      rgba(255,255,255,0.9);
        --input-bg:       #ffffff;
        --input-focus:    #f9f9f9;
        --code-bg-from:   #ffffff;
        --code-bg-to:     #f9f9f9;
        --code-hdr-from:  #f0f0f0;
        --code-hdr-to:    #e8e8e8;
        --shadow:         rgba(0,0,0,0.06);
    }
`;

const THEME_INIT = `(function(){var t=localStorage.getItem('prompthub-theme')||'dark';document.documentElement.setAttribute('data-theme',t);})();`;

export default async function handler(req, res) {
  const { slug } = req.query;

  if (!slug) {
    return res.status(404).send('Slug not found');
  }

  try {
    const promptData = await redis.hgetall(`prompt:${slug}`);

    if (!promptData || !promptData.judul) {
      return res.status(404).send('Prompt not found');
    }

    const isProtected = promptData.isProtected === 'true' || promptData.isProtected === true;

    let profileUrl = '';
    if (promptData.uploadedBy) {
      const userData = await redis.hgetall(`user:${promptData.uploadedBy}`);
      profileUrl = userData?.profileUrl || '';
    }

    const analyticsKey  = `analytics:${slug}`;
    const analyticsData = await redis.hgetall(analyticsKey);

    const analytics = {
      views:     analyticsData && analyticsData.views     ? parseInt(analyticsData.views)     : 0,
      copies:    analyticsData && analyticsData.copies    ? parseInt(analyticsData.copies)    : 0,
      downloads: analyticsData && analyticsData.downloads ? parseInt(analyticsData.downloads) : 0,
    };

    if (!isProtected) {
      try {
        await redis.hincrby(analyticsKey, 'views', 1);
        analytics.views += 1;
      } catch (e) {
        console.error('Failed to track view:', e);
      }
    }

    const cookies = parseCookies(req.headers.cookie);

    if (isProtected) {
      const sessionToken = cookies[`prompt_session_${slug}`];

      if (!sessionToken) {
        return res.status(200).send(renderPasswordPage(slug, promptData, profileUrl));
      }

      const sessionKey    = `session:${slug}:${sessionToken}`;
      const isValidSession = await redis.get(sessionKey);

      if (isValidSession === 'valid') {
        try {
          await redis.hincrby(analyticsKey, 'views', 1);
          analytics.views += 1;
        } catch (e) {
          console.error('Failed to track view:', e);
        }
        return res.status(200).send(renderNormalPage(slug, promptData, profileUrl, analytics));
      } else {
        res.setHeader('Set-Cookie', [`prompt_session_${slug}=; Path=/; Max-Age=0`]);
        return res.status(200).send(renderPasswordPage(slug, promptData, profileUrl));
      }
    }

    return res.status(200).send(renderNormalPage(slug, promptData, profileUrl, analytics));

  } catch (error) {
    console.error('Error in get-prompt-page:', error);
    res.status(500).send(`<!DOCTYPE html>
<html lang="id" data-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error - AI Prompt Hub</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script>${THEME_INIT}</script>
    <style>
        ${THEME_CSS}
        body { font-family: 'Inter', sans-serif; background: linear-gradient(to bottom, var(--bg-base), var(--bg-surface)); color: var(--text-primary); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1rem; }
    </style>
</head>
<body>
    <div class="max-w-lg mx-auto p-8 rounded-xl text-center shadow-xl" style="background:linear-gradient(135deg,var(--bg-surface),var(--bg-surface2));border:1px solid var(--border)">
        <i class="fa-solid fa-exclamation-triangle text-red-500 text-5xl mb-4 block"></i>
        <h2 class="font-bold text-2xl uppercase mb-4" style="color:#f87171">Internal Server Error</h2>
        <p class="text-sm mb-6 font-mono" style="color:var(--text-muted)">${error.message}</p>
        <a href="/" class="inline-block px-6 py-3 rounded-lg text-sm font-bold uppercase" style="background:var(--text-primary);color:var(--bg-base)">
            <i class="fa-solid fa-home mr-2"></i>Back to Home
        </a>
    </div>
</body>
</html>`);
  }
}

function renderPasswordPage(slug, promptData, profileUrl = '') {
  const pageTitle = `${promptData.judul} - AI Prompt Hub`;
  const metaDesc  = promptData.description || 'Prompt ini diproteksi dengan password';
  const metaImage = promptData.imageUrl || 'https://cdn.yupra.my.id/yp/xihcb4th.jpg';

  const profilePicHtml = profileUrl && profileUrl.trim() !== ''
    ? `<img src="${profileUrl}" class="profile-pic" alt="${promptData.uploadedBy}">`
    : `<div class="profile-pic-placeholder rounded-full flex items-center justify-center" style="background:var(--bg-surface3);border:1px solid var(--border-hover)"><i class="fa-solid fa-user text-sm" style="color:var(--text-muted)"></i></div>`;

  return `<!DOCTYPE html>
<html lang="id" data-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle}</title>
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="AI Prompt Hub">
    <meta property="og:title" content="${pageTitle}">
    <meta property="og:description" content="${metaDesc}">
    <meta property="og:image" content="${metaImage}">
    <meta name="description" content="${metaDesc}">
    <link rel="icon" type="image/jpeg" href="https://cdn.yupra.my.id/yp/xihcb4th.jpg">
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/notyf@3/notyf.min.css">
    <script>${THEME_INIT}</script>
    <style>
        ${THEME_CSS}
        * { box-sizing: border-box; }
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: linear-gradient(to bottom, var(--bg-base) 0%, var(--bg-surface) 100%); color: var(--text-primary); min-height: 100vh; transition: background 0.25s, color 0.25s; }
        header { background: var(--header-bg); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); }
        .password-container { background: linear-gradient(135deg, var(--bg-surface) 0%, var(--bg-surface2) 100%); border: 1px solid var(--border); box-shadow: 0 8px 24px var(--shadow); }
        input { background-color: var(--input-bg) !important; border-color: var(--border) !important; color: var(--text-primary) !important; transition: all 0.3s ease; }
        input:focus { border-color: var(--border-hover) !important; background-color: var(--input-focus) !important; box-shadow: 0 0 0 3px rgba(128,128,128,0.1); }
        input::placeholder { color: var(--text-muted) !important; }
        .btn-primary { background: linear-gradient(135deg, var(--text-secondary) 0%, var(--text-primary) 100%); color: var(--bg-base); transition: all 0.3s ease; }
        .btn-primary:hover { box-shadow: 0 4px 12px rgba(128,128,128,0.2); transform: translateY(-1px); }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .back-btn { transition: all 0.3s ease; color: var(--text-muted); }
        .back-btn:hover { color: var(--text-primary); transform: translateX(-2px); }
        .profile-pic { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border-hover); }
        .profile-pic-placeholder { width: 32px; height: 32px; }
        .lock-icon-large { width: 80px; height: 80px; background: linear-gradient(135deg, var(--bg-surface3) 0%, var(--bg-surface2) 100%); border: 2px solid var(--border-hover); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem; }
        .toggle-password-btn { cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; transition: color 0.2s ease; background: none; border: none; color: var(--text-muted); }
        .toggle-password-btn:hover { color: var(--text-primary); }
    </style>
</head>
<body>
    <header class="sticky top-0 z-10 shadow-lg">
        <div class="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
            <a href="/" class="back-btn font-bold text-xs flex items-center gap-2">
                <i class="fa-solid fa-arrow-left text-xs"></i> KEMBALI
            </a>
            <h1 class="text-xs font-bold uppercase tracking-widest" style="color:var(--text-muted)">Protected Content</h1>
        </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 py-6">
        <div class="mb-5 border-l-2 pl-3" style="border-color:var(--border-hover)">
            <span class="text-xs font-bold px-2 py-0.5 rounded uppercase" style="background:var(--text-primary);color:var(--bg-base);border:1px solid var(--border-hover)">${promptData.kategori || 'Lainnya'}</span>
            <h2 class="text-xl font-bold mt-3 uppercase tracking-tight leading-tight flex items-center gap-2" style="color:var(--text-primary)">
                ${promptData.judul}
                <i class="fa-solid fa-lock text-yellow-500 text-base"></i>
            </h2>
            <div class="mt-3 flex flex-wrap items-center gap-3 text-xs" style="color:var(--text-muted)">
                <div class="flex items-center gap-2">
                    ${profilePicHtml}
                    <span class="font-semibold" style="color:var(--text-primary)">Uploaded by <span style="color:var(--text-secondary)">@${promptData.uploadedBy || 'Admin'}</span></span>
                </div>
                <div class="flex items-center gap-1">
                    <i class="fa-solid fa-clock text-[10px]" style="color:var(--text-secondary)"></i>
                    <span class="text-[11px]" style="color:var(--text-primary)">${promptData.createdAt || '-'}</span>
                </div>
            </div>
        </div>

        <div class="password-container rounded-lg overflow-hidden">
            <div class="p-8 text-center" style="border-bottom:1px solid var(--border)">
                <div class="lock-icon-large rounded-full">
                    <i class="fa-solid fa-lock text-3xl text-yellow-500"></i>
                </div>
                <h3 class="text-lg font-bold mb-2 uppercase tracking-tight" style="color:var(--text-primary)">Password Required</h3>
                <p class="text-sm leading-relaxed max-w-md mx-auto" style="color:var(--text-secondary)">
                    This content is password protected. Please enter the password to view the full prompt.
                </p>
            </div>
            <div class="p-8">
                <form id="passwordForm" class="space-y-5 max-w-md mx-auto">
                    <div>
                        <label class="text-sm font-bold uppercase mb-2 flex items-center gap-2" style="color:var(--text-muted)">
                            <i class="fa-solid fa-key text-xs"></i> Enter Password
                        </label>
                        <div class="relative">
                            <input type="password" id="passwordInput" placeholder="••••••••" required
                                class="w-full p-4 pr-12 rounded-xl border outline-none text-base" autocomplete="off">
                            <button type="button" id="togglePasswordBtn" onclick="togglePasswordVisibility()"
                                class="toggle-password-btn absolute right-4 top-1/2 -translate-y-1/2"
                                title="Show/Hide Password">
                                <i class="fa-solid fa-eye text-sm"></i>
                            </button>
                        </div>
                    </div>
                    <button type="submit" class="w-full btn-primary font-bold py-4 rounded-xl uppercase tracking-widest text-sm">
                        <i class="fa-solid fa-unlock mr-2"></i>Unlock Prompt
                    </button>
                </form>
            </div>
            <div class="px-8 pb-8 pt-4" style="border-top:1px solid var(--border)">
                <div class="rounded-lg p-4" style="background:var(--bg-base);border:1px solid var(--border)">
                    <p class="text-xs text-center mb-2" style="color:var(--text-muted)">
                        <i class="fa-solid fa-info-circle mr-1" style="color:var(--text-secondary)"></i> Don't have the password?
                    </p>
                    <p class="text-xs text-center font-semibold" style="color:var(--text-primary)">
                        Contact <span style="color:var(--text-secondary)">@${promptData.uploadedBy}</span> for access
                    </p>
                </div>
            </div>
        </div>
    </main>

    <script src="https://cdn.jsdelivr.net/npm/notyf@3/notyf.min.js"></script>
    <script>
        const notyf = new Notyf({ duration: 3000, position: { x: 'right', y: 'top' }, ripple: true, dismissible: true });

        function togglePasswordVisibility() {
            const pi   = document.getElementById('passwordInput');
            const icon = document.getElementById('togglePasswordBtn').querySelector('i');
            if (pi.type === 'password') { pi.type = 'text';     icon.className = 'fa-solid fa-eye-slash text-sm'; }
            else                        { pi.type = 'password'; icon.className = 'fa-solid fa-eye text-sm'; }
        }

        document.getElementById('passwordForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const btn  = this.querySelector('button[type="submit"]');
            const orig = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Verifying...';
            btn.disabled  = true;
            const password = document.getElementById('passwordInput').value;
            try {
                const res    = await fetch('/api/verify-password', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ slug: '${slug}', password })
                });
                const result = await res.json();
                if (result.success) {
                    notyf.success('Access granted! Redirecting...');
                    setTimeout(() => { window.location.href = '/prompt/${slug}'; }, 1000);
                } else {
                    notyf.error(result.message || 'Incorrect password');
                    document.getElementById('passwordInput').value = '';
                    document.getElementById('passwordInput').focus();
                }
            } catch(e) { notyf.error('An error occurred. Please try again.'); }
            finally { btn.innerHTML = orig; btn.disabled = false; }
        });

        document.getElementById('passwordInput').focus();
    </script>
</body>
</html>`;
}

function renderNormalPage(slug, promptData, profileUrl = '', analytics = { views: 0, copies: 0, downloads: 0 }) {
  const metaDesc = promptData.description && promptData.description.trim() !== ''
    ? promptData.description
    : (promptData.isi || '').substring(0, 150) + '...';

  const metaImage = promptData.imageUrl && promptData.imageUrl.trim() !== ''
    ? promptData.imageUrl
    : 'https://cdn.yupra.my.id/yp/xihcb4th.jpg';

  const pageTitle = `${promptData.judul} - AI Prompt Hub`;

  const fmt = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000)    return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  return `<!DOCTYPE html>
<html lang="id" data-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle}</title>
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="AI Prompt Hub">
    <meta property="og:title" content="${pageTitle}">
    <meta property="og:description" content="${metaDesc}">
    <meta property="og:image" content="${metaImage}">
    <meta name="description" content="${metaDesc}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${pageTitle}">
    <meta name="twitter:description" content="${metaDesc}">
    <meta name="twitter:image" content="${metaImage}">
    <link rel="icon" type="image/jpeg" href="https://cdn.yupra.my.id/yp/xihcb4th.jpg">
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/notyf@3/notyf.min.css">
    <script>${THEME_INIT}</script>
    <style>
        ${THEME_CSS}
        * { box-sizing: border-box; }
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: linear-gradient(to bottom, var(--bg-base) 0%, var(--bg-surface) 100%); color: var(--text-primary); min-height: 100vh; transition: background 0.25s, color 0.25s; }
        .carbon-dots span { width: 10px; height: 10px; display: inline-block; background: var(--text-primary); border-radius: 50%; opacity: 0.4; }
        header { background: var(--header-bg); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); }
        .code-container { background: linear-gradient(135deg, var(--code-bg-from) 0%, var(--code-bg-to) 100%); border: 1px solid var(--border); box-shadow: 0 8px 24px var(--shadow); }
        .code-header { background: linear-gradient(135deg, var(--code-hdr-from) 0%, var(--code-hdr-to) 100%); border-bottom: 1px solid var(--border); }
        .btn-icon { transition: all 0.3s ease; color: var(--text-muted); background: none; border: none; cursor: pointer; }
        .btn-icon:hover { color: var(--text-primary); transform: scale(1.05); }
        .back-btn { transition: all 0.3s ease; color: var(--text-muted); }
        .back-btn:hover { color: var(--text-primary); transform: translateX(-2px); }
        .image-container { border: 1px solid var(--border); background: linear-gradient(135deg, var(--bg-surface) 0%, var(--bg-surface2) 100%); box-shadow: 0 8px 24px var(--shadow); }
        .profile-pic { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border-hover); }
        .profile-pic-placeholder { width: 32px; height: 32px; }
        .fullscreen-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.97); backdrop-filter: blur(8px); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 1rem; }
        .fullscreen-image-wrapper { position: relative; max-width: 100%; max-height: 100%; }
        .fullscreen-modal img { max-width: 100%; max-height: 100vh; object-fit: contain; border-radius: 8px; }
        .fullscreen-close { position: absolute; top: 1rem; right: 1rem; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.3s ease; }
        .fullscreen-close:hover { transform: scale(1.1); }
        .description-link { color: var(--text-primary); text-decoration: underline; text-underline-offset: 2px; word-break: break-all; transition: color 0.2s ease; }
        .description-link:hover { color: var(--text-secondary); }
        pre code { color: var(--text-secondary) !important; }
    </style>
</head>
<body>
    <header class="sticky top-0 z-10 shadow-lg">
        <div class="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
            <a href="/" class="back-btn font-bold text-xs flex items-center gap-2">
                <i class="fa-solid fa-arrow-left text-xs"></i> KEMBALI
            </a>
            <h1 class="text-xs font-bold uppercase tracking-widest" style="color:var(--text-muted)">Detail View</h1>
        </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 py-6">
        <div id="detailContent">
            <div class="mb-5 border-l-2 pl-3" style="border-color:var(--border-hover)">
                <span class="text-xs font-bold px-2 py-0.5 rounded uppercase" style="background:var(--text-primary);color:var(--bg-base);border:1px solid var(--border-hover)">${promptData.kategori || 'Lainnya'}</span>
                <h2 class="text-xl font-bold mt-3 uppercase tracking-tight leading-tight" style="color:var(--text-primary)">${promptData.judul}</h2>
                <div class="mt-3 flex flex-wrap items-center gap-3 text-xs" style="color:var(--text-muted)">
                    <div class="flex items-center gap-2">
                        <div>
                            ${profileUrl && profileUrl.trim() !== ''
                                ? `<img src="${profileUrl}" class="profile-pic" alt="${promptData.uploadedBy || 'Admin'}">`
                                : `<div class="profile-pic-placeholder rounded-full flex items-center justify-center" style="background:var(--bg-surface3);border:1px solid var(--border-hover)"><i class="fa-solid fa-user text-sm" style="color:var(--text-muted)"></i></div>`
                            }
                        </div>
                        <span class="font-semibold" style="color:var(--text-primary)">Uploaded by <span style="color:var(--text-secondary)">@${promptData.uploadedBy || 'Admin'}</span></span>
                    </div>
                    <div class="flex items-center gap-1">
                        <i class="fa-solid fa-clock text-[10px]" style="color:var(--text-secondary)"></i>
                        <span class="time-ago text-[11px]" style="color:var(--text-primary)" data-timestamp="${promptData.timestamp || 0}" data-created-at="${promptData.createdAt || '-'}">Loading...</span>
                    </div>
                </div>
                <div class="mt-3 flex flex-wrap gap-3">
                    <div class="flex items-center gap-1.5" title="Total Views">
                        <i class="fa-solid fa-eye text-[11px]" style="color:var(--text-muted)"></i>
                        <span id="viewsCount" class="text-xs font-bold" style="color:var(--text-secondary)">${fmt(analytics.views)}</span>
                    </div>
                    <div class="flex items-center gap-1.5" title="Total Copies">
                        <i class="fa-solid fa-copy text-[11px]" style="color:var(--text-muted)"></i>
                        <span id="copiesCount" class="text-xs font-bold" style="color:var(--text-secondary)">${fmt(analytics.copies)}</span>
                    </div>
                    <div class="flex items-center gap-1.5" title="Total Downloads">
                        <i class="fa-solid fa-download text-[11px]" style="color:var(--text-muted)"></i>
                        <span id="downloadsCount" class="text-xs font-bold" style="color:var(--text-secondary)">${fmt(analytics.downloads)}</span>
                    </div>
                </div>
            </div>

            ${promptData.description && promptData.description.trim() !== '' ? `
            <div class="mb-5">
                <h3 class="text-base font-extrabold mb-2" style="color:var(--text-primary)">Description</h3>
                <hr style="border:0;height:1px;background:var(--border);margin-bottom:0.5rem">
                <p class="text-sm leading-relaxed mb-3" style="color:var(--text-secondary);white-space:pre-line">${linkify(promptData.description)}</p>
                <hr style="border:0;height:1px;background:var(--border)">
            </div>
            ` : ''}

            ${promptData.imageUrl && promptData.imageUrl.trim() !== '' ? `
            <div class="mb-5">
                <div class="image-container rounded-lg overflow-hidden relative">
                    <img src="${promptData.imageUrl}" class="w-full h-auto max-h-64 object-contain" alt="${promptData.judul}">
                    <button onclick="openFullscreen('${promptData.imageUrl}')" class="absolute bottom-3 right-3 w-9 h-9 flex items-center justify-content: center; transition-all hover:scale-110 active:scale-95" title="Fullscreen">
                        <img src="/assets/open_in_full.svg" class="w-6 h-6" alt="Fullscreen">
                    </button>
                </div>
            </div>
            ` : ''}

            <div class="code-container rounded-lg overflow-hidden mb-6">
                <div class="code-header px-4 py-2.5 flex justify-between items-center relative">
                    <div class="carbon-dots flex gap-1.5"><span></span><span></span><span></span></div>
                    <div class="text-xs font-bold uppercase tracking-wider absolute left-1/2 -translate-x-1/2" style="color:var(--text-primary)">Prompt</div>
                    <div class="flex gap-3 items-center">
                        <button id="copyCodeBtn" title="Copy Prompt" class="btn-icon text-sm"><i class="fa-solid fa-copy"></i></button>
                        <button id="downloadBtn" title="Download as .txt" class="btn-icon text-sm"><i class="fa-solid fa-download"></i></button>
                    </div>
                </div>
                <div class="p-4 overflow-x-auto">
                    <pre><code class="leading-relaxed whitespace-pre-wrap text-xs block font-mono">${promptData.isi || ''}</code></pre>
                </div>
            </div>
        </div>
    </main>

    <div id="fullscreenModal" class="hidden fullscreen-modal" onclick="closeFullscreen(event)">
        <div class="fullscreen-image-wrapper">
            <img id="fullscreenImage" src="" alt="Fullscreen">
            <button class="fullscreen-close" onclick="closeFullscreen(event)">
                <img src="/assets/close.svg" class="w-6 h-6" alt="Close">
            </button>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/notyf@3/notyf.min.js"></script>
    <script src="/js/timeago.js"></script>
    <script>
        const promptData = ${JSON.stringify({ judul: promptData.judul, isi: promptData.isi, slug: slug })};
        const notyf = new Notyf({ duration: 2500, position: { x: 'right', y: 'top' }, ripple: true, dismissible: true });

        function fmt(num) {
            if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
            if (num >= 1000)    return (num / 1000).toFixed(1) + 'K';
            return num.toString();
        }

        function updateAnalyticsDisplay(a) {
            document.getElementById('viewsCount').innerText     = fmt(a.views);
            document.getElementById('copiesCount').innerText    = fmt(a.copies);
            document.getElementById('downloadsCount').innerText = fmt(a.downloads);
        }

        async function trackAnalytics(action) {
            try {
                const res    = await fetch('/api/analytics', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ slug: promptData.slug, action })
                });
                const result = await res.json();
                if (result.success && result.analytics) updateAnalyticsDisplay(result.analytics);
            } catch(e) { console.error('Error tracking analytics:', e); }
        }

        document.getElementById('copyCodeBtn').onclick = async () => {
            navigator.clipboard.writeText(promptData.isi);
            await trackAnalytics('copy');
            notyf.success('Copied to clipboard!');
        };

        document.getElementById('downloadBtn').onclick = async () => {
            const blob = new Blob([promptData.isi], { type: 'text/plain;charset=utf-8' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = promptData.judul.replace(/[^a-zA-Z0-9]/g, '_') + '.txt';
            document.body.appendChild(a); a.click();
            document.body.removeChild(a); URL.revokeObjectURL(url);
            await trackAnalytics('download');
            notyf.success('Downloaded successfully!');
        };

        function openFullscreen(imageUrl) {
            document.getElementById('fullscreenImage').src = imageUrl;
            document.getElementById('fullscreenModal').classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }

        function closeFullscreen(event) {
            if (event) event.stopPropagation();
            document.getElementById('fullscreenModal').classList.add('hidden');
            document.body.style.overflow = '';
        }

        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFullscreen(); });
    </script>
</body>
</html>`;
}
