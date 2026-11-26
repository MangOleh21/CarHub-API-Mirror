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
- Waktu `createdAt` dan `reviewedAt` dikirim sebagai timestamp ISO 8601.
- Field dengan nilai `null` dapat muncul pada data lama, khususnya `color`, `bodyType`, `location`, `imageUrl`, `fuelType`, `reviewedByEmail`, `reviewNote`, `reviewedAt`, dan `userId`.
- `images` berisi URL gambar berurutan; `imageUrl` tetap tersedia sebagai alias gambar pertama untuk kompatibilitas.

### Nilai enum kendaraan

| Field | Nilai yang diizinkan |
|---|---|
| `transmission` | `Manual`, `Automatic`, `CVT`, `DCT`, `AMT` |
| `fuelType` | `Bensin`, `Diesel`, `Hybrid`, `Listrik` |
| `bodyType` | `SUV`, `MPV`, `Hatchback`, `Sedan`, `LCGC`, `Pickup`, `Van`, `Truck`, `Bus` |
| `color` | `Putih`, `Hitam`, `Silver`, `Abu-abu`, `Merah`, `Biru`, `Cokelat`, `Hijau`, `Kuning`, `Oranye`, `Lainnya` |

### Pagination dan filter katalog

`GET /api/cars` menerima query filter katalog berikut. `GET /api/admin/cars` menerima query yang sama dan tambahan `archiveStatus`.

| Parameter | Tipe | Default | Aturan |
|---|---|---:|---|
| `search` | string | — | Maksimal 100 karakter; pencarian sebagian tanpa membedakan kapital pada brand atau model |
| `brand` | string | — | Maksimal 100 karakter; pencocokan brand tanpa membedakan kapital |
| `bodyType` | string / multi-string | — | Satu atau beberapa nilai `bodyType` (parameter berulang `?bodyType=SUV&bodyType=MPV` atau dipisahkan koma `?bodyType=SUV,MPV`) |
| `color` | string | — | Salah satu nilai `color` |
| `fuelType` | string | — | Salah satu nilai `fuelType` |
| `transmission` | string | — | Salah satu nilai `transmission` |
| `minPrice`, `maxPrice` | integer | — | Rentang harga inklusif, positif, dan maksimal `Number.MAX_SAFE_INTEGER`; nilai minimum tidak boleh melebihi maksimum |
| `minYear`, `maxYear` | integer | — | Rentang tahun inklusif 1886–2100; nilai minimum tidak boleh melebihi maksimum |
| `sortBy` | string | `createdAt` | `createdAt`, `price`, atau `year` |
| `sortOrder` | string | `desc` | `asc` atau `desc` |
| `page` | integer | `1` | Rentang 1–1.000.000 |
| `pageSize` | integer | `20` | Rentang 1–100 |
| `archiveStatus` (admin only) | string | `active` | `active` atau `archived`; tidak tersedia pada endpoint publik |

Filter yang digunakan bersamaan harus cocok semuanya (khusus `bodyType` multi-nilai cocok jika salah satu nilai cocok). Parameter sort memakai kolom yang diizinkan server; jika nilai harga/tahun sama, ID menjadi pemecah urutan. Parameter yang tidak dikenal atau nilai di luar aturan menghasilkan `422`. Respons daftar menggunakan bentuk:

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

### Autentikasi sesi dan Origin

CarHub memakai dua cookie sesi `HttpOnly` yang **sepenuhnya terpisah** (cookie pengguna tidak pernah memberi akses admin, dan cookie admin tidak pernah memberi akses pengguna):

| Jenis sesi | Nama cookie | Path | Masa berlaku | Dipakai pada |
|---|---|---|---:|---|
| Pengguna publik | `carhub_user_session` | `/api` | 7 hari | `/api/auth/*`, `/api/me*`, `POST /api/submissions` |
| Admin / Owner | `carhub_admin_session` | `/api/admin` | 8 jam | `/api/admin/*` |

