// Initialize Notyf dengan konfigurasi minimal - gunakan default Notyf styling
const notyf = new Notyf({
    duration: 2500,
    position: {
        x: 'right',
        y: 'top',
    },
    ripple: true, // Enable ripple effect
    dismissible: true // Allow user to dismiss notifications
});

let allPrompts = [];
let selectedCategory = 'all';
let currentSort = 'newest';

async function fetchPrompts() {
    try {
        console.log('🔄 Fetching prompts from API...');
        
        const response = await fetch('/api/get-prompts');
        console.log('📊 Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const json = await response.json();
        console.log('✅ Data received:', json);
        
        if (!json.success) {
            throw new Error('API returned success: false');
        }
        
        if (!json.data || !Array.isArray(json.data)) {
            throw new Error('Invalid data format from API');
        }
        
        allPrompts = json.data;
        console.log(`✅ Loaded ${allPrompts.length} prompts`);
        
        document.getElementById('loading').classList.add('hidden');
        renderCategories();
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
        
        renderCategories();
    }
}

function renderCategories() {
    const filterContainer = document.getElementById('categoryFilter');
    
    if (allPrompts.length === 0) {
        filterContainer.innerHTML = `
            <button class="category-btn active whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold uppercase snap-start">
                <i class="fa-solid fa-layer-group mr-1.5 text-[10px]"></i>ALL (0)
            </button>
        `;
        return;
    }
    
    const categoriesMap = {};
    const categoryCounts = {};
    
    allPrompts.forEach(item => {
        const key = item.kategori.toLowerCase();
        if (!categoriesMap[key]) {
            categoriesMap[key] = item.kategori;
            categoryCounts[key] = 0;
        }
        categoryCounts[key]++;
    });
    
    const categories = ['all', ...Object.keys(categoriesMap)];
    const totalCount = allPrompts.length;
    
    filterContainer.innerHTML = categories.map(cat => {
        const displayText = cat === 'all' ? 'ALL' : categoriesMap[cat];
        const count = cat === 'all' ? totalCount : categoryCounts[cat];
        const isActive = selectedCategory === cat;
        return `
        <button onclick="setCategory('${cat}')" 
            class="category-btn ${isActive ? 'active' : ''} whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold uppercase snap-start"
            style="${isActive ? 'color: #000 !important;' : ''}">
            <i class="fa-solid ${cat === 'all' ? 'fa-layer-group' : 'fa-tag'} mr-1.5 text-[10px]" style="${isActive ? 'color: #000 !important;' : ''}"></i>${displayText} (${count})
        </button>
    `}).join('');
    
    setupScrollIndicators();
    
    setTimeout(() => {
        const activeBtn = filterContainer.querySelector('.category-btn.active');
        if (activeBtn) {
            activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }, 100);
}

function setupScrollIndicators() {
    const filterContainer = document.getElementById('categoryFilter');
    const leftIndicator = document.getElementById('scrollLeftIndicator');
    const rightIndicator = document.getElementById('scrollRightIndicator');
    const leftBtn = document.getElementById('scrollLeftBtn');
    const rightBtn = document.getElementById('scrollRightBtn');
    
    function updateIndicators() {
        const scrollLeft = filterContainer.scrollLeft;
        const scrollWidth = filterContainer.scrollWidth;
        const clientWidth = filterContainer.clientWidth;
        
        if (scrollLeft > 10) {
            leftIndicator.classList.remove('hidden');
            leftBtn.classList.remove('hidden');
        } else {
            leftIndicator.classList.add('hidden');
            leftBtn.classList.add('hidden');
        }
        
        if (scrollLeft + clientWidth < scrollWidth - 10) {
            rightIndicator.classList.remove('hidden');
            rightBtn.classList.remove('hidden');
        } else {
            rightIndicator.classList.add('hidden');
            rightBtn.classList.add('hidden');
        }
    }
    
    leftBtn.addEventListener('click', () => {
        filterContainer.scrollBy({ left: -200, behavior: 'smooth' });
    });
    
    rightBtn.addEventListener('click', () => {
        filterContainer.scrollBy({ left: 200, behavior: 'smooth' });
    });
    
    setTimeout(updateIndicators, 200);
    filterContainer.addEventListener('scroll', updateIndicators);
    window.addEventListener('resize', updateIndicators);
}

function setCategory(cat) {
    selectedCategory = cat;
    renderCategories();
    applyFilters();
}

function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const filtered = allPrompts.filter(item => {
        const matchesCat = selectedCategory === 'all' || 
                          item.kategori.toLowerCase() === selectedCategory.toLowerCase();
        const matchesSearch = item.judul.toLowerCase().includes(searchTerm) || 
                            item.isi.toLowerCase().includes(searchTerm);
        return matchesCat && matchesSearch;
    });
    
    const sorted = sortPrompts(filtered);
    renderPrompts(sorted);
}

function sortPrompts(prompts) {
    const sorted = [...prompts];
    
    switch(currentSort) {
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
                
                const aScore = (a.analytics?.views || 0) * 1 + 
                              (a.analytics?.copies || 0) * 2 + 
                              (a.analytics?.downloads || 0) * 3;
                const bScore = (b.analytics?.views || 0) * 1 + 
                              (b.analytics?.copies || 0) * 2 + 
                              (b.analytics?.downloads || 0) * 3;
                return bScore - aScore;
            });
            break;
            
        case 'popular':
            sorted.sort((a, b) => {
                const aViews = a.analytics?.views || 0;
                const bViews = b.analytics?.views || 0;
                return bViews - aViews;
            });
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
            ? `<i class="fa-solid fa-lock text-yellow-500 text-xs ml-2" title="Protected"></i>` 
            : '';
        
        const previewText = item.isProtected 
            ? '🔒 This content is password protected. Click to unlock.'
            : item.isi;
        
        const analytics = item.analytics || { views: 0, copies: 0, downloads: 0 };
        const analyticsHtml = `
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
        `;
        
        return `
        <a href="/prompt/${item.id}" class="block card rounded-lg p-3 shadow-sm group">
            <div class="flex justify-between items-start mb-1.5">
                <span class="text-[10px] font-bold px-2 py-0.5 bg-[#252525] text-gray-400 rounded uppercase border border-[#333]">${item.kategori}</span>
                <span class="time-ago text-[9px] text-white font-mono uppercase tracking-wide" data-timestamp="${item.timestamp}">${timeAgo(item.timestamp)}</span>
            </div>
            <div class="flex justify-between items-center mb-1">
                <h3 class="font-bold text-white text-sm uppercase group-hover:text-gray-200 transition-colors flex items-center">
                    ${item.judul}${lockIcon}
                </h3>
                <i class="fa-solid fa-chevron-right text-gray-600 text-xs group-hover:text-gray-400 transition-colors"></i>
            </div>
            <p class="text-xs ${item.isProtected ? 'text-yellow-500 italic' : 'text-gray-400'} line-clamp-2 leading-relaxed mb-2">${previewText}</p>
            ${analyticsHtml}
        </a>
    `}).join('');
    
    updateAllTimeAgo();
}

