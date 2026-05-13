# AGENTS.md

Panduan untuk AI coding agent yang bekerja di repo ini.

## Ringkasan Proyek

Repo ini sekarang berisi satu Chrome extension MV3 yang membantu dokter menyusun resume medis di eRM RSUD.

Komponen utamanya:

- `Side panel`:
  SO, CPPT, Penunjang, Analisa, Setting, Admin Knowledge BPJS.
- `Inline improve`:
  tombol pensil di halaman eRM untuk improve `anamnesis` (`ab`) dan `px fisik` (`ae`) dengan preview hasil AI.
- `Supabase backend ringan`:
  knowledge base BPJS dan konfigurasi API key admin per aplikasi.

Repo ini **tidak** lagi memakai struktur `extension/` atau landing page `src/`. Source extension ada langsung di root workspace.

## Struktur Direktori Aktual

```text
manifest.json
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
agents.md
readme.md
```

## Aturan Kerja Agent

### Untuk perubahan extension

1. Edit file root extension langsung, bukan folder `extension/`.
2. Selalu repackage ZIP setelah perubahan extension:

```powershell
Compress-Archive -Path manifest.json,background.js,sidepanel.html,sidepanel.css,sidepanel.js,icon.png,vendor,improve-inline.js,improve-inline.css -DestinationPath public\resume-medis-reviewer.zip -Force
```

3. Jangan tambah library berat. UI extension tetap vanilla HTML/CSS/JS.
4. Persistensi settings tetap di `chrome.storage.local`.
5. Jangan merusak perilaku side panel yang sudah ada saat menambah fitur content script atau background messaging.

### Untuk perubahan Supabase

File utama:

- `supabase_migration.sql`
- `supabase/functions/knowledge-admin/index.ts`
- `supabase/config.toml`

Fungsi `knowledge-admin` menangani:

- login admin
- CRUD knowledge chunks
- search knowledge
- simpan / baca / validasi API key admin
- proxy panggilan AI admin

Knowledge bersifat `global`.
API key admin bersifat `per app_id`.

App ID yang saat ini dipakai:

- `resume-medis-reviewer`
- `eklaim-koding-assistant`
- `soap-gen`

## Fitur yang Sudah Ada

### Side panel

- `SO`: tarik subjektif/objektif dari IGD dan masukkan ke resume.
- `CPPT`: akses tabel CPPT, proses AI menjadi 7 field resume.
- `Penunjang`: tarik data dari tombol `HASIL` pada tabel `#DataTables_Table_1_wrapper`, rangkum PDF, lalu masukkan ke resume.
- `Analisa`: analisa resume berbasis knowledge BPJS, output kartu risiko dan saran.
- `Setting/Admin`: sumber API key `admin/pribadi`, validasi key, admin API config, knowledge upload PDF/manual.

### Inline improve

- Content script hanya aktif di halaman eRM yang cocok.
- Menyisipkan tombol pensil biru di samping:
  - `textarea[name="ab"]`
  - `textarea[name="ae"]`
- Hasil AI harus muncul sebagai preview dulu.
- `ab` dan `ae` memakai prompt berbeda.
- Input arahan user wajib diisi.

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

## Aturan AI / Provider

- Provider pribadi didukung:
  - `gemini`
  - `sumopod`
  - `aimurah`
- Jalur admin memakai Supabase `ai_generate`.
- Jalur `sumopod` / `aimurah` untuk penunjang memakai parser lokal `PDF.js` dulu.
- Error `546` harus diterjemahkan menjadi pesan yang ramah untuk user, bukan dibiarkan mentah.

## Desain

- Ikuti `design.md`.
- Side panel tetap memakai token warna di `sidepanel.css`.
- Tombol primer side panel hitam.
- Tombol inline improve memang biru karena itu fitur in-page yang berbeda konteks.

## Larangan

- Jangan hardcode API key AI sensitif atau service role key di repo.
- Jangan menghapus fallback / fitur side panel lama saat menambah fitur baru.
- Jangan mengubah `knowledge` menjadi per aplikasi kecuali user meminta; saat ini hanya API key admin yang per `app_id`.
- Jangan pakai reset/destructive git command.

## Verifikasi Sebelum Selesai

- `node --check sidepanel.js`
- `node --check background.js`
- `node --check improve-inline.js`
- ZIP `public/resume-medis-reviewer.zip` ter-update bila ada perubahan extension
- Bila mengubah Supabase function, pastikan penjelasan final menyebut perlu redeploy function / rerun migration bila relevan