- Cookie memakai `Secure` ketika `NODE_ENV=production` atau `ADMIN_COOKIE_SECURE=true`; `SameSite` default-nya `lax` dan dapat diatur dengan `ADMIN_COOKIE_SAME_SITE` (`none` wajib bersama `Secure`).
- Pemanggilan dari browser lintas-origin harus menyertakan credentials (`credentials: "include"` pada `fetch` atau `withCredentials: true` pada Axios), dan origin frontend harus ada di `FRONTEND_ORIGINS`.
- Seluruh request autentikasi (`register`, `login`, `logout`) dan semua operasi tulis (user maupun admin) wajib menyertakan header `Origin` yang termasuk dalam `FRONTEND_ORIGINS`; request tanpa origin tepercaya ditolak dengan `403`.
- Percobaan register/login (user dan admin) dibatasi maksimal 10 kali per 15 menit. Login memakai pesan error generik yang sama baik email tidak ditemukan, akun nonaktif, maupun password salah.
- Owner pertama dibuat lokal melalui `npm run admin:bootstrap`; tidak ada endpoint HTTP untuk membuat owner.
- Jangan menyimpan token sesi di LocalStorage.

---

## Endpoint publik

### `GET /api/health`

Memeriksa bahwa API merespons.

**Respons `200`:**

```json
{ "status": "ok" }
```

### `GET /api/cars`

Mengambil daftar mobil katalog aktif dengan pagination dan filter opsional. Parameter dijelaskan pada bagian [Pagination dan filter katalog](#pagination-dan-filter-katalog).

**Respons `200`:** mengikuti bentuk respons daftar umum. Setiap item menggunakan skema [Car](#car). Email pemilik tidak pernah dikembalikan pada endpoint publik.

**Respons error:** `422 VALIDATION_ERROR` jika query tidak valid.

### `GET /api/cars/brands`

Mengambil daftar merek unik yang tersedia pada katalog aktif, diurutkan secara alfabetis tanpa membedakan kapital.

**Respons `200`:**

```json
{
  "success": true,
  "data": ["Honda", "Mitsubishi", "Toyota"]
}
```

### `GET /api/cars/:id`

Mengambil detail satu mobil aktif. `id` harus berupa bilangan bulat positif yang sesuai batas `BIGINT`.

**Respons `200`:** `{ "success": true, "data": <Car> }`.

**Respons error:**

- `422 VALIDATION_ERROR` — format ID tidak valid.
- `404 NOT_FOUND` — mobil tidak ditemukan atau sedang diarsipkan.

### `POST /api/uploads/submissions`

Meminta URL bertanda tangan dan field upload untuk mengirim satu foto pengajuan langsung ke Cloudinary. Kirim `Origin` yang termasuk dalam `FRONTEND_ORIGINS`. Dibatasi 10 kali per 15 menit per proses API.

**Request body:**

```json
{
  "contentType": "image/png",
  "size": 1024
}
```

`contentType` hanya menerima `image/jpeg`, `image/png`, atau `image/webp`. `size` antara `1` sampai `5242880` (5 MiB).

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

**Respons error:** `403 FORBIDDEN`, `422 VALIDATION_ERROR`, `429 RATE_LIMITED`, atau `500 INTERNAL_ERROR`.

---

## Endpoint pengguna: autentikasi, profil & pengajuan jual

### `POST /api/auth/register`

Mendaftarkan akun pengguna publik baru dan langsung membuat sesi (`carhub_user_session`). Wajib mengirim `Origin` tepercaya. Dibatasi 10 percobaan per 15 menit.

**Request body:**

```json
{
  "name": "Budi Santoso",
  "email": "budi@example.test",
  "phone": "+6281234567890",
  "location": "Semarang",
  "password": "<minimal 8 karakter>"
}
```

| Field | Tipe | Aturan |
|---|---|---|
| `name` | string | Wajib, 1–150 karakter setelah trim |
| `email` | string | Wajib, format email valid, maks. 254 karakter (disimpan huruf kecil) |
| `phone` | string | Wajib; opsional `+`, lalu digit, diikuti 7–19 digit/spasi/`(`/`)`/`-` |
| `location` | string atau `null` | Opsional, maks. 150 karakter |
| `password` | string | Wajib, 8–128 karakter |

**Respons `201`:** cookie `carhub_user_session` dikirim melalui `Set-Cookie`.

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "10",
      "name": "Budi Santoso",
      "email": "budi@example.test",
      "phone": "+6281234567890",
      "location": "Semarang",
      "createdAt": "2026-11-26T10:00:00.000Z"
    }
  }
}
```

**Respons error:** `403 FORBIDDEN`, `409 EMAIL_ALREADY_REGISTERED`, `422 VALIDATION_ERROR`, `429 RATE_LIMITED`.

### `POST /api/auth/login`

Login pengguna publik. Wajib mengirim `Origin` tepercaya. Dibatasi 10 percobaan per 15 menit.

**Request body:**

```json
{
  "email": "budi@example.test",
  "password": "<kata sandi>"
}
```

**Respons `200`:** `{ "success": true, "data": { "user": <User> } }` beserta header `Set-Cookie`.

**Respons error:** `401 INVALID_CREDENTIALS`, `403 FORBIDDEN`, `422 VALIDATION_ERROR`, `429 RATE_LIMITED`.

### `GET /api/auth/session`

Memeriksa sesi pengguna aktif dari cookie `carhub_user_session`.

**Respons `200`:** `{ "success": true, "data": { "user": <User> } }`.

**Respons error:** `401 UNAUTHENTICATED`.

### `POST /api/auth/logout`

Wajib mengirim `Origin` tepercaya. Mencabut sesi pengguna jika cookie tersedia dan menghapus cookie `carhub_user_session`.

**Respons `204`:** tidak ada response body.

**Respons error:** `403 FORBIDDEN`.

### `GET /api/me`

Mengambil data profil pengguna yang sedang login. Memerlukan cookie `carhub_user_session`.

**Respons `200`:** `{ "success": true, "data": { "user": <User> } }`.

**Respons error:** `401 UNAUTHENTICATED`.

### `PATCH /api/me`

Memperbarui data profil pengguna aktif (dan opsional mengganti kata sandi). Memerlukan cookie `carhub_user_session` dan `Origin` tepercaya.

**Request body:**

```json
{
  "name": "Budi S.",
  "phone": "+6281234567890",
  "location": "Jakarta",
  "newPassword": "<opsional, minimal 8 karakter>"
}
```

| Field | Tipe | Aturan |
|---|---|---|
| `name` | string | Wajib, 1–150 karakter setelah trim |
| `phone` | string | Wajib, format telepon valid |
| `location` | string atau `null` | Opsional, maks. 150 karakter |
| `newPassword` | string | Opsional, 8–128 karakter; jika dikirim akan memperbarui hash kata sandi |

**Respons `200`:** `{ "success": true, "data": { "user": <User> } }`.

**Respons error:** `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `422 VALIDATION_ERROR`.

