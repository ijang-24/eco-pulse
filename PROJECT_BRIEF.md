# Eco-Pulse Project Brief

## 1. Konsep Utama
Eco-Pulse adalah aplikasi berbasis komunitas (crowdsourcing data) untuk monitoring pengelolaan sampah dan penghematan energi di level RT/RW atau perumahan.

## 2. Value Proposition (Data Reciprocity)
Warga menginput data (foto sampah/tagihan listrik), dan sebagai gantinya mereka mendapatkan:
- Poin yang bisa ditukar di merchant lokal.
- Visualisasi dampak lingkungan (pohon yang diselamatkan/CO2 yang dikurangi).
- Perbandingan performa lingkungan antar blok/RT.

## 3. Fitur Kunci
- **Waste Sorting Tracker**: Pencatatan sampah daur ulang.
- **Neighborhood Leaderboard**: Kompetisi positif antar RT/blok.
- **Impact Dashboard**: Visualisasi dampak lingkungan secara real-time.
- **Green Point System**: Gamifikasi untuk mendorong kebiasaan hijau.

## 4. Arsitektur Teknis
- **Backend**: Node.js & Express.
- **Frontend**: EJS (Templating Engine) & Tailwind CSS (CDN).
- **Database**: MySQL.
- **Styling**: Tailwind CSS via CDN (Modern & Responsive).

## 5. Struktur Database (Proposed)
- `users`: id, username, email, password, address_rt, total_points.
- `waste_logs`: id, user_id, waste_type, weight, photo_url, status, points_earned.
- `energy_logs`: id, user_id, energy_type (electric/water), usage_value, period, points_earned.
- `merchants`: id, name, location, reward_list.
- `points_transactions`: id, user_id, merchant_id, points_used, transaction_date.

---
Created by Gemini CLI - 2026
