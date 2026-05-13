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
};

function buildImprovePrompt(kind, existingText, instruction) {
  const isAnamnesis = kind === "ab";
  const roleTitle = isAnamnesis ? "anamnesis" : "pemeriksaan fisik";
  const guidance = isAnamnesis
    ? [
        "- Pertahankan isi asli yang sudah ada.",
        "- Tambahkan detail klinis yang relevan dengan arahan user, meski belum tertulis, sebagai draft dokter.",
        "- Fokus pada keluhan, perjalanan penyakit, gejala penyerta, faktor risiko, atau tanda yang mendukung arah diagnosis.",
        "- Gunakan bahasa singkat, padat, gaya catatan medis dokter.",
        "- Output hanya teks anamnesis akhir.",
        "- Tulis hasil rapi dengan pemisahan baris.",
        "- Paragraf utama berisi keluhan dan perjalanan penyakit.",
        "- Jika ada, tulis 'Faktor risiko:' pada baris baru.",
        "- Jika ada, tulis 'RPD:' pada baris baru.",
        "- Jika ada, tulis 'RPO:' pada baris baru.",
      ].join("\n")
    : [
        "- Pertahankan isi asli yang sudah ada.",
        "- Tambahkan detail pemeriksaan fisik yang relevan dengan arahan user, meski belum tertulis, sebagai draft dokter.",
        "- Fokus pada temuan objektif singkat yang mendukung arah diagnosis, misalnya konjungtiva pucat (+), akral dingin, CRT, ronki, wheezing, edema, dll bila relevan.",
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
        "- Jika arahan misalnya pneumonia, cukup ubah bagian paru/thorax yang relevan seperti Rh atau Wh. Jangan membuat temuan positif yang tidak perlu di section lain.",
      ].join("\n");

  return `Kamu membantu dokter memperbaiki dokumentasi ${roleTitle} resume medis.

TUGAS:
${guidance}

ARAHAN PENTING:
- User boleh memberi arah diagnosis atau fokus perbaikan, misalnya anemia, dehidrasi, pneumonia.
- Perbaikan ditujukan agar dokumentasi lebih kuat secara klinis dan lebih mendukung kelengkapan resume/klaim.
- Jangan menulis penjelasan, jangan markdown, jangan bullet.

${isAnamnesis ? "ANAMNESIS SAAT INI" : "PEMERIKSAAN FISIK SAAT INI"}:
${existingText}

ARAHAN USER:
${instruction}`;
}

function normalizeSpacing(text) {
  return String(text || "")
    .replace(/\r/g, "")
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

function postProcessImproveText(kind, text) {
  return kind === "ab" ? formatImproveAnamnesis(text) : formatImproveObjective(text);
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

async function callAdminAiText(prompt) {
  const data = await knowledgeApi("ai_generate", {
    prompt,
  });
  return data.text || "";
}

async function getEffectiveAiSettings() {
  const settings = await chrome.storage.local.get([
    "apiKeySource",
    "apiKey",
    "model",
    "provider",
  ]);
  const source = settings.apiKeySource || "admin";
  const hasPersonal = Boolean(settings.apiKey && settings.model && settings.provider);
  if (source === "personal" && hasPersonal) {
    return {
      source: "personal",
      apiKey: settings.apiKey,
      model: settings.model,
      provider: settings.provider,
    };
  }
  const data = await knowledgeApi("get_ai_config");
  if (!data.config?.hasApiKey) throw new Error("API key admin belum diset");
  return {
    source: "admin",
    provider: data.config.provider,
    model: data.config.model,
  };
}

async function callProviderText({ provider, apiKey, model, prompt }) {
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

  const endpoint = PROVIDERS[provider]?.url;
  if (!endpoint) throw new Error("Provider tidak dikenal: " + provider);
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
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "IMPROVE_INLINE_FIELD") return undefined;

  (async () => {
    const kind = message.kind === "ae" ? "ae" : "ab";
    const existingText = String(message.existingText || "").trim();
    const instruction = String(message.instruction || "").trim();

    if (!instruction) {
      throw new Error("Isi arahan terlebih dahulu.");
    }
    if (!existingText) {
      throw new Error(kind === "ab" ? "Isi anamnesis terlebih dahulu." : "Isi pemeriksaan fisik terlebih dahulu.");
    }

    const prompt = buildImprovePrompt(kind, existingText, instruction);
    const ai = await getEffectiveAiSettings();
    const text =
      ai.source === "admin"
        ? await callAdminAiText(prompt)
        : await callProviderText({
            provider: ai.provider,
            apiKey: ai.apiKey,
            model: ai.model,
            prompt,
          });
    const improvedText = postProcessImproveText(kind, text);
    if (!improvedText) throw new Error("Respons AI kosong.");
    sendResponse({ ok: true, text: improvedText });
  })().catch((error) => {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  return true;
});