### `GET /api/me/listings`

Mengambil katalog mobil milik pengguna aktif: gabungan mobil aktif yang sudah tayang (`cars`, `kind: "car"`, `status: "active"`) dan pengajuan berstatus `pending` atau `rejected` (`submissions`, `kind: "submission"`). Memerlukan cookie `carhub_user_session`.

| Parameter | Tipe | Default | Aturan |
|---|---|---:|---|
| `status` | string | `all` | `all`, `active`, `pending`, atau `rejected` |
| `page` | integer | `1` | Rentang 1–1.000.000 |
| `pageSize` | integer | `20` | Rentang 1–100 |

**Respons `200`:** mengikuti bentuk respons daftar umum; setiap item menggunakan skema [UserListing](#userlisting).

**Respons error:** `401 UNAUTHENTICATED`, `422 VALIDATION_ERROR`.

### `POST /api/submissions`

Mengirim pengajuan penjualan mobil dengan status `pending` dan menghubungkannya ke `user_id` pengguna aktif. Memerlukan cookie `carhub_user_session` dan `Origin` tepercaya.

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
  "color": "Putih",
  "bodyType": "MPV",
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

| Field | Tipe | Aturan |
|---|---|---|
| `sellerName` | string | Opsional, 1–150 karakter; default dari `name` profil pengguna |
| `sellerPhone` | string | Opsional, format telepon valid; default dari `phone` profil pengguna |
| `brand` | string | Wajib, 1–100 karakter |
| `model` | string | Wajib, 1–100 karakter |
| `year` | integer | Wajib, 1886 sampai tahun berjalan + 1 |
| `transmission` | string | Wajib, lihat [Nilai enum kendaraan](#nilai-enum-kendaraan) |
| `fuelType` | string | Opsional, default `Bensin` |
| `color` | string | Wajib, lihat [Nilai enum kendaraan](#nilai-enum-kendaraan) |
| `bodyType` | string | Wajib, lihat [Nilai enum kendaraan](#nilai-enum-kendaraan) |
| `mileage` | integer | Wajib, `0`–`2147483647` |
| `expectedPrice` | integer | Wajib, positif dan maks. `Number.MAX_SAFE_INTEGER` |
| `location` | string | Wajib, 1–150 karakter setelah trim |
| `images` | array URL | Wajib untuk beberapa foto, 1–10 URL `https:` valid |
| `imageUrl` | URL | Kompatibilitas satu foto (`https:`) |
| `description` | string | Opsional, maks. 3.000 karakter |

**Respons `201`:**

```json
{
  "success": true,
  "data": {
    "id": "105",
    "status": "pending",
    "createdAt": "2026-11-26T10:30:00.000Z"
  }
}
```

**Respons error:** `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `422 VALIDATION_ERROR`, `422 INVALID_IMAGE`.

---

## Endpoint admin: autentikasi

### `POST /api/admin/auth/login`

Login admin. Wajib mengirim `Origin` tepercaya. Password harus 12–128 karakter. Dibatasi 10 percobaan per 15 menit.

**Request body:** `{ "email": "admin@example.test", "password": "<password admin>" }`.

**Respons `200`:** cookie `carhub_admin_session` dikirim melalui `Set-Cookie`.

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

**Respons error:** `401 INVALID_CREDENTIALS`, `403 FORBIDDEN`, `422 VALIDATION_ERROR`, `429 RATE_LIMITED`.

### `GET /api/admin/auth/session`

Mengambil identitas admin dari cookie `carhub_admin_session`.

**Respons `200`:** `{ "success": true, "data": { "admin": <Admin> } }`.

**Respons error:** `401 UNAUTHENTICATED`.

### `POST /api/admin/auth/logout`

Wajib mengirim `Origin` tepercaya. Mencabut sesi admin jika cookie tersedia dan menghapus cookie `carhub_admin_session`.

**Respons `204`:** tidak ada response body.

---

## Endpoint admin: katalog mobil

Semua endpoint memerlukan sesi admin aktif; operasi tulis juga mewajibkan `Origin` tepercaya.

### `GET /api/admin/cars`

Daftar mobil untuk pengelolaan. Mendukung seluruh filter `GET /api/cars` ditambah `archiveStatus=active` (default) atau `archiveStatus=archived`.

### `GET /api/admin/cars/:id`

Detail satu mobil (termasuk yang diarsipkan).

### `POST /api/admin/uploads/cars`

Meminta URL dan field signed upload Cloudinary untuk foto mobil katalog (`asset_folder: "carhub/cars"`).

### `POST /api/admin/cars`

Membuat mobil baru di katalog. Body wajib sesuai [Car input](#car-input). Respons `201` `{ "success": true, "data": <Car> }`.

### `PUT /api/admin/cars/:id`

Mengganti seluruh data mobil. Body wajib sesuai [Car input](#car-input). Respons `200` `{ "success": true, "data": <Car> }`.

### `DELETE /api/admin/cars/:id`

Mengarsipkan mobil tanpa menghapus datanya (idempoten). Respons `204`.

### `PATCH /api/admin/cars/:id/restore`

Memulihkan mobil dari arsip ke katalog aktif. Respons `204`.

### `DELETE /api/admin/cars/:id/permanent`

Menghapus permanen baris mobil yang sudah diarsipkan (foto di object storage tetap tersimpan). Respons `204`.

### Car input

Body `POST` dan `PUT` bersifat strict dengan field berikut:

| Field | Tipe | Aturan |
|---|---|---|
| `brand` | string | Wajib, 1–100 karakter setelah trim |
| `model` | string | Wajib, 1–100 karakter setelah trim |
| `year` | integer | Wajib, 1886–2100 |
| `transmission` | string | Wajib, lihat [Nilai enum kendaraan](#nilai-enum-kendaraan) |
| `fuelType` | string | Opsional, lihat enum; default `Bensin` |
| `color` | string | Wajib, lihat [Nilai enum kendaraan](#nilai-enum-kendaraan) |
| `bodyType` | string | Wajib, lihat [Nilai enum kendaraan](#nilai-enum-kendaraan) |
| `mileage` | integer | Wajib, `0`–`2147483647` |
| `price` | integer | Wajib, positif dan maks. `Number.MAX_SAFE_INTEGER` |
| `images` | array URL | Wajib untuk beberapa foto, 1–10 URL `https:` |
| `imageUrl` | URL | Kompatibilitas satu foto (`https:`) |
| `sellerName` | string | Wajib, 1–150 karakter setelah trim |
| `sellerPhone` | string | Wajib, format telepon valid |
| `location` | string | Wajib, 1–150 karakter setelah trim |
| `description` | string atau `null` | Opsional, maks. 3.000 karakter |

---

## Endpoint admin: moderasi submission

### `GET /api/admin/submissions`

Mengambil daftar submission terpaginasikan (`status`: `pending` [default], `approved`, `rejected`, atau `all`; `page`; `pageSize`). Item mengikuti skema [Submission](#submission).

### `PATCH /api/admin/submissions/:id/approved`

Menyetujui submission `pending` dan secara atomik membuat baris baru di `cars` (menyalin `user_id`, `color`, `body_type`, `fuel_type`, foto, lokasi, dll.). Email reviewer diambil dari sesi admin.

**Request body opsional (termasuk untuk melengkapi submission lama):**

```json
{
  "reviewNote": "Data kendaraan telah diperiksa.",
  "location": "Bandung",
  "color": "Putih",
  "bodyType": "MPV",
  "images": ["https://images.example.test/car.jpg"]
}
```

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
      "reviewedAt": "2026-11-26T00:00:00.000Z"
    },
    "car": { "id": "42" }
  }
}
```

**Respons error:** `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 SUBMISSION_NOT_FOUND`, `409 SUBMISSION_NOT_PENDING`, `422 VALIDATION_ERROR`, `422 SUBMISSION_MISSING_REQUIRED_FIELDS`.

### `PATCH /api/admin/submissions/:id/rejected`

Menolak submission `pending` tanpa membuat baris `cars`. Body opsional `{ "reviewNote": "..." }`. Respons `200` dengan `"car": null`.

---

## Endpoint admin: kelola pengguna publik (CRUD)

Semua endpoint dapat diakses oleh `admin` maupun `owner` dengan sesi aktif. Operasi tulis (`POST`, `PUT`, `DELETE`) mewajibkan `Origin` tepercaya. Password/hash tidak pernah dikembalikan dalam respons.

### `GET /api/admin/customers`

Mengambil daftar akun pengguna publik terpaginasikan.

| Parameter | Tipe | Default | Aturan |
|---|---|---:|---|
| `search` | string | — | Maks. 100 karakter; mencari pada `name`, `email`, `phone`, atau `location` |
| `status` | string | `all` | `all`, `active`, atau `inactive` |
| `page` | integer | `1` | Rentang 1–1.000.000 |
| `pageSize` | integer | `20` | Rentang 1–100 |

**Respons `200`:** mengikuti bentuk respons daftar umum; setiap item menggunakan skema [ManagedCustomer](#managedcustomer).

### `GET /api/admin/customers/:id`

Mengambil detail satu akun pengguna publik.

**Respons `200`:** `{ "success": true, "data": <ManagedCustomer> }`.

**Respons error:** `401 UNAUTHENTICATED`, `404 USER_NOT_FOUND`, `422 VALIDATION_ERROR`.

### `POST /api/admin/customers`

Membuat akun pengguna publik baru.

**Request body:**

```json
{
  "name": "Siti Aminah",
  "email": "siti@example.test",
  "phone": "+6281234567890",
  "location": "Bandung",
  "password": "<minimal 8 karakter>",
  "isActive": true
}
```

`isActive` opsional (default `true`), `location` opsional.

**Respons `201`:** `{ "success": true, "data": <ManagedCustomer> }`.

**Respons error:** `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `409 EMAIL_ALREADY_REGISTERED`, `422 VALIDATION_ERROR`.

### `PUT /api/admin/customers/:id`

Memperbarui data akun pengguna publik. Jika `isActive` diubah menjadi `false`, seluruh sesi aktif pengguna pada `user_sessions` langsung dicabut. Field `password` bersifat opsional untuk reset kata sandi.

**Request body:**

```json
{
  "name": "Siti Aminah",
  "email": "siti@example.test",
  "phone": "+6281234567890",
  "location": "Jakarta",
  "isActive": false,
  "password": "<opsional, minimal 8 karakter>"
}
```

**Respons `200`:** `{ "success": true, "data": <ManagedCustomer> }`.

**Respons error:** `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 USER_NOT_FOUND`, `409 EMAIL_ALREADY_REGISTERED`, `422 VALIDATION_ERROR`.

### `DELETE /api/admin/customers/:id`

Menghapus permanen akun pengguna publik. Sesi di `user_sessions` ikut terhapus (`ON DELETE CASCADE`), sedangkan listing mobil (`cars`) dan pengajuan (`submissions`) tetap dipertahankan dengan `user_id = NULL`.

**Respons `204`:** tidak ada response body.

**Respons error:** `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 USER_NOT_FOUND`, `422 VALIDATION_ERROR`.

---

## Endpoint admin: akun admin (khusus owner)

Semua endpoint hanya dapat dipakai oleh `owner` dengan sesi aktif. Operasi tulis juga memerlukan `Origin` tepercaya.

### `GET /api/admin/users`

Mengambil daftar akun owner/admin beserta status aktif dan waktu pembuatan.

### `POST /api/admin/users`

Membuat akun dengan role `admin` (`email`, `password` 12–128 karakter). Respons `201`.

### `PATCH /api/admin/users/:id/deactivate`

Menonaktifkan akun aktif ber-role `admin` dan mencabut sesi aktifnya. Owner tidak dapat dinonaktifkan. Respons `200`.

---

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
  "color": "Putih",
  "bodyType": "MPV",
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
  "createdAt": "2026-11-26T10:30:00.000Z"
}
```

### Submission

```json
{
  "id": "105",
  "userId": "10",
  "sellerName": "Ayu",
  "sellerPhone": "+6281234567890",
  "brand": "Toyota",
  "model": "Avanza",
  "year": 2020,
  "transmission": "Automatic",
  "fuelType": "Bensin",
  "color": "Putih",
  "bodyType": "MPV",
  "mileage": 25000,
  "expectedPrice": "180000000",
  "imageUrl": "https://images.example.test/car.jpg",
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
  "createdAt": "2026-11-26T10:30:00.000Z"
}
```

### User

```json
{
  "id": "10",
  "name": "Budi Santoso",
  "email": "budi@example.test",
  "phone": "+6281234567890",
  "location": "Semarang",
  "createdAt": "2026-11-26T10:00:00.000Z"
}
```

### ManagedCustomer

Sama dengan skema [User](#user), ditambah `"isActive": true | false`.

### UserListing

```json
{
  "kind": "car",
  "id": "42",
  "carId": "42",
  "submissionId": null,
  "status": "active",
  "brand": "Toyota",
  "model": "Avanza",
  "year": 2020,
  "transmission": "Automatic",
  "fuelType": "Bensin",
  "color": "Putih",
  "bodyType": "MPV",
  "mileage": 25000,
  "price": "180000000",
  "imageUrl": "https://images.example.test/car.jpg",
  "images": ["https://images.example.test/car.jpg"],
  "sellerName": "Budi Santoso",
  "sellerPhone": "+6281234567890",
  "location": "Semarang",
  "description": null,
  "reviewNote": null,
  "reviewedAt": null,
  "createdAt": "2026-11-26T10:30:00.000Z"
}
```

Untuk pengajuan (`kind: "submission"`), `carId` bernilai `null`, `submissionId` sama dengan `id`, dan `status` bernilai `"pending"` atau `"rejected"`.

### Admin

Objek admin memuat `id`, `email`, dan `role` (`owner` atau `admin`). Endpoint `/api/admin/users` juga menyertakan `isActive` dan `createdAt`. Password dan hash tidak pernah disertakan.

---

## Format error

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

| HTTP | Kode | Keterangan |
|---:|---|---|
| `400` | `INVALID_JSON` | Body JSON tidak valid |
| `401` | `UNAUTHENTICATED`, `INVALID_CREDENTIALS` | Sesi tidak valid atau kredensial login salah |
| `403` | `FORBIDDEN` | Origin tidak tepercaya atau izin role tidak terpenuhi |
| `404` | `NOT_FOUND`, `USER_NOT_FOUND`, `SUBMISSION_NOT_FOUND`, `ADMIN_NOT_FOUND` | Resource tidak ditemukan |
| `409` | `EMAIL_ALREADY_REGISTERED`, `ADMIN_EMAIL_EXISTS`, `SUBMISSION_NOT_PENDING` | Konflik data / status |
| `413` | `PAYLOAD_TOO_LARGE` | Body melebihi batas 1 MB |
| `422` | `VALIDATION_ERROR`, `INVALID_IMAGE`, `SUBMISSION_MISSING_REQUIRED_FIELDS` | Input tidak valid |
| `429` | `RATE_LIMITED` | Batas laju percobaan tercapai |
| `500` | `INTERNAL_ERROR` | Kegagalan tak terduga; detail internal tidak dikirim ke client |

Route yang tidak dikenal menghasilkan `404 NOT_FOUND` dengan pesan `Resource not found`.
