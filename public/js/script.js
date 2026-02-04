let allPrompts = [];
let selectedCategory = 'all';

async function fetchPrompts() {
    try {
        const response = await fetch('/api/get-prompts');
        const json = await response.json();
        allPrompts = json.data;
        
        // Tunggu semua gambar selesai dimuat
        await waitForImagesToLoad(allPrompts);
        
        document.getElementById('loading').classList.add('hidden');
        renderCategories();
        applyFilters(); 
    } catch (err) {
        console.error(err);
        // Tetap tampilkan data meskipun ada error
        document.getElementById('loading').classList.add('hidden');
        renderCategories();
        applyFilters();
    }
}

// Fungsi untuk menunggu semua gambar selesai dimuat
async function waitForImagesToLoad(prompts) {
    const imagePromises = prompts
        .filter(item => item.imageUrl && item.imageUrl.trim() !== '')
        .map(item => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve();
                img.onerror = () => resolve(); // Tetap resolve meskipun error
                img.src = item.imageUrl;
                
                // Timeout 5 detik untuk setiap gambar
                setTimeout(() => resolve(), 5000);
            });
        });
    
    // Tunggu semua gambar atau maksimal 10 detik
    await Promise.race([
        Promise.all(imagePromises),
        new Promise(resolve => setTimeout(resolve, 10000))
    ]);
}

function renderCategories() {
    const filterContainer = document.getElementById('categoryFilter');
    
    // Ambil unique kategori dengan case-insensitive
    const categoriesMap = {};
    allPrompts.forEach(item => {
        const key = item.kategori.toLowerCase(); // Use lowercase as key
        if (!categoriesMap[key]) {
            categoriesMap[key] = item.kategori; // Store original display text
        }
    });
    
    const categories = ['all', ...Object.keys(categoriesMap)];
    
    filterContainer.innerHTML = categories.map(cat => {
        const displayText = cat === 'all' ? 'all' : categoriesMap[cat];
        return `
        <button onclick="setCategory('${cat}')" 
            class="whitespace-nowrap px-3 py-1.5 rounded-lg border text-xs font-bold transition uppercase ${selectedCategory === cat ? 'bg-white text-black border-white shadow-md' : 'bg-black text-gray-500 border-[#222] hover:border-white'}">
            <i class="fa-solid ${cat === 'all' ? 'fa-layer-group' : 'fa-tag'} mr-1 text-[10px]"></i> ${displayText}
        </button>
    `}).join('');
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
        container.innerHTML = `<div class="text-center text-gray-500 py-10 text-sm font-bold uppercase"><i class="fa-solid fa-ghost text-2xl mb-2 block"></i> Tidak ditemukan</div>`;
        return;
    }
    container.innerHTML = data.map(item => {
        // Cek apakah ada gambar
        const hasImage = item.imageUrl && item.imageUrl.trim() !== '';
        
        return `
        <a href="/prompt/${item.id}" class="block card rounded-lg p-3 shadow-sm border border-[#222] active:scale-95 transition-all group hover:border-white">
            ${hasImage ? `
            <div class="mb-2.5 overflow-hidden rounded-lg border border-[#222]">
                <img src="${item.imageUrl}" alt="${item.judul}" class="w-full h-24 object-cover group-hover:scale-105 transition-transform duration-300" onerror="this.parentElement.style.display='none'">
            </div>
            ` : ''}
            <div class="flex justify-between items-start mb-1.5">
                <span class="text-[10px] font-bold px-2 py-0.5 bg-[#1a1a1a] text-gray-400 rounded uppercase border border-[#333]">${item.kategori}</span>
                <span class="text-[9px] text-gray-600 font-mono uppercase">${item.createdAt}</span>
            </div>
            <div class="flex justify-between items-center mb-1">
                <h3 class="font-bold text-white text-sm uppercase group-hover:underline underline-offset-4">${item.judul}</h3>
                <i class="fa-solid fa-chevron-right text-gray-600 text-xs group-hover:text-white transition-colors"></i>
            </div>
            <p class="text-xs text-gray-500 line-clamp-2 leading-relaxed mb-2.5">${item.isi}</p>
            <div class="pt-1.5 border-t border-[#111] flex items-center gap-1.5">
                <div class="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center">
                    <i class="fa-solid fa-user text-[8px] text-gray-400"></i>
                </div>
                <span class="text-[10px] font-bold text-gray-500 uppercase tracking-tight">Uploaded by <span class="text-gray-300">${item.uploadedBy}</span></span>
            </div>
        </a>
    `}).join('');
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
