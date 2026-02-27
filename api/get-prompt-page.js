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

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
        --dot-color:      #e5e5e5;
        --fullscreen-filter: none;
        --btn-bg:         #ffffff;
        --btn-text:       #0f0f0f;
        --comment-bg:     #161616;
        --comment-border: #222;
        --comment-input-bg: #111;
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
        --dot-color:      #18181b;
        --fullscreen-filter: invert(1);
        --btn-bg:         #18181b;
        --btn-text:       #ffffff;
        --comment-bg:     #f9f9f9;
        --comment-border: #e4e4e7;
        --comment-input-bg: #fff;
    }
`;

const THEME_INIT = `(function(){var t=localStorage.getItem('prompthub-theme')||'dark';document.documentElement.setAttribute('data-theme',t);})();`;

export default async function handler(req, res) {
  const { slug } = req.query;
  if (!slug) return res.status(404).send('Slug not found');

  try {
    const promptData = await redis.hgetall(`prompt:${slug}`);
    if (!promptData || !promptData.judul) return res.status(404).send('Prompt not found');

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
      try { await redis.hincrby(analyticsKey, 'views', 1); analytics.views += 1; } catch (e) {}
    }

    const cookies = parseCookies(req.headers.cookie);

    if (isProtected) {
      const sessionToken = cookies[`prompt_session_${slug}`];
      if (!sessionToken) return res.status(200).send(renderPasswordPage(slug, promptData, profileUrl));

      const sessionKey = `session:${slug}:${sessionToken}`;
      const isValidSession = await redis.get(sessionKey);
      if (isValidSession === 'valid') {
        try { await redis.hincrby(analyticsKey, 'views', 1); analytics.views += 1; } catch (e) {}
        return res.status(200).send(renderNormalPage(slug, promptData, profileUrl, analytics));
      } else {
        res.setHeader('Set-Cookie', [`prompt_session_${slug}=; Path=/; Max-Age=0`]);
        return res.status(200).send(renderPasswordPage(slug, promptData, profileUrl));
      }
    }

    return res.status(200).send(renderNormalPage(slug, promptData, profileUrl, analytics));
  } catch (error) {
    console.error('Error in get-prompt-page:', error);
    res.status(500).send(`<html><body>Error: ${error.message}</body></html>`);
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
        body { font-family: 'Inter', sans-serif; background: linear-gradient(to bottom, var(--bg-base), var(--bg-surface)); color: var(--text-primary); min-height: 100vh; transition: background 0.25s, color 0.25s; }
        header { background: var(--header-bg); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); }
        .password-container { background: linear-gradient(135deg, var(--bg-surface), var(--bg-surface2)); border: 1px solid var(--border); box-shadow: 0 8px 24px var(--shadow); }
        input { background-color: var(--input-bg) !important; border-color: var(--border) !important; color: var(--text-primary) !important; transition: all 0.3s ease; }
        input:focus { border-color: var(--border-hover) !important; background-color: var(--input-focus) !important; }
        input::placeholder { color: var(--text-muted) !important; }
        .btn-primary { background: var(--btn-bg); color: var(--btn-text); transition: all 0.3s ease; }
        .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-primary:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }
        .back-btn { transition: all 0.3s ease; color: var(--text-muted); }
        .back-btn:hover { color: var(--text-primary); transform: translateX(-2px); }
        .profile-pic { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border-hover); }
        .profile-pic-placeholder { width: 32px; height: 32px; }
    </style>
</head>
<body>
    <header class="sticky top-0 z-10 shadow-lg">
        <div class="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
            <a href="/" class="back-btn font-bold text-xs flex items-center gap-2"><i class="fa-solid fa-arrow-left text-xs"></i> KEMBALI</a>
            <h1 class="text-xs font-bold uppercase tracking-widest" style="color:var(--text-muted)">Protected Content</h1>
        </div>
    </header>
    <main class="max-w-3xl mx-auto px-4 py-6">
        <div class="mb-5 border-l-2 pl-3" style="border-color:var(--border-hover)">
            <span class="text-xs font-bold px-2 py-0.5 rounded uppercase" style="background:var(--text-primary);color:var(--bg-base)">${escapeHtml(promptData.kategori || 'Lainnya')}</span>
            <h2 class="text-xl font-bold mt-3 uppercase tracking-tight flex items-center gap-2" style="color:var(--text-primary)">${escapeHtml(promptData.judul)} <i class="fa-solid fa-lock text-yellow-500 text-base"></i></h2>
            <div class="mt-3 flex flex-wrap items-center gap-3 text-xs" style="color:var(--text-muted)">
                <div class="flex items-center gap-2">${profilePicHtml}<span>Uploaded by <span style="color:var(--text-secondary)">@${escapeHtml(promptData.uploadedBy || 'Admin')}</span></span></div>
                <div class="flex items-center gap-1"><i class="fa-solid fa-clock text-[10px]" style="color:var(--text-secondary)"></i><span>${escapeHtml(promptData.createdAt || '-')}</span></div>
            </div>
        </div>
        <div class="password-container rounded-lg overflow-hidden">
            <div class="p-8 text-center" style="border-bottom:1px solid var(--border)">
                <div class="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style="background:var(--bg-surface3);border:2px solid var(--border-hover)">
                    <i class="fa-solid fa-lock text-3xl text-yellow-500"></i>
                </div>
                <h3 class="text-lg font-bold mb-2 uppercase" style="color:var(--text-primary)">Password Required</h3>
                <p class="text-sm max-w-md mx-auto" style="color:var(--text-secondary)">Enter the password to view this prompt.</p>
            </div>
            <div class="p-8">
                <form id="passwordForm" class="space-y-4 max-w-md mx-auto">
                    <div>
                        <label class="text-xs font-bold uppercase mb-2 block" style="color:var(--text-muted)">Password</label>
                        <div class="relative">
                            <input type="password" id="passwordInput" placeholder="••••••••" required class="w-full p-4 pr-12 rounded-xl border outline-none text-base" autocomplete="off">
                            <button type="button" onclick="togglePwd()" class="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center" style="background:none;border:none;color:var(--text-muted);cursor:pointer">
                                <i id="eyeIcon" class="fa-solid fa-eye text-sm"></i>
                            </button>
                        </div>
                    </div>
                    <button type="submit" class="w-full btn-primary font-bold py-4 rounded-xl uppercase tracking-widest text-sm"><i class="fa-solid fa-unlock mr-2"></i>Unlock Prompt</button>
                </form>
            </div>
        </div>
    </main>
    <script src="https://cdn.jsdelivr.net/npm/notyf@3/notyf.min.js"></script>
    <script>
        const notyf = new Notyf({ duration: 3000, position: { x: 'right', y: 'top' } });
        function togglePwd() {
            const pi = document.getElementById('passwordInput'), icon = document.getElementById('eyeIcon');
            pi.type = pi.type === 'password' ? 'text' : 'password';
            icon.className = pi.type === 'password' ? 'fa-solid fa-eye text-sm' : 'fa-solid fa-eye-slash text-sm';
        }
        document.getElementById('passwordForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const btn = this.querySelector('button[type="submit"]'), orig = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Verifying...'; btn.disabled = true;
            try {
                const res = await fetch('/api/verify-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: '${slug}', password: document.getElementById('passwordInput').value }) });
                const result = await res.json();
                if (result.success) { notyf.success('Access granted!'); setTimeout(() => location.href = '/prompt/${slug}', 1000); }
                else { notyf.error(result.message || 'Incorrect password'); document.getElementById('passwordInput').value = ''; }
            } catch(e) { notyf.error('An error occurred'); }
            finally { btn.innerHTML = orig; btn.disabled = false; }
        });
    </script>
</body>
</html>`;
}

