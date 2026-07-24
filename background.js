chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error(err));

const KNOWLEDGE_FUNCTION_URL =
  "https://yvcqgwpfjoxhuyhxuiry.supabase.co/functions/v1/knowledge-admin";
const APP_ID = "resume-medis-reviewer";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2Y3Fnd3Bmam94aHV5aHh1aXJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NzkxOTIsImV4cCI6MjA5NDA1NTE5Mn0.cSVjIjIpC9hlm8Sb5nISxUitoRHtEL0pC6ZphQ9SxLw";

const PROVIDERS = {
  gemini: { label: "Gemini", url: null },
  sumopod: { label: "Sumopod", url: "https://ai.sumopod.com/v1/chat/completions" },
  aimurah: { label: "AImurah", url: "https://aimurah.my.id/api/v1/chat/completions" },
  semutssh: { label: "SemutSSH", url: "https://ai-partner.semutssh.com/v1/chat/completions" },
};

function buildImproveQuestionsPrompt(kind, existingText, instruction, anamnesisText = "") {
  const isAnamnesis = kind === "ab";
  return [
    `Buat pertanyaan konfirmasi singkat dan contoh jawaban untuk dokter sebelum AI memperbaiki ${isAnamnesis ? "anamnesis" : "pemeriksaan fisik"}.`,
    "Gunakan format persis berikut:",
    "PERTANYAAN:",
    "1. ...",
    "2. ...",
    "",
    "CONTOH JAWABAN:",
    "...",
    "",
    isAnamnesis
      ? "Pertanyaan harus mencakup gejala, onset, derajat keparahan, gejala penyerta, dan tanda kegawatdaruratan yang relevan dengan arahan."
      : "Pertanyaan harus mencakup temuan objektif dan tanda vital yang perlu diperiksa. Jangan menyimpulkan temuan positif dari diagnosis atau anamnesis.",
    "Batasi 3-7 pertanyaan yang paling bermakna.",
    "Contoh jawaban harus satu baris, sangat singkat, padat, tepat, dan bergaya catatan medis dokter.",
    isAnamnesis
      ? "Khusus anamnesis: tulis hanya keluhan subjektif, onset, perjalanan penyakit, gejala penyerta, dan derajat keluhan. Jangan masukkan tanda vital, hasil pemeriksaan fisik, diagnosis, atau interpretasi."
      : "Khusus pemeriksaan fisik: tulis hanya temuan objektif dan tanda vital. Jangan masukkan keluhan, onset, perjalanan penyakit, diagnosis, atau interpretasi.",
    isAnamnesis
      ? "Contoh gaya: Batuk berdahak hijau sejak 3 hari, demam (+), sesak memberat sejak pagi, sulit bicara kalimat panjang."
      : "Contoh gaya: KU tampak sesak, RR 30 x/menit, SpO2 88% RA, retraksi (+), Rh +/+.",
    "Gunakan singkatan medis yang lazim, misalnya SpO2, RR, RA, TD, HR, Rh, Wh, dan CRT.",
    "Jangan menulis kesimpulan atau kalimat tambahan seperti sehingga, mengarah ke, mendukung, dicurigai, perlu dikonfirmasi, atau sesuai pneumonia berat.",
    "Jangan gunakan daftar, nomor, placeholder, tanda kurung siku, pembuka, penutup, atau penjelasan tambahan pada contoh jawaban.",
    "Contoh jawaban bersifat hipotetis, bukan data pasien, dan wajib disesuaikan dokter sebelum digunakan.",
    "",
    `${isAnamnesis ? "ANAMNESIS" : "PEMERIKSAAN FISIK"} SAAT INI:`,
    existingText,
    ...(isAnamnesis ? [] : ["", "KONTEKS ANAMNESIS:", anamnesisText || "Tidak tersedia"]),
    "",
    "ARAHAN USER:",
    instruction,
  ].join("\n");
}

