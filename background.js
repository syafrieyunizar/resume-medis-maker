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
  x5lab: { label: "X5Lab", url: "https://api.x5lab.dev/v1/chat/completions" },
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
    .replace(/[→⇒➔➜➝➞]/g, "->")
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
  if (message?.type !== "IMPROVE_INLINE_FIELD") return undefined;

  (async () => {
    const ai = await getEffectiveAiSettings();
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
