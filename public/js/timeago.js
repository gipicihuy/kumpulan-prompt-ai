/**
 * Konversi timestamp ke format relatif (Baru saja, X menit yang lalu, dll)
 * @param {number} timestamp - Unix timestamp dalam milidetik
 * @returns {string} - Format waktu relatif
 */
function timeAgo(timestamp) {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    
    // Baru saja (< 1 menit)
    if (diffSec < 60) {
        return 'Baru saja';
    }
    
    // X menit yang lalu (1-59 menit)
    if (diffMin < 60) {
        return `${diffMin} menit yang lalu`;
    }
    
    // X jam yang lalu (< 24 jam DAN masih hari yang sama)
    // Cek apakah masih di hari yang sama
    const nowDate = new Date(now);
    const postDate = new Date(timestamp);
    
    // Set jam ke 00:00:00 untuk perbandingan tanggal saja
    const nowDateOnly = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
    const postDateOnly = new Date(postDate.getFullYear(), postDate.getMonth(), postDate.getDate());
    
    const daysDiff = Math.floor((nowDateOnly - postDateOnly) / (1000 * 60 * 60 * 24));
    
    // Jika masih hari ini (daysDiff = 0)
    if (daysDiff === 0) {
        return `${diffHour} jam yang lalu`;
    }
    
    // Jika kemarin (daysDiff = 1)
    if (daysDiff === 1) {
        return 'Kemarin';
    }
    
    // Tampilkan tanggal lengkap (> 1 hari yang lalu)
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

// Update setiap 30 detik agar tetap akurat
if (typeof window !== 'undefined') {
    // Update pertama kali saat halaman dimuat
    document.addEventListener('DOMContentLoaded', updateAllTimeAgo);
    
    // Update berkala setiap 30 detik
    setInterval(updateAllTimeAgo, 30000);
}
