# CarHub REST API

Dokumentasi ini merujuk implementasi API yang tersedia di backend saat ini. Tidak ada prefix versi; seluruh route memakai prefix `/api`.

## Menjalankan API

Untuk konfigurasi lokal, migrasi database, dan perintah backend, lihat [README backend](../README.md). API lokal biasanya tersedia di `http://localhost:5000`.
Koleksi request siap pakai tersedia di [`postman/`](../postman/); import collection dan environment lokal dari folder tersebut.

Setiap contoh request menggunakan base URL berikut:

```text
http://localhost:5000
```

Untuk deployment, ganti dengan URL API yang dikonfigurasi. Jangan pernah mengirim `DATABASE_URL` ke frontend atau membagikan nilainya.

## Format umum

- Body request yang menerima data menggunakan `Content-Type: application/json`.
- Sebagian besar respons berhasil berbentuk JSON dengan `success` dan `data`; pengecualiannya adalah health check (`status`) dan endpoint yang mengembalikan `204 No Content`.
- ID database `BIGINT` selalu dikirim sebagai string.
- `price` dan `expectedPrice` juga dikirim sebagai string dalam objek respons agar nilainya tetap presisi. Dalam request, keduanya dikirim sebagai JSON number.
- Waktu `createdAt` dikirim sebagai timestamp ISO 8601.
- Field dengan nilai `null` dapat muncul pada data lama, khususnya `location`, `imageUrl`, `fuelType`, `reviewedByEmail`, `reviewNote`, dan `reviewedAt` pada submission.
- `images` berisi URL gambar berurutan; `imageUrl` tetap tersedia sebagai alias gambar pertama untuk kompatibilitas.

### Pagination dan filter katalog

`GET /api/cars` dan `GET /api/admin/cars` menerima query berikut:

| Parameter | Tipe | Default | Aturan |
|---|---|---:|---|
| `search` | string | — | Maksimal 100 karakter; pencarian sebagian tanpa membedakan kapital pada brand atau model |
| `brand` | string | — | Maksimal 100 karakter; pencocokan brand tanpa membedakan kapital |
| `transmission` | string | — | `Manual`, `Automatic`, `CVT`, `DCT`, atau `AMT` |
| `minPrice`, `maxPrice` | integer | — | Rentang harga inklusif, positif, dan maksimal `Number.MAX_SAFE_INTEGER`; nilai minimum tidak boleh melebihi maksimum |
| `minYear`, `maxYear` | integer | — | Rentang tahun inklusif 1886–2100; nilai minimum tidak boleh melebihi maksimum |
| `sortBy` | string | `createdAt` | `createdAt`, `price`, atau `year` |
| `sortOrder` | string | `desc` | `asc` atau `desc` |
| `page` | integer | `1` | Rentang 1–1.000.000 |
| `pageSize` | integer | `20` | Rentang 1–100 |

