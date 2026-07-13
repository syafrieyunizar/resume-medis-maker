# AGENTS.md

Panduan untuk AI coding agent yang bekerja di repo ini. Baca file ini sebelum mengubah kode.

## Ringkasan Proyek

Repo ini berisi satu Chrome extension MV3 untuk membantu dokter menyusun dan mereview resume medis di eRM RSUD.

Source extension ada langsung di root workspace, bukan di folder `extension/` dan bukan landing page `src/`.

Komponen utama:

- `Side panel`: SOAP, CPPT, Penunjang, Analisa, Setting, Admin Knowledge BPJS.
- `Inline improve`: tombol in-page untuk memperbaiki anamnesis `ab` dan px fisik `ae` dengan preview AI.
- `Supabase backend ringan`: knowledge BPJS, user admin, dan konfigurasi API key admin per aplikasi.
- `Self-hosted release`: file `.crx` dan `update.xml` untuk update extension; `.pem` wajib lokal saja.

## Struktur Direktori Aktual

```text
manifest.json
update.xml
resume-medis-reviewer.crx
background.js
sidepanel.html
sidepanel.css
sidepanel.js
improve-inline.js
improve-inline.css
vendor/
  pdf.min.js
  pdf.worker.min.js
supabase/
  config.toml
  functions/
    knowledge-admin/
      index.ts
supabase_migration.sql
public/
  resume-medis-reviewer.zip
design.md
AGENTS.md
agents.md
readme.md
```

## Aturan Kerja Agent

### Perubahan Extension

1. Edit file root extension langsung: `manifest.json`, `background.js`, `sidepanel.html`, `sidepanel.css`, `sidepanel.js`, `improve-inline.js`, `improve-inline.css`.
2. Jangan membuat atau memakai folder `extension/`.
3. Jangan tambah library berat; UI extension tetap vanilla HTML/CSS/JS.
4. Persistensi setting user tetap di `chrome.storage.local`.
5. Jangan merusak fitur side panel lama saat menambah content script, background messaging, atau alur AI.
6. Setelah perubahan extension, selalu repackage ZIP:

```powershell
Compress-Archive -Path manifest.json,background.js,sidepanel.html,sidepanel.css,sidepanel.js,icon.png,vendor,improve-inline.js,improve-inline.css -DestinationPath public\resume-medis-reviewer.zip -Force
```

### Perubahan Supabase

File utama:

- `supabase_migration.sql`
- `supabase/functions/knowledge-admin/index.ts`
- `supabase/config.toml`

Fungsi `knowledge-admin` menangani:

- login user admin dan sesi admin
- CRUD user admin
- CRUD knowledge chunks
- search knowledge
- simpan, baca, reset, dan validasi API key admin
- proxy panggilan AI jalur admin

Knowledge bersifat `global`. API key admin bersifat `per app_id`.

App ID yang dipakai:

- `resume-medis-reviewer`
- `eklaim-koding-assistant`
- `soap-gen`
- `icd-search-helper`

Bila mengubah Supabase function atau migration, final answer wajib menyebut perlu redeploy function atau rerun migration bila relevan.

## Alur Workflow Extension

### 1. Setting dan API Key

Side panel selalu membaca konfigurasi AI efektif sebelum fitur AI berjalan.

- `API key admin`: default bila user memilih admin atau data pribadi belum lengkap.
- `API key pribadi`: dipakai bila user memilih pribadi dan provider/model/key valid tersedia di `chrome.storage.local`.
- Provider pribadi yang didukung: `gemini`, `sumopod`, `aimurah`, `x5lab`, dan `custom` bila tersedia di UI.
- Admin provider disimpan di Supabase per `app_id`, bukan global.
- User admin login lewat panel admin/user access; session disimpan lokal sebagai `adminUserSession`.
- API key pribadi disimpan lokal di browser user, bukan Supabase.
- API key admin disimpan di Supabase lewat Edge Function; jangan expose nilainya ke UI selain status ada/tidak.
- Gemini fallback dapat dipakai untuk alur penunjang bila provider OpenAI-compatible gagal.

Jangan hardcode API key, service role key, `.pem`, token, atau credential sensitif di repo.

