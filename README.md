# CarHub Backend API

REST API Express untuk CarHub PWA. Data disimpan di Neon PostgreSQL; fitur publik tidak memerlukan login, sedangkan portal admin memakai sesi berbasis cookie.

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

Pastikan `DATABASE_URL` menunjuk ke database yang benar sebelum menjalankan migrasi. Migration menambahkan tabel dan indeks yang dibutuhkan API.

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

## Endpoint

Semua endpoint memakai prefix `/api`.

### Publik

| Method dan path | Keterangan |
|---|---|
| `GET /api/health` | Status API |
| `GET /api/cars?search=&brand=&page=1&pageSize=20` | Daftar mobil terpaginasikan; `search`, `brand`, `page`, dan `pageSize` opsional |
| `GET /api/cars/:id` | Detail mobil |
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
  "mileage": 25000,
  "expectedPrice": 180000000,
  "imageUrl": "https://images.example.test/car.jpg",
  "description": "Kondisi terawat"
}
```

`imageUrl` dan `description` opsional. `imageUrl`, jika dikirim, harus berupa URL HTTPS. Foto disimpan sebagai URL, bukan file di database.

### Admin

Admin login memakai cookie sesi HttpOnly; jangan mengirim token lewat LocalStorage. Request login, logout, dan perubahan akun admin harus menyertakan header `Origin` yang termasuk dalam `FRONTEND_ORIGINS`.

| Method dan path | Akses | Keterangan |
|---|---|---|
| `POST /api/admin/auth/login` | Publik, dibatasi laju | Login dengan `email` dan `password` (minimal 12 karakter) |
| `GET /api/admin/auth/session` | Admin terautentikasi | Memeriksa sesi aktif |
| `POST /api/admin/auth/logout` | Origin tepercaya | Mencabut sesi dan menghapus cookie |
| `POST /api/admin/users` | Owner | Membuat akun ber-role `admin`; body berisi `email` dan `password` |
| `PATCH /api/admin/users/:id/deactivate` | Owner | Menonaktifkan akun admin aktif |

Password admin harus 12–128 karakter. Belum tersedia endpoint admin untuk CRUD katalog mobil atau moderasi submission.

## Skema database

Migration awal berada di `migrations/001_initial_schema.sql`.

| Tabel | Kolom utama |
|---|---|
| `cars` | `id`, `brand`, `model`, `year`, `transmission`, `fuel_type`, `mileage`, `price`, `image_url`, `seller_name`, `seller_phone`, `location`, `description`, `created_at` |
| `submissions` | `id`, `seller_name`, `seller_phone`, `brand`, `model`, `year`, `transmission`, `mileage`, `expected_price`, `image_url`, `description`, `status`, `created_at` |
| `admin_users` | `id`, `email`, `password_hash`, `role` (`owner` atau `admin`), `is_active`, `created_at` |
| `admin_sessions` | `id`, `admin_user_id`, `token_hash`, `expires_at`, `revoked_at`, `created_at` |

ID database bertipe `BIGINT` dan dikirim API sebagai string agar tidak kehilangan presisi. Nilai harga pada katalog juga dikirim sebagai string; nilai angka pada body pengajuan dikirim sebagai JSON number.

## Postman

Import `postman/PPB_API_Postman_Collection.json` dan `postman/PPB_API_Postman_Environment.json`. Pilih environment **CarHub Local**, lalu isi variabel kredensial admin. Host dan port API bisa diubah melalui `apiHost` dan `apiPort`. Collection mencakup request yang menulis data; gunakan hanya pada database local/development.

## Troubleshooting

- SSL warning dari `pg-connection-string`: pool mengubah `sslmode=prefer`, `require`, atau `verify-ca` menjadi `verify-full`, yang mempertahankan verifikasi penuh TLS.
- Jika endpoint mengembalikan `500`, log server sekarang mencatat `errorCode` tanpa menampilkan pesan database. Kode PostgreSQL `42P01` berarti tabel tidak ditemukan; pastikan `DATABASE_URL` menunjuk ke database development yang benar dan migration sudah diterapkan.
- Jangan membagikan nilai `DATABASE_URL`; cukup bagikan `errorCode` jika meminta bantuan debug.
