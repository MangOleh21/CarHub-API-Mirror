# CarHub Backend API

REST API Express untuk CarHub PWA. Data disimpan di Neon PostgreSQL; fitur publik tidak memerlukan login, sedangkan portal admin memakai sesi berbasis cookie.

Dibuat oleh Galileo Athari Muhammad (21120124130099) untuk Tugas Akhir Praktikum Pemrograman Perangkat Bergerak 2026.

## Setup lokal

Persyaratan: Node.js 22+ dan npm.

Jalankan perintah berikut dari direktori `backend/`:

```bash
npm install
```

Backend membaca konfigurasi dari `.env`. Jika file itu belum ada, salin `.env.example` terlebih dahulu; jangan menimpa `.env` yang sudah berisi konfigurasi lokal. Isi `DATABASE_URL` dengan connection string Neon untuk database development.

| Variabel | Keterangan |
|---|---|
| `DATABASE_URL` | Connection string PostgreSQL Neon; wajib untuk migrasi dan server |
| `PORT` | Port server, default `5000` |
| `FRONTEND_ORIGINS` | Allowlist origin frontend, dipisahkan koma; default `http://localhost:5173` |
| `CLOUDINARY_CLOUD_NAME` | Cloud name Cloudinary |
| `CLOUDINARY_API_KEY` | API key Cloudinary |
| `CLOUDINARY_API_SECRET` | API secret Cloudinary; hanya disimpan di backend |
| `CLOUDINARY_UPLOAD_PRESET` | Nama upload preset bertipe signed |

Pastikan `DATABASE_URL` menunjuk ke database yang benar sebelum menjalankan migrasi. Runner menerapkan file migration bernomor yang belum tercatat. Migration `005` memperluas pilihan transmisi dan menambahkan kolom bahan bakar nullable pada submission; migration `006` menambahkan `cars.archived_at` secara aditif. Keduanya tidak mengubah data listing yang ada. Migration hanya perlu dijalankan setelah target database dipastikan benar.
Untuk upload gambar, isi variabel `CLOUDINARY_*` pada `backend/.env` dan environment backend di Vercel. Buat upload preset Cloudinary bertipe signed. Jangan pernah menaruh `CLOUDINARY_API_SECRET` di frontend, membagikannya, atau meng-commit nilainya. Browser menerima signature sementara dari API, lalu mengirim file langsung ke Cloudinary.

```bash
npm run db:migrate
npm run admin:bootstrap
npm run dev
```

`admin:bootstrap` meminta email dan password owner secara interaktif; password tidak ditampilkan. Perintah ini hanya dapat membuat owner pertama satu kali. Server berjalan pada `PORT` yang dikonfigurasi.

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Menjalankan server development dengan watch |
| `npm start` | Menjalankan server |
| `npm test` | Menjalankan seluruh tes backend |
| `npm run db:migrate` | Menerapkan migration yang belum tercatat ke `DATABASE_URL` |
| `npm run admin:bootstrap` | Membuat owner pertama |

## Deployment ke Vercel

