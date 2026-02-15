/**
 * Konversi timestamp ke format relatif (Baru saja, X menit yang lalu, dll)
 * @param {number} timestamp - Unix timestamp dalam milidetik (UTC standar)
 * @param {string} createdAt - String tanggal dari database (fallback untuk > 1 hari)
 * @returns {string} - Format waktu relatif
 */
function timeAgo(timestamp, createdAt) {
    const now = Date.now(); // UTC timestamp standar
    const diffMs = now - timestamp;
    
    // Jika timestamp di masa depan (clock skew), anggap "Baru saja"
    if (diffMs < 0) {
        return 'Baru saja';
    }
    
    // ✅ FIX: Pakai Math.floor untuk exact calculation (bukan round up)
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    
    // Baru saja (< 1 menit)
    if (diffSec < 60) {
        return 'Baru saja';
    }
    
    // X menit yang lalu (1-59 menit)
    if (diffMin < 60) {
        return `${diffMin} menit yang lalu`;
    }
    
    // X jam yang lalu (< 24 jam)
    if (diffHour < 24) {
        return `${diffHour} jam yang lalu`;
    }
    
    // ✅ Cek hari (untuk "Kemarin" atau tanggal lengkap)
    // Pakai Date object langsung (browser otomatis handle timezone)
    const nowDate = new Date(now);
    const postDate = new Date(timestamp);
    
    // Ambil tanggal saja (tanpa jam) di timezone lokal
    const nowDateOnly = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
    const postDateOnly = new Date(postDate.getFullYear(), postDate.getMonth(), postDate.getDate());
    
    const daysDiff = Math.floor((nowDateOnly - postDateOnly) / (1000 * 60 * 60 * 24));
    
    // Jika kemarin (daysDiff = 1)
    if (daysDiff === 1) {
        return 'Kemarin';
    }
    
    // ✅ Tampilkan tanggal DARI DATABASE (> 1 hari yang lalu)
    // Kalau ada createdAt dari database, pakai itu (format lengkap dengan jam)
    if (createdAt && createdAt !== '-') {
        return createdAt;
    }
    
    // Fallback: format sendiri kalau ga ada createdAt
    const postDate = new Date(timestamp);
    const options = { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric',
        timeZone: 'Asia/Jakarta'
    };
    
    return postDate.toLocaleDateString('id-ID', options);
}

/**
 * Update semua elemen dengan class 'time-ago' secara real-time
 */
function updateAllTimeAgo() {
    const elements = document.querySelectorAll('.time-ago');
    elements.forEach(el => {
        const timestamp = parseInt(el.dataset.timestamp);
        const createdAt = el.dataset.createdAt; // ✅ Ambil createdAt dari data attribute
        if (!isNaN(timestamp)) {
            el.textContent = timeAgo(timestamp, createdAt);
        }
    });
}

// ✅ FIX: Update setiap 1 DETIK untuk akurasi maksimal!
if (typeof window !== 'undefined') {
    // Update pertama kali saat halaman dimuat
    document.addEventListener('DOMContentLoaded', updateAllTimeAgo);
    
    // ✅ Update berkala setiap 1 DETIK (1000ms)
    setInterval(updateAllTimeAgo, 1000);
}