function parseImproveQuestionsResponse(text) {
  const value = normalizeSpacing(text);
  const marker = value.match(/(?:^|\n)(?:CONTOH|SARAN) JAWABAN:\s*/i);
  if (!marker) {
    return { questions: value.replace(/^PERTANYAAN:\s*/i, "").trim(), suggestedAnswer: "" };
  }
  return {
    questions: value.slice(0, marker.index).replace(/^PERTANYAAN:\s*/i, "").trim(),
    suggestedAnswer: value.slice(marker.index + marker[0].length).replace(/\s*\n+\s*/g, " ").replace(/\bsaturasi oksigen\b/gi, "SpO2").replace(/\budara ruangan\b/gi, "RA").replace(/\bfrekuensi napas\b/gi, "RR").replace(/\s+(?:sehingga\s+)?(?:perlu dikonfirmasi|mengarah ke|mendukung diagnosis|dicurigai sebagai|sesuai dengan)\b.*$/i, "").trim(),
  };
}
function buildImprovePrompt(kind, existingText, instruction, confirmation, anamnesisText = "") {
  const isAnamnesis = kind === "ab";
  const roleTitle = isAnamnesis ? "anamnesis" : "pemeriksaan fisik";
  const guidance = isAnamnesis
    ? [
        "- Pertahankan isi asli yang sudah ada dengan cara mengambil bagian-bagian penting isi dari anamnesis agar tidak terlalu berbeda.",
        "- Buat kegawatdaruratan yang sesuai dengan satu atau lebih kriteria berikut: a) mengancam nyawa, membahayakan diri dan orang lain/lingkungan; b) adanya gangguan pada jalan napas, pernapasan, dan sirkulasi; c) adanya penurunan kesadaran; d) adanya gangguan hemodinamik; dan/atau e) memerlukan tindakan segera. Sesuaikan dengan arahan user.",
        "- Integrasikan gejala, tanda, atau perjalanan penyakit yang sudah ada dan yang dikonfirmasi dokter pada JAWABAN KONFIRMASI.",
        "- Jangan mengubah pertanyaan/saran AI menjadi fakta bila tidak dikonfirmasi dokter.",
        "- Fokus pada keluhan, perjalanan penyakit, gejala penyerta, atau tanda yang mendukung arah diagnosis.",
        "- Gunakan bahasa singkat, padat, gaya catatan medis dokter.",
        "- Output hanya teks anamnesis akhir.",
        "- Tunjukkan kegawatdaruratan hanya melalui gejala, onset, derajat keluhan, atau keterbatasan fungsi yang konkret. Jangan jelaskan interpretasinya.",
        "- Jika Faktor risiko/RPD/RPO sudah ada pada teks awal atau disebut eksplisit oleh user, pertahankan dan rapikan pada baris sendiri.",
        "- Jika Faktor risiko/RPD/RPO tidak ada, jangan tuliskan section tersebut.",
      ].join("\n")
    : [
        "- Pertahankan isi asli yang sudah ada.",
        "- Gunakan anamnesis hanya sebagai konteks untuk memilih bagian pemeriksaan yang relevan.",
        "- Tambahkan atau ubah temuan objektif hanya jika dikonfirmasi dokter pada JAWABAN KONFIRMASI.",
        "- Diagnosis atau gejala subjektif tidak membuktikan RR meningkat, ronki, wheezing, edema, atau temuan objektif lainnya.",
        "- Gunakan bahasa singkat, padat, gaya catatan medis dokter.",
        "- Output hanya teks pemeriksaan fisik akhir.",
        "- Gunakan format section tetap berikut dan isi seperlunya:",
        "Kepala/Leher:",
        "Konj. pucat (-), Sklera ikterik (-)",
        "",
        "Thorax:",
        "Paru:",
        "Retraksi (-)",
        "SDV +/+",
        "Wh -/-",
        "Rh -/-",
        "",
        "Jantung: S1 S2 reguler, murmur (-), gallop (-)",
        "",
        "Abd:",
        "I: Distensi (-)",
        "A: BU (+)",
        "P: Timpani (+)",
        "P: Nyeri tekan (-)",
        "",
        "Ekstremitas:",
        "Akral hangat +/+",
        "Edema -/-",
        "",
        "- Jika arahan misalnya pneumonia, ubah bagian paru/thorax hanya berdasarkan temuan yang dikonfirmasi dokter.",
      ].join("\n");

  return `${isAnamnesis
    ? "Kamu membantu dokter memperbaiki dokumentasi anamnesis resume medis menjadi sebuah anamnesis dengan kegawatdaruratan agar dapat diklaim BPJS Kesehatan."
    : `Kamu membantu dokter memperbaiki dokumentasi ${roleTitle} resume medis.`}

TUGAS:
${guidance}

ARAHAN PENTING:
- User boleh memberi arah diagnosis atau fokus perbaikan, misalnya anemia, dehidrasi, pneumonia.
- Perbaikan ditujukan agar dokumentasi lebih kuat secara klinis dan lebih mendukung kelengkapan resume/klaim.
- Kegawatdaruratan hanya boleh terlihat dari gejala atau temuan konkret yang didukung teks awal atau jawaban konfirmasi dokter.
- Jangan menulis diagnosis, interpretasi, kesimpulan klinis, alasan klaim, atau kalimat tentang perlunya evaluasi, pemeriksaan, penanganan, maupun tatalaksana.
- Jangan memakai frasa seperti mengarah ke, mengarah pada, mendukung diagnosis, dicurigai sebagai, sesuai dengan, sehingga perlu, atau memerlukan tatalaksana.
- Akhiri output pada gejala atau temuan klinis terakhir.
- Jangan menulis penjelasan, jangan markdown, jangan bullet.

${isAnamnesis ? "ANAMNESIS SAAT INI" : "PEMERIKSAAN FISIK SAAT INI"}:
${existingText}

${isAnamnesis ? "" : `KONTEKS ANAMNESIS:
${anamnesisText || "Tidak tersedia"}
`}
ARAHAN USER:
${instruction}

JAWABAN KONFIRMASI DOKTER:
${confirmation}`;
}
function findFirstJsonObject(text) {
  const source = String(text || "");
  const start = source.indexOf("{");
  if (start < 0) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return "";
}