Atur Root Directory proyek Vercel ke `backend/`. Express app diekspor dari `src/app.js` sebagai handler default. Tambahkan `DATABASE_URL`, `FRONTEND_ORIGINS`, dan seluruh variabel `CLOUDINARY_*` pada Environment Variables Vercel; jangan letakkan `DATABASE_URL` atau `CLOUDINARY_API_SECRET` di frontend. Lihat [dokumentasi Express di Vercel](https://vercel.com/docs/frameworks/backend/express).

## Endpoint

Semua endpoint memakai prefix `/api`.
Lihat [dokumentasi lengkap API](./docs/API_DOCUMENTATION.md) untuk skema request/response, validasi, autentikasi, dan contoh tiap endpoint.

### Publik

| Method dan path | Keterangan |
|---|---|
| `GET /api/health` | Status API |
| `GET /api/cars?search=&brand=&transmission=&minPrice=&maxPrice=&minYear=&maxYear=&sortBy=createdAt&sortOrder=desc&page=1&pageSize=20` | Daftar mobil terpaginasikan dengan filter dan pengurutan |
| `GET /api/cars/:id` | Detail mobil |
| `POST /api/uploads/submissions` | Meminta field upload bertanda tangan untuk foto pengajuan |
| `POST /api/submissions` | Mengirim pengajuan jual mobil; membuat submission berstatus `pending` |

Contoh body `POST /api/submissions`:

```json
{
  "sellerName": "Ayu",
  "sellerPhone": "+6281234567890",
  "brand": "Toyota",
  "model": "Avanza",
  "year": 2020,
  "transmission": "Automatic",
  "fuelType": "Bensin",
  "mileage": 25000,
  "expectedPrice": 180000000,
  "images": [
    "https://images.example.test/car.jpg",
    "https://images.example.test/car-side.jpg"
  ],
  "description": "Kondisi terawat"
}
```

`location` dan satu hingga sepuluh URL foto HTTPS pada `images` wajib. `transmission` menerima `Manual`, `Automatic`, `CVT`, `DCT`, atau `AMT`. `fuelType` menerima `Bensin`, `Diesel`, `Hybrid`, atau `Listrik`, dan default ke `Bensin` jika tidak dikirim oleh klien lama. Field `imageUrl` tunggal tetap diterima untuk kompatibilitas. `description` opsional. Foto disimpan sebagai URL, bukan file di database.

### Admin

Admin login memakai cookie sesi HttpOnly; jangan mengirim token lewat LocalStorage. Request login, logout, perubahan katalog, moderasi submission, dan perubahan akun admin harus menyertakan header `Origin` yang termasuk dalam `FRONTEND_ORIGINS`.

| Method dan path | Akses | Keterangan |
|---|---|---|
| `POST /api/admin/auth/login` | Publik, dibatasi laju | Login dengan `email` dan `password` (minimal 12 karakter) |
| `GET /api/admin/auth/session` | Admin terautentikasi | Memeriksa sesi aktif |
| `POST /api/admin/auth/logout` | Origin tepercaya | Mencabut sesi dan menghapus cookie |
| `GET /api/admin/cars?...` | Admin terautentikasi | Daftar mobil terpaginasikan; `archiveStatus=active` (default) atau `archived` |
| `GET /api/admin/cars/:id` | Admin terautentikasi | Detail mobil |
| `POST /api/admin/uploads/cars` | Admin terautentikasi + Origin tepercaya | Meminta field upload bertanda tangan untuk foto mobil |
| `POST /api/admin/cars` | Admin terautentikasi + Origin tepercaya | Membuat mobil katalog |
| `PUT /api/admin/cars/:id` | Admin terautentikasi + Origin tepercaya | Mengganti seluruh data mobil |
| `DELETE /api/admin/cars/:id` | Admin terautentikasi + Origin tepercaya | Mengarsipkan mobil tanpa menghapus datanya; respons `204` |
| `DELETE /api/admin/cars/:id/permanent` | Admin terautentikasi + Origin tepercaya | Menghapus permanen mobil yang sudah diarsipkan; foto di object storage tetap tersimpan; respons `204` |
| `PATCH /api/admin/cars/:id/restore` | Admin terautentikasi + Origin tepercaya | Memulihkan mobil ke katalog aktif; respons `204` |
| `GET /api/admin/submissions?status=pending&page=1&pageSize=20` | Admin terautentikasi | Daftar submission terpaginasikan; status default `pending`, filter menerima `pending`, `approved`, `rejected`, atau `all` untuk semua status |
| `PATCH /api/admin/submissions/:id/approved` | Admin terautentikasi + Origin tepercaya | Menyetujui dan membuat mobil katalog secara atomik |
| `PATCH /api/admin/submissions/:id/rejected` | Admin terautentikasi + Origin tepercaya | Menolak submission tanpa membuat mobil katalog |
| `GET /api/admin/users` | Owner | Mendaftar akun owner/admin aktif dan nonaktif tanpa password/hash |
| `POST /api/admin/users` | Owner | Membuat akun ber-role `admin`; body berisi `email` dan `password` |
| `PATCH /api/admin/users/:id/deactivate` | Owner | Menonaktifkan akun admin aktif |

Password admin harus 12–128 karakter. Body `POST` dan `PUT` mobil menerima `brand`, `model`, `year`, `transmission`, `fuelType`, `mileage`, `price`, `images` (1–10 URL HTTPS; atau `imageUrl` lama untuk satu foto), `sellerName`, `sellerPhone`, `location`, dan `description`. `fuelType` default ke `Bensin`, `description` boleh `null` atau tidak dikirim. Karena `PUT` mengganti seluruh data, field yang tidak dikirim akan memakai default atau dikosongkan sesuai aturan tersebut. `DELETE /api/admin/cars/:id` mengarsipkan baris mobil; gunakan `PATCH /api/admin/cars/:id/restore` untuk memulihkannya. `DELETE /api/admin/cars/:id/permanent` menghapus permanen hanya baris yang sudah diarsipkan; file foto di object storage tidak dihapus.

Body kedua endpoint menerima `reviewNote` opsional (maksimal 3.000 karakter). Untuk approval, `location` dan/atau `images` juga dapat dikirim jika submission lama belum memilikinya; data yang sudah diberikan penjual tetap dipakai. Email reviewer diambil dari sesi admin dan tidak dapat ditentukan melalui body. Submission yang sudah tidak berstatus `pending` tidak dapat diproses kembali (`409`). Keputusan baru menyimpan email reviewer, catatan, dan `reviewedAt`; nilai historis pada database development dapat memakai `created_at` sebagai perkiraan.

Contoh body (catatan dapat dihilangkan):

```json
{ "reviewNote": "Data kendaraan telah diperiksa." }
```

Kirim body yang sama ke `/api/admin/submissions/:id/approved` atau `/api/admin/submissions/:id/rejected`; pada approval data lokasi/foto hanya diperlukan jika submission belum memilikinya.

## Skema database

Migration berada di `migrations/001_initial_schema.sql` hingga `migrations/006_add_car_archive.sql`. Migration `004` menambahkan galeri foto dan timestamp review; migration `005` memperluas opsi transmisi dan menambahkan `submissions.fuel_type` nullable; migration `006` menambahkan `cars.archived_at` nullable. Migration `005` dan `006` tidak memperbarui atau menghapus baris yang sudah ada.

| Tabel | Kolom utama |
|---|---|
| `cars` | `id`, `brand`, `model`, `year`, `transmission`, `fuel_type`, `mileage`, `price`, `image_url`, `images`, `seller_name`, `seller_phone`, `location`, `description`, `archived_at`, `created_at` |
| `submissions` | `id`, `seller_name`, `seller_phone`, `brand`, `model`, `year`, `transmission`, `fuel_type`, `mileage`, `expected_price`, `image_url`, `images`, `location`, `description`, `status`, `reviewed_by_email`, `review_note`, `reviewed_at`, `created_at` |
| `admin_users` | `id`, `email`, `password_hash`, `role` (`owner` atau `admin`), `is_active`, `created_at` |
| `admin_sessions` | `id`, `admin_user_id`, `token_hash`, `expires_at`, `revoked_at`, `created_at` |

ID database bertipe `BIGINT` dan dikirim API sebagai string agar tidak kehilangan presisi. Nilai harga pada katalog juga dikirim sebagai string; nilai angka pada body pengajuan dikirim sebagai JSON number.

## Postman

Import `postman/PPB_API_Postman_Collection.json` dan `postman/PPB_API_Postman_Environment.json`. Pilih environment **CarHub Local**, lalu isi variabel kredensial admin jika ingin menjalankan request admin. Host dan port API bisa diubah melalui `apiHost` dan `apiPort`.

Untuk menguji upload gambar, buka folder **Public API** dan jalankan **Request submission image upload URL** sekali untuk setiap foto. Atur `uploadContentType` dan `uploadFileSizeBytes` sesuai file, lalu jalankan **Upload submission image to Cloudinary** dan pilih file yang sama pada bagian Body > form-data. Foto yang berhasil akan menjadi aset publik di Cloudinary dan tidak dihapus oleh collection, jadi gunakan hanya akun local/development. Masukkan URL berurutan pada field `images` request **Create car submission**. Batas 5 MiB divalidasi UI dan API berdasarkan ukuran yang dilaporkan klien; signed direct upload tidak dapat memaksakan batas ukuran file di Cloudinary. Rincian kontrak ada di [dokumentasi API](./docs/API_DOCUMENTATION.md#post-apiuploadssubmissions).

Collection juga dapat membuat dan menghapus mobil uji, serta mengirim dan mengapprove submission; gunakan hanya pada database local/development.

## Troubleshooting

- SSL warning dari `pg-connection-string`: pool mengubah `sslmode=prefer`, `require`, atau `verify-ca` menjadi `verify-full`, yang mempertahankan verifikasi penuh TLS.
- Jika endpoint mengembalikan `500`, log server mencatat `errorClass` dan `errorCode` tanpa menampilkan pesan error. Untuk upload Cloudinary, periksa konfigurasi `CLOUDINARY_*` pada environment backend; saat meminta bantuan debug, bagikan hanya `errorClass` dan `errorCode`, bukan isi error mentah atau kredensial. Kode PostgreSQL `42P01` berarti tabel tidak ditemukan; pastikan `DATABASE_URL` menunjuk ke database development yang benar dan migration sudah diterapkan.
- Jangan membagikan nilai `DATABASE_URL`; cukup bagikan `errorCode` jika meminta bantuan debug.