function renderNormalPage(slug, promptData, profileUrl = '', analytics = { views: 0, copies: 0, downloads: 0 }) {
  const metaDesc = promptData.description?.trim() ? promptData.description : (promptData.isi || '').substring(0, 150) + '...';
  const metaImage = promptData.imageUrl?.trim() ? promptData.imageUrl : 'https://cdn.yupra.my.id/yp/xihcb4th.jpg';
  const pageTitle = `${promptData.judul} - AI Prompt Hub`;

  const fmt = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
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
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: linear-gradient(to bottom, var(--bg-base), var(--bg-surface)); color: var(--text-primary); min-height: 100vh; transition: background 0.25s, color 0.25s; }
        .carbon-squares { display: flex; gap: 6px; align-items: center; }
        .carbon-squares span { width: 10px; height: 10px; display: inline-block; background: var(--dot-color); border-radius: 2px; opacity: 0.5; }
        header { background: var(--header-bg); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); }
        .code-container { background: linear-gradient(135deg, var(--code-bg-from), var(--code-bg-to)); border: 1px solid var(--border); box-shadow: 0 8px 24px var(--shadow); }
        .code-header { background: linear-gradient(135deg, var(--code-hdr-from), var(--code-hdr-to)); border-bottom: 1px solid var(--border); }
        .btn-icon { transition: all 0.3s ease; color: var(--text-muted); background: none; border: none; cursor: pointer; }
        .btn-icon:hover { color: var(--text-primary); transform: scale(1.05); }
        .back-btn { transition: all 0.3s ease; color: var(--text-muted); }
        .back-btn:hover { color: var(--text-primary); transform: translateX(-2px); }
        .image-container { border: 1px solid var(--border); background: linear-gradient(135deg, var(--bg-surface), var(--bg-surface2)); box-shadow: 0 8px 24px var(--shadow); }
        .profile-pic { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border-hover); }
        .profile-pic-placeholder { width: 32px; height: 32px; }
        .fullscreen-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.97); backdrop-filter: blur(8px); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 1rem; }
        .fullscreen-image-wrapper { position: relative; max-width: 100%; max-height: 100%; }
        .fullscreen-modal img { max-width: 100%; max-height: 100vh; object-fit: contain; border-radius: 8px; }
        .fullscreen-close { position: absolute; top: 1rem; right: 1rem; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.3s ease; }
        .description-link { color: var(--text-primary); text-decoration: underline; text-underline-offset: 2px; word-break: break-all; transition: color 0.2s ease; }
        .description-link:hover { color: var(--text-secondary); }
        pre code { color: var(--text-secondary) !important; }
        .fullscreen-icon-btn { filter: var(--fullscreen-filter); }

        /* === COMMENT STYLES === */
        .comments-section { background: var(--comment-bg); border: 1px solid var(--comment-border); border-radius: 12px; overflow: hidden; }
        .comment-input-area { background: var(--comment-input-bg); border: 1px solid var(--border); color: var(--text-primary); border-radius: 10px; resize: none; outline: none; transition: border-color 0.2s ease; width: 100%; padding: 12px; font-size: 0.875rem; font-family: inherit; }
        .comment-input-area:focus { border-color: var(--border-hover); }
        .comment-input-area::placeholder { color: var(--text-muted); }
        .comment-item { border-bottom: 1px solid var(--comment-border); padding: 16px; transition: background 0.2s; }
        .comment-item:last-child { border-bottom: none; }
        .comment-item:hover { background: rgba(255,255,255,0.02); }
        .comment-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border); flex-shrink: 0; }
        .comment-avatar-placeholder { width: 36px; height: 36px; border-radius: 50%; background: var(--bg-surface3); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .btn-comment-submit { background: var(--btn-bg); color: var(--btn-text); border: none; padding: 8px 20px; border-radius: 8px; font-weight: 700; font-size: 0.75rem; letter-spacing: 0.04em; cursor: pointer; transition: all 0.2s ease; text-transform: uppercase; }
        .btn-comment-submit:hover { opacity: 0.85; transform: translateY(-1px); }
        .btn-comment-submit:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }
        .login-prompt-box { background: linear-gradient(135deg, var(--bg-surface2), var(--bg-surface3)); border: 1px dashed var(--border-hover); border-radius: 10px; padding: 20px; text-align: center; }
        .btn-login-comment { display: inline-flex; align-items: center; gap: 8px; background: var(--btn-bg); color: var(--btn-text); border: none; padding: 10px 24px; border-radius: 8px; font-weight: 700; font-size: 0.75rem; letter-spacing: 0.04em; cursor: pointer; transition: all 0.2s; text-transform: uppercase; text-decoration: none; }
        .btn-login-comment:hover { opacity: 0.85; transform: translateY(-1px); }
        .char-count { font-size: 0.7rem; color: var(--text-muted); text-align: right; }
        .char-count.warning { color: #f59e0b; }
        .char-count.danger { color: #ef4444; }
        .comment-delete-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; transition: all 0.2s; opacity: 0; }
        .comment-item:hover .comment-delete-btn { opacity: 1; }
        .comment-delete-btn:hover { color: #ef4444; background: rgba(239,68,68,0.1); }

        /* Auth Modal */
        .auth-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 1rem; opacity: 0; visibility: hidden; transition: all 0.3s ease; }
        .auth-modal-overlay.show { opacity: 1; visibility: visible; }
        .auth-modal { background: linear-gradient(135deg, var(--bg-surface), var(--bg-surface2)); border: 1px solid var(--border); border-radius: 16px; padding: 2rem; max-width: 400px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
        .auth-input { background: var(--input-bg) !important; border: 1px solid var(--border) !important; color: var(--text-primary) !important; padding: 10px 14px; border-radius: 8px; outline: none; width: 100%; font-size: 0.875rem; transition: border-color 0.2s; }
        .auth-input:focus { border-color: var(--border-hover) !important; }
        .auth-input::placeholder { color: var(--text-muted) !important; }
        .auth-tab { padding: 8px 16px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; border: none; background: none; color: var(--text-muted); border-bottom: 2px solid transparent; transition: all 0.2s; }
        .auth-tab.active { color: var(--text-primary); border-bottom-color: var(--text-primary); }
        .btn-auth-submit { background: var(--btn-bg); color: var(--btn-text); width: 100%; padding: 12px; border: none; border-radius: 8px; font-weight: 700; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; transition: all 0.2s; }
        .btn-auth-submit:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-auth-submit:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }
        .user-chip { display: inline-flex; align-items: center; gap: 8px; padding: 4px 10px 4px 4px; border-radius: 999px; background: var(--bg-surface3); border: 1px solid var(--border); cursor: pointer; transition: all 0.2s; }
        .user-chip:hover { border-color: var(--border-hover); }
        .user-chip img { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; }
        .logout-btn { background: none; border: none; color: var(--text-muted); font-size: 0.7rem; font-weight: 700; text-transform: uppercase; cursor: pointer; padding: 4px 8px; border-radius: 4px; transition: all 0.2s; }
        .logout-btn:hover { color: #ef4444; background: rgba(239,68,68,0.1); }
    </style>
</head>
<body>
    <header class="sticky top-0 z-10 shadow-lg">
        <div class="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
            <a href="/" class="back-btn font-bold text-xs flex items-center gap-2"><i class="fa-solid fa-arrow-left text-xs"></i> KEMBALI</a>
            <div class="flex items-center gap-3">
                <h1 class="text-xs font-bold uppercase tracking-widest" style="color:var(--text-muted)">Detail View</h1>
                <div id="userHeaderSection"><!-- filled by JS --></div>
            </div>
        </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 py-6">
        <div id="detailContent">
            <div class="mb-5 border-l-2 pl-3" style="border-color:var(--border-hover)">
                <span class="text-xs font-bold px-2 py-0.5 rounded uppercase" style="background:var(--text-primary);color:var(--bg-base)">${escapeHtml(promptData.kategori || 'Lainnya')}</span>
                <h2 class="text-xl font-bold mt-3 uppercase tracking-tight leading-tight" style="color:var(--text-primary)">${escapeHtml(promptData.judul)}</h2>
                <div class="mt-3 flex flex-wrap items-center gap-3 text-xs" style="color:var(--text-muted)">
                    <div class="flex items-center gap-2">
                        ${profileUrl && profileUrl.trim() !== ''
                          ? `<img src="${profileUrl}" class="profile-pic" alt="${escapeHtml(promptData.uploadedBy || 'Admin')}">`
                          : `<div class="profile-pic-placeholder rounded-full flex items-center justify-center" style="background:var(--bg-surface3);border:1px solid var(--border-hover)"><i class="fa-solid fa-user text-sm" style="color:var(--text-muted)"></i></div>`
                        }
                        <span class="font-semibold" style="color:var(--text-primary)">Uploaded by <span style="color:var(--text-secondary)">@${escapeHtml(promptData.uploadedBy || 'Admin')}</span></span>
                    </div>
                    <div class="flex items-center gap-1">
                        <i class="fa-solid fa-clock text-[10px]" style="color:var(--text-secondary)"></i>
                        <span class="time-ago text-[11px]" style="color:var(--text-primary)" data-timestamp="${promptData.timestamp || 0}" data-created-at="${escapeHtml(promptData.createdAt || '-')}">Loading...</span>
                    </div>
                </div>
                <div class="mt-3 flex flex-wrap gap-3">
                    <div class="flex items-center gap-1.5" title="Total Views"><i class="fa-solid fa-eye text-[11px]" style="color:var(--text-muted)"></i><span id="viewsCount" class="text-xs font-bold" style="color:var(--text-secondary)">${fmt(analytics.views)}</span></div>
                    <div class="flex items-center gap-1.5" title="Total Copies"><i class="fa-solid fa-copy text-[11px]" style="color:var(--text-muted)"></i><span id="copiesCount" class="text-xs font-bold" style="color:var(--text-secondary)">${fmt(analytics.copies)}</span></div>
                    <div class="flex items-center gap-1.5" title="Total Downloads"><i class="fa-solid fa-download text-[11px]" style="color:var(--text-muted)"></i><span id="downloadsCount" class="text-xs font-bold" style="color:var(--text-secondary)">${fmt(analytics.downloads)}</span></div>
                </div>
            </div>

            ${promptData.description?.trim() ? `
            <div class="mb-5">
                <h3 class="text-base font-extrabold mb-2" style="color:var(--text-primary)">Description</h3>
                <hr style="border:0;height:1px;background:var(--border);margin-bottom:0.5rem">
                <p class="text-sm leading-relaxed mb-3" style="color:var(--text-secondary);white-space:pre-line">${linkify(promptData.description)}</p>
                <hr style="border:0;height:1px;background:var(--border)">
            </div>` : ''}

            ${promptData.imageUrl?.trim() ? `
            <div class="mb-5">
                <div class="image-container rounded-lg overflow-hidden relative">
                    <img src="${escapeHtml(promptData.imageUrl)}" class="w-full h-auto max-h-64 object-contain" alt="${escapeHtml(promptData.judul)}">
                    <button onclick="openFullscreen('${escapeHtml(promptData.imageUrl)}')" class="absolute bottom-3 right-3 w-9 h-9 flex items-center justify-center transition-all hover:scale-110 active:scale-95" title="Fullscreen">
                        <img src="/assets/open_in_full.svg" class="w-6 h-6 fullscreen-icon-btn" alt="Fullscreen">
                    </button>
                </div>
            </div>` : ''}

            <div class="code-container rounded-lg overflow-hidden mb-6">
                <div class="code-header px-4 py-2.5 flex justify-between items-center relative">
                    <div class="carbon-squares"><span></span><span></span><span></span></div>
                    <div class="text-xs font-bold uppercase tracking-wider absolute left-1/2 -translate-x-1/2" style="color:var(--text-primary)">Prompt</div>
                    <div class="flex gap-3 items-center">
                        <button id="copyCodeBtn" title="Copy Prompt" class="btn-icon text-sm"><i class="fa-solid fa-copy"></i></button>
                        <button id="downloadBtn" title="Download as .txt" class="btn-icon text-sm"><i class="fa-solid fa-download"></i></button>
                    </div>
                </div>
                <div class="p-4 overflow-x-auto">
                    <pre><code class="leading-relaxed whitespace-pre-wrap text-xs block font-mono">${escapeHtml(promptData.isi || '')}</code></pre>
                </div>
            </div>

            <!-- COMMENTS SECTION -->
            <div class="mb-8">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-base font-extrabold uppercase tracking-tight flex items-center gap-2" style="color:var(--text-primary)">
                        <i class="fa-solid fa-comments text-sm" style="color:var(--text-muted)"></i>
                        Comments <span id="commentCount" class="text-sm font-normal" style="color:var(--text-muted)"></span>
                    </h3>
                </div>

                <!-- Comment Input -->
                <div id="commentInputSection" class="mb-5"></div>

                <!-- Comments List -->
                <div id="commentsList" class="comments-section">
                    <div class="p-6 text-center" style="color:var(--text-muted)">
                        <i class="fa-solid fa-circle-notch fa-spin text-xl mb-2 block"></i>
                        <p class="text-xs uppercase tracking-widest font-bold">Loading comments...</p>
                    </div>
                </div>
            </div>
        </div>
    </main>

    <div id="fullscreenModal" class="hidden fullscreen-modal" onclick="closeFullscreen(event)">
        <div class="fullscreen-image-wrapper">
            <img id="fullscreenImage" src="" alt="Fullscreen">
            <button class="fullscreen-close" onclick="closeFullscreen(event)"><img src="/assets/close.svg" class="w-6 h-6" alt="Close"></button>
        </div>
    </div>

    <!-- AUTH MODAL -->
    <div id="authModal" class="auth-modal-overlay">
        <div class="auth-modal">
            <div class="flex items-center justify-between mb-5">
                <div class="flex gap-0" style="border-bottom: 1px solid var(--border)">
                    <button class="auth-tab active" id="tabLoginBtn" onclick="switchAuthTab('login')">Login</button>
                    <button class="auth-tab" id="tabRegisterBtn" onclick="switchAuthTab('register')">Register</button>
                </div>
                <button onclick="closeAuthModal()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.1rem"><i class="fa-solid fa-times"></i></button>
            </div>
            <div id="authLoginForm">
                <div class="space-y-3">
                    <div><label class="text-xs font-bold uppercase mb-1 block" style="color:var(--text-muted)">Username</label><input type="text" id="authLoginUser" class="auth-input" placeholder="your_username" autocomplete="username"></div>
                    <div><label class="text-xs font-bold uppercase mb-1 block" style="color:var(--text-muted)">Password</label>
                        <div class="relative"><input type="password" id="authLoginPass" class="auth-input" placeholder="••••••••" autocomplete="current-password" style="padding-right: 40px">
                            <button type="button" onclick="toggleAuthPwd('authLoginPass', 'eyeLogin')" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);cursor:pointer"><i id="eyeLogin" class="fa-solid fa-eye text-sm"></i></button>
                        </div>
                    </div>
                    <button onclick="doLogin()" id="btnDoLogin" class="btn-auth-submit mt-2"><i class="fa-solid fa-right-to-bracket mr-2"></i>Login</button>
                    <p class="text-xs text-center" style="color:var(--text-muted)">Belum punya akun? <button onclick="switchAuthTab('register')" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-weight:700;text-decoration:underline">Daftar sekarang</button></p>
                </div>
            </div>
            <div id="authRegisterForm" class="hidden">
                <div class="space-y-3">
                    <div><label class="text-xs font-bold uppercase mb-1 block" style="color:var(--text-muted)">Username</label><input type="text" id="authRegUser" class="auth-input" placeholder="username (a-z, 0-9, _)" autocomplete="username"><p class="text-[10px] mt-1" style="color:var(--text-muted)">3-30 karakter, hanya huruf/angka/underscore</p></div>
                    <div><label class="text-xs font-bold uppercase mb-1 block" style="color:var(--text-muted)">Display Name</label><input type="text" id="authRegDisplay" class="auth-input" placeholder="Nama tampilan (opsional)" autocomplete="name"></div>
                    <div><label class="text-xs font-bold uppercase mb-1 block" style="color:var(--text-muted)">Password</label>
                        <div class="relative"><input type="password" id="authRegPass" class="auth-input" placeholder="Min. 6 karakter" autocomplete="new-password" style="padding-right: 40px">
                            <button type="button" onclick="toggleAuthPwd('authRegPass', 'eyeReg')" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);cursor:pointer"><i id="eyeReg" class="fa-solid fa-eye text-sm"></i></button>
                        </div>
                    </div>
                    <button onclick="doRegister()" id="btnDoRegister" class="btn-auth-submit mt-2"><i class="fa-solid fa-user-plus mr-2"></i>Daftar</button>
                    <p class="text-xs text-center" style="color:var(--text-muted)">Sudah punya akun? <button onclick="switchAuthTab('login')" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-weight:700;text-decoration:underline">Login</button></p>
                </div>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/notyf@3/notyf.min.js"></script>
    <script src="/js/timeago.js"></script>
    <script>
        const PROMPT_SLUG = '${slug}';
        const promptData = ${JSON.stringify({ judul: promptData.judul, isi: promptData.isi, slug: slug })};
        const notyf = new Notyf({ duration: 2500, position: { x: 'right', y: 'top' }, ripple: true, dismissible: true });

        // ===== AUTH STATE =====
        let currentUser = null;
        let userToken = localStorage.getItem('user_token');

        function fmt(num) {
            if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
            if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
            return num.toString();
        }

        function updateAnalyticsDisplay(a) {
            document.getElementById('viewsCount').innerText = fmt(a.views);
            document.getElementById('copiesCount').innerText = fmt(a.copies);
            document.getElementById('downloadsCount').innerText = fmt(a.downloads);
        }

        async function trackAnalytics(action) {
            try {
                const res = await fetch('/api/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: PROMPT_SLUG, action }) });
                const result = await res.json();
                if (result.success && result.analytics) updateAnalyticsDisplay(result.analytics);
            } catch(e) {}
        }

        document.getElementById('copyCodeBtn').onclick = async () => {
            navigator.clipboard.writeText(promptData.isi);
            await trackAnalytics('copy');
            notyf.success('Copied to clipboard!');
        };

        document.getElementById('downloadBtn').onclick = async () => {
            const blob = new Blob([promptData.isi], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = promptData.judul.replace(/[^a-zA-Z0-9]/g, '_') + '.txt';
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            await trackAnalytics('download');
            notyf.success('Downloaded!');
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

        // ===== AUTH =====
        function openAuthModal() { document.getElementById('authModal').classList.add('show'); }
        function closeAuthModal() { document.getElementById('authModal').classList.remove('show'); }
        document.getElementById('authModal').addEventListener('click', function(e) { if (e.target === this) closeAuthModal(); });

        function switchAuthTab(tab) {
            document.getElementById('authLoginForm').classList.toggle('hidden', tab !== 'login');
            document.getElementById('authRegisterForm').classList.toggle('hidden', tab !== 'register');
            document.getElementById('tabLoginBtn').classList.toggle('active', tab === 'login');
            document.getElementById('tabRegisterBtn').classList.toggle('active', tab === 'register');
        }

        function toggleAuthPwd(inputId, iconId) {
            const el = document.getElementById(inputId), icon = document.getElementById(iconId);
            el.type = el.type === 'password' ? 'text' : 'password';
            icon.className = el.type === 'password' ? 'fa-solid fa-eye text-sm' : 'fa-solid fa-eye-slash text-sm';
        }

        async function doLogin() {
            const username = document.getElementById('authLoginUser').value.trim();
            const password = document.getElementById('authLoginPass').value;
            if (!username || !password) { notyf.error('Isi username dan password'); return; }
            const btn = document.getElementById('btnDoLogin'), orig = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Logging in...'; btn.disabled = true;
            try {
                const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, action: 'login' }) });
                const data = await res.json();
                if (data.success && !data.isAdmin) {
                    localStorage.setItem('user_token', data.token);
                    userToken = data.token;
                    currentUser = data.user;
                    notyf.success('Login berhasil!');
                    closeAuthModal();
                    renderUserHeader();
                    renderCommentInput();
                } else if (data.isAdmin) {
                    notyf.error('Gunakan halaman Admin untuk login admin');
                } else {
                    notyf.error(data.message || 'Login gagal');
                }
            } catch(e) { notyf.error('Error: ' + e.message); }
            finally { btn.innerHTML = orig; btn.disabled = false; }
        }

        async function doRegister() {
            const username = document.getElementById('authRegUser').value.trim();
            const display_name = document.getElementById('authRegDisplay').value.trim();
            const password = document.getElementById('authRegPass').value;
            if (!username || !password) { notyf.error('Isi username dan password'); return; }
            const btn = document.getElementById('btnDoRegister'), orig = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Mendaftar...'; btn.disabled = true;
            try {
                const res = await fetch('/api/login?action=register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, display_name, password, action: 'register' }) });
                const data = await res.json();
                if (data.success) {
                    localStorage.setItem('user_token', data.token);
                    userToken = data.token;
                    currentUser = data.user;
                    notyf.success('Registrasi berhasil! Selamat datang, ' + data.user.display_name + '!');
                    closeAuthModal();
                    renderUserHeader();
                    renderCommentInput();
                } else {
                    notyf.error(data.message || 'Registrasi gagal');
                }
            } catch(e) { notyf.error('Error: ' + e.message); }
            finally { btn.innerHTML = orig; btn.disabled = false; }
        }

        async function doLogout() {
            try { await fetch('/api/login?action=logout', { method: 'POST', headers: { 'Authorization': userToken } }); } catch(e) {}
            localStorage.removeItem('user_token');
            userToken = null; currentUser = null;
            renderUserHeader();
            renderCommentInput();
            notyf.success('Logout berhasil');
        }

        function renderUserHeader() {
            const section = document.getElementById('userHeaderSection');
            if (currentUser) {
                section.innerHTML = \`<div class="flex items-center gap-2">
                    <div class="user-chip" title="\${currentUser.display_name}">
                        <img src="\${currentUser.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(currentUser.display_name || currentUser.username) + '&background=random&color=fff'}" alt="">
                        <span class="text-xs font-bold" style="color:var(--text-primary)">\${currentUser.display_name || currentUser.username}</span>
                    </div>
                    <button class="logout-btn" onclick="doLogout()"><i class="fa-solid fa-right-from-bracket"></i></button>
                </div>\`;
            } else {
                section.innerHTML = \`<button onclick="openAuthModal()" class="btn-login-comment text-xs" style="padding: 6px 14px"><i class="fa-solid fa-right-to-bracket"></i> Login</button>\`;
            }
        }

        function renderCommentInput() {
            const section = document.getElementById('commentInputSection');
            if (currentUser) {
                section.innerHTML = \`<div style="background:var(--comment-bg);border:1px solid var(--comment-border);border-radius:12px;padding:16px">
                    <div class="flex gap-3 items-start">
                        <img src="\${currentUser.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(currentUser.display_name || currentUser.username) + '&background=random&color=fff'}" class="comment-avatar" alt="">
                        <div style="flex:1">
                            <textarea id="newCommentText" class="comment-input-area" rows="3" placeholder="Tulis komentar..." maxlength="500" oninput="updateCharCount(this)"></textarea>
                            <div class="flex items-center justify-between mt-2">
                                <span id="charCountDisplay" class="char-count">0 / 500</span>
                                <button onclick="submitComment()" id="submitCommentBtn" class="btn-comment-submit"><i class="fa-solid fa-paper-plane mr-1.5"></i>Kirim</button>
                            </div>
                        </div>
                    </div>
                </div>\`;
            } else {
                section.innerHTML = \`<div class="login-prompt-box">
                    <i class="fa-solid fa-comment-dots text-2xl mb-3 block" style="color:var(--text-muted)"></i>
                    <p class="text-sm font-semibold mb-1" style="color:var(--text-primary)">Ingin berkomentar?</p>
                    <p class="text-xs mb-4" style="color:var(--text-muted)">Login atau daftar untuk meninggalkan komentar</p>
                    <button onclick="openAuthModal()" class="btn-login-comment"><i class="fa-solid fa-right-to-bracket"></i> Login / Register</button>
                </div>\`;
            }
        }

        function updateCharCount(el) {
            const count = el.value.length;
            const display = document.getElementById('charCountDisplay');
            display.textContent = count + ' / 500';
            display.className = 'char-count' + (count > 450 ? (count > 490 ? ' danger' : ' warning') : '');
        }

        async function submitComment() {
            const text = document.getElementById('newCommentText')?.value?.trim();
            if (!text) { notyf.error('Komentar tidak boleh kosong'); return; }
            if (text.length > 500) { notyf.error('Komentar terlalu panjang'); return; }
            const btn = document.getElementById('submitCommentBtn'), orig = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; btn.disabled = true;
            try {
                const res = await fetch('/api/analytics?action=post-comment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': userToken },
                    body: JSON.stringify({ slug: PROMPT_SLUG, content: text })
                });
                const data = await res.json();
                if (data.success) {
                    document.getElementById('newCommentText').value = '';
                    updateCharCount(document.getElementById('newCommentText'));
                    notyf.success('Komentar terkirim!');
                    loadComments();
                } else {
                    notyf.error(data.message || 'Gagal mengirim komentar');
                }
            } catch(e) { notyf.error('Error: ' + e.message); }
            finally { btn.innerHTML = orig; btn.disabled = false; }
        }

        async function deleteComment(commentId) {
            if (!confirm('Hapus komentar ini?')) return;
            try {
                const res = await fetch('/api/analytics?action=delete-comment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': userToken },
                    body: JSON.stringify({ commentId })
                });
                const data = await res.json();
                if (data.success) { notyf.success('Komentar dihapus'); loadComments(); }
                else notyf.error(data.message || 'Gagal menghapus');
            } catch(e) { notyf.error('Error'); }
        }

        function formatCommentTime(dateStr) {
            const d = new Date(dateStr);
            const now = new Date();
            const diffMs = now - d;
            const diffMin = Math.floor(diffMs / 60000);
            if (diffMin < 1) return 'Baru saja';
            if (diffMin < 60) return diffMin + ' menit lalu';
            const diffHour = Math.floor(diffMin / 60);
            if (diffHour < 24) return diffHour + ' jam lalu';
            const diffDay = Math.floor(diffHour / 24);
            if (diffDay < 7) return diffDay + ' hari lalu';
            return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        }

        async function loadComments() {
            const container = document.getElementById('commentsList');
            try {
                const res = await fetch('/api/analytics?action=get-comments&slug=' + PROMPT_SLUG);
                const data = await res.json();
                if (!data.success) throw new Error(data.message);

                const comments = data.comments || [];
                document.getElementById('commentCount').textContent = comments.length > 0 ? '(' + comments.length + ')' : '';

                if (comments.length === 0) {
                    container.innerHTML = \`<div class="p-8 text-center">
                        <i class="fa-regular fa-comment text-3xl mb-3 block" style="color:var(--text-muted)"></i>
                        <p class="text-sm font-semibold mb-1" style="color:var(--text-secondary)">Belum ada komentar</p>
                        <p class="text-xs" style="color:var(--text-muted)">Jadilah yang pertama berkomentar!</p>
                    </div>\`;
                    return;
                }

                const isCurrentUserComment = (username) => currentUser && currentUser.username === username;

                container.innerHTML = comments.map(c => \`
                    <div class="comment-item">
                        <div class="flex gap-3 items-start">
                            <img src="\${c.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(c.display_name || c.username) + '&background=random&color=fff&bold=true&size=128'}" class="comment-avatar" alt="" onerror="this.src='https://ui-avatars.com/api/?name=\${encodeURIComponent(c.username)}&background=random&color=fff&bold=true&size=128'">
                            <div style="flex:1;min-width:0">
                                <div class="flex items-center gap-2 mb-1 flex-wrap">
                                    <span class="text-sm font-bold" style="color:var(--text-primary)">\${c.display_name || c.username}</span>
                                    <span class="text-[10px]" style="color:var(--text-muted)">@\${c.username}</span>
                                    <span class="text-[10px]" style="color:var(--text-muted)">·</span>
                                    <span class="text-[10px]" style="color:var(--text-muted)">\${formatCommentTime(c.created_at)}</span>
                                    \${isCurrentUserComment(c.username) ? \`<button class="comment-delete-btn" onclick="deleteComment(\${c.id})" title="Hapus"><i class="fa-solid fa-trash text-[10px]"></i></button>\` : ''}
                                </div>
                                <p class="text-sm leading-relaxed" style="color:var(--text-secondary);word-break:break-word">\${c.content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>')}</p>
                            </div>
                        </div>
                    </div>\`).join('');
            } catch(error) {
                container.innerHTML = \`<div class="p-6 text-center text-xs" style="color:var(--text-muted)">Gagal memuat komentar</div>\`;
            }
        }

        async function initUserSession() {
            if (!userToken) { renderUserHeader(); renderCommentInput(); loadComments(); return; }
            try {
                const res = await fetch('/api/login?action=profile', { headers: { 'Authorization': userToken } });
                const data = await res.json();
                if (data.success) {
                    currentUser = data.user;
                } else {
                    localStorage.removeItem('user_token');
                    userToken = null;
                }
            } catch(e) {
                localStorage.removeItem('user_token');
                userToken = null;
            }
            renderUserHeader();
            renderCommentInput();
            loadComments();
        }

        // Enter to submit comment (Shift+Enter for newline)
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey && document.activeElement?.id === 'newCommentText') {
                e.preventDefault();
                submitComment();
            }
        });

        initUserSession();
    </script>
</body>
</html>`;
}