function parseJsonResponse(text) {
  if (!text) throw new Error("Respons kosong dari provider");
  const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const firstObject = findFirstJsonObject(cleaned);
    if (firstObject) return JSON.parse(firstObject);
    throw error;
  }
}

function normalizeSpacing(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[Ã¢â€ â€™Ã¢â€¡â€™Ã¢Å¾â€Ã¢Å¾Å“Ã¢Å¾ÂÃ¢Å¾Å¾]/g, "->")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatImproveAnamnesis(text) {
  return normalizeSpacing(
    String(text || "")
      .replace(/\s+(Faktor risiko:)/gi, "\n$1")
      .replace(/\s+(RPD:)/gi, "\n$1")
      .replace(/\s+(RPO:)/gi, "\n$1")
      .replace(/\s+(Riwayat penyakit dahulu:)/gi, "\n$1")
      .replace(/\s+(Riwayat pengobatan:)/gi, "\n$1")
      .replace(/(?:^|\n)(?:Faktor risiko|RPD|RPO|Riwayat penyakit dahulu|Riwayat pengobatan):\s*(?:-|tidak ada|nihil|tidak diketahui)?\s*(?=\n|$)/gi, "\n")
  );
}

function formatImproveObjective(text) {
  let value = normalizeSpacing(text);
  const sections = [
    "Kepala/Leher:",
    "Thorax:",
    "Paru:",
    "Jantung:",
    "Abd:",
    "Ekstremitas:",
  ];
  sections.forEach((section) => {
    const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    value = value.replace(new RegExp(`\\s*${escaped}`, "gi"), `\n\n${section}`);
  });
  value = value
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .trim();
  return value;
}

function stripClinicalConclusions(text) {
  return String(text || "")
    .replace(/(?:,?\s+|\.\s*)(?:yang\s+)?(?:mengarah(?:\s+(?:ke|pada))?|mendukung(?:\s+diagnosis)?|dicurigai(?:\s+sebagai)?|sesuai\s+dengan)\s+[^.\n]*(?:\.|$)/gi, ".")
    .replace(/(?:,?\s+|\.\s*)(?:sehingga\s+)?(?:memerlukan|perlu)\s+(?:evaluasi|tatalaksana|penanganan|pemeriksaan|konfirmasi)[^.\n]*(?:\.|$)/gi, ".")
    .replace(/[ \t]+\./g, ".")
    .replace(/\.{2,}/g, ".");
}

function postProcessImproveText(kind, text) {
  const cleaned = stripClinicalConclusions(text);
  return kind === "ab" ? formatImproveAnamnesis(cleaned) : formatImproveObjective(cleaned);
}
function buildSoapBpjsPrompt(identity, serviceMode, soapInput = {}) {
  const modeText = {
    rawat_inap: "RAWAT INAP",
    rawat_jalan: "RAWAT JALAN",
    dari_poli: "DARI POLI",
  }[serviceMode] || "RAWAT INAP";

  return `Kamu adalah asisten dokter IGD yang membantu menyusun catatan SOAP Gawat Darurat untuk kebutuhan dokumentasi medis dan kelayakan klaim BPJS.

Tugas kamu adalah mengembangkan data SOAP ringkas yang sudah ditulis dokter menjadi SOAP IGD yang lebih lengkap, natural, ringkas, klinis, dan defensible untuk kondisi gawat darurat.

Kamu WAJIB mengikuti prinsip berikut:
1. Jangan menulis seperti artikel, buku teks, atau bahasa AI.
2. Gunakan gaya bahasa dokter IGD Indonesia.
3. Gunakan singkatan medis yang lazim bila sesuai.
4. Jangan mengarang identitas pasien.
5. Jangan memasukkan nama pasien, nomor rekam medis, alamat, atau identitas pribadi.
6. Identitas yang boleh dipakai hanya umur dan jenis kelamin.
7. Tetap munculkan red flag kegawatdaruratan yang relevan secara klinis dari keluhan dan objektif yang diberikan.
8. Jangan membuat diagnosis atau temuan yang bertentangan dengan data awal.
9. Jika data awal sangat ringkas, perluas menjadi dokumentasi klinis IGD yang masuk akal dan harus tetap selaras dengan keluhan utama.
10. Output wajib berupa JSON valid tanpa markdown.

KRITERIA GAWAT DARURAT BPJS:
Berdasarkan Matriks Ketentuan Penjaminan dan Penagihan Klaim IGD pada BA Kesepakatan No. 1247/BA/1124, kasus IGD harus memenuhi sedikitnya satu kriteria:
a. mengancam nyawa, membahayakan diri dan orang lain/lingkungan;
b. adanya gangguan pada jalan napas, pernafasan, dan sirkulasi;
c. adanya penurunan kesadaran;
d. adanya gangguan hemodinamik; dan/atau
e. memerlukan tindakan segera.

Gunakan red flag dan kriteria yang paling sesuai dengan data awal. Jangan menambahkan red flag yang bertentangan dengan keluhan, temuan, atau konteks kasus.

KONTEKS PASIEN:
Identitas anonim:
${identity}

Status pelayanan:
${modeText}

Pilihan status pelayanan hanya salah satu dari:
- RAWAT INAP
- RAWAT JALAN
- DARI POLI

ATURAN STATUS PELAYANAN:
- Jika status pelayanan RAWAT INAP, tuliskan SOAP dengan konteks bahwa pasien sudah mendapatkan terapi awal di IGD, tetapi keluhan belum membaik, bertambah berat, masih membutuhkan observasi ketat, atau masih membutuhkan rawat inap/perawatan lanjutan sesuai konteks klinis.
- Jika status pelayanan RAWAT JALAN, tuliskan SOAP dengan konteks bahwa setelah terapi di IGD kondisi pasien membaik. Jika sebelumnya ada tanda vital atau kondisi hemodinamik tidak stabil, tuliskan bahwa setelah terapi kondisi menjadi lebih stabil bila sesuai konteks klinis.
- Jika status pelayanan DARI POLI, tuliskan SOAP dengan konteks bahwa pasien berasal dari poli dan membutuhkan rawat inap untuk perbaikan keadaan umum, observasi, terapi lanjutan, rencana tindakan, atau alasan klinis lain yang disesuaikan dengan konteks kasus.

DATA AWAL DARI DOKTER:
Subjektif awal:
${soapInput.s || ""}

Objektif awal:
${soapInput.o || ""}

Assessment awal:
${soapInput.a || ""}

Planning awal:
${soapInput.p || ""}

ATURAN MUTLAK SUBJEKTIF (S):
Bagian S adalah ANAMNESIS, yaitu apa yang DIKELUHKAN dan DIRASAKAN pasien.

Oleh karena itu:
- DILARANG KERAS menggunakan istilah klinis yang hanya diketahui dokter, bukan bahasa pasien.
- Istilah seperti "retraksi", "ronki", "wheezing", "sianosis", "distensi abdomen", "defans muskular", dan istilah pemeriksaan fisik lain adalah temuan pemeriksaan fisik. Letakkan di bagian O (Objektif), BUKAN di S.
- Di bagian S, gunakan HANYA bahasa yang bisa diucapkan pasien kepada dokter.
- Bila status pelayanan RAWAT INAP, tambahkan konteks bahwa setelah terapi awal keluhan belum membaik atau masih membutuhkan observasi/perawatan.
- Bila status pelayanan RAWAT JALAN, tambahkan konteks bahwa setelah terapi keluhan membaik bila sesuai.
- Bila status pelayanan DARI POLI, tambahkan konteks bahwa pasien membutuhkan rawat inap untuk perbaikan keadaan umum, rencana tindakan, observasi, terapi lanjutan, atau alasan klinis lain sesuai konteks.

CONTOH KONVERSI ISTILAH KLINIS KE BAHASA PASIEN DAN BAHASA DOKTER:
- Jangan tulis: "terdapat retraksi sela iga"
  Tulis: "napas terasa berat dan tidak lancar"
- Jangan tulis: "sesak napas dengan retraksi subkostal"
  Tulis: "napas terasa sesak dan berat, susah menarik napas"
- Jangan tulis: "intensitas nyeri tetap tinggi"
  Tulis: "nyerinya tidak berkurang"
- Jangan tulis: "distensi abdomen"
  Tulis: "perut terasa kembung dan penuh"
- Jangan tulis: "Pasien tidak membaik saat observasi di IGD, nyeri tetap tidak tertahankan dan muntah masih terus berlangsung meskipun telah diberikan terapi injeksi antinyeri awal."
  Tulis: "Setelah diberikan terapi dan observasi di IGD, keluhan nyeri tidak berkurang dan masih muntah muntah"
- Jangan tulis: "Pasien datang dengan keluhan BAB cair frekuensi lebih dari 15 kali sejak 2 hari SMRS."
  Tulis: "Pasien datang dengan keluhan BAB cair >15x sejak 2 hari SMRS"
- Jangan tulis: "kondisi fisik semakin menurun dan tanda dehidrasi semakin memberat."
  Tulis: "pasien masih mengatakan tidak ada BAK, dan keluhan belum membaik"

ATURAN NORMALISASI BAHASA ANAMNESIS:
- Buat bahasa Subjektif senatural mungkin seperti catatan dokter IGD Indonesia.
- Jangan membuat kalimat terlalu baku atau seperti artikel.
- Jangan mengubah makna klinis dari input dokter.
- Untuk keluhan yang disangkal, ubah menjadi format ringkas dokter dengan tanda negatif bila ditulis ringkas.
- Contoh:
  "muntah tidak ada" menjadi "muntah (-)"
  "tidak ada muntah" menjadi "muntah (-)"
  "demam tidak ada" menjadi "demam (-)"
  "batuk pilek tidak ada" menjadi "batuk pilek (-)"
  "sesak tidak ada" menjadi "sesak (-)"
- Untuk frekuensi atau durasi keluhan, gunakan angka dan "x" agar ringkas dan natural bila sesuai.
- Contoh:
  "BAB cair tiga kali" menjadi "BAB cair 3x"
  "muntah dua kali" menjadi "muntah 2x"
  "kejang satu kali" menjadi "kejang 1x"
  "demam lima hari" menjadi "demam 5 hari"
  "nyeri sejak tiga jam" menjadi "nyeri sejak 3 jam"

ATURAN FORMAT SUBJEKTIF (S) WAJIB DIPATUHI:
1. S harus lebih detail dan lengkap daripada input awal dokter. Jangan hanya menyalin atau membuat parafrase pendek.
2. Kembangkan S menjadi anamnesis IGD yang natural, runtut, dan defensible untuk kegawatdaruratan, tetapi DILARANG mengarang fakta spesifik yang tidak didukung data awal.
3. S wajib tetap berada dalam satu nilai string JSON "s", tetapi isi string wajib memakai newline escaped "\n" untuk memisahkan bagian sesuai aturan di bawah.
4. Setiap gejala/keluhan utama wajib dipisahkan dengan newline "\n".
5. Setiap gejala yang ada wajib diberi tanda "(+)" setelah nama gejala di awal kalimat, lalu dilanjutkan dengan deskripsinya.
6. Format natural yang diharapkan:
   "Pasien datang dengan keluhan sesak napas (+) yang dirasakan memberat sejak tadi malam. Sesak dirasakan terus-menerus dan semakin berat saat pasien batuk atau beraktivitas."
   "Pasien juga mengeluhkan batuk (+) yang sudah berlangsung hampir 1 bulan ini, batuk disertai dahak yang sulit dikeluarkan."
   "Pasien mengeluhkan nyeri dada (+) di sebelah kiri yang terasa seperti tertusuk, terutama saat pasien menarik napas dalam atau saat batuk."
7. Keluhan yang disangkal boleh tetap dalam satu kalimat natural, misalnya:
   "Keluhan demam, mual, maupun muntah disangkal oleh pasien."
8. Bila keluhan negatif ditulis ringkas, gunakan format seperti "demam (-)", "mual (-)", "muntah (-)", atau "sesak (-)".
9. Awali dengan cerita keluhan utama secara lengkap berdasarkan data yang tersedia: onset, durasi, lokasi, penjalaran bila relevan, karakter, perburukan, pencetus, pemberat/peringan, dan keluhan penyerta. Gunakan hanya unsur yang tersedia atau dapat dinyatakan secara umum tanpa membuat fakta baru.
10. Jika data awal memuat RPD, riwayat penyakit dahulu, riwayat pemeriksaan sebelumnya, riwayat pengobatan, atau riwayat penting lain, pisahkan dengan dua newline "\n\n" lalu tulis dengan heading "RPD :".
11. Jika ada RPO, pisahkan dengan dua newline "\n\n" lalu tulis sebagai "RPO :".
12. Jika ada riwayat alergi, pisahkan dengan dua newline "\n\n" lalu tulis sebagai "Alergi :".
13. Setelah bagian riwayat, pisahkan lagi dengan dua newline "\n\n" sebelum konteks terapi/observasi IGD bila ada.
14. Untuk RAWAT INAP dan RAWAT JALAN, bagian respons terapi wajib diawali dengan "Setelah diberikan terapi...".
15. Untuk RAWAT INAP, jelaskan bahwa setelah terapi awal keluhan belum membaik sepenuhnya, masih memberat, masih membutuhkan observasi ketat, atau masih membutuhkan rawat inap/perawatan lanjutan sesuai konteks klinis.
16. Untuk RAWAT JALAN, jelaskan bahwa setelah terapi keluhan membaik dan kondisi lebih stabil bila sesuai konteks klinis.
17. Untuk DARI POLI, gunakan konteks "Pasien dari poli..." atau kalimat natural lain yang menjelaskan kebutuhan rawat inap, observasi, terapi lanjutan, rencana tindakan, atau alasan klinis lain.
18. Bila data awal memuat RPD, RPO, riwayat alergi, riwayat terapi, atau riwayat penting lain, letakkan di bagian riwayat yang sesuai. Jangan membuat riwayat yang tidak diberikan.
19. Jangan memasukkan temuan objektif/pemeriksaan fisik ke bagian S.
20. Jangan gunakan bullet, nomor, atau judul selain heading riwayat seperti "RPD :", "RPO :", dan "Alergi :".

ATURAN MUTLAK OBJEKTIF (O):
Objektif (O) HARUS MUTLAK mengikuti template baku di bawah ini.

JANGAN ubah struktur.
JANGAN hapus tabel Paru (Wh/Rh).
JANGAN gabungkan baris Abdomen (I,A,P,P).
WAJIB selalu beri jarak antar sistem organ persis seperti format baku.
Isi sesuai kasus kegawatan.
Selalu buat tanda vital tidak normal yang relevan dengan kegawatan.
Jika ada objektif di luar format baku Status Generalis, tambahkan di bawah Status Generalis sesuai sistem, misalnya:
- Status Dermatologis
- Status Neurologis
- Status Obstetri
- Status Ginekologis
- Status Lokalis

FORMAT BAKU OBJEKTIF (WAJIB DITIRU PERSIS URUTAN DAN SPASINYA):
Status Generalis :
Kesadaran: [Isi Kesadaran]
GCS : [Isi GCS]
TD : [Isi TD] mmHg
N :  [Isi Nadi] x/m
RR :  [Isi RR] x/m
T: [Isi Suhu] \u00B0C
SpO2 : [Isi SpO2] % RA

Kepala/Leher :
[Isi temuan kepala/leher]

Thorax:
Paru :
Retraksi [Isi retraksi]
Suara Nafas [Isi suara nafas, jika normal cukup Vesikuler +/+]
Wh    Rh
-/-      -/-
-/-      -/-
-/-      -/-
Jantung: [Isi temuan jantung]

Abd:
I : Distensi [Isi]
A : BU [Isi]
P : Timpani [Isi]
P : Nyeri tekan [Isi]

Ekstremitas:
Akral [Isi]
Sianosis [Isi]
Edema [Isi]
CRT [Isi]

ATURAN ASSESSMENT (A):
- Assessment harus berdasarkan Subjektif dan Objektif hasil generate AI.
- Jika Assessment awal kosong, buat assessment paling relevan dari Subjektif dan Objektif.
- Jika Assessment awal diisi dokter, gunakan sebagai petunjuk, tetapi tetap rapikan dan sesuaikan dengan Subjektif dan Objektif hasil generate AI.
- Jangan mengikuti Assessment awal secara buta jika tidak selaras dengan Subjektif dan Objektif.
- Gunakan istilah diagnosis klinis yang lazim, rapi, dan sesuai kegawatdaruratan.
- Jika diagnosis awal terlalu sederhana, rapikan menjadi diagnosis yang lebih klinis.
- Contoh: "fraktur tibia fibula" dapat menjadi "Close fracture tibia et fibula sinistra" bila sesuai konteks.
- Assessment jangan dibuat dalam bentuk narasi/paragraf panjang.
- Susun Assessment ke bawah.
- Jika hanya ada satu diagnosis, cukup satu baris.
- Jika ada lebih dari satu diagnosis atau masalah klinis, tulis satu diagnosis/masalah per baris.
- Di dalam JSON, gunakan newline escaped "\\n" untuk memisahkan baris.
- Jangan gabungkan beberapa diagnosis dengan koma bila lebih rapi ditulis ke bawah.

ATURAN PLANNING (P):
- Planning harus berdasarkan Subjektif, Objektif, dan Assessment hasil generate AI.
- Jika Planning awal kosong, buat planning IGD yang relevan.
- Jika Planning awal diisi dokter, rapikan terapi yang sudah ditulis dokter, lalu tambahkan usulan terapi/tindakan yang kurang bila sesuai.
- Jangan menghapus terapi dokter kecuali jelas duplikat atau hanya salah format.
- Ubah singkatan terapi menjadi format medis yang rapi.
- Contoh input dokter: "NS 20 tpm, keto 1 amp"
  Output: "IVFD NS 20 tpm, Inj. Ketorolac 30 mg"
- Planning jangan dibuat dalam bentuk narasi/paragraf panjang.
- Susun Planning ke bawah, satu terapi/tindakan/rencana per baris.
- Jangan gabungkan terapi dengan koma dalam satu kalimat.
- Di dalam JSON, gunakan newline escaped "\\n" untuk memisahkan baris.
- Contoh input dokter: "NS 20 tpm, keto 1 amp"
  Output yang benar: "IVFD NS 20 tpm\\nInj. Ketorolac 30 mg"
  Output yang salah: "IVFD NS 20 tpm, Inj. Ketorolac 30 mg"
- Bila ada terapi/tindakan tambahan yang disarankan, tulis dalam bagian "Usul:".
- Jika ada usulan tambahan, susun sebagai:
  "Usul:\\n[usulan 1]\\n[usulan 2]"
- Usulan harus wajar untuk IGD dan sesuai diagnosis.
- Jangan memberi terapi ekstrem yang tidak didukung konteks.
- Untuk RAWAT INAP, sertakan observasi, monitoring, konsultasi, pemeriksaan penunjang, terapi lanjutan, dan rencana rawat inap bila sesuai.
- Untuk RAWAT JALAN, sertakan evaluasi pasca terapi, KIE, obat pulang, tanda bahaya, dan kontrol bila sesuai.
- Untuk DARI POLI, sertakan rencana rawat inap, evaluasi lanjutan, terapi selama rawat, pemeriksaan penunjang, konsultasi, atau rencana tindakan bila sesuai.

INSTRUKSI PENALARAN INTERNAL:
- Sebelum menghasilkan jawaban, pikirkan ulang kasus secara global dengan menghubungkan Subjektif awal, Objektif awal, Assessment awal, Planning awal, identitas anonim, status pelayanan, dan kriteria gawat darurat BPJS.
- Jika model mendukung reasoning atau thinking mode, gunakan kemampuan tersebut secara internal untuk mengecek konsistensi S, O, A, dan P.
- Jangan tampilkan proses berpikir, analisis internal, atau alasan langkah demi langkah.
- Keluarkan hanya hasil akhir yang konsisten dalam format JSON.

FORMAT OUTPUT:
Kembalikan hanya JSON valid tanpa markdown dengan key berikut:
{
  "s": "Subjektif hasil akhir",
  "o": "Objektif hasil akhir",
  "a": "Assessment hasil akhir",
  "p": "Planning hasil akhir"
}

Jangan menambahkan key lain.
Jangan menulis penjelasan di luar JSON.`;
}
function normalizeSoapBpjsResult(value) {
  const parsed = typeof value === "string" ? parseJsonResponse(value) : value;
  return {
    s: String(parsed.s || "").trim(),
    o: String(parsed.o || "").trim(),
    a: String(parsed.a || "").trim(),
    p: String(parsed.p || "").trim(),
    bpjs_narrative: String(parsed.bpjs_narrative || "").trim(),
    bpjs_defense: String(parsed.bpjs_defense || "").trim(),
  };
}
async function knowledgeApi(action, payload = {}) {
  const response = await fetch(KNOWLEDGE_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ action, app_id: APP_ID, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    if (response.status === 401) {
      throw new Error("Supabase menolak akses Edge Function.");
    }
    if (response.status === 546) {
      throw new Error("Knowledge API 546: proses terlalu lama atau payload terlalu besar");
    }
    throw new Error(data.error || `Knowledge API ${response.status}`);
  }
  return data;
}

