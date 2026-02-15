/**
 * Konversi timestamp ke format relatif (Baru saja, X menit yang lalu, dll)
 * @param {number} timestamp - Unix timestamp dalam milidetik (UTC standar)
 * @returns {string} - Format waktu relatif
 */
function timeAgo(timestamp) {
    const now = Date.now(); // UTC timestamp standar
    const diffMs = now - timestamp;
    
    // Jika timestamp di masa depan (clock skew), anggap "Baru saja"
    if (diffMs < 0) {
        return 'Baru saja';
    }
    
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
    
    // X jam yang lalu (< 24 jam DAN masih hari yang sama)
    // Cek apakah masih di hari yang sama di timezone Jakarta
    const nowDateJakarta = new Date(now + (7 * 60 * 60 * 1000)); // UTC+7
    const postDateJakarta = new Date(timestamp + (7 * 60 * 60 * 1000)); // UTC+7
    
    // Ambil tanggal saja (tanpa jam)
    const nowDateOnly = new Date(nowDateJakarta.getFullYear(), nowDateJakarta.getMonth(), nowDateJakarta.getDate());
    const postDateOnly = new Date(postDateJakarta.getFullYear(), postDateJakarta.getMonth(), postDateJakarta.getDate());
    
    const daysDiff = Math.floor((nowDateOnly - postDateOnly) / (1000 * 60 * 60 * 24));
    
    // Jika masih hari ini (daysDiff = 0)
    if (daysDiff === 0 && diffHour < 24) {
        return `${diffHour} jam yang lalu`;
    }
    
    // Jika kemarin (daysDiff = 1)
    if (daysDiff === 1) {
        return 'Kemarin';
    }
    
    // Tampilkan tanggal lengkap (> 1 hari yang lalu)
    // Gunakan timezone Jakarta untuk format
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
        if (!isNaN(timestamp)) {
            el.textContent = timeAgo(timestamp);
        }
    });
}

// Update setiap 10 detik agar lebih responsif
if (typeof window !== 'undefined') {
    // Update pertama kali saat halaman dimuat
    document.addEventListener('DOMContentLoaded', updateAllTimeAgo);
    
    // Update berkala setiap 10 detik
    setInterval(updateAllTimeAgo, 10000);
}
