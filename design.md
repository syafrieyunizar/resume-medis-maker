# Design Guidelines — Resume Medis Reviewer

Panduan visual untuk ekstensi Chrome dan landing page. Ikuti aturan ini setiap kali menambah UI.

## Prinsip

- Minimalis, profesional, fokus pada keterbacaan teks medis.
- Hierarki tegas: judul tebal, label kecil, body netral.
- Warna terbatas — hitam/abu sebagai dasar, violet sebagai aksen tunggal.
- Tidak ada dekorasi berlebih (gradien warna-warni, shadow tebal, emoji UI).

## Color Tokens

Didefinisikan di `extension/sidepanel.css` (`:root`). Untuk halaman web (Tailwind), gunakan nilai hex yang sama agar konsisten.

| Token | Value | Pemakaian |
|---|---|---|
| `--canvas-white` | `#ffffff` | Background utama |
| `--graphite-black` | `#000000` | Hover state ink |
| `--ink-solid` | `#202020` | Teks utama, tombol primer |
| `--slate-gray` | `#292d34` | Teks sekunder kuat (label) |
| `--subtle-gray` | `#646464` | Teks pendukung |
| `--ash-gray` | `#838383` | Hint, placeholder |
| `--whisper-white` | `#f0f0f0` | Background note/status netral |
| `--cloud-gray` | `#e8e8e8` | Border, divider |
| `--electric-violet` | `#7b68ee` | Aksen, focus ring |
| `--deep-violet` | `#514b81` | Teks loading state |
| `--success` | `#16a34a` | Konfirmasi sukses |
| Error | `#b91c1c` / `#fee2e2` | Status error |

Aturan:
- Jangan pakai warna mentah di komponen baru — referensikan token.
- Aksen violet hanya untuk fokus & loading. Tombol primer tetap `--ink-solid`.

## Typography

- Heading: **Plus Jakarta Sans**, weight 700, `letter-spacing: -0.04em`.
- Body: **Inter**, 14px, `line-height: 1.5`, `letter-spacing: -0.14px`.
- Label form: 12px, weight 600, warna `--slate-gray`.
- Hint: 11px, warna `--ash-gray`.

## Spacing & Radius

- Padding panel: `16px`.
- Gap antar field: `12px`; gap dalam field (label↔input): `6px`.
- Border radius: `9px` untuk input/tombol/status, `18px` untuk kartu besar.
- Border: `1px solid var(--cloud-gray)`.

## Komponen

**Tombol**
- `.btn-primary` — background `--ink-solid`, teks putih. Aksi utama.
- `.btn-outline` — transparan, border `--cloud-gray`. Aksi sekunder.
- `.btn-success` — hijau, hanya untuk indikator state setelah aksi (mis. "✓ CPPT Diakses").
- Disabled: `opacity: 0.5`, cursor `not-allowed`.

**Input / Textarea**
- Border `--cloud-gray`, focus → border `--electric-violet` + ring `rgba(123,104,238,0.15)`.
- Textarea `resize: vertical`, min-height `80px`.

**Tabs**
- Underline 2px pada tab aktif (warna `--ink-solid`), inaktif `--subtle-gray`.
- Tidak ada background pill.

**Toast**
- Fixed bottom-center, radius `9px`, auto-hide 2.5s.
- Varian: default (ink), `is-success` (hijau), `is-error` (merah).

**Status box**
- Background `--whisper-white`. Varian `is-loading` (violet tipis), `is-error` (merah tipis).

## Layout Side Panel

- Lebar minimum `320px`.
- Header sticky di atas dengan judul + tab nav.
- Konten di-scroll, panel tidak aktif memakai `hidden`.

## Aksesibilitas

- Kontras teks ≥ 4.5:1 (semua token sudah memenuhi terhadap canvas putih).
- Tab gunakan `role="tab"`, panel `role="tabpanel"` bila ditambah.
- Semua tombol punya label teks eksplisit (tanpa hanya ikon).

## Yang Dihindari

- Dark mode (belum diperlukan).
- Gradien warna-warni, glassmorphism, shadow tebal.
- Ikon emoji selain checkmark sederhana untuk indikator state.
- Library UI berat di dalam ekstensi — sidepanel ditulis HTML/CSS/JS murni.