# TrafficGuard AI — Intelligent Transit & Traffic Vision System

[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-green.svg)](https://nodejs.org/)
[![MongoDB Atlas](https://img.shields.io/badge/MongoDB%20Atlas-Cluster0-brightgreen.svg)](https://www.mongodb.com/cloud/atlas)
[![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-COCO--SSD-orange.svg)](https://www.tensorflow.org/js)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Sistem Computer Vision canggih berbasis Web dan Cloud Database (MongoDB Atlas) untuk memonitor lalu lintas jalan raya dan transportasi rel secara real-time. Mendukung input berupa **Foto** dan **Video rekaman**.

---

## 🚀 Fitur Utama

1. **Deteksi & Klasifikasi Kendaraan**:
   - Menghitung jumlah total kendaraan secara akurat.
   - Kategorisasi real-time: **Mobil**, **Motor**, **Bus**, **Truk**, dan **Kereta**.

2. **Deteksi Jumlah Penumpang Kereta**:
   - Menghitung kepadatan orang/penumpang pada gerbong kereta atau peron stasiun.
   - Indikator Okupansi real-time (*Sepi*, *Moderat*, *Penuh/Padat*).

3. **Automatic License Plate Recognition (ALPR)**:
   - Isolasi wilayah plat nomor kendaraan.
   - OCR character extraction dengan pola standar Indonesia (contoh: `B 1842 RFO`, `D 4591 ABC`).
   - Tingkat keyakinan (confidence score) pembacaan plat.

4. **Deteksi Kondisi Pencahayaan & Waktu (Siang / Sore / Malam)**:
   - Analisis luminansi rata-rata Grayscale: $Y = 0.299R + 0.587G + 0.114B$
   - Pengukuran nilai kecerahan HSV ($V$) dan saturasi.
   - Indeks kehangatan YIQ ($I = 0.596R - 0.274G - 0.322B$) untuk mendeteksi rona senja/sunset.
   - Rekomendasi preprocessing citra (*Grayscale + Binary M3*, *Warm Tint Gamma Balanced*, *Night Low-Light Equalization*).

5. **Multi-Input Media**:
   - **Foto**: Analisis instan beresolusi penuh.
   - **Video**: Pemutar video terintegrasi dengan scrubber, ekstraksi keyframe dengan FFmpeg, tripwire counting line.
   - **Kamera Langsung**: Dukungan webcam untuk pengujian lokal.

6. **Integrasi MongoDB Atlas Database**:
   - Terkoneksi ke database `trafficguard` dengan koleksi `trafficlogs`.
   - Driver dengan failover otomatis (SRV & ReplicaSet connection fallback).
   - Fitur **Auto-Sync**, **Manual Sync**, filter pencarian, dan **Export JSON**.

---

## 🛠️ Arsitektur Proyek

```
├── trafficDb.js             # Driver MongoDB Atlas (koleksi trafficlogs, CRUD, agregasi)
├── trafficVision.js         # Engine fotometrik (Siang/Sore/Malam), ALPR, FFmpeg frame extractor
├── trafficGuardBackend.js   # Express REST API (/api/traffic/*) & Multer upload handler
├── server.js                # Server utama Express & static web server
├── test_trafficguard_api.js # Skrip uji coba otomatis end-to-end
├── Procfile                 # Deployment descriptor untuk Heroku
├── public/
│   ├── trafficguard.html    # Halaman Dashboard Web
│   ├── trafficguard.css     # Desain UI Cyber-Dark Glassmorphism
│   └── trafficguard.js      # Controller logika frontend, inferensi TF.js & canvas HUD
└── uploads/                 # Direktori sementara penyimpanan media & frame ekstraksi
```

---

## ⚡ Panduan Instalasi & Menjalankan

### 1. Kloning Repository & Masuk ke Direktori
```bash
git clone https://github.com/username/trafficguard-ai.git
cd trafficguard-ai
```

### 2. Pasang Dependencies
```bash
npm install
```

### 3. Konfigurasi Database MongoDB Atlas
Koneksi default telah disematkan pada `trafficDb.js` atau dapat disesuaikan menggunakan environment variable:
```env
MONGODB_URI=mongodb+srv://dimasryanjr_db_user:dimasugesti@cluster0.yyngy7.mongodb.net/trafficguard?appName=Cluster0
```

### 4. Uji Coba Koneksi & Engine
```bash
npm run test:traffic
```

### 5. Jalankan Server
```bash
npm start
```
Buka peramban (browser) di alamat:
👉 **`http://localhost:3000/trafficguard.html`**

---

## 📄 Lisensi
Didistribusikan di bawah Lisensi MIT. Bebas dimodifikasi dan dikembangkan lebih lanjut.
