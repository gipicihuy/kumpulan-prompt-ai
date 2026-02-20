// Initialize Notyf
const notyf = new Notyf({
    duration: 2500,
    position: { x: 'right', y: 'top' },
    ripple: true,
    dismissible: true
});

let allPrompts = [];
let selectedCategory = 'all';
let currentSort = 'newest';

// ✅ Helper function untuk Title Case dengan special cases
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
        const lowerWord = word.toLowerCase();
        if (specialCases[lowerWord]) return specialCases[lowerWord];
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
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
        const container = document.getElementById('content');
        container.innerHTML = `
            <div class="text-center py-16">
                <div class="inline-block p-8 bg-gradient-to-br from-[#1a1a1a] to-[#1f1f1f] border border-red-900/50 rounded-2xl shadow-2xl">
                    <i class="fa-solid fa-exclamation-triangle text-red-500 text-5xl mb-4 block"></i>
                    <h3 class="text-red-400 font-bold text-xl uppercase mb-3">Failed to Load Data</h3>
                    <p class="text-gray-400 text-sm mb-4 font-mono">${err.message}</p>
                    <button onclick="window.location.reload()" class="bg-gradient-to-r from-gray-200 to-white text-black px-6 py-3 rounded-lg text-sm font-bold uppercase hover:from-gray-300 hover:to-gray-100 transition-all shadow-lg">
                        <i class="fa-solid fa-rotate-right mr-2"></i>Retry
                    </button>
                </div>
            </div>
        `;
        renderCategoryPills();
    }
}

// ========== PILL CATEGORY SYSTEM ==========

function renderCategoryPills() {
    const pillsContainer = document.getElementById('categoryPills');
    const wrapper = document.getElementById('pillWrapper');

    // Build category map
    const categoriesMap = {};
    const categoryCounts = {};
    allPrompts.forEach(item => {
        const key = item.kategori.toLowerCase().trim();
        if (!categoriesMap[key]) {
            categoriesMap[key] = toTitleCase(item.kategori);
            categoryCounts[key] = 0;
        }
        categoryCounts[key]++;
    });

    const totalCount = allPrompts.length;
    const categories = ['all', ...Object.keys(categoriesMap)];

    pillsContainer.innerHTML = categories.map(cat => {
        const isAll = cat === 'all';
        const label = isAll ? 'All' : categoriesMap[cat];
        const count = isAll ? totalCount : categoryCounts[cat];
        const isActive = selectedCategory === cat;

        return `
        <button
            class="cat-pill ${isActive ? 'active' : ''}"
            data-category="${cat}"
            onclick="setCategory('${cat}')"
        >
            ${label}
            <span class="count-badge">${count}</span>
        </button>`;
    }).join('');

    // Setup scroll fade hints
    setupScrollFade(pillsContainer, wrapper);

    // Scroll active pill into view smoothly
    const activePill = pillsContainer.querySelector('.cat-pill.active');
    if (activePill) {
        setTimeout(() => {
            activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }, 50);
    }
}

function setupScrollFade(scroller, wrapper) {
    const update = () => {
        const atStart = scroller.scrollLeft <= 4;
        const atEnd = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 4;
        wrapper.classList.toggle('at-start', atStart);
        wrapper.classList.toggle('at-end', atEnd);
    };
    scroller.removeEventListener('scroll', update);
    scroller.addEventListener('scroll', update, { passive: true });
    update(); // initial check
}

function setCategory(cat) {
    selectedCategory = cat;
    renderCategoryPills(); // re-render pills with new active state
    applyFilters();
}

// ========== FILTERS & SORT ==========

function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const filtered = allPrompts.filter(item => {
        const matchesCat = selectedCategory === 'all' ||
            item.kategori.toLowerCase().trim() === selectedCategory.toLowerCase().trim();
        const matchesSearch = item.judul.toLowerCase().includes(searchTerm) ||
            item.isi.toLowerCase().includes(searchTerm);
        return matchesCat && matchesSearch;
    });
    const sorted = sortPrompts(filtered);
    renderPrompts(sorted);
}

