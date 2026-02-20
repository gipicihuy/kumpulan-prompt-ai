const notyf = new Notyf({
    duration: 2500,
    position: { x: 'right', y: 'top' },
    ripple: true,
    dismissible: true
});

let allPrompts = [];
let selectedCategory = 'all';
let currentSort = 'newest';

function toTitleCase(str) {
    const specialCases = {
        'chatgpt': 'ChatGPT', 'openai': 'OpenAI', 'ai': 'AI', 'api': 'API',
        'ui': 'UI', 'ux': 'UX', 'seo': 'SEO', 'html': 'HTML', 'css': 'CSS',
        'javascript': 'JavaScript', 'nodejs': 'Node.js', 'reactjs': 'React.js',
        'vuejs': 'Vue.js', 'ios': 'iOS', 'macos': 'macOS', 'iphone': 'iPhone',
        'ipad': 'iPad', 'youtube': 'YouTube', 'tiktok': 'TikTok',
        'linkedin': 'LinkedIn', 'github': 'GitHub', 'wordpress': 'WordPress',
        'midjourney': 'Midjourney', 'dalle': 'DALL-E', 'gpt': 'GPT',
        'llm': 'LLM', 'nft': 'NFT', 'pdf': 'PDF', 'json': 'JSON',
        'xml': 'XML', 'sql': 'SQL', 'php': 'PHP', 'csharp': 'C#',
        'cplusplus': 'C++', 'vscode': 'VSCode', 'figma': 'Figma',
        'photoshop': 'Photoshop', 'excel': 'Excel', 'powerpoint': 'PowerPoint'
    };
    return str.split(' ').map(word => {
        const lw = word.toLowerCase();
        return specialCases[lw] || (word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
    }).join(' ');
}

async function fetchPrompts() {
    try {
        const response = await fetch('/api/get-prompts');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const json = await response.json();
        if (!json.success) throw new Error('API returned success: false');
        if (!json.data || !Array.isArray(json.data)) throw new Error('Invalid data format from API');
        allPrompts = json.data;
        document.getElementById('loading').classList.add('hidden');
        renderCategoryPills();
        applyFilters();
    } catch (err) {
        console.error('❌ Error fetching prompts:', err);
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('content').innerHTML = `
            <div class="text-center py-16">
                <div class="inline-block p-8 rounded-2xl shadow-2xl" style="background: linear-gradient(135deg, var(--bg-surface) 0%, var(--bg-surface2) 100%); border: 1px solid var(--border);">
                    <i class="fa-solid fa-exclamation-triangle text-red-500 text-5xl mb-4 block"></i>
                    <h3 class="font-bold text-xl uppercase mb-3" style="color: #f87171">Failed to Load Data</h3>
                    <p class="text-sm mb-4 font-mono" style="color: var(--text-muted)">${err.message}</p>
                    <button onclick="window.location.reload()" class="px-6 py-3 rounded-lg text-sm font-bold uppercase" style="background: var(--text-primary); color: var(--bg-base)">
                        <i class="fa-solid fa-rotate-right mr-2"></i>Retry
                    </button>
                </div>
            </div>
        `;
        renderCategoryPills();
    }
}

function renderCategoryPills() {
    const pillsContainer = document.getElementById('categoryPills');
    const wrapper = document.getElementById('pillWrapper');

    const categoriesMap = {};
    const categoryCounts = {};
    allPrompts.forEach(item => {
        const key = item.kategori.toLowerCase().trim();
        if (!categoriesMap[key]) { categoriesMap[key] = toTitleCase(item.kategori); categoryCounts[key] = 0; }
        categoryCounts[key]++;
    });

    const totalCount = allPrompts.length;
    const categories = ['all', ...Object.keys(categoriesMap)];

    pillsContainer.innerHTML = categories.map(cat => {
        const label = cat === 'all' ? 'All' : categoriesMap[cat];
        const count = cat === 'all' ? totalCount : categoryCounts[cat];
        const isActive = selectedCategory === cat;
        return `<button class="cat-pill ${isActive ? 'active' : ''}" data-category="${cat}" onclick="setCategory('${cat}')">
            ${label}
            <span class="count-badge">${count}</span>
        </button>`;
    }).join('');

    setupScrollFade(pillsContainer, wrapper);

    const activePill = pillsContainer.querySelector('.cat-pill.active');
    if (activePill) setTimeout(() => activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }), 50);
}

