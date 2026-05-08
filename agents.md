# AGENTS.md

Panduan bagi AI coding agent (Lovable, Claude, Cursor, dll.) yang bekerja pada repo ini.

## Ringkasan Proyek

Dua artefak dalam satu repo:

1. **Chrome Extension** (`extension/`) — Side panel "Resume Medis Reviewer" yang membantu dokter mengisi SO dan mengekstrak CPPT menjadi 7 kolom resume menggunakan Gemini API.
2. **Landing Page** (`src/`) — Aplikasi TanStack Start v1 + Vite 7 yang menyajikan halaman download untuk file `.zip` ekstensi.

## Struktur Direktori

```
extension/                 # Source ekstensi Chrome (MV3)
  manifest.json            # Manifest V3
  background.js            # Service worker (set side panel behavior)
  sidepanel.html           # UI side panel
  sidepanel.css            # Design tokens + komponen
  sidepanel.js             # Logika: settings, SO insert, CPPT extract via Gemini
  icon.png
public/
  resume-medis-reviewer.zip  # Hasil packaging ekstensi (di-serve sebagai static asset)
src/
  routes/                  # File-based routing (TanStack Router)
    __root.tsx             # Root layout (jangan dibuat ulang sebagai _app/layout)
    index.tsx              # Landing page + tombol download
  components/ui/           # shadcn/ui (jangan modif file ini)
  styles.css               # Tailwind v4 + token global
design.md                  # Panduan visual — WAJIB diikuti untuk UI baru
agents.md                  # File ini
readme.md                  # Petunjuk pengguna akhir
```

## Aturan Kerja Agent

### Untuk perubahan pada ekstensi

1. Edit file di `extension/`.
2. Selalu repackage ZIP setelah perubahan:
   ```bash
   rm -f /dev-server/public/resume-medis-reviewer.zip && \
     cd /dev-server/extension && \
     nix run nixpkgs#zip -- -r /dev-server/public/resume-medis-reviewer.zip .
   ```
3. Jangan tambah library berat — sidepanel adalah HTML/CSS/JS vanilla.
4. Patuhi Manifest V3: `chrome.storage.local` untuk persistensi (bukan `localStorage`).
5. Apa pun yang ber-fetch ke Gemini harus membaca `apiKey` dari `chrome.storage.local` — jangan hardcode.

### Untuk perubahan pada landing page

1. Stack: TanStack Start v1, React 19, Vite 7, Tailwind v4.
2. Routing: file-based di `src/routes/` (flat dot convention). JANGAN edit `src/routeTree.gen.ts`.
3. JANGAN buat `entry-client.tsx` / `entry-server.tsx` / `src/pages/` / `_app/layout`.
4. Download asset pakai `fetch + blob` (bukan `<a href download>` langsung) — preview Lovable butuh auth header.

### Desain

- **Wajib baca `design.md`** sebelum menambah/mengubah UI.
- Token warna ada di `extension/sidepanel.css` (`:root`). Jangan tulis warna mentah di komponen.
- Tombol primer = `--ink-solid` (hitam). Aksen violet hanya untuk focus/loading.
- Tidak ada dark mode, tidak ada emoji UI selain checkmark state.

### Gemini API

- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.
- Model default: `gemini-2.0-flash`. Pilihan lain: `gemini-2.5-flash`, `gemini-2.5-pro`.
- Output CPPT pakai `responseMimeType: "application/json"` + `responseSchema` agar struktur 7 kolom konsisten.
- Gaya prompt: telegrafis, koma desimal Indonesia (0,1), titik ribuan (10.600), format lab `awal→akhir satuan`. Detail di `extension/sidepanel.js` (`systemPrompt`).

### DOM Target di Halaman EMR

Selektor yang dipakai `chrome.scripting.executeScript`:

| Fitur | Selector |
|---|---|
| SO Subjektif (input) | `textarea[name="ab"]` |
| SO Objektif (input) | `textarea[name="ae"]` |
| Sumber CPPT (read) | `#example1_wrapper > div:nth-child(2) > div` |
| Penunjang (output) | `[name="an"]` |
| Terapi dirawat | `[name="af"]` |
| Operasi | `[name="a"]` |
| Dx Utama | `[name="b"]` |
| Dx Sekunder | `[name="c"]` |
| Konsul | `[name="d"]` |
| Terapi pulang | `[name="e"]` |

Set value via descriptor setter + dispatch `input` & `change` event (sudah diimplementasikan di `setVal`) supaya kompatibel dengan React-controlled input.

## Yang TIDAK Boleh Dilakukan

- Menyimpan API key di kode atau di repo.
- Mengirim data pasien ke server selain Gemini API milik user.
- Menambah backend / Lovable Cloud — proyek ini sengaja 100% lokal.
- Mengubah `src/components/ui/*` (shadcn primitives).
- Memakai React Router DOM atau `src/pages/`.

## Verifikasi Sebelum Selesai

- ZIP ter-update bila ada perubahan di `extension/`.
- Tidak ada warna hardcoded baru di komponen UI (cek pakai `rg`).
- Build TanStack Start berhasil (harness menjalankan otomatis).