async function getStoredAdminUserSession() {
  const { adminUserSession = null } = await chrome.storage.local.get(["adminUserSession"]);
  return adminUserSession;
}

async function validateStoredAdminUserSession() {
  const session = await getStoredAdminUserSession();
  if (!session?.username || !session?.sessionToken || !session?.deviceId) return null;
  try {
    const data = await knowledgeApi("validate_user_session", {
      username: session.username,
      session_token: session.sessionToken,
      device_id: session.deviceId,
    });
    const nextSession = {
      username: data.session?.username || session.username,
      sessionToken: session.sessionToken,
      deviceId: data.session?.deviceId || session.deviceId,
      expiresAt: data.session?.expiresAt || session.expiresAt || null,
    };
    await chrome.storage.local.set({ adminUserSession: nextSession });
    return nextSession;
  } catch (_error) {
    await chrome.storage.local.remove(["adminUserSession"]);
    return null;
  }
}

async function callAdminAiText(prompt, userSession) {
  const data = await knowledgeApi("ai_generate", {
    prompt,
    user_session: userSession,
  });
  return data.text || "";
}

async function getEffectiveAiSettings() {
  const settings = await chrome.storage.local.get([
    "apiKeySource",
    "apiKey",
    "model",
    "provider",
    "customProviderLabel",
    "customBaseUrl",
  ]);
  const source = settings.apiKeySource || "admin";
  const hasPersonal = Boolean(settings.apiKey && settings.model && settings.provider);
  if (source === "personal" && hasPersonal) {
    return {
      source: "personal",
      apiKey: settings.apiKey,
      model: settings.model,
      provider: settings.provider,
      providerLabel: settings.customProviderLabel || "",
      baseUrl: settings.customBaseUrl || "",
    };
  }
  const data = await knowledgeApi("get_ai_config");
  if (!data.config?.hasApiKey) throw new Error("API key admin belum diset");
  const adminUserSession = await validateStoredAdminUserSession();
  if (!adminUserSession) throw new Error("Sesi admin di perangkat ini sudah tidak aktif. Silakan login ulang.");
  return {
    source: "admin",
    provider: data.config.provider,
    model: data.config.model,
    adminUserSession,
  };
}

