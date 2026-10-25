# Dapur Rasa — paket publikasi + kerangka integrasi Midtrans

Paket ini berisi toko online statis yang disajikan oleh server Node.js/Express agar frontend dan API berada di satu origin. Integrasi Midtrans menggunakan Snap redirect melalui backend; **pembayaran belum aktif sampai pemilik toko menambahkan kredensial sendiri dan menguji alurnya**.

## Isi paket
- `public/index.html` — website responsif, katalog demo, pencarian, keranjang, checkout.
- `server.js` — server website, endpoint membuat transaksi Midtrans, endpoint notifikasi dengan pemeriksaan signature.
- `package.json` — dependensi Node.js.

## 1. Jalankan lokal
Perlu Node.js versi 18 atau lebih baru.
```bash
npm install
npm start
```
Buka `http://localhost:10000`. Tanpa kredensial Midtrans, website tetap dapat dilihat dan keranjang dapat dicoba; checkout online akan memberi pesan bahwa konfigurasi belum tersedia.

## 2. Publikasikan gratis di Render (frontend + backend)
Render menyediakan layanan web gratis dengan subdomain `onrender.com`; layanan gratis dapat tidur setelah tidak aktif dan cocok untuk uji coba, bukan beban produksi kritis.
1. Buat akun GitHub dan buat repository baru.
2. Unggah semua isi folder paket ini ke root repository (pastikan `package.json`, `server.js`, dan folder `public/` ada di root).
3. Di Render, pilih **New → Web Service**, hubungkan repository tersebut.
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Pilih instance **Free** jika tersedia di akun/region kamu, lalu deploy.
7. Render memberi URL subdomain `*.onrender.com`. Setelah deploy, cek `/api/health`.
8. Website dapat online sebelum pembayaran dikonfigurasi, tetapi jangan mengiklankan checkout online sampai pengujian selesai.

Dokumentasi Render: https://render.com/docs/your-first-deploy dan https://render.com/docs/free

## 3. Konfigurasikan Midtrans Sandbox terlebih dahulu
1. Buat/masuk ke akun Midtrans dan buka bagian Access Keys.
2. Ambil **Sandbox Server Key** untuk server dan jangan bagikan di chat atau masukkan ke file frontend.
3. Di Render → service → Environment, tambahkan:
   - `MIDTRANS_ENV` = `sandbox`
   - `MIDTRANS_SERVER_KEY` = nilai Sandbox Server Key
4. Simpan perubahan dan redeploy/restart service.
5. Tes `/api/health`: `paymentConfigured` harus `true`, `environment` harus `sandbox`.
6. Tambahkan URL notifikasi di pengaturan Midtrans:
   `https://NAMA-SERVICE.onrender.com/api/midtrans-notification`
   Ganti `NAMA-SERVICE` dengan URL Render milikmu.
7. Uji dengan alur dan instrumen pembayaran Sandbox sesuai panduan Midtrans. Jangan gunakan uang sungguhan di Sandbox.

Dokumentasi resmi:
- Snap integration guide: https://docs.midtrans.com/docs/snap-snap-integration-guide
- Access keys: https://docs.midtrans.com/docs/access-keys
- API authorization: https://docs.midtrans.com/docs/api-authorization-headers

## 4. WhatsApp
Belum ada nomor WhatsApp toko. Saat sudah punya nomor bisnis, buka `public/index.html` dan cari:
```js
const STORE_WHATSAPP = "";
```
Isi nomor format internasional tanpa `+`, spasi, atau tanda baca, contoh format: `62812xxxxxxx`. Simpan lalu deploy ulang. Pastikan nomor itu memang milik toko dan dapat menerima chat.

## 5. Produk dan harga
Saat ini harga contoh ada di dua tempat:
- Frontend: `const products = [...]` di `public/index.html`
- Backend: objek `PRODUCTS` di `server.js`

Saat mengganti harga/produk, sinkronkan kedua daftar. Server yang menjadi sumber harga transaksi untuk mencegah manipulasi harga dari browser.

## 6. Sebelum menerima pembayaran sungguhan
Kerangka ini sengaja belum merupakan sistem toko siap produksi sepenuhnya. Sebelum berpindah ke `MIDTRANS_ENV=production`:
- Ajukan dan selesaikan aktivasi akun merchant Midtrans.
- Gunakan Production Server Key di environment server (tidak pernah di frontend).
- Implementasikan database persisten untuk pesanan, pelanggan seperlunya, nominal, dan status pembayaran.
- Dalam webhook, gunakan notifikasi untuk memicu pemeriksaan status transaksi ke API status Midtrans, lalu perbarui order di database secara idempotent.
- Jangan tandai pesanan lunas hanya karena browser kembali ke halaman toko.
- Tambahkan ongkir/area layanan, stok, pembatalan/refund, kebijakan privasi, syarat penggunaan, dan validasi data.
- Uji signature notification, duplicate notifications, pending/expire/deny/settlement, serta jumlah harga pada Sandbox sebelum produksi.

**Penting:** instance Render gratis dapat tidur atau restart dan tidak menyediakan persistent disk; jangan mengandalkannya sebagai penyimpanan pesanan. Gunakan database persisten yang sesuai sebelum menerima transaksi pelanggan sungguhan.