function setupScrollFade(scroller, wrapper) {
    const update = () => {
        wrapper.classList.toggle('at-start', scroller.scrollLeft <= 4);
        wrapper.classList.toggle('at-end', scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 4);
    };
    scroller.removeEventListener('scroll', update);
    scroller.addEventListener('scroll', update, { passive: true });
    update();
}

function setCategory(cat) {
    selectedCategory = cat;
    renderCategoryPills();
    applyFilters();
}

const sortBtn      = document.getElementById('sortBtn');
const sortDropdown = document.getElementById('sortDropdown');
const sortOptions  = document.querySelectorAll('.sort-option');

sortBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = sortDropdown.classList.toggle('show');
    sortBtn.classList.toggle('open', open);
});

document.addEventListener('click', (e) => {
    if (!sortBtn.contains(e.target) && !sortDropdown.contains(e.target)) {
        sortDropdown.classList.remove('show');
        sortBtn.classList.remove('open');
    }
});

const sortIndicatorMap = {
    newest:   { type: 'fa', icon: 'fa-fire',           color: '#eab308' },
    trending: { type: 'fa', icon: 'fa-chart-line',     color: '#f97316' },
    popular:  { type: 'fa', icon: 'fa-trophy',         color: '#ca8a04' },
    'a-z':    { type: 'fa', icon: 'fa-arrow-down-a-z', color: '#60a5fa' },
    'z-a':    { type: 'fa', icon: 'fa-arrow-up-z-a',   color: '#60a5fa' },
};

function updateSortIndicator() {
    const indicator = document.getElementById('sortIndicator');
    if (!indicator) return;
    const s = sortIndicatorMap[currentSort];
    indicator.className = `fa-solid ${s.icon} sort-indicator`;
    indicator.style.color = s.color;
    indicator.textContent = '';
}

sortOptions.forEach(option => {
    option.addEventListener('click', () => {
        sortOptions.forEach(o => o.classList.remove('active'));
        option.classList.add('active');
        currentSort = option.dataset.sort;
        updateSortIndicator();
        sortDropdown.classList.remove('show');
        sortBtn.classList.remove('open');
        applyFilters();
    });
});

function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const filtered = allPrompts.filter(item => {
        const matchesCat = selectedCategory === 'all' ||
            item.kategori.toLowerCase().trim() === selectedCategory.toLowerCase().trim();
        const matchesSearch = item.judul.toLowerCase().includes(searchTerm) ||
            item.isi.toLowerCase().includes(searchTerm);
        return matchesCat && matchesSearch;
    });
    renderPrompts(sortPrompts(filtered));
}