Filter `search`, `brand`, transmisi, dan rentang harga/tahun yang digunakan bersamaan harus cocok semuanya. Parameter sort memakai kolom yang diizinkan server; jika nilai harga/tahun sama, ID menjadi pemecah urutan. Parameter yang tidak dikenal atau nilai di luar aturan menghasilkan `422`. Respons daftar menggunakan bentuk:

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 0,
    "totalPages": 0
  }
}
```

### Autentikasi admin dan Origin

- Endpoint admin memakai cookie sesi `carhub_admin_session`; API tidak menerima bearer token sebagai mekanisme autentikasi.
- Login berhasil mengirim cookie `HttpOnly` dengan masa berlaku 8 jam. Cookie memakai `Secure` ketika `NODE_ENV=production` atau `ADMIN_COOKIE_SECURE=true`; `SameSite` default-nya `lax` dan dapat diatur dengan `ADMIN_COOKIE_SAME_SITE`. Nilai `none` hanya boleh digunakan bersama cookie `Secure`.
- Pemanggilan dari browser lintas-origin harus menyertakan credentials (misalnya `credentials: "include"` pada `fetch`), dan origin frontend harus ada di `FRONTEND_ORIGINS`.
- Request login, logout, dan semua operasi tulis admin harus menyertakan header `Origin` yang sama persis dengan salah satu origin di `FRONTEND_ORIGINS`. Request tanpa origin tepercaya ditolak dengan `403`.
- Login dibatasi maksimal 10 percobaan dalam 15 menit. Kesalahan kredensial memakai respons yang sama, baik email tidak ditemukan, akun nonaktif, maupun password salah.
- Owner pertama dibuat secara lokal melalui `npm run admin:bootstrap`; tidak ada endpoint HTTP untuk membuat owner. Hanya owner dapat membuat atau menonaktifkan akun dengan role `admin`.

Contoh header browser/Postman untuk request admin:

```http
Origin: http://localhost:5173
Cookie: carhub_admin_session=<cookie dari login>
Content-Type: application/json
```

Jangan menyalin atau menyimpan token sesi secara manual ke LocalStorage.

## Endpoint publik

### `GET /api/health`

Memeriksa bahwa API merespons.

**Respons `200`:**

```json
{ "status": "ok" }
```

### `GET /api/cars`

Mengambil daftar mobil katalog dengan pagination dan filter opsional. Parameter dijelaskan pada bagian [Pagination dan filter katalog](#pagination-dan-filter-katalog).

**Respons `200`:** mengikuti bentuk respons daftar umum. Setiap item menggunakan skema [Car](#car).

**Respons lain:** `422 VALIDATION_ERROR` jika query tidak valid.

### `GET /api/cars/:id`

Mengambil detail satu mobil. `id` harus berupa bilangan bulat positif yang sesuai batas `BIGINT`.

**Respons `200`:**

```json
{
  "success": true,
  "data": {
    "id": "42",
    "brand": "Toyota",
    "model": "Avanza",
    "year": 2020,
    "transmission": "Automatic",
    "fuelType": "Bensin",
    "mileage": 25000,
    "price": "180000000",
    "imageUrl": "https://images.example.test/car.jpg",
    "images": [
      "https://images.example.test/car.jpg",
      "https://images.example.test/car-side.jpg"
    ],
    "sellerName": "Ayu",
    "sellerPhone": "+6281234567890",
    "location": "Bandung",
    "description": "Kondisi terawat",
    "createdAt": "2026-01-15T10:30:00.000Z"
  }
}
```

**Respons error:**

- `422 VALIDATION_ERROR` — format ID tidak valid.
- `404 NOT_FOUND` — mobil tidak ditemukan.

### `POST /api/submissions`

Mengirim pengajuan penjualan mobil. Endpoint ini publik dan membuat submission dengan status `pending`.

**Request body:**

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
  "location": "Bandung",
  "images": [
    "https://images.example.test/car.jpg",
    "https://images.example.test/car-side.jpg"
  ],
  "description": "Kondisi terawat"
}
```

Semua field wajib kecuali `fuelType` dan `description`. `fuelType` menerima `Bensin`, `Diesel`, `Hybrid`, atau `Listrik`, dengan default `Bensin` untuk klien lama. Kirim `images` berisi 1–10 URL HTTPS; `imageUrl` tunggal masih diterima untuk kompatibilitas dan menjadi gambar pertama.