### 2. SOAP Side Panel

Alur SOAP:

1. User berada di halaman kajian dokter IGD/RM 07 yang memuat SOAP.
2. Tombol `Tarik data SOAP` membaca field halaman: subjektif, objektif, assessment, planning, konsultasi, dan vital sign.
3. Data masuk ke field side panel dan tersimpan sebagai draft lokal.
4. `Masukkan S & O ke Resume` mengisi resume medis `ab` dan `ae`.
5. `Masukkan SOAP ke RM 07` mengisi field RM 07: subjektif, objektif, assessment, planning, konsultasi, dan vital sign.

Jaga selector SOAP/RM 07 tetap sesuai eRM. Jangan menghapus fallback insert yang sudah ada.

### 3. CPPT

Alur CPPT:

1. User masuk tab CPPT.
2. Pilih mode satu ruangan atau multi ruangan.
3. `Akses CPPT` membaca tabel CPPT dari halaman aktif.
4. Multi ruangan menggabungkan sumber CPPT dan mencegah duplikasi akses ruangan yang sama.
5. `Proses CPPT dengan AI` mengubah CPPT menjadi 7 field resume:
   - Pemeriksaan Penunjang Bermakna
   - Terapi Selama Dirawat
   - Operasi/Tindakan
   - Diagnosa Utama
   - Diagnosa Sekunder
   - Konsultasi bidang lain
   - Terapi saat pulang
6. Hasil bisa diedit, lalu `Masukkan Semua Data ke Resume` mengisi field resume.
7. CPPT juga menghasilkan catatan gap dokumentasi untuk membantu Analisa.

Jaga progress UI, autosave draft, dan tombol akses multi ruangan.

### 4. Penunjang

Alur Penunjang:

1. User masuk halaman penunjang/lab/radiologi yang memiliki tabel `#DataTables_Table_1_wrapper`.
2. Extension hanya memakai tombol/label `HASIL`, bukan tombol lain.
3. `Tarik Data` mengumpulkan link PDF hasil penunjang, ukuran file, jenis, tanggal hasil, dan metadata row.
4. User dapat filter berdasarkan periode rawat bila tersedia.
5. `Rangkum Penunjang` memakai parser lokal PDF.js dulu untuk sanitasi dan ekstraksi.
6. Jalur Gemini/admin/provider merangkum hasil tersanitasi menjadi narasi penunjang bermakna.
7. Hasil bisa dikirim ke Resume atau dipakai sebagai konteks CPPT.

Jangan mengganti alur HASIL-only. Jangan mengirim PDF mentah ke provider OpenAI-compatible bila parser lokal sudah dipakai untuk sanitasi.

### 5. Analisa Klaim BPJS

Alur Analisa:

1. Mengambil data SO, CPPT, penunjang, diagnosis, terapi, dan field resume terkait.
2. Search knowledge BPJS dari Supabase.
3. AI menilai kelengkapan dokumentasi dan risiko klaim.
4. Output berupa kartu risiko, bukti ditemukan, bukti kurang, dan rekomendasi dokumentasi.

Knowledge BPJS tetap global. Jangan mengubah knowledge menjadi per aplikasi kecuali user meminta eksplisit.

### 6. Admin Knowledge BPJS

Panel admin menangani:

- login admin
- upload/parse PDF knowledge
- input manual knowledge
- chunking knowledge
- simpan/edit/hapus/search knowledge
- kelola provider admin
- kelola user admin

Jaga kompatibilitas `knowledge-admin` dengan schema migration yang ada.

### 7. Inline Improve

Content script aktif di halaman eRM yang cocok dan menambahkan tombol inline pada:

- `textarea[name="ab"]` untuk anamnesis
- `textarea[name="ae"]` untuk pemeriksaan fisik

Alur wajib:

1. User mengisi arahan.
2. AI dapat membuat pertanyaan konfirmasi dan contoh jawaban.
3. Dokter mengisi jawaban konfirmasi.
4. AI membuat hasil perbaikan.
5. Hasil muncul sebagai preview.
6. Field asli baru berubah setelah user klik `Gunakan Hasil`.

`ab` dan `ae` memakai prompt berbeda. Jangan langsung overwrite field tanpa preview.

## Selector Penting

### Resume Medis

| Fitur | Selector |
|---|---|
| Subjektif resume | `textarea[name="ab"]` |
| Objektif resume | `textarea[name="ae"]` |
| Penunjang resume | `input[name="an"], textarea[name="an"]` |
| Terapi dirawat | `input[name="af"], textarea[name="af"]` |
| Operasi | `input[name="a"], textarea[name="a"]` |
| Dx utama | `input[name="b"], textarea[name="b"]` |
| Dx sekunder | `input[name="c"], textarea[name="c"]` |
| Konsul | `input[name="d"], textarea[name="d"]` |
| Terapi pulang | `input[name="e"], textarea[name="e"]` |

### CPPT

| Fitur | Selector |
|---|---|
| Wrapper CPPT | `#example1_wrapper > div:nth-child(2) > div` |
| Jumlah row CPPT | `select[name="example1_length"]` |

### Penunjang

| Fitur | Selector |
|---|---|
| Tabel penunjang bersama | `#DataTables_Table_1_wrapper` |
| Tombol hasil per row | `label.btn-xs.btn-success` dengan teks `HASIL` |

## Rilis dan Auto Update

Repo ini memakai self-hosted update metadata:

- `manifest.json` berisi `update_url` ke GitHub raw `update.xml`.
- `update.xml` berisi `appid`, URL `.crx`, dan version.
- `.crx` harus dibuat ulang dengan `.pem` yang sama agar extension ID tetap sama.
- `resume-medis-reviewer.pem` adalah private key lokal dan wajib ignored.

Setiap rilis extension wajib melakukan semua langkah ini:

1. Naikkan `version` di `manifest.json`.
2. Repackage ZIP `public/resume-medis-reviewer.zip` bila source extension berubah.
3. Buat ulang `resume-medis-reviewer.crx` memakai `resume-medis-reviewer.pem` yang sama.
4. Update `version` di `update.xml` agar sama dengan `manifest.json`.
5. Pastikan `update.xml` `codebase` menunjuk ke CRX yang benar:
   `https://syafrieyunizar.github.io/resume-medis-maker/resume-medis-reviewer.crx`
6. Push `resume-medis-reviewer.crx` dan `update.xml`.
7. Jangan push `resume-medis-reviewer.pem`.
8. Sebelum commit, cek `git status --short --ignored` dan pastikan `.pem` muncul sebagai ignored (`!!`) atau tidak muncul sama sekali.

Jangan mengganti `.pem` untuk rilis normal. Jika `.pem` berubah, extension ID berubah dan update existing install bisa putus.

## Desain

- Ikuti `design.md`.
- Side panel memakai token warna di `sidepanel.css`.
- Tombol primer side panel hitam.
- Fitur inline berada di konteks halaman eRM; jaga tampilannya tidak mengganggu form asli.
- Jangan buat UI terlalu besar; dokter harus bisa scan cepat dan edit hasil AI.

## Larangan

- Jangan hardcode API key AI, Supabase service role key, token, password, atau `.pem`.
- Jangan commit `resume-medis-reviewer.pem` atau file private key apa pun.
- Jangan menghapus fallback atau fitur side panel lama saat menambah fitur baru.
- Jangan mengubah `knowledge` menjadi per aplikasi kecuali user meminta.
- Jangan pakai reset/destructive git command tanpa instruksi eksplisit user.
- Jangan menambah dependency untuk hal yang bisa dilakukan vanilla JS/CSS/Chrome API.

## Verifikasi Sebelum Selesai

Untuk perubahan extension:

- `node --check sidepanel.js`
- `node --check background.js`
- `node --check improve-inline.js`
- ZIP `public/resume-medis-reviewer.zip` ter-update bila source extension berubah
- Jika rilis: `manifest.json` version, `update.xml` version, dan `.crx` harus sinkron

Untuk perubahan Supabase:

- Jelaskan apakah perlu redeploy Edge Function
- Jelaskan apakah perlu rerun SQL migration

Untuk perubahan release metadata saja:

- Parse `update.xml`
- Pastikan `.pem` tidak staged
- Pastikan URL `.crx` di `update.xml` cocok dengan nama file tracked
