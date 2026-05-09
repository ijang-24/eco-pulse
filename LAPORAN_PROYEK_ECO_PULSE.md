# LAPORAN PROYEK: ECO-PULSE
**Monitoring Pengelolaan Sampah & Energi Berbasis Komunitas**

---

## 1. PENDAHULUAN
Eco-Pulse adalah platform digital inovatif yang dirancang untuk memberdayakan komunitas (tingkat RT/RW atau perumahan) dalam mengelola sampah dan memantau konsumsi energi secara mandiri. Proyek ini menggabungkan konsep *crowdsourcing* data dengan sistem *gamification* untuk menciptakan dampak lingkungan yang terukur.

## 2. TUJUAN PROYEK
- **Kesadaran Lingkungan**: Mendorong warga untuk lebih peduli terhadap jenis sampah yang dihasilkan dan pola penggunaan energi (listrik/air).
- **Efisiensi Pengelolaan**: Memberikan data real-time kepada pengurus komunitas mengenai volume sampah yang terkumpul.
- **Ekosistem Lokal**: Menghubungkan partisipasi warga dengan merchant lokal melalui sistem poin (Green Points).

## 3. FITUR UTAMA
1.  **Waste Sorting Tracker**: Pencatatan mandiri jenis sampah (plastik, kertas, logam, dll) beserta bukti foto.
2.  **Impact Dashboard**: Visualisasi dampak lingkungan, seperti estimasi pengurangan emisi CO2 atau jumlah pohon yang diselamatkan.
3.  **Neighborhood Leaderboard**: Kompetisi positif antar blok atau RT untuk meningkatkan partisipasi.
4.  **Green Point System**: Penukaran poin yang didapat dari aktivitas ramah lingkungan dengan reward di merchant lokal.

## 4. SPESIFIKASI TEKNIS
- **Framework Utama**: Node.js & Express.js.
- **Tampilan (Frontend)**: EJS (Embedded JavaScript) dengan Vanilla CSS & Tailwind CSS.
- **Basis Data**: MySQL 8.0+.
- **Manajemen Lingkungan**: Dotenv (untuk keamanan konfigurasi database).

## 5. STATUS IMPLEMENTASI TERBARU
- [x] **Setup Database**: Skema database (`eco_pulse`) telah dikonfigurasi dengan tabel: `users`, `waste_logs`, `energy_logs`, `merchants`, dan `rewards`.
- [x] **Sistem Migrasi**: Implementasi script otomatis `migrate.js` untuk memudahkan deployment database.
- [x] **Keamanan Env**: Perbaikan mekanisme pembacaan file `.env` untuk memastikan koneksi database yang aman dan terisolasi.

## 6. CARA MENJALANKAN SISTEM
Untuk menjalankan aplikasi di lingkungan baru:

1.  **Install Dependencies**:
    ```bash
    npm install
    ```
2.  **Konfigurasi Database**:
    Sesuaikan file `.env` dengan kredensial MySQL setempat.
3.  **Jalankan Migrasi Database**:
    ```bash
    npm run migrate
    ```
4.  **Jalankan Aplikasi**:
    ```bash
    npm start
    ```

---
*Laporan ini dihasilkan secara otomatis untuk keperluan dokumentasi teknis dan manajerial proyek Eco-Pulse.*
