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
    
    // ✅ FIXED: Cek hari dengan benar (untuk "Kemarin")
    // MASALAH: Kalau sekarang jam 17:14 dan post jam 13:06, itu BUKAN kemarin!
    // Kita harus cek apakah BENAR-BENAR beda hari kalender, bukan cuma 24 jam
    
    // Ambil tanggal hari ini di timezone lokal (tanpa waktu)
    const nowDate = new Date();
    const nowDay = nowDate.getDate();
    const nowMonth = nowDate.getMonth();
    const nowYear = nowDate.getFullYear();
    
    // Ambil tanggal post di timezone lokal (tanpa waktu)
    const postDate = new Date(timestamp);
    const postDay = postDate.getDate();
    const postMonth = postDate.getMonth();
    const postYear = postDate.getFullYear();
    
    // Cek apakah BENAR-BENAR hari yang berbeda
    const isSameDay = (nowDay === postDay && nowMonth === postMonth && nowYear === postYear);
    
    // Cek apakah BENAR-BENAR kemarin (beda 1 hari kalender)
    const yesterdayDate = new Date(nowDate);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const isYesterday = (
        postDay === yesterdayDate.getDate() && 
        postMonth === yesterdayDate.getMonth() && 
        postYear === yesterdayDate.getFullYear()
    );
    
    // Jika BENAR-BENAR kemarin (bukan hari ini!)
    if (isYesterday && !isSameDay) {
        return 'Kemarin';
    }
    
    // ✅ Tampilkan tanggal TANPA JAM (> 1 hari yang lalu) untuk tampilan yang lebih ringkas
    // Kalau ada createdAt dari database, parse dan extract hanya tanggal (tanpa jam)
    if (createdAt && createdAt !== '-') {
        // Extract tanggal saja (hilangkan jam)
        // Format dari database: "12 Feb 2026, 15:13 WIB" atau "12 Feb 2026, 15:13 WIB (edited)"
        // Ambil bagian sebelum koma (tanggal saja)
        const datePart = createdAt.split(',')[0].trim();
        
        // Cek apakah ada suffix "(edited)"
        const editedMatch = createdAt.match(/\(edited\)$/);
        
        return editedMatch ? `${datePart} (edited)` : datePart;
    }
    
    // Fallback: format sendiri kalau ga ada createdAt (tanpa jam)
    const options = { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric',
        timeZone: 'Asia/Jakarta'
    };
    
    return postDate.toLocaleString('id-ID', options);
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
