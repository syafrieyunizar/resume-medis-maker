# Resume Medis Reviewer

Ekstensi Chrome MV3 untuk membantu dokter menyusun resume medis di eRM RSUD. Repo ini sekarang berisi satu extension utama dengan dua mode kerja:

- `Side panel` untuk SO, CPPT, Penunjang, Analisa, Setting/Admin Knowledge BPJS.
- `Inline improve` di halaman eRM untuk memperbaiki `anamnesis` (`textarea[name="ab"]`) dan `px fisik` (`textarea[name="ae"]`) memakai AI dengan preview terlebih dahulu.

## Fitur Utama

- `SO`:
  tarik data subjektif/objektif dari IGD dan masukkan ke Resume Medis.
- `CPPT`:
  akses tabel CPPT, baca periode rawat, proses AI menjadi 7 field resume, lalu masukkan ke form resume.
- `Penunjang`:
  tarik PDF dari tombol `HASIL`, simpan tanpa duplikasi, hapus manual, rangkum menjadi penunjang bermakna, lalu masukkan ke resume.
- `Analisa`:
  analisa kelengkapan resume berbasis knowledge BPJS dengan output kartu risiko, temuan, bukti, dan saran kelengkapan.
- `Setting`:
  pilih `API key admin` atau `API key pribadi`, validasi key, dan simpan model/provider.
- `Admin Knowledge BPJS`:
  login admin, kelola knowledge manual/PDF chunking, dan simpan API key admin per aplikasi.
- `Improve Inline`:
  tombol pensil biru di samping field `ab` dan `ae`, input arahan wajib, preview hasil AI, lalu `Gunakan Hasil`.

## Struktur Repo

```text
manifest.json                 # Manifest MV3
background.js                 # Service worker: side panel + AI message handler inline improve
sidepanel.html                # UI side panel
sidepanel.css                 # Styling side panel
sidepanel.js                  # Logika side panel
improve-inline.js             # Content script fitur improve anamnesis / px fisik
improve-inline.css            # Styling content script
vendor/
  pdf.min.js                  # PDF.js
  pdf.worker.min.js           # Worker PDF.js
supabase/
  config.toml                 # Konfigurasi function Supabase
  functions/
    knowledge-admin/
      index.ts                # Edge Function untuk knowledge + admin AI config
supabase_migration.sql        # SQL migration Supabase
public/
  resume-medis-reviewer.zip   # Paket extension
design.md                     # Panduan visual
agents.md                     # Panduan agent coding
```

## Setup Pengguna

1. Buka `chrome://extensions`.
2. Aktifkan `Developer mode`.
3. Klik `Load unpacked` dan pilih folder repo ini, atau unzip `public/resume-medis-reviewer.zip`.
4. Buka side panel `Resume Medis Reviewer`.
5. Pilih sumber AI:
   - `API key admin`: memakai konfigurasi admin dari Supabase.
   - `API key pribadi`: memakai provider/model/key milik user.

## Setup Supabase

Extension ini tidak lagi 100% lokal. Knowledge dan API key admin memakai Supabase Edge Function.

Yang perlu aktif:

- `supabase_migration.sql` dijalankan di SQL Editor.
- Edge Function `knowledge-admin` dideploy dari `supabase/functions/knowledge-admin/index.ts`.
- Secret function:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `ADMIN_USERNAME`
  - `ADMIN_PASSWORD`

`Knowledge` bersifat global. `API key admin` disimpan per `app_id`.

App ID yang sudah disiapkan:

- `resume-medis-reviewer`
- `eklaim-koding-assistant`
- `soap-gen`

## Catatan Implementasi

- Jalur `Gemini` bisa menerima PDF mentah.
- Jalur `Sumopod` / `AImurah` memakai parser lokal `PDF.js` lebih dulu, lalu mengirim hasil ekstraksi ke model.
- Progress bar pseudo dipakai untuk proses AI besar: CPPT, rangkuman penunjang, dan analisa.
- Error parser PDF sekarang lebih informatif, termasuk nama file yang gagal dibaca.

## Pengembangan

- Jangan lupa repackage ZIP setelah mengubah file extension:

```powershell
Compress-Archive -Path manifest.json,background.js,sidepanel.html,sidepanel.css,sidepanel.js,icon.png,vendor,improve-inline.js,improve-inline.css -DestinationPath public\resume-medis-reviewer.zip -Force
```

- Cek sintaks file JS utama:

```powershell
node --check sidepanel.js
node --check background.js
node --check improve-inline.js
```

## Lisensi

Internal use.
