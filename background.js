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

function buildImprovePrompt(kind, existingText, instruction) {
  const isAnamnesis = kind === "ab";
  const roleTitle = isAnamnesis ? "anamnesis" : "pemeriksaan fisik";
  const guidance = isAnamnesis
    ? [
        "- Pertahankan isi asli yang sudah ada.",
        "- Hanya buat draft penyesuaian pada keluhan, perjalanan penyakit, dan gejala penyerta yang relevan dengan arahan user.",
        "- Jangan menambahkan faktor risiko, RPD, RPO, riwayat alergi, atau riwayat lain bila tidak ada pada teks awal atau tidak disebut eksplisit oleh user.",
        "- Fokus pada keluhan, perjalanan penyakit, gejala penyerta, atau tanda yang mendukung arah diagnosis.",
        "- Gunakan bahasa singkat, padat, gaya catatan medis dokter.",
        "- Output hanya teks anamnesis akhir.",
        "- Tulis hasil rapi dengan pemisahan baris.",
        "- Paragraf utama berisi keluhan dan perjalanan penyakit.",
        "- Jika Faktor risiko/RPD/RPO sudah ada pada teks awal atau disebut eksplisit oleh user, pertahankan dan rapikan pada baris sendiri.",
        "- Jika Faktor risiko/RPD/RPO tidak ada, jangan tuliskan section tersebut.",
      ].join("\n")
    : [
        "- Pertahankan isi asli yang sudah ada.",
        "- Hanya buat draft penyesuaian pada pemeriksaan fisik yang relevan dengan arahan user.",
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

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeAiPoweredSoapResult(value) {
  const data = value && typeof value === "object" ? value : {};
  const draft = data.draft && typeof data.draft === "object" ? data.draft : {};
  return {
    draft: {
      subjektif: String(draft.subjektif || ""),
      objektif: String(draft.objektif || ""),
      assessment: String(draft.assessment || draft.assesment || ""),
      planning: String(draft.planning || ""),
      vitals: draft.vitals && typeof draft.vitals === "object" ? draft.vitals : {},
    },
    confirmations: normalizeArray(data.confirmations)
      .map((item) => ({
        label: String(item?.label || "").trim(),
        target_field: String(item?.target_field || "").trim().toLowerCase(),
        insert_text: String(item?.insert_text || "").trim(),
      }))
      .filter((item) => item.label && item.target_field && item.insert_text),
    reason: String(data.reason || "").trim(),
  };
}

function buildAiPoweredSoapPrompt({ targetDiagnosis, pageData, context }) {
  return [
    "Kamu membantu dokter membuat draft SOAP dari data rekam medis yang tersedia.",
    "",
    "ATURAN WAJIB:",
    "- Output hanya JSON valid, tanpa markdown.",
    "- Draft SOAP hanya boleh memakai data yang sudah tersedia pada PAGE_DATA atau CONTEXT.",
    "- Data yang belum terdokumentasi harus masuk ke confirmations sebagai pertanyaan konfirmasi dokter, bukan langsung sebagai fakta di draft.",
    "- confirmations harus relevan dengan DIAGNOSIS_TARGET dan berisi teks yang akan ditambahkan bila dokter mencentang.",
    "- Gunakan bahasa Indonesia, singkat, padat, gaya catatan dokter.",
    "",
    "FORMAT JSON:",
    "{\"draft\":{\"subjektif\":\"\",\"objektif\":\"\",\"assessment\":\"\",\"planning\":\"\",\"vitals\":{}},\"confirmations\":[{\"label\":\"\",\"target_field\":\"subjektif|objektif|assessment|planning\",\"insert_text\":\"\"}],\"reason\":\"\"}",
    "",
    "DIAGNOSIS_TARGET:",
    targetDiagnosis,
    "",
    "PAGE_DATA:",
    JSON.stringify(pageData || {}),
    "",
    "CONTEXT:",
    JSON.stringify(context || {}),
  ].join("\n");
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
  if (!["IMPROVE_INLINE_FIELD", "AI_POWERED_SOAP"].includes(message?.type)) return undefined;

  (async () => {
    const ai = await getEffectiveAiSettings();

    if (message.type === "AI_POWERED_SOAP") {
      const targetDiagnosis = String(message.targetDiagnosis || "").trim();
      if (!targetDiagnosis) throw new Error("Isi diagnosis target terlebih dahulu.");
      const prompt = buildAiPoweredSoapPrompt({
        targetDiagnosis,
        pageData: message.pageData || {},
        context: message.context || {},
      });
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
      sendResponse({ ok: true, data: normalizeAiPoweredSoapResult(parseJsonResponse(text)) });
      return;
    }

    const kind = message.kind === "ae" ? "ae" : "ab";
    const existingText = String(message.existingText || "").trim();
    const instruction = String(message.instruction || "").trim();

    if (!instruction) throw new Error("Isi arahan terlebih dahulu.");
    if (!existingText) {
      throw new Error(kind === "ab" ? "Isi anamnesis terlebih dahulu." : "Isi pemeriksaan fisik terlebih dahulu.");
    }

    const prompt = buildImprovePrompt(kind, existingText, instruction);
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
