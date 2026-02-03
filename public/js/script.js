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
    }
}

function renderCategories() {
    const filterContainer = document.getElementById('categoryFilter');
    const categories = ['all', ...new Set(allPrompts.map(item => item.kategori))];
    filterContainer.innerHTML = categories.map(cat => `
        <button onclick="setCategory('${cat}')" 
            class="whitespace-nowrap px-4 py-1.5 rounded-lg border text-[14px] font-bold transition uppercase ${selectedCategory === cat ? 'bg-white text-black border-white shadow-md' : 'bg-black text-gray-500 border-[#222] hover:border-white'}">
            <i class="fa-solid ${cat === 'all' ? 'fa-layer-group' : 'fa-tag'} mr-1"></i> ${cat}
        </button>
    `).join('');
}

function setCategory(cat) {
    selectedCategory = cat;
    renderCategories();
    applyFilters();
}

function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const filtered = allPrompts.filter(item => {
        const matchesCat = selectedCategory === 'all' || item.kategori === selectedCategory;
        const matchesSearch = item.judul.toLowerCase().includes(searchTerm) || item.isi.toLowerCase().includes(searchTerm);
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
    container.innerHTML = data.map(item => `
        <a href="/prompt/${item.id}" class="block card rounded-xl p-4 shadow-sm border border-[#222] active:scale-95 transition-all group hover:border-white">
            <div class="mb-2">
                <span class="text-[12px] font-bold px-2 py-0.5 bg-[#1a1a1a] text-gray-400 rounded uppercase border border-[#333]">${item.kategori}</span>
            </div>
            <div class="flex justify-between items-center mb-1">
                <h3 class="font-bold text-white text-sm uppercase group-hover:underline underline-offset-4">${item.judul}</h3>
                <i class="fa-solid fa-chevron-right text-gray-600 group-hover:text-white transition-colors"></i>
            </div>
            <p class="text-xs text-gray-500 line-clamp-2 leading-relaxed">${item.isi}</p>
        </a>
    `).join('');
}

function toggleModal(show) {
    document.getElementById('formModal').classList.toggle('hidden', !show);
}

document.getElementById('addForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const msg = `PROMPT BARU!\n\nJudul: ${document.getElementById('formJudul').value}\nKategori: ${document.getElementById('formKategori').value}\nIsi: ${document.getElementById('formIsi').value}`;
    window.open(`https://t.me/GivyAdmin?text=${encodeURIComponent(msg)}`, '_blank');
});

document.getElementById('searchInput').addEventListener('input', applyFilters);
fetchPrompts();
