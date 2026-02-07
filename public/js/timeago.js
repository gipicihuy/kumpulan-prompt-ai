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
    const diffDay = Math.floor(diffHour / 24);
    
    // Baru saja (< 1 menit)
    if (diffSec < 60) {
        return 'Baru saja';
    }
    
    // X menit yang lalu (1-59 menit)
    if (diffMin < 60) {
        return `${diffMin} menit yang lalu`;
    }
    
    // X jam yang lalu (1-23 jam)
    if (diffHour < 24) {
        return `${diffHour} jam yang lalu`;
    }
    
    // Kemarin (24-48 jam)
    if (diffDay === 1) {
        return 'Kemarin';
    }
    
    // Tampilkan tanggal lengkap (> 48 jam)
    const date = new Date(timestamp);
    const options = { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric',
        timeZone: 'Asia/Jakarta'
    };
    
    return date.toLocaleDateString('id-ID', options);
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