function toggleModal(show) {
    document.getElementById('formModal').classList.toggle('hidden', !show);
}

document.getElementById('addForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.innerText = 'Mengirim...';
    btn.disabled = true;

    const data = {
        judul: document.getElementById('formJudul').value,
        kategori: document.getElementById('formKategori').value,
        isi: document.getElementById('formIsi').value
    };

    try {
        const response = await fetch('/api/request-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            // Gunakan default success notification dari Notyf
            notyf.success('Request sent successfully!');
            toggleModal(false);
            document.getElementById('addForm').reset();
        } else {
            // Gunakan default error notification dari Notyf
            notyf.error(result.message || 'Failed to send request');
        }
    } catch (error) {
        console.error('Error:', error);
        notyf.error('An error occurred. Please try again.');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

document.getElementById('searchInput').addEventListener('input', applyFilters);

const sortBtn = document.getElementById('sortBtn');
const sortMenu = document.getElementById('sortMenu');
const sortOptions = document.querySelectorAll('.sort-option');
const sortLabel = document.getElementById('sortLabel');
const sortIcon = document.getElementById('sortIcon');

sortBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sortMenu.classList.toggle('show');
    sortBtn.classList.toggle('open');
});

document.addEventListener('click', (e) => {
    if (!sortBtn.contains(e.target) && !sortMenu.contains(e.target)) {
        sortMenu.classList.remove('show');
        sortBtn.classList.remove('open');
    }
});

sortOptions.forEach(option => {
    option.addEventListener('click', () => {
        const sortType = option.dataset.sort;
        
        sortOptions.forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');
        
        const optionIcon = option.querySelector('i').className;
        const optionText = option.querySelector('span').textContent;
        
        sortIcon.className = optionIcon;
        sortLabel.textContent = optionText;
        
        currentSort = sortType;
        applyFilters();
        
        sortMenu.classList.remove('show');
        sortBtn.classList.remove('open');
    });
});

setInterval(async () => {
    try {
        const response = await fetch('/api/get-prompts');
        const json = await response.json();
        
        if (json.success && json.data) {
            json.data.forEach(newItem => {
                const oldItem = allPrompts.find(p => p.id === newItem.id);
                if (oldItem) {
                    oldItem.analytics = newItem.analytics;
                }
            });
            
            applyFilters();
        }
    } catch (err) {
        console.error('Failed to refresh analytics:', err);
    }
}, 10000);

console.log('🚀 Page loaded, starting fetch...');
fetchPrompts();
