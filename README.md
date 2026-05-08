# Resume Medis Reviewer

Ekstensi Chrome (side panel) untuk membantu dokter mengisi **SO** dan merangkum **CPPT** menjadi 7 kolom resume medis menggunakan **Gemini AI**. Berjalan **100% lokal** — API key disimpan di browser Anda, data pasien hanya dikirim ke endpoint Gemini milik Anda sendiri.

## Fitur

- **Tab Setting** — simpan Gemini API Key & pilih model (`gemini-2.0-flash`, `gemini-2.5-flash`, `gemini-2.5-pro`).
- **Tab SO** — tulis Subjektif & Objektif, lalu satu klik untuk auto-input ke form EMR.
- **Tab CPPT** — ambil tabel CPPT dari halaman aktif, ekstrak via Gemini menjadi 7 kolom:
  1. Pemeriksaan Penunjang Bermakna
  2. Terapi Selama Dirawat
  3. Operasi/Tindakan
  4. Diagnosa Utama
  5. Diagnosa Sekunder
  6. Konsultasi Bidang Lain
  7. Terapi Saat Pulang
- Hasil dapat diedit, lalu dimasukkan kembali ke form EMR dengan tombol **Masukkan Detail**.
- Gaya output telegrafis (singkatan medis baku, koma desimal Indonesia, format lab `awal→akhir`).

## Instalasi

1. Buka halaman landing proyek dan klik **Download Ekstensi (.zip)**, atau ambil file langsung di `public/resume-medis-reviewer.zip`.
2. Unzip file tersebut.
3. Buka `chrome://extensions` di Chrome / Edge / Brave.
4. Aktifkan **Developer mode** (pojok kanan atas).
5. Klik **Load unpacked** dan pilih folder hasil unzip.
6. Klik ikon ekstensi di toolbar untuk membuka side panel.

## Setup

1. Dapatkan API Key Gemini di <https://aistudio.google.com/app/apikey>.
2. Buka tab **Setting** di side panel, tempel API Key, pilih model, klik **Simpan**.
3. Buka halaman EMR pasien dan mulai gunakan tab **SO** atau **CPPT**.

> Untuk tab CPPT, pastikan tabel sudah menampilkan **100 entries** sebelum klik **Akses CPPT**.

## Privasi

- API key disimpan di `chrome.storage.local` — tidak pernah keluar dari browser Anda.
- Data CPPT dikirim **hanya** ke `generativelanguage.googleapis.com` saat tombol **Extract data CPPT** diklik.
- Tidak ada server pihak ketiga, tidak ada analytics, tidak ada telemetry.

## Pengembangan

Repo berisi dua bagian:

- `extension/` — source ekstensi Chrome (Manifest V3, vanilla HTML/CSS/JS).
- `src/` — landing page (TanStack Start v1 + Vite 7 + Tailwind v4).

### Repackage ekstensi setelah edit

```bash
rm -f public/resume-medis-reviewer.zip && \
  cd extension && \
  nix run nixpkgs#zip -- -r ../public/resume-medis-reviewer.zip .
```

### Jalankan landing page

```bash
bun install
bun run dev
```

## Dokumentasi Tambahan

- [`design.md`](./design.md) — panduan visual & design tokens.
- [`agents.md`](./agents.md) — panduan untuk AI coding agent yang berkontribusi ke repo.

## Lisensi

Internal use. Tidak untuk distribusi publik tanpa izin.