| Field | Tipe | Aturan |
|---|---|---|
| `sellerName` | string | Wajib, 1–150 karakter setelah trim |
| `sellerPhone` | string | Wajib; opsional `+`, lalu digit, diikuti 7–19 digit/spasi/`(`/`)`/`-` |
| `brand` | string | Wajib, 1–100 karakter |
| `model` | string | Wajib, 1–100 karakter |
| `year` | integer | Wajib, 1886 sampai tahun berjalan + 1 |
| `transmission` | string | Wajib: `Manual`, `Automatic`, `CVT`, `DCT`, atau `AMT` |
| `fuelType` | string | Opsional: `Bensin`, `Diesel`, `Hybrid`, atau `Listrik`; default `Bensin` |
| `mileage` | integer | Validator request menerima 0 sampai `Number.MAX_SAFE_INTEGER`, tetapi kolom database bertipe `INT`; nilai di atas 2.147.483.647 dapat gagal disimpan dan menghasilkan `500`. Batas praktis saat ini: 2.147.483.647 |
| `expectedPrice` | integer | Wajib, positif dan tidak melebihi `Number.MAX_SAFE_INTEGER` |
| `location` | string | Wajib, 1–150 karakter setelah trim |
| `images` | array URL | Wajib untuk beberapa foto, 1–10 URL valid dengan skema `https:` |
| `imageUrl` | URL | Bentuk kompatibilitas satu foto; URL valid dengan skema `https:` |
| `description` | string | Opsional, maksimal 3.000 karakter; boleh dihilangkan |

Body bersifat strict; field tambahan yang tidak dikenal akan ditolak.

**Respons `201`:**

```json
{
  "success": true,
  "data": {
    "id": "105",
    "status": "pending",
    "createdAt": "2026-01-15T10:30:00.000Z"
  }
}
```

**Respons error:** `422 VALIDATION_ERROR` jika body tidak valid.

### `POST /api/uploads/submissions`

Meminta URL bertanda tangan dan field upload untuk mengirim satu foto pengajuan langsung ke Cloudinary. Request ini hanya membuat otorisasi upload; file tidak dikirim ke API. Kirim `Origin` yang termasuk dalam `FRONTEND_ORIGINS`. Endpoint ini dibatasi 10 kali per 15 menit per proses API.

**Request body:**

```json
{
  "contentType": "image/png",
  "size": 1024
}
```

`contentType` hanya menerima `image/jpeg`, `image/png`, atau `image/webp`. `size` adalah ukuran file dalam byte yang dilaporkan klien, dari 1 sampai 5.242.880 (5 MiB); endpoint menolak nilai di luar rentang tersebut. Karena file diunggah langsung ke Cloudinary, nilai `size` bukan bukti ukuran aktual dan tidak membatasi file yang dikirim ke Cloudinary. UI memvalidasi ukuran 5 MiB, tetapi batas keras tidak tersedia per upload preset Cloudinary.

**Respons `200`:**

```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://api.cloudinary.com/v1_1/<cloud-name>/image/upload",
    "uploadFields": {
      "timestamp": 1737000000,
      "public_id": "<generated-id>",
      "asset_folder": "carhub/submissions",
      "upload_preset": "<signed-preset>",
      "overwrite": false,
      "allowed_formats": "jpg,png,webp",
      "api_key": "<cloudinary-api-key>",
      "signature": "<temporary-signature>"
    }
  }
}
```

Kirim setiap file menggunakan `multipart/form-data` dengan method `POST` ke `uploadUrl`. Sertakan field `file` dan semua pasangan nama/nilai dari `uploadFields`; minta signature upload terpisah untuk tiap file. Cloudinary mengembalikan `secure_url`; kirim URL berurutan di `images` pada `POST /api/submissions`. API secret tidak pernah dikirim ke browser. Upload preset harus bertipe signed dan host API upload tetap `api.cloudinary.com`.

**Respons error:** `403 FORBIDDEN` jika Origin tidak diizinkan, `422 VALIDATION_ERROR` jika tipe konten/ukuran deklaratif tidak valid, `429 RATE_LIMITED` jika batas request tercapai, atau `500 INTERNAL_ERROR` jika konfigurasi/signature gagal.

### `POST /api/admin/uploads/cars`

Meminta URL dan field upload Cloudinary untuk foto mobil katalog. Endpoint ini memerlukan sesi admin aktif dan `Origin` yang termasuk dalam `FRONTEND_ORIGINS`. Request body, respons, serta alur upload langsung ke Cloudinary sama dengan `POST /api/uploads/submissions`, kecuali `asset_folder` bernilai `carhub/cars`. Nilai ukuran tetap merupakan deklarasi klien, bukan batas keras pada file yang diunggah.

