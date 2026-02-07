let allPrompts = [];
let selectedCategory = 'all';

async function fetchPrompts() {
    try {
        const response = await fetch('/api/get-prompts');
        const json = await response.json();
        allPrompts = json.data;
        
        document.getElementById('loading').classList.add('hidden');
        renderCategories();
        applyFilters(); 
    } catch (err) {
        console.error(err);
        document.getElementById('loading').classList.add('hidden');
        renderCategories();
        applyFilters();
    }
}

function renderCategories() {
    const filterContainer = document.getElementById('categoryFilter');
    
    // Ambil unique kategori dengan case-insensitive
    const categoriesMap = {};
    allPrompts.forEach(item => {
        const key = item.kategori.toLowerCase();
        if (!categoriesMap[key]) {
            categoriesMap[key] = item.kategori;
        }
    });
    
    const categories = ['all', ...Object.keys(categoriesMap)];
    
    filterContainer.innerHTML = categories.map(cat => {
        const displayText = cat === 'all' ? 'all' : categoriesMap[cat];
        const isActive = selectedCategory === cat;
        return `
        <button onclick="setCategory('${cat}')" 
            class="category-btn ${isActive ? 'active' : ''} whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold uppercase snap-start"
            style="${isActive ? 'color: #000 !important;' : ''}">
            <i class="fa-solid ${cat === 'all' ? 'fa-layer-group' : 'fa-tag'} mr-1.5 text-[10px]" style="${isActive ? 'color: #000 !important;' : ''}"></i>${displayText}
        </button>
    `}).join('');
    
    // Setup scroll indicators
    setupScrollIndicators();
    
    // Auto scroll ke active category
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
        
        // Show/hide left indicator & button
        if (scrollLeft > 10) {
            leftIndicator.classList.remove('hidden');
            leftBtn.classList.remove('hidden');
        } else {
            leftIndicator.classList.add('hidden');
            leftBtn.classList.add('hidden');
        }
        
        // Show/hide right indicator & button
        if (scrollLeft + clientWidth < scrollWidth - 10) {
            rightIndicator.classList.remove('hidden');
            rightBtn.classList.remove('hidden');
        } else {
            rightIndicator.classList.add('hidden');
            rightBtn.classList.add('hidden');
        }
    }
    
    // Scroll left button click
    leftBtn.addEventListener('click', () => {
        filterContainer.scrollBy({ left: -200, behavior: 'smooth' });
    });
    
    // Scroll right button click
    rightBtn.addEventListener('click', () => {
        filterContainer.scrollBy({ left: 200, behavior: 'smooth' });
    });
    
    // Initial check
    setTimeout(updateIndicators, 200);
    
    // Update on scroll
    filterContainer.addEventListener('scroll', updateIndicators);
    
    // Update on window resize
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
        // Case-insensitive kategori comparison
        const matchesCat = selectedCategory === 'all' || 
                          item.kategori.toLowerCase() === selectedCategory.toLowerCase();
        const matchesSearch = item.judul.toLowerCase().includes(searchTerm) || 
                            item.isi.toLowerCase().includes(searchTerm);
        return matchesCat && matchesSearch;
    });
    renderPrompts(filtered);
}

function renderPrompts(data) {
    const container = document.getElementById('content');
    document.getElementById('counter').innerText = `${data.length} TOTAL PROMPTS`;
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
        // Tampilan profile picture
        const profilePicHtml = item.profileUrl && item.profileUrl.trim() !== '' 
            ? `<img src="${item.profileUrl}" class="w-7 h-7 rounded-full object-cover border border-[#333]" alt="${item.uploadedBy}">`
            : `<div class="w-7 h-7 rounded-full bg-[#252525] flex items-center justify-center border border-[#333]">
                 <i class="fa-solid fa-user text-xs text-gray-500"></i>
               </div>`;
        
        // Icon lock jika prompt diproteksi
        const lockIcon = item.isProtected 
            ? `<i class="fa-solid fa-lock text-yellow-500 text-xs ml-2" title="Protected"></i>` 
            : '';
        
        // Untuk protected prompts, tampilkan placeholder text alih-alih konten asli
        const previewText = item.isProtected 
            ? '🔒 This content is password protected. Click to unlock.'
            : item.isi;
        
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
            <p class="text-xs ${item.isProtected ? 'text-yellow-500 italic' : 'text-gray-400'} line-clamp-2 leading-relaxed mb-2.5">${previewText}</p>
            <div class="pt-1.5 border-t border-[#2a2a2a] flex items-center gap-2">
                ${profilePicHtml}
                <span class="text-xs font-semibold text-gray-300">@${item.uploadedBy}</span>
            </div>
        </a>
    `}).join('');
    
    // Update semua time-ago setelah render
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
            alert('✅ Request berhasil dikirim! Admin akan segera mereview.');
            toggleModal(false);
            document.getElementById('addForm').reset();
        } else {
            alert('❌ Gagal mengirim request: ' + result.message);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Terjadi kesalahan. Silakan coba lagi.');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

document.getElementById('searchInput').addEventListener('input', applyFilters);
fetchPrompts();