function getProviderEndpoint(provider, baseUrl = "") {
  return provider === "custom" ? baseUrl : PROVIDERS[provider]?.url || baseUrl;
}

function getProviderDisplay(provider, providerLabel = "") {
  if (provider === "custom") return providerLabel || "Provider Lain";
  return PROVIDERS[provider]?.label || provider || "Provider";
}

async function callProviderText({ provider, apiKey, model, prompt, baseUrl = "", providerLabel = "" }) {
  if (provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4 },
      }),
    });
    if (!res.ok) throw new Error("Gemini API " + res.status + ": " + (await res.text()).slice(0, 200));
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  const endpoint = getProviderEndpoint(provider, baseUrl);
  if (!endpoint) throw new Error("Endpoint " + getProviderDisplay(provider, providerLabel) + " belum diisi.");
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    }),
  });
  if (!res.ok) throw new Error("API " + res.status + ": " + (await res.text()).slice(0, 200));
  const data = parseJsonResponse(await res.text());
  return data?.choices?.[0]?.message?.content || "";
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type || !["IMPROVE_INLINE_FIELD", "GENERATE_SOAP_BPJS"].includes(message.type)) return undefined;

  (async () => {
    const ai = await getEffectiveAiSettings();

    if (message.type === "GENERATE_SOAP_BPJS") {
      const identity = String(message.identity || "").trim();
      const soapInput = message.soapInput || { s: message.complaint || "", o: "", a: "", p: "" };
      soapInput.s = String(soapInput.s || "").trim();
      soapInput.o = String(soapInput.o || "").trim();
      soapInput.a = String(soapInput.a || "").trim();
      soapInput.p = String(soapInput.p || "").trim();
      if (!identity || !soapInput.s) throw new Error("Subjektif wajib diisi minimal keluhan utama.");
      const prompt = buildSoapBpjsPrompt(identity, message.serviceMode || "rawat_inap", soapInput);
      const rawResponse =
        ai.source === "admin"
          ? await callAdminAiText(prompt, ai.adminUserSession)
          : await callProviderText({
              provider: ai.provider,
              apiKey: ai.apiKey,
              model: ai.model,
              prompt,
              baseUrl: ai.baseUrl,
              providerLabel: ai.providerLabel,
            });
      const result = normalizeSoapBpjsResult(rawResponse);
      if (!result.s || !result.o || !result.a || !result.p) throw new Error("Respons SOAP tidak lengkap.");
      sendResponse({ ok: true, result });
      return;
    }

    const kind = message.kind === "ae" ? "ae" : "ab";
    const existingText = String(message.existingText || "").trim();
    const instruction = String(message.instruction || "").trim();
    const confirmation = String(message.confirmation || "").trim();
    const anamnesisText = String(message.anamnesisText || "").trim();

    if (!instruction) throw new Error("Isi arahan terlebih dahulu.");
    if (!existingText) {
      throw new Error(kind === "ab" ? "Isi anamnesis terlebih dahulu." : "Isi pemeriksaan fisik terlebih dahulu.");
    }

    if (message.phase === "questions") {
      const prompt = buildImproveQuestionsPrompt(kind, existingText, instruction, anamnesisText);
      const rawResponse =
        ai.source === "admin"
          ? await callAdminAiText(prompt, ai.adminUserSession)
          : await callProviderText({
              provider: ai.provider,
              apiKey: ai.apiKey,
              model: ai.model,
              prompt,
              baseUrl: ai.baseUrl,
              providerLabel: ai.providerLabel,
            });
      const result = parseImproveQuestionsResponse(rawResponse);
      if (!result.questions) throw new Error("Pertanyaan konfirmasi kosong.");
      sendResponse({ ok: true, ...result });
      return;
    }

    if (!confirmation) throw new Error("Isi jawaban konfirmasi dokter terlebih dahulu.");

    const prompt = buildImprovePrompt(kind, existingText, instruction, confirmation, anamnesisText);
    const text =
      ai.source === "admin"
        ? await callAdminAiText(prompt, ai.adminUserSession)
        : await callProviderText({
            provider: ai.provider,
            apiKey: ai.apiKey,
            model: ai.model,
            prompt,
            baseUrl: ai.baseUrl,
            providerLabel: ai.providerLabel,
          });
    const improvedText = postProcessImproveText(kind, text);
    if (!improvedText) throw new Error("Respons AI kosong.");
    sendResponse({ ok: true, text: improvedText });
  })().catch((error) => {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
  });

  return true;
});