**Respons error:** `401 UNAUTHENTICATED` jika sesi admin tidak aktif, `403 FORBIDDEN` jika Origin tidak diizinkan, `422 VALIDATION_ERROR` jika tipe konten/ukuran deklaratif tidak valid, atau `500 INTERNAL_ERROR` jika konfigurasi/signature gagal.

## Endpoint admin: autentikasi

### `POST /api/admin/auth/login`

Login admin. Wajib mengirim `Origin` tepercaya. Email dinormalisasi menjadi huruf kecil saat dicari. Password harus 12–128 karakter.

**Request body:**

```json
{
  "email": "admin@example.test",
  "password": "<password admin>"
}
```

**Respons `200`:** cookie sesi dikirim melalui header `Set-Cookie`.

```json
{
  "success": true,
  "data": {
    "admin": {
      "id": "1",
      "email": "admin@example.test",
      "role": "owner"
    }
  }
}
```

**Respons error:**

- `401 INVALID_CREDENTIALS` — email/password tidak cocok atau akun tidak aktif.
- `403 FORBIDDEN` — `Origin` tidak diizinkan.
- `422 VALIDATION_ERROR` — email/password tidak memenuhi format.
- `429 RATE_LIMITED` — batas percobaan login tercapai.

### `GET /api/admin/auth/session`

Mengambil identitas admin dari cookie sesi aktif.

**Respons `200`:**

```json
{
  "success": true,
  "data": {
    "admin": {
      "id": "1",
      "email": "admin@example.test",
      "role": "owner"
    }
  }
}
```

**Respons error:** `401 UNAUTHENTICATED` jika cookie tidak ada, sesi kedaluwarsa/dicabut, atau akun nonaktif.

### `POST /api/admin/auth/logout`

Wajib mengirim `Origin` tepercaya. Mencabut sesi jika cookie tersedia dan menghapus cookie pada respons. Autentikasi aktif tidak diwajibkan untuk memanggil logout.

**Respons `204`:** tidak ada response body.

**Respons error:** `403 FORBIDDEN` jika `Origin` tidak diizinkan.

## Endpoint admin: katalog mobil

Semua endpoint katalog admin selain pembacaan memerlukan sesi admin aktif dan `Origin` tepercaya.

### `GET /api/admin/cars`

Mengambil daftar mobil untuk pengelolaan. Mendukung filter dan pagination yang sama dengan `GET /api/cars`.