function sortPrompts(prompts) {
    const sorted = [...prompts];
    switch (currentSort) {
        case 'newest':
            sorted.sort((a, b) => b.timestamp - a.timestamp);
            break;
        case 'trending':
            const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            sorted.sort((a, b) => {
                const aRecent = a.timestamp >= sevenDaysAgo;
                const bRecent = b.timestamp >= sevenDaysAgo;
                if (!aRecent && !bRecent) return b.timestamp - a.timestamp;
                if (!aRecent) return 1;
                if (!bRecent) return -1;
                const aScore = (a.analytics?.views || 0) + (a.analytics?.copies || 0) * 2 + (a.analytics?.downloads || 0) * 3;
                const bScore = (b.analytics?.views || 0) + (b.analytics?.copies || 0) * 2 + (b.analytics?.downloads || 0) * 3;
                return bScore - aScore;
            });
            break;
        case 'popular':
            sorted.sort((a, b) => (b.analytics?.views || 0) - (a.analytics?.views || 0));
            break;
        case 'a-z':
            sorted.sort((a, b) => a.judul.localeCompare(b.judul, 'id'));
            break;
        case 'z-a':
            sorted.sort((a, b) => b.judul.localeCompare(a.judul, 'id'));
            break;
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
            <div class="text-center text-gray-500 py-10 text-sm font-bold uppercase">
                <i class="fa-solid fa-ghost text-2xl mb-2 block"></i> 
                Tidak ditemukan
            </div>
        `;
        return;
    }
    container.innerHTML = data.map(item => {
        const profilePicHtml = item.profileUrl && item.profileUrl.trim() !== ''
            ? `<img src="${item.profileUrl}" class="w-7 h-7 rounded-full object-cover border border-[#333]" alt="${item.uploadedBy}">`
            : `<div class="w-7 h-7 rounded-full bg-[#252525] flex items-center justify-center border border-[#333]">
                 <i class="fa-solid fa-user text-xs text-gray-500"></i>
               </div>`;
        const lockIcon = item.isProtected
            ? `<i class="fa-solid fa-lock text-yellow-500 text-xs ml-2" title="Protected"></i>` : '';
        const previewText = item.isProtected
            ? '🔒 This content is password protected. Click to unlock.' : item.isi;
        const displayKategori = toTitleCase(item.kategori);
        const analytics = item.analytics || { views: 0, copies: 0, downloads: 0 };

        return `
        <a href="/prompt/${item.id}" class="block card rounded-lg p-3 shadow-sm group">
            <div class="flex justify-between items-start mb-1.5">
                <span class="text-[10px] font-bold px-2 py-0.5 bg-[#252525] text-gray-400 rounded uppercase border border-[#333]">${displayKategori}</span>
                <span class="time-ago text-[10px] text-white font-mono font-bold uppercase tracking-wide" data-timestamp="${item.timestamp}" data-created-at="${item.createdAt || '-'}">Loading...</span>
            </div>
            <div class="flex justify-between items-center mb-1">
                <h3 class="font-bold text-white text-sm uppercase group-hover:text-gray-200 transition-colors flex items-center">
                    ${item.judul}${lockIcon}
                </h3>
                <i class="fa-solid fa-chevron-right text-gray-600 text-xs group-hover:text-gray-400 transition-colors"></i>
            </div>
            <p class="text-xs ${item.isProtected ? 'text-yellow-500 italic' : 'text-gray-400'} line-clamp-2 leading-relaxed mb-2">${previewText}</p>
            <div class="flex items-center justify-between pt-2 border-t border-[#2a2a2a] mt-2.5">
                <div class="flex items-center gap-2">
                    ${profilePicHtml}
                    <span class="text-xs font-semibold text-gray-300">@${item.uploadedBy}</span>
                </div>
                <div class="flex items-center gap-3 text-xs">
                    <div class="flex items-center gap-1.5" title="Views">
                        <i class="fa-solid fa-eye text-[11px] text-gray-400"></i>
                        <span class="font-bold text-gray-300">${formatNumber(analytics.views)}</span>
                    </div>
                    <div class="flex items-center gap-1.5" title="Copies">
                        <i class="fa-solid fa-copy text-[11px] text-gray-400"></i>
                        <span class="font-bold text-gray-300">${formatNumber(analytics.copies)}</span>
                    </div>
                    <div class="flex items-center gap-1.5" title="Downloads">
                        <i class="fa-solid fa-download text-[11px] text-gray-400"></i>
                        <span class="font-bold text-gray-300">${formatNumber(analytics.downloads)}</span>
                    </div>
                </div>
            </div>
        </a>`;
    }).join('');
    
    updateAllTimeAgo();
}

document.getElementById('searchInput').addEventListener('input', applyFilters);

// ========== SORT DROPDOWN ==========
const sortBtn     = document.getElementById('sortBtn');
const sortMenu    = document.getElementById('sortMenu');
const sortOptions = document.querySelectorAll('#sortMenu .dropdown-option');
const sortLabel   = document.getElementById('sortLabel');
const sortIcon    = document.getElementById('sortIcon');
const sortChevron = document.getElementById('sortChevron');

sortBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = sortMenu.classList.contains('show');
    sortMenu.classList.toggle('show', !isOpen);
    sortBtn.classList.toggle('open', !isOpen);
    sortChevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
});

document.addEventListener('click', (e) => {
    if (!sortBtn.contains(e.target) && !sortMenu.contains(e.target)) {
        sortMenu.classList.remove('show');
        sortBtn.classList.remove('open');
        sortChevron.style.transform = 'rotate(0deg)';
    }
});

sortOptions.forEach(option => {
    option.addEventListener('click', () => {
        const sortType = option.dataset.sort;
        sortOptions.forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');
        sortIcon.className = option.querySelector('i').className;
        sortLabel.textContent = option.querySelector('span').textContent;
        currentSort = sortType;
        applyFilters();
        sortMenu.classList.remove('show');
        sortBtn.classList.remove('open');
        sortChevron.style.transform = 'rotate(0deg)';
    });
});

// ========== AUTO REFRESH ANALYTICS ==========
setInterval(async () => {
    try {
        const response = await fetch('/api/get-prompts');
        const json = await response.json();
        if (json.success && json.data) {
            json.data.forEach(newItem => {
                const oldItem = allPrompts.find(p => p.id === newItem.id);
                if (oldItem) oldItem.analytics = newItem.analytics;
            });
            applyFilters();
        }
    } catch (err) {
        console.error('Failed to refresh analytics:', err);
    }
}, 10000);

fetchPrompts();