function sortPrompts(prompts) {
    const sorted = [...prompts];
    switch (currentSort) {
        case 'newest':
            sorted.sort((a, b) => b.timestamp - a.timestamp); break;
        case 'trending':
            const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            sorted.sort((a, b) => {
                const aR = a.timestamp >= sevenDaysAgo, bR = b.timestamp >= sevenDaysAgo;
                if (!aR && !bR) return b.timestamp - a.timestamp;
                if (!aR) return 1; if (!bR) return -1;
                const score = x => (x.analytics?.views || 0) + (x.analytics?.copies || 0) * 2 + (x.analytics?.downloads || 0) * 3;
                return score(b) - score(a);
            }); break;
        case 'popular':
            sorted.sort((a, b) => (b.analytics?.views || 0) - (a.analytics?.views || 0)); break;
        case 'a-z':
            sorted.sort((a, b) => a.judul.localeCompare(b.judul, 'id')); break;
        case 'z-a':
            sorted.sort((a, b) => b.judul.localeCompare(a.judul, 'id')); break;
    }
    return sorted;
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function renderPrompts(data) {
    const container = document.getElementById('content');
    if (data.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10 text-sm font-bold uppercase" style="color: var(--text-muted)">
                <i class="fa-solid fa-ghost text-2xl mb-2 block"></i>Tidak ditemukan
            </div>`;
        return;
    }
    container.innerHTML = data.map(item => {
        // Profile pic — uses CSS var for placeholder background
        const profilePicHtml = item.profileUrl && item.profileUrl.trim() !== ''
            ? `<img src="${item.profileUrl}" class="w-7 h-7 rounded-full object-cover" style="border: 1px solid var(--border)" alt="${item.uploadedBy}">`
            : `<div class="w-7 h-7 rounded-full flex items-center justify-center profile-placeholder" style="border: 1px solid var(--border)"><i class="fa-solid fa-user text-xs" style="color: var(--text-muted)"></i></div>`;

        const lockIcon = item.isProtected
            ? `<i class="fa-solid fa-lock text-yellow-500 text-xs ml-2" title="Protected"></i>`
            : '';

        const previewText = item.isProtected
            ? '🔒 This content is password protected. Click to unlock.'
            : item.isi;

        const analytics = item.analytics || { views: 0, copies: 0, downloads: 0 };

        return `<a href="/prompt/${item.id}" class="block card rounded-lg p-3 shadow-sm group">
            <div class="flex justify-between items-start mb-1.5">
                <span class="cat-badge text-[10px] font-bold px-2 py-0.5 rounded uppercase">${toTitleCase(item.kategori)}</span>
                <span class="time-ago time-chip text-[10px] font-mono font-bold uppercase tracking-wide" data-timestamp="${item.timestamp}" data-created-at="${item.createdAt || '-'}">Loading...</span>
            </div>
            <div class="flex justify-between items-center mb-1">
                <h3 class="font-bold text-sm uppercase transition-colors flex items-center" style="color: var(--text-primary)">${item.judul}${lockIcon}</h3>
                <i class="fa-solid fa-chevron-right text-xs transition-colors" style="color: var(--text-muted)"></i>
            </div>
            <p class="text-xs line-clamp-2 leading-relaxed mb-2 ${item.isProtected ? 'protected-text italic' : ''}" style="${item.isProtected ? '' : 'color: var(--text-secondary)'}">${previewText}</p>
            <div class="flex items-center justify-between pt-2 mt-2.5" style="border-top: 1px solid var(--border)">
                <div class="flex items-center gap-2">${profilePicHtml}<span class="text-xs font-semibold card-author">@${item.uploadedBy}</span></div>
                <div class="flex items-center gap-3 text-xs">
                    <div class="flex items-center gap-1.5" title="Views"><i class="fa-solid fa-eye text-[11px]" style="color: var(--text-muted)"></i><span class="font-bold" style="color: var(--text-secondary)">${formatNumber(analytics.views)}</span></div>
                    <div class="flex items-center gap-1.5" title="Copies"><i class="fa-solid fa-copy text-[11px]" style="color: var(--text-muted)"></i><span class="font-bold" style="color: var(--text-secondary)">${formatNumber(analytics.copies)}</span></div>
                    <div class="flex items-center gap-1.5" title="Downloads"><i class="fa-solid fa-download text-[11px]" style="color: var(--text-muted)"></i><span class="font-bold" style="color: var(--text-secondary)">${formatNumber(analytics.downloads)}</span></div>
                </div>
            </div>
        </a>`;
    }).join('');
    updateAllTimeAgo();
}

setInterval(async () => {
    try {
        const json = await (await fetch('/api/get-prompts')).json();
        if (json.success && json.data) {
            json.data.forEach(newItem => {
                const old = allPrompts.find(p => p.id === newItem.id);
                if (old) old.analytics = newItem.analytics;
            });
            applyFilters();
        }
    } catch (err) { console.error('Failed to refresh analytics:', err); }
}, 10000);

fetchPrompts();