**Respons `200`:** mengikuti bentuk respons daftar umum; setiap item menggunakan skema [Car](#car).

**Respons error:** `401 UNAUTHENTICATED` jika admin belum login; `422 VALIDATION_ERROR` jika query tidak valid.

### `GET /api/admin/cars/:id`

Mengambil detail mobil untuk admin. Respons sukses dan error sama seperti `GET /api/cars/:id`, ditambah `401 UNAUTHENTICATED` jika belum login.

### `POST /api/admin/cars`

Membuat mobil baru di katalog. Wajib mengirim body lengkap sesuai [Car input](#car-input).

**Respons `201`:**

```json
{
  "success": true,
  "data": {
    "id": "42",
    "brand": "Toyota",
    "model": "Avanza",
    "year": 2020,
    "transmission": "Automatic",
    "fuelType": "Bensin",
    "mileage": 25000,
    "price": "180000000",
    "imageUrl": "https://images.example.test/car.jpg",
    "images": [
      "https://images.example.test/car.jpg",
      "https://images.example.test/car-side.jpg"
    ],
    "sellerName": "Ayu",
    "sellerPhone": "+6281234567890",
    "location": "Bandung",
    "description": null,
    "createdAt": "2026-01-15T10:30:00.000Z"
  }
}
```

**Respons error:** `401 UNAUTHENTICATED`, `403 FORBIDDEN` untuk Origin tidak tepercaya, atau `422 VALIDATION_ERROR`.

### `PUT /api/admin/cars/:id`

Mengganti data mobil. `PUT` memerlukan body lengkap, bukan partial update.

**Request body:** sama dengan [Car input](#car-input).

**Respons `200`:** `{ "success": true, "data": <Car> }`.

**Respons error:** `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `422 VALIDATION_ERROR` untuk ID/body tidak valid, atau `404 NOT_FOUND` jika mobil tidak ditemukan.

### `DELETE /api/admin/cars/:id`

Menghapus permanen satu mobil. Operasi ini adalah **hard delete** dan tidak menyediakan pemulihan melalui API.

**Respons `204`:** tidak ada response body.

**Respons error:** `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `422 VALIDATION_ERROR` untuk ID tidak valid, atau `404 NOT_FOUND` jika mobil tidak ditemukan.

### Car input

Body `POST` dan `PUT` harus berupa object strict dengan field berikut:

| Field | Tipe | Aturan |
|---|---|---|
| `brand` | string | Wajib, 1–100 karakter setelah trim |
| `model` | string | Wajib, 1–100 karakter setelah trim |
| `year` | integer | Wajib, 1886–2100 |
| `transmission` | string | Wajib: `Manual`, `Automatic`, `CVT`, `DCT`, atau `AMT` |
| `fuelType` | string | Opsional, 1–50 karakter; default `Bensin` |
| `mileage` | integer | Wajib, 0–2.147.483.647 |
| `price` | integer | Wajib, positif dan tidak melebihi `Number.MAX_SAFE_INTEGER` |
| `images` | array URL | Wajib untuk beberapa foto, 1–10 URL valid dengan skema `https:` |
| `imageUrl` | URL | Bentuk kompatibilitas satu foto; URL valid dengan skema `https:` |
| `sellerName` | string | Wajib, 1–150 karakter setelah trim |
| `sellerPhone` | string | Wajib; opsional `+`, lalu digit, diikuti 7–19 digit/spasi/`(`/`)`/`-` |
| `location` | string | Wajib, 1–150 karakter setelah trim |
| `description` | string atau `null` | Opsional, maksimal 3.000 karakter; jika dihilangkan atau `null`, disimpan sebagai `null` |

Field tambahan ditolak. Nilai `price` dikirim sebagai JSON number pada request, tetapi akan menjadi string di respons.

## Endpoint admin: moderasi submission

Semua endpoint membutuhkan sesi admin aktif. Operasi keputusan juga wajib mengirim `Origin` tepercaya. Email reviewer selalu diambil dari sesi, tidak dari request body.

### `GET /api/admin/submissions`

Mengambil daftar submission dengan pagination. Hasil diurutkan dari data terbaru.

| Parameter | Tipe | Default | Aturan |
|---|---|---:|---|
| `status` | string | `pending` | `pending`, `approved`, `rejected`, atau `all` |
| `page` | integer | `1` | Rentang 1–1.000.000 |
| `pageSize` | integer | `20` | Rentang 1–100 |

`status=all` menyertakan submission dari semua status. Data item mengikuti skema [Submission](#submission).

**Respons `200`:** mengikuti bentuk respons daftar umum.

**Respons error:** `401 UNAUTHENTICATED` atau `422 VALIDATION_ERROR`.

### `PATCH /api/admin/submissions/:id/approved`

Menyetujui submission pending dan membuat mobil katalog dalam satu transaksi. Data kendaraan, seller, harga, deskripsi, dan `fuelType` diambil dari submission. Untuk submission lama yang belum memiliki `fuelType`, nilai mobil baru tetap memakai `Bensin`.

Untuk submission lama yang belum mempunyai lokasi/foto, body dapat mengisi nilai yang hilang. Nilai pada submission yang sudah tersedia tetap digunakan. Lokasi dan URL foto diperlukan agar approval dapat berhasil.

**Request body:**

```json
{
  "reviewNote": "Data kendaraan telah diperiksa.",
  "location": "Bandung",
  "images": [
    "https://images.example.test/car.jpg",
    "https://images.example.test/car-side.jpg"
  ]
}
```

`reviewNote`, `location`, `imageUrl`, dan `images` opsional. Untuk submission lama yang belum mempunyai foto, `imageUrl` tunggal atau `images` 1–10 URL HTTPS dapat diberikan. `reviewNote` jika dikirim harus berisi 1–3.000 karakter setelah trim. `location` harus berisi 1–150 karakter setelah trim. Body bersifat strict.

**Respons `200`:**

```json
{
  "success": true,
  "data": {
    "submission": {
      "id": "105",
      "status": "approved",
      "reviewedByEmail": "admin@example.test",
      "reviewNote": "Data kendaraan telah diperiksa.",
      "reviewedAt": "2026-11-24T00:00:00.000Z"
    },
    "car": {
      "id": "42"
    }
  }
}
```

**Respons error:**

- `401 UNAUTHENTICATED` — tidak ada sesi admin aktif.
- `403 FORBIDDEN` — Origin tidak diizinkan.
- `404 SUBMISSION_NOT_FOUND` — ID tidak ditemukan.
- `409 SUBMISSION_NOT_PENDING` — status sudah bukan `pending`; respons menyertakan status saat ini.
- `422 VALIDATION_ERROR` — ID/body tidak valid.
- `422 SUBMISSION_MISSING_REQUIRED_FIELDS` — lokasi dan/atau URL foto masih tidak tersedia. `details.fields` berisi field yang kurang.

### `PATCH /api/admin/submissions/:id/rejected`

Menolak submission pending tanpa membuat mobil katalog. Kirim object JSON kosong (`{}`) atau object yang berisi catatan review.

**Request body opsional:**

```json
{
  "reviewNote": "Dokumen kendaraan belum lengkap."
}
```

Jika dikirim, `reviewNote` harus berisi 1–3.000 karakter setelah trim.

**Respons `200`:**

```json
{
  "success": true,
  "data": {
    "submission": {
      "id": "105",
      "status": "rejected",
      "reviewedByEmail": "admin@example.test",
      "reviewNote": "Dokumen kendaraan belum lengkap.",
      "reviewedAt": "2026-11-24T00:00:00.000Z"
    },
    "car": null
  }
}
```

Error yang mungkin: sama dengan endpoint approval, kecuali `SUBMISSION_MISSING_REQUIRED_FIELDS` tidak berlaku.

## Endpoint admin: akun admin

Semua endpoint hanya dapat dipakai oleh owner dengan sesi aktif. Operasi tulis juga memerlukan `Origin` tepercaya.

### `GET /api/admin/users`

Mengambil daftar akun owner/admin beserta status aktif dan waktu pembuatan. Hash/password tidak pernah dikembalikan.

**Respons `200`:** `{ "success": true, "data": [<Admin>] }`.

**Respons error:** `401 UNAUTHENTICATED` atau `403 FORBIDDEN` jika sesi bukan owner.

### `POST /api/admin/users`

Membuat akun dengan role `admin`.

**Request body:**

```json
{
  "email": "moderator@example.test",
  "password": "<password baru, minimal 12 karakter>"
}
```

Email harus valid dan maksimal 254 karakter. Password harus 12–128 karakter. Body strict; role tidak boleh dipilih dalam request.

**Respons `201`:**

```json
{
  "success": true,
  "data": {
    "admin": {
      "id": "2",
      "email": "moderator@example.test",
      "role": "admin",
      "isActive": true
    }
  }
}
```

**Respons error:** `401 UNAUTHENTICATED`, `403 FORBIDDEN` untuk Origin tidak tepercaya atau role bukan owner, `409 ADMIN_EMAIL_EXISTS`, atau `422 VALIDATION_ERROR`.

### `PATCH /api/admin/users/:id/deactivate`

Menonaktifkan akun aktif dengan role `admin`; sesi aktif akun tersebut ikut dicabut. Owner tidak dapat dinonaktifkan melalui endpoint ini.

**Respons `200`:** `{ "success": true, "data": { "admin": <Admin> } }`.

**Respons error:** `401 UNAUTHENTICATED`, `403 FORBIDDEN` untuk Origin tidak tepercaya atau role bukan owner, `404 ADMIN_NOT_FOUND` jika tidak ada akun admin aktif dengan ID tersebut, atau `422 VALIDATION_ERROR` jika ID tidak valid.

## Skema respons

### Car

```json
{
  "id": "42",
  "brand": "Toyota",
  "model": "Avanza",
  "year": 2020,
  "transmission": "Automatic",
  "fuelType": "Bensin",
  "mileage": 25000,
  "price": "180000000",
  "imageUrl": "https://images.example.test/car.jpg",
  "images": [
    "https://images.example.test/car.jpg",
    "https://images.example.test/car-side.jpg"
  ],
  "sellerName": "Ayu",
  "sellerPhone": "+6281234567890",
  "location": "Bandung",
  "description": null,
  "createdAt": "2026-01-15T10:30:00.000Z"
}
```

### Submission

```json
{
  "id": "105",
  "sellerName": "Ayu",
  "sellerPhone": "+6281234567890",
  "brand": "Toyota",
  "model": "Avanza",
  "year": 2020,
  "transmission": "Automatic",
  "fuelType": "Bensin",
  "mileage": 25000,
  "expectedPrice": "180000000",
  "images": [
    "https://images.example.test/car.jpg",
    "https://images.example.test/car-side.jpg"
  ],
  "location": "Bandung",
  "description": "Kondisi terawat",
  "status": "pending",
  "reviewedByEmail": null,
  "reviewNote": null,
  "reviewedAt": null,
  "createdAt": "2026-01-15T10:30:00.000Z"
}
```

Untuk submission lama, `imageUrl` dan `location` dapat bernilai `null`; `images` dapat kosong. `reviewedByEmail`, `reviewNote`, dan `reviewedAt` bernilai `null` sampai review dilakukan. Data historis yang sudah di-backfill dapat memakai `createdAt` sebagai perkiraan `reviewedAt`. Respons `POST /api/submissions` hanya mengembalikan `id`, `status`, dan `createdAt`; respons moderasi mengembalikan ringkasan submission dan ID mobil jika approval berhasil.

### Admin

Objek admin yang dikembalikan oleh login/session memuat `id`, `email`, dan `role`. Endpoint akun admin juga mengembalikan `isActive`. Password dan hash password tidak pernah disertakan dalam respons.

## Format error

Sebagian besar error memakai bentuk berikut:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid car data",
    "details": {
      "brand": ["<pesan validasi>"]
    }
  }
}
```

`details` hanya tersedia jika endpoint mengirim detail validasi atau informasi tambahan. Kode umum:

| HTTP | Kode | Keterangan |
|---:|---|---|
| `400` | `INVALID_JSON` | Body JSON tidak valid |
| `401` | `UNAUTHENTICATED`, `INVALID_CREDENTIALS` | Sesi admin tidak valid atau kredensial login salah |
| `403` | `FORBIDDEN` | Origin tidak tepercaya atau izin owner tidak terpenuhi |
| `404` | `NOT_FOUND` dan kode spesifik resource | Route/resource tidak ditemukan |
| `409` | Kode konflik spesifik | Misalnya email admin sudah dipakai atau submission sudah diproses |
| `413` | `PAYLOAD_TOO_LARGE` | Body melebihi batas 1 MB |
| `422` | `VALIDATION_ERROR` atau kode spesifik | Query, ID, atau body tidak valid |
| `429` | `RATE_LIMITED` | Terlalu banyak percobaan login |
| `500` | `INTERNAL_ERROR` | Kegagalan tak terduga; detail internal tidak dikirim ke client |

Route yang tidak dikenal menghasilkan `404 NOT_FOUND` dengan pesan `Resource not found`.
