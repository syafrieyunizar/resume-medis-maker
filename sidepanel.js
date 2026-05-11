const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  cpptText: "",
  cpptSummary: null,
  cpptPenunjang: "",
  penunjangFiles: [],
};

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(
    "vendor/pdf.worker.min.js"
  );
}

// ---------------- Tabs ----------------
function activatePanel(target) {
  $$(".tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tab === target);
  });
  const settingButton = $(".settings-button");
  if (settingButton) {
    settingButton.classList.toggle("is-active", target === "setting");
  }
  $$(".panel").forEach((panel) => {
    const active = panel.dataset.panel === target;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
}

$$("[data-tab]").forEach((tab) => {
  tab.addEventListener("click", () => activatePanel(tab.dataset.tab));
});

// ---------------- Toast ----------------
function toast(msg, type = "") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast" + (type ? " is-" + type : "");
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), 2500);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1).replace(".", ",") + " KB";
  return (bytes / (1024 * 1024)).toFixed(1).replace(".", ",") + " MB";
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("Gagal membaca file"));
    reader.readAsDataURL(blob);
  });
}

function updatePenunjangList() {
  const list = $("#penunjangList");
  if (!list) return;
  if (!state.penunjangFiles.length) {
    list.className = "pulled-list is-empty";
    list.textContent = "Belum ada data penunjang.";
    if (summarizePenunjangBtn) summarizePenunjangBtn.disabled = true;
    return;
  }

  list.className = "pulled-list";
  list.textContent = "";
  state.penunjangFiles.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "pulled-item";

    const main = document.createElement("div");
    main.className = "pulled-item-main";

    const title = document.createElement("div");
    title.className = "pulled-item-title";
    title.append(document.createTextNode(`${idx + 1}. Tanggal Hasil `));
    const date = document.createElement("strong");
    date.textContent = item.resultDate || "-";
    title.append(date);

    const meta = document.createElement("div");
    meta.className = "pulled-item-meta";
    meta.textContent = `${item.kind || "Penunjang"} - ${item.code || "HASIL"} - ${formatBytes(item.size)}`;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn-remove";
    remove.textContent = "X";
    remove.setAttribute("aria-label", `Hapus tarikan data ${idx + 1}`);
    remove.addEventListener("click", () => {
      state.penunjangFiles.splice(idx, 1);
      updatePenunjangList();
      toast("Data tarikan dihapus", "success");
    });

    main.append(title, meta);
    row.append(main, remove);
    list.append(row);
  });
  if (summarizePenunjangBtn) summarizePenunjangBtn.disabled = false;
}

function updateCpptPenunjangLinked(value) {
  const field = $("#cpptPenunjangField");
  const textarea = $("#cpptPenunjangLinked");
  const text = String(value || "").trim();
  state.cpptPenunjang = text && text !== "-" ? text : "";
  if (!field || !textarea) return;
  if (!state.cpptPenunjang) {
    field.hidden = true;
    textarea.value = "";
    return;
  }
  textarea.value = state.cpptPenunjang;
  field.hidden = false;
}

function getPenunjangIdentity(item) {
  return String(item.url || `${item.kind}|${item.code}|${item.resultDate}`).toLowerCase();
}

function mergePenunjangFiles(newFiles) {
  const existing = new Set(state.penunjangFiles.map(getPenunjangIdentity));
  const added = [];
  newFiles.forEach((file) => {
    const identity = getPenunjangIdentity(file);
    if (existing.has(identity)) return;
    existing.add(identity);
    state.penunjangFiles.push(file);
    added.push(file);
  });
  return added;
}

function summarizePulledKinds(files) {
  const counts = new Map();
  files.forEach((file) => {
    const key = file.kind || "Penunjang";
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([kind, count]) => `${count} data berhasil ditarik dari ${kind}`)
    .join(", ");
}

function isWithinCarePeriod(resultDate) {
  const date = parseFlexibleDate(resultDate);
  const start = state.cpptSummary?.startDate;
  const end = state.cpptSummary?.endDate;
  if (!date || !start || !end) return false;
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return day >= startDay && day <= endDay;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function normalizeLine(line) {
  return (line || "").replace(/\s+/g, " ").trim();
}

function normalizeBoilerplateLine(line) {
  return normalizeLine(line)
    .toLowerCase()
    .replace(/\bhal(?:aman)?\s*\d+\s*(?:\/\s*\d+)?/g, "")
    .replace(/\bpage\s*\d+\s*(?:of\s*\d+)?/g, "")
    .replace(/\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g, "")
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, "")
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function groupTextItemsIntoLines(items) {
  const rows = [];
  items
    .map((item) => ({
      text: normalizeLine(item.str),
      x: item.transform?.[4] || 0,
      y: item.transform?.[5] || 0,
    }))
    .filter((item) => item.text)
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .forEach((item) => {
      const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 3);
      if (row) {
        row.items.push(item);
        row.y = (row.y + item.y) / 2;
      } else {
        rows.push({ y: item.y, items: [item] });
      }
    });

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) =>
      row.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(" ")
    )
    .map(normalizeLine)
    .filter(Boolean);
}

function removeRepeatedHeaderFooter(pages) {
  const scanLines = 8;
  const counts = new Map();
  const minHits = Math.max(2, Math.ceil(pages.length * 0.6));

  pages.forEach((page) => {
    const candidates = [...page.lines.slice(0, scanLines), ...page.lines.slice(-scanLines)];
    new Set(candidates.map(normalizeBoilerplateLine).filter((line) => line.length >= 8)).forEach(
      (line) => counts.set(line, (counts.get(line) || 0) + 1)
    );
  });

  const repeated = new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count >= minHits)
      .map(([line]) => line)
  );

  return pages.map((page) => ({
    ...page,
    lines: page.lines.filter((line) => !repeated.has(normalizeBoilerplateLine(line))),
  }));
}

async function extractPdfWithPdfJs(file) {
  if (!window.pdfjsLib) throw new Error("PDF.js belum tersedia");
  const doc = await window.pdfjsLib.getDocument({ data: file.arrayBuffer.slice(0) }).promise;
  const pages = [];

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    const textContent = await page.getTextContent();
    const lines = groupTextItemsIntoLines(textContent.items);
    pages.push({ pageNo, lines, text: lines.join("\n") });
  }

  const cleanedPages = removeRepeatedHeaderFooter(pages);
  const text = cleanedPages.map((page) => page.lines.join("\n")).join("\n\n");
  if (text.replace(/\s+/g, "").length < 30) {
    throw new Error("PDF tidak menghasilkan teks bermakna, kemungkinan scan/gambar");
  }

  return {
    pageCount: doc.numPages,
    pages: cleanedPages,
    text,
    structured: parsePenunjangDocument(text, file),
  };
}

function classifyDocument(text, file = {}) {
  const source = `${file.kind || ""} ${file.url || ""} ${text}`.toLowerCase();
  if (/c_labpk|laboratorium|hemoglobin|leukosit|trombosit|ureum|kreatinin|sgot|sgpt|bilirubin/.test(source)) {
    return "lab";
  }
  if (/lvef|ejection fraction|tricuspid|mitral|aortic|ekokardiografi|\becho\b/.test(source)) {
    return "echo";
  }
  if (/ekg|ecg|irama|sinus rhythm|qrs|st elevation|st depresi/.test(source)) {
    return "ekg";
  }
  if (/c_radiologi|radiologi|rontgen|thorax|usg|ct scan|mri|kesan|expertise|ekspertisi/.test(source)) {
    return "radiology";
  }
  return "generic";
}

function extractDateFromText(text) {
  const patterns = [
    /Tgl\.?\s*Hasil\s*:?\s*(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)/i,
    /Tanggal\s*Hasil\s*:?\s*(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)/i,
    /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?)/,
    /(\d{4}-\d{2}-\d{2})/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function parseLabDocument(text, file) {
  const knownTests = [
    "Hemoglobin",
    "Hematokrit",
    "Leukosit",
    "Trombosit",
    "Eritrosit",
    "Mcv",
    "Mchc",
    "Mch",
    "Ureum",
    "Kreatinin",
    "SGOT",
    "SGPT",
    "Albumin",
    "Bilirubin Total",
    "Bilirubin Direk",
    "Bilirubin Indirek",
    "Trigliserida",
    "Asam Urat",
    "Natrium",
    "Kalium",
    "Klorida",
    "Gula Darah",
    "Glukosa",
    "HbA1c",
    "CRP",
    "Procalcitonin",
  ];
  const unitPattern = "(?:g\\/dl|g\\/dL|mg\\/dL|mg\\/dl|U\\/L|u\\/l|\\/ ul|\\/ul|%|fl|pg|mmol\\/L|mEq\\/L)";
  const observations = [];

  knownTests.forEach((test) => {
    const escaped = test.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `${escaped}\\s+([<>]?\\d+(?:[\\.,]\\d+)?)\\s+(?:\\d+(?:[\\.,]\\d+)?\\s*-\\s*\\d+(?:[\\.,]\\d+)?\\s+)?(${unitPattern})`,
      "i"
    );
    const match = text.match(pattern);
    if (match) {
      observations.push({
        name: test,
        values: [
          {
            date: file.resultDate || extractDateFromText(text),
            value: match[1],
            unit: normalizeLine(match[2]).replace(/\s+/g, ""),
          },
        ],
      });
    }
  });

  const expertise = text.match(/Ekspertisi\s*:?\s*([\s\S]{0,300}?)(?:Tgl\.?\s*Hasil|Dokter Pemeriksa|$)/i)?.[1];
  return {
    type: "lab",
    sourceName: file.kind || "Laboratorium",
    date: file.resultDate || extractDateFromText(text),
    observations,
    expertise: normalizeLine(expertise || ""),
    rawExcerpt: text.slice(0, 5000),
  };
}

function parseRadiologyLikeDocument(text, file, type) {
  const impression =
    text.match(/(?:Kesan|Impression|Ekspertisi|Expertise)\s*:?\s*([\s\S]{0,1800})/i)?.[1] ||
    text.slice(0, 1800);
  const modality =
    text.match(/\b(USG|CT\s*Scan|MRI|Rontgen|Thorax|Abdomen|Echo|Ekokardiografi|EKG|ECG)[^\n:]*/i)?.[0] ||
    file.kind ||
    type;
  return {
    type,
    modality: normalizeLine(modality),
    date: file.resultDate || extractDateFromText(text),
    impression: normalizeLine(impression).slice(0, 1800),
    rawExcerpt: text.slice(0, 3000),
  };
}

function parsePenunjangDocument(text, file) {
  const type = classifyDocument(text, file);
  if (type === "lab") return parseLabDocument(text, file);
  if (["radiology", "echo", "ekg"].includes(type)) {
    return parseRadiologyLikeDocument(text, file, type);
  }
  return {
    type: "generic",
    sourceName: file.kind || "Penunjang",
    date: file.resultDate || extractDateFromText(text),
    rawExcerpt: text.slice(0, 4000),
  };
}

function compactParsedDocs(files) {
  return files.map((file, index) => ({
    index: index + 1,
    code: file.code,
    date: file.resultDate,
    kind: file.kind,
    url: file.url,
    parser: file.parsed?.structured || null,
  }));
}

function parseJsonResponse(text) {
  if (!text) throw new Error("Respons kosong dari provider");
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

function normalizeResultKey(key) {
  return String(key || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function firstStringValue(source, aliases) {
  if (!source || typeof source !== "object") return "";
  const normalized = new Map(
    Object.entries(source).map(([key, value]) => [normalizeResultKey(key), value])
  );
  for (const alias of aliases) {
    const value = normalized.get(normalizeResultKey(alias));
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.join(", ");
    if (value && typeof value === "object") return JSON.stringify(value);
  }
  return "";
}

function normalizeCpptResult(parsed) {
  const payload =
    parsed?.resume ||
    parsed?.result ||
    parsed?.hasil ||
    parsed?.data ||
    parsed?.output ||
    parsed;
  const aliases = {
    penunjang: [
      "penunjang",
      "pemeriksaan_penunjang",
      "pemeriksaan_penunjang_bermakna",
      "Pemeriksaan Penunjang Bermakna",
    ],
    terapi_dirawat: [
      "terapi_dirawat",
      "terapi_selama_dirawat",
      "Terapi Selama Dirawat",
      "terapi",
    ],
    operasi: ["operasi", "operasi_tindakan", "tindakan", "Operasi/Tindakan"],
    dx_utama: ["dx_utama", "diagnosa_utama", "diagnosis_utama", "Diagnosa Utama"],
    dx_sekunder: [
      "dx_sekunder",
      "diagnosa_sekunder",
      "diagnosis_sekunder",
      "Diagnosa Sekunder",
    ],
    konsul: [
      "konsul",
      "konsultasi",
      "konsultasi_bidang_lain",
      "Konsultasi Bidang Lain",
    ],
    terapi_pulang: [
      "terapi_pulang",
      "terapi_saat_pulang",
      "obat_pulang",
      "Terapi Saat Pulang",
    ],
  };

  return Object.fromEntries(
    Object.entries(aliases).map(([key, names]) => [key, firstStringValue(payload, names)])
  );
}

function hasMeaningfulCpptResult(result) {
  return Object.values(result).some((value) => String(value || "").trim() && String(value).trim() !== "-");
}

function parseFlexibleDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  let match = text.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\b/);
  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4] || 0),
      Number(match[5] || 0),
      Number(match[6] || 0)
    );
  }
  match = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\b/);
  if (match) {
    return new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1]),
      Number(match[4] || 0),
      Number(match[5] || 0),
      Number(match[6] || 0)
    );
  }
  return null;
}

function formatDateId(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "-";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function summarizeCpptText(text) {
  const lines = text
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);
  const dates = [];
  const datePattern = /\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\b/g;
  lines.forEach((line) => {
    for (const match of line.matchAll(datePattern)) {
      const parsed = parseFlexibleDate(match[0]);
      if (parsed) dates.push(parsed);
    }
  });

  const sortedDates = dates.sort((a, b) => a.getTime() - b.getTime());
  const startDate = sortedDates[0] || null;
  const endDate = sortedDates[sortedDates.length - 1] || null;
  const rowCount = lines.length;
  const periodText =
    startDate && endDate ? `${formatDateId(startDate)} - ${formatDateId(endDate)}` : "-";

  return {
    rowCount,
    startDate,
    endDate,
    periodText,
  };
}

function summarizeCpptTable(tableData, fallbackText = "") {
  if (!tableData?.rowCount) return summarizeCpptText(fallbackText);
  const parsedDates = tableData.dates
    .map(parseFlexibleDate)
    .filter((date) => date && !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  const startDate = parsedDates[0] || null;
  const endDate = parsedDates[parsedDates.length - 1] || null;
  const periodText =
    startDate && endDate ? `${formatDateId(startDate)} - ${formatDateId(endDate)}` : "-";

  return {
    rowCount: tableData.rowCount,
    startDate,
    endDate,
    periodText,
  };
}

function renderCpptAccessSummary(summary) {
  const box = $("#cpptAccessSummary");
  if (!box) return;
  box.hidden = false;
  box.className = "status cppt-summary";
  box.textContent = "";

  const statusLine = document.createElement("div");
  statusLine.className = "cppt-summary-line";
  statusLine.innerHTML = "CPPT terbaca";

  const rowsLine = document.createElement("div");
  rowsLine.className = "cppt-summary-line";
  rowsLine.append("Jumlah Baris: ");
  const rowsValue = document.createElement("strong");
  rowsValue.textContent = String(summary.rowCount);
  rowsLine.append(rowsValue);

  const periodLine = document.createElement("div");
  periodLine.className = "cppt-summary-line";
  periodLine.append("Preview tanggal mulai rawat - akhir rawat: ");
  const periodValue = document.createElement("strong");
  periodValue.textContent = summary.periodText;
  periodLine.append(periodValue);

  box.append(statusLine, rowsLine, periodLine);
}

function updateCarePeriodNote(summary) {
  const note = $("#carePeriodNote");
  if (!note) return;
  if (!summary?.periodText || summary.periodText === "-") {
    note.hidden = true;
    note.textContent = "Periode rawat : -";
    return;
  }
  note.hidden = false;
  note.textContent = `Periode rawat : ${summary.periodText}`;
}

// ---------------- Settings ----------------
const PROVIDERS = {
  gemini: { label: "Gemini", url: null /* dynamic */ },
  sumopod: { label: "Sumopod", url: "https://ai.sumopod.com/v1/chat/completions" },
  aimurah: { label: "AImurah", url: "https://aimurah.my.id/api/v1/chat/completions" },
};

const penunjangSystemPrompt =
  `Kamu adalah dokter DPJP yang merangkum pemeriksaan penunjang bermakna dari data rekam medis.

ATURAN PENULISAN:
- Output satu field saja: pemeriksaan penunjang bermakna.
- Sangat singkat, padat, jelas, gaya catatan medis dokter.
- Gabungkan semua data; jangan hilangkan hasil penting dari dokumen berbeda.
- Kelompokkan per modalitas bila jelas: Lab, USG, CT, MRI, Echo, EKG, Rontgen, PA, Kultur, dll.
- Untuk nilai lab serial gunakan format nilai_awal->nilai_akhir satuan.
- Gunakan koma desimal Indonesia dan titik ribuan.
- Sertakan tanggal bila tampak bermakna.
- Abaikan hasil normal yang tidak bermakna, kecuali diperlukan untuk konteks.
- Jangan menulis penjelasan proses, disclaimer, atau narasi panjang.`;

const penunjangSchema = {
  type: "object",
  properties: {
    penunjang: { type: "string" },
  },
  required: ["penunjang"],
};

async function callGeminiForPenunjangPdf({ apiKey, model, files }) {
  const parts = [
    {
      text:
        "Rangkum seluruh PDF penunjang berikut menjadi output singkat, padat, jelas. Jika ada lab serial, tulis perubahan awal->akhir. Kembalikan JSON sesuai skema.",
    },
  ];
  files.forEach((file, idx) => {
    parts.push({
      text: `\n\nDokumen ${idx + 1}: ${file.kind || "Penunjang"} ${file.resultDate || ""} ${file.code || ""}`,
    });
    parts.push({
      inlineData: {
        mimeType: file.mimeType || "application/pdf",
        data: file.base64,
      },
    });
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    systemInstruction: { parts: [{ text: penunjangSystemPrompt }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: penunjangSchema,
      temperature: 0.2,
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error("Gemini API " + res.status + ": " + errText.slice(0, 200));
  }
  const data = await res.json();
  return parseJsonResponse(data?.candidates?.[0]?.content?.parts?.[0]?.text).penunjang || "";
}

async function callOpenAiCompatibleForPenunjang({ provider, apiKey, model, parsedDocs }) {
  const endpoint = PROVIDERS[provider]?.url;
  if (!endpoint) throw new Error("Provider tidak dikenal: " + provider);
  const body = {
    model,
    messages: [
      { role: "system", content: penunjangSystemPrompt },
      {
        role: "user",
        content:
          "Berikut JSON hasil parser lokal dari PDF penunjang. Ambil hanya data bermakna, gabungkan lab serial bila ada, dan kembalikan JSON {\"penunjang\":\"...\"}.\n\n" +
          JSON.stringify(parsedDocs),
      },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
  };
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${PROVIDERS[provider].label} API ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  return parseJsonResponse(data?.choices?.[0]?.message?.content).penunjang || "";
}

async function validateGeminiKey({ apiKey, model }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "Balas OK." }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 8 },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 160)}`);
  }
  await res.json();
}

async function validateOpenAiCompatibleKey({ provider, apiKey, model }) {
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
      messages: [{ role: "user", content: "Balas OK." }],
      temperature: 0,
      max_tokens: 8,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${PROVIDERS[provider].label} API ${res.status}: ${errText.slice(0, 160)}`);
  }
  await res.json();
}

function syncSettingsFields(provider, modelValue) {
  const isGemini = provider === "gemini";
  const modelInput = $("#model");
  const fallbackFields = $("#geminiFallbackFields");
  // update API key label text
  const apiKeyField = $("#apiKey").closest(".field");
  if (apiKeyField) {
    apiKeyField.querySelector(".label").textContent =
      (isGemini ? "Gemini" : PROVIDERS[provider]?.label || "Provider") + " API Key";
  }
  if (fallbackFields) fallbackFields.hidden = isGemini;
  if (modelInput) modelInput.value = modelValue || (isGemini ? "gemini-2.0-flash" : "");
}

async function loadSettings() {
  const {
    apiKey = "",
    model = "gemini-2.0-flash",
    provider = "gemini",
    geminiFallbackApiKey = "",
    geminiFallbackModel = "gemini-2.0-flash",
  } = await chrome.storage.local.get([
    "apiKey",
    "model",
    "provider",
    "geminiFallbackApiKey",
    "geminiFallbackModel",
  ]);
  $("#apiKey").value = apiKey;
  $("#provider").value = provider;
  $("#geminiFallbackApiKey").value = geminiFallbackApiKey;
  $("#geminiFallbackModel").value = geminiFallbackModel;
  syncSettingsFields(provider, model);
}
loadSettings();

$("#provider").addEventListener("change", () => {
  syncSettingsFields($("#provider").value, $("#model").value.trim());
});

function getCurrentModel() {
  return $("#model").value.trim();
}

$("#saveSettings").addEventListener("click", async () => {
  const provider = $("#provider").value;
  const model = getCurrentModel();
  if (!model) {
    toast("Model wajib diisi", "error");
    return;
  }
  await chrome.storage.local.set({
    apiKey: $("#apiKey").value.trim(),
    model,
    provider,
    geminiFallbackApiKey: $("#geminiFallbackApiKey").value.trim(),
    geminiFallbackModel: $("#geminiFallbackModel").value.trim() || "gemini-2.0-flash",
  });
  toast("Pengaturan disimpan", "success");
});

$("#validateApiKey").addEventListener("click", async () => {
  const button = $("#validateApiKey");
  const status = $("#settingsStatus");
  const provider = $("#provider").value;
  const model = getCurrentModel();
  const apiKey = $("#apiKey").value.trim();
  const fallbackKey = $("#geminiFallbackApiKey").value.trim();
  const fallbackModel = $("#geminiFallbackModel").value.trim() || "gemini-2.0-flash";

  if (!apiKey || !model) {
    status.hidden = false;
    status.className = "status is-error";
    status.textContent = "API key dan model utama wajib diisi.";
    toast("API key/model belum lengkap", "error");
    return;
  }

  button.disabled = true;
  status.hidden = false;
  status.className = "status is-loading";
  status.textContent = `Memvalidasi ${PROVIDERS[provider]?.label || provider}...`;

  try {
    if (provider === "gemini") {
      await validateGeminiKey({ apiKey, model });
      status.className = "status";
      status.textContent = "Gemini API key aktif.";
      toast("API key aktif", "success");
      return;
    }

    await validateOpenAiCompatibleKey({ provider, apiKey, model });
    if (fallbackKey) {
      status.textContent = `${PROVIDERS[provider]?.label || provider} aktif. Memvalidasi Gemini fallback...`;
      await validateGeminiKey({ apiKey: fallbackKey, model: fallbackModel });
      status.className = "status";
      status.textContent = `${PROVIDERS[provider]?.label || provider} aktif. Gemini fallback aktif.`;
    } else {
      status.className = "status";
      status.textContent = `${PROVIDERS[provider]?.label || provider} aktif. Gemini fallback belum diisi.`;
    }
    toast("Validasi selesai", "success");
  } catch (e) {
    console.error(e);
    status.className = "status is-error";
    status.textContent = "Validasi gagal: " + e.message;
    toast("Validasi gagal", "error");
  } finally {
    button.disabled = false;
  }
});

// ---------------- SO: Insert detail ----------------
const pullSOButton = $("#pullSO");

function setButtonState(button, stateName, text, options = {}) {
  const defaultText = options.defaultText || button.dataset.defaultText || button.textContent;
  button.dataset.defaultText = defaultText;
  clearTimeout(button._stateTimer);
  button.classList.remove("btn-primary", "btn-success", "btn-error", "btn-outline");
  button.classList.add(
    stateName === "success" ? "btn-success" : stateName === "error" ? "btn-error" : "btn-primary"
  );
  button.textContent = text;
  if (options.temporary !== false && stateName !== "primary") {
    button._stateTimer = setTimeout(() => {
      button.classList.remove("btn-success", "btn-error", "btn-outline");
      button.classList.add("btn-primary");
      button.textContent = defaultText;
    }, options.duration || 3000);
  }
}

pullSOButton.addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("Tab aktif tidak ditemukan");
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const subjektif = document.querySelector('textarea[name="subjektif"]');
        const objektif = document.querySelector('textarea[name="objektive"]');
        if (!subjektif || !objektif) return { ok: false };
        return {
          ok: true,
          subjektif: subjektif.value || subjektif.textContent || "",
          objektif: objektif.value || objektif.textContent || "",
        };
      },
    });

    if (!result?.ok) {
      setButtonState(pullSOButton, "error", "Pastikan sudah berada di eRM Dokter IGD");
      toast("Pastikan sudah berada di eRM Dokter IGD", "error");
      return;
    }

    $("#soSubjektif").value = result.subjektif || "";
    $("#soObjektif").value = result.objektif || "";
    setButtonState(pullSOButton, "success", "✓ Data S & O Ditarik");
    toast("Data S & O berhasil ditarik", "success");
  } catch (e) {
    console.error(e);
    setButtonState(pullSOButton, "error", "Pastikan sudah berada di eRM Dokter IGD");
    toast("Gagal: " + e.message, "error");
  }
});

const insertSOButton = $("#insertSO");

insertSOButton.addEventListener("click", async () => {
  const subjektif = $("#soSubjektif").value;
  const objektif = $("#soObjektif").value;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("Tab aktif tidak ditemukan");
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sub, obj) => {
        const setVal = (el, val) => {
          if (!el) return false;
          const proto = Object.getPrototypeOf(el);
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          setter ? setter.call(el, val) : (el.value = val);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        };
        const a = setVal(document.querySelector('textarea[name="ab"]'), sub);
        const b = setVal(document.querySelector('textarea[name="ae"]'), obj);
        return { a, b };
      },
      args: [subjektif, objektif],
    });
    if (result.a && result.b) {
      setButtonState(insertSOButton, "success", "✓ S & O Masuk ke Resume");
      toast("S & O dimasukkan ke resume", "success");
    } else {
      setButtonState(insertSOButton, "error", "Pastikan sudah berada di halaman Resume Medis");
      toast("Pastikan sudah berada di halaman Resume Medis", "error");
    }
  } catch (e) {
    console.error(e);
    setButtonState(insertSOButton, "error", "Pastikan sudah berada di halaman Resume Medis");
    toast("Gagal: " + e.message, "error");
  }
});

// ---------------- CPPT: Akses ----------------
const aksesBtn = $("#aksesCPPT");
const extractBtn = $("#extractCPPT");

aksesBtn.addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("Tab aktif tidak ditemukan");
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const setSelectValue = (select, value) => {
          if (!select) return false;
          const hasOption = Array.from(select.options || []).some((option) => option.value === value);
          if (!hasOption) return false;
          if (select.value === value) return true;
          const proto = Object.getPrototypeOf(select);
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          setter ? setter.call(select, value) : (select.value = value);
          select.dispatchEvent(new Event("input", { bubbles: true }));
          select.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        };

        const lengthSelect = document.querySelector('select[name="example1_length"]');
        const changedTo100 = setSelectValue(lengthSelect, "100");
        if (changedTo100) await wait(700);

        const wrapper = document.querySelector("#example1_wrapper > div:nth-child(2) > div");
        const table = document.querySelector("#example1") || wrapper?.querySelector?.("table");
        const rows = Array.from(table?.querySelectorAll?.("tbody tr") || []);
        const dataRows = rows.filter((tr) => {
          const cells = tr.querySelectorAll("td");
          const dateText = (cells[1]?.innerText || cells[1]?.textContent || "")
            .replace(/\s+/g, " ")
            .trim();
          return cells.length > 1 && /\b\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\b/.test(dateText);
        });
        const dates = dataRows.map((tr) => {
          const cells = tr.querySelectorAll("td");
          return (cells[1]?.innerText || cells[1]?.textContent || "")
            .replace(/\s+/g, " ")
            .trim();
        });
        const text = wrapper?.innerText || table?.innerText || "";
        return text
          ? {
              text,
              table: {
                rowCount: dataRows.length,
                dates,
              },
              changedTo100,
            }
          : null;
      },
    });
    if (!result?.text) {
      setButtonState(aksesBtn, "error", "CPPT tidak terbaca", { temporary: false });
      toast("Pastikan sudah berada di halaman CPPT Ruangan", "error");
      return;
    }
    state.cpptText = result.text;
    state.cpptSummary = summarizeCpptTable(result.table, result.text);
    renderCpptAccessSummary(state.cpptSummary);
    updateCarePeriodNote(state.cpptSummary);
    setButtonState(aksesBtn, "success", "✓ CPPT Diakses", { duration: 3000 });
    extractBtn.disabled = false;
    toast("CPPT berhasil di akses", "success");
  } catch (e) {
    console.error(e);
    setButtonState(aksesBtn, "error", "CPPT tidak terbaca", { temporary: false });
    toast("Pastikan sudah berada di halaman CPPT Ruangan", "error");
  }
});

// ---------------- CPPT: Extract via Gemini ----------------
extractBtn.addEventListener("click", async () => {
  const {
    apiKey,
    model = "gemini-2.0-flash",
    provider = "gemini",
  } = await chrome.storage.local.get(["apiKey", "model", "provider"]);
  if (!apiKey) {
    toast("Isi API Key di tab Setting dulu", "error");
    return;
  }
  if (!model) {
    toast("Model belum diatur", "error");
    return;
  }
  if (!state.cpptText) {
    toast("Akses CPPT terlebih dahulu", "error");
    return;
  }

  const status = $("#cpptStatus");
  status.hidden = false;
  status.className = "status is-loading";
  status.textContent = `Memproses dengan ${PROVIDERS[provider]?.label || provider}...`;
  extractBtn.disabled = true;

  const systemPrompt =
    `Kamu adalah dokter DPJP yang membuat resume medis pasien dari data CPPT. 

ATURAN PENULISAN (WAJIB):
- Gaya bahasa: SANGAT RINGKAS, PADAT, TELEGRAFIS — seperti catatan medis dokter, bukan paragraf naratif.
- JANGAN menjelaskan, JANGAN menarasikan, JANGAN gunakan kalimat lengkap dengan subjek-predikat seperti "pasien mendapatkan...", "dilakukan...", "menunjukkan...".
- Pisahkan item dengan koma. Tanpa kata penghubung yang tidak perlu.
- Gunakan singkatan medis baku (IV, PO, tpm, mg, mL, g/dL, U/L, mcg/kgBB/menit, dll).
- Gunakan koma desimal Indonesia (mis. 0,1 bukan 0.1) dan titik ribuan (mis. 10.600).
- Untuk nilai lab yang berubah gunakan format: nama nilai_awal→nilai_akhir satuan (mis. ureum 154→63 mg/dL).
- Sertakan satuan untuk semua nilai lab/dosis.
- Ambil HANYA data yang bermakna/penting. Abaikan info redundant.

CONTOH GAYA YANG BENAR:
Penunjang: "Hb 7,1 g/dL, ureum 154→63 mg/dL, SGOT/SGPT 75/134 U/L, USG abdomen: hydrops GB, cholelithiasis, Echo: LVEF 55,64%, TR mild."
Terapi: "Sp. Vascon 0,1 mcg/kgBB/menit, infus NS 14 tpm, Lansoprazole inj 2x30 mg IV, Ceftazidime 2x1 g IV, transfusi PRC 3 kolf/12 jam."

CONTOH GAYA YANG SALAH (jangan tiru):
"Pasien mendapatkan infus NS 14 tpm untuk hidrasi. Dilakukan transfusi PRC sebanyak 3 kolf..."

Berikan output untuk: Pemeriksaan Penunjang Bermakna, Terapi Selama Dirawat, Operasi/Tindakan, Diagnosa Utama, Diagnosa Sekunder, Konsultasi bidang lain, Terapi saat pulang.`;

  const schema = {
    type: "object",
    properties: {
      penunjang: { type: "string" },
      terapi_dirawat: { type: "string" },
      operasi: { type: "string" },
      dx_utama: { type: "string" },
      dx_sekunder: { type: "string" },
      konsul: { type: "string" },
      terapi_pulang: { type: "string" },
    },
    required: [
      "penunjang",
      "terapi_dirawat",
      "operasi",
      "dx_utama",
      "dx_sekunder",
      "konsul",
      "terapi_pulang",
    ],
  };

  try {
    const userMsg =
      "Data CPPT:\n\n" +
      state.cpptText +
      "\n\nKembalikan JSON object dengan key PERSIS berikut: penunjang, terapi_dirawat, operasi, dx_utama, dx_sekunder, konsul, terapi_pulang. Jangan gunakan key lain. Setiap field berisi ringkasan singkat, padat, detail bermakna. Jika tidak ada data, isi dengan '-'.";

    let text;
    if (provider === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const body = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userMsg }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.2,
        },
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error("API " + res.status + ": " + errText.slice(0, 200));
      }
      const data = await res.json();
      text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    } else {
      // OpenAI-compatible: Sumopod, AImurah
      const endpoint = PROVIDERS[provider]?.url;
      if (!endpoint) throw new Error("Provider tidak dikenal: " + provider);
      const body = {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error("API " + res.status + ": " + errText.slice(0, 200));
      }
      const data = await res.json();
      text = data?.choices?.[0]?.message?.content;
    }
    if (!text) throw new Error("Respons kosong dari provider");
    const parsed = parseJsonResponse(text);
    const normalized = normalizeCpptResult(parsed);

    $("#cpptResults").hidden = false;
    $$("#cpptResults textarea").forEach((ta) => {
      ta.value = normalized[ta.dataset.key] ?? "";
    });
    updateCpptPenunjangLinked(normalized.penunjang);

    if (!hasMeaningfulCpptResult(normalized)) {
      updateCpptPenunjangLinked("");
      const keys = Object.keys(parsed || {}).join(", ") || "tidak ada key";
      status.className = "status is-error";
      status.textContent = `Provider merespons sukses, tetapi 7 field kosong/tidak cocok. Key respons: ${keys}`;
      toast("Hasil extract kosong", "error");
    } else {
      const filled = Object.values(normalized).filter((value) => String(value || "").trim()).length;
      status.className = "status";
      status.textContent = `Selesai. ${filled}/7 field terisi dan dapat diedit di bawah.`;
      toast("Ekstraksi selesai", "success");
    }
  } catch (e) {
    console.error(e);
    status.className = "status is-error";
    status.textContent = "Gagal: " + e.message;
    toast("Gagal extract", "error");
  } finally {
    extractBtn.disabled = false;
  }
});

// ---------------- Tindak Lanjut: Tarik data penunjang PDF ----------------
const pullPenunjangBtn = $("#pullPenunjang");
const summarizePenunjangBtn = $("#summarizePenunjang");
const pullPeriodConfirm = $("#pullPeriodConfirm");
const pullPeriodYes = $("#pullPeriodYes");
const pullPeriodNo = $("#pullPeriodNo");

function setPullConfirmVisible(visible) {
  if (pullPeriodConfirm) pullPeriodConfirm.hidden = !visible;
}

pullPenunjangBtn.addEventListener("click", () => {
  setPullConfirmVisible(true);
});

pullPeriodYes.addEventListener("click", () => pullPenunjangData({ filterByPeriod: true }));
pullPeriodNo.addEventListener("click", () => pullPenunjangData({ filterByPeriod: false }));

async function pullPenunjangData({ filterByPeriod }) {
  setPullConfirmVisible(false);
  const status = $("#penunjangStatus");
  status.hidden = false;
  status.className = "status is-loading";
  status.textContent = filterByPeriod
    ? "Mencari data HASIL sesuai periode rawat inap..."
    : "Mencari dan membuka seluruh data HASIL...";
  pullPenunjangBtn.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("Tab aktif tidak ditemukan");

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const labels = Array.from(document.querySelectorAll("label.btn-xs.btn-success"))
          .filter((el) => (el.textContent || "").trim().toUpperCase() === "HASIL");

        const asUrl = (value) => {
          if (!value || /^javascript:/i.test(value)) return "";
          try {
            return new URL(value, location.href).href;
          } catch {
            return "";
          }
        };

        const getCandidateUrl = (label) => {
          const row = label.closest("tr");
          const direct = label.closest("a[href]");
          const directHref = direct?.getAttribute?.("href") || "";
          if (asUrl(directHref)) return asUrl(directHref);

          const anchors = Array.from(row?.querySelectorAll?.("a[href]") || []);
          const resultAnchor =
            anchors.find((a) => /\/c_[^/]+\//i.test(a.getAttribute("href") || "")) ||
            anchors.find((a) => {
              const text = (a.textContent || "").trim().toUpperCase();
              const href = a.getAttribute("href") || "";
              return text !== "LIHAT" && !/\/r_[^/]+\//i.test(href);
            });
          const href = resultAnchor?.getAttribute?.("href") || "";
          if (asUrl(href)) return asUrl(href);

          const nearby =
            label.parentElement?.querySelector?.("a[href]") ||
            label.closest("td")?.querySelector?.("a[href]");
          const nearbyHref = nearby?.getAttribute?.("href") || "";
          if (asUrl(nearbyHref) && !/\/r_[^/]+\//i.test(nearbyHref)) return asUrl(nearbyHref);

          const attrNames = ["data-href", "data-url", "data-link", "formaction"];
          const holder = label.closest("a, button, [data-href], [data-url], [data-link], form") || label;
          for (const attr of attrNames) {
            const value = holder.getAttribute?.(attr) || label.getAttribute?.(attr);
            if (asUrl(value)) return asUrl(value);
          }
          const onclick = holder.getAttribute?.("onclick") || label.getAttribute?.("onclick") || "";
          const match = onclick.match(/['"]([^'"]+\.(?:pdf|PDF)(?:\?[^'"]*)?)['"]/);
          return asUrl(match?.[1] || "");
        };

        const rows = [];
        for (let i = 0; i < labels.length; i += 1) {
          const label = labels[i];
          const tr = label.closest("tr");
          const cells = Array.from(tr?.querySelectorAll?.("td") || []).map((td) =>
            (td.innerText || td.textContent || "").replace(/\s+/g, " ").trim()
          );
          const url = getCandidateUrl(label);
          const rowText = (tr?.innerText || label.parentElement?.innerText || "HASIL")
            .replace(/\s+/g, " ")
            .trim();
          const code = cells.find((cell) => /^[A-Z]{1,4}\d{6,}$/i.test(cell)) || "";
          const dates = rowText.match(/\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?/g) || [];
          const resultDate = dates.sort((a, b) => b.length - a.length)[0] || cells.find((cell) => /^\d{4}-\d{2}-\d{2}/.test(cell)) || "";
          const kind =
            cells.find((cell) => /laboratorium|radiologi|patologi|echo|ekg|usg/i.test(cell)) ||
            (/c_radiologi/i.test(url) ? "Radiologi" : /c_labpk/i.test(url) ? "Laboratorium Patalogi Klinik" : "Penunjang");
          const name = `Tanggal Hasil ${resultDate || "-"}`;

          if (!url) {
            rows.push({ ok: false, name, code, resultDate, kind, error: "URL PDF tidak ditemukan" });
            continue;
          }

          rows.push({ ok: true, name, url, code, resultDate, kind });
        }
        return { total: labels.length, rows };
      },
    });

    let candidateRows = (result?.rows || []).filter((row) => row.ok && row.url);
    if (filterByPeriod) {
      candidateRows = candidateRows.filter((row) => isWithinCarePeriod(row.resultDate));
    }
    const okRows = [];
    const failedRows = (result?.rows || []).filter((row) => !row.ok);
    for (const row of candidateRows) {
      try {
        const response = await fetch(row.url, { credentials: "include" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const base64 = arrayBufferToBase64(arrayBuffer);
        okRows.push({
          ...row,
          size: blob.size,
          mimeType: blob.type || response.headers.get("content-type") || "application/pdf",
          arrayBuffer,
          base64,
        });
      } catch (error) {
        failedRows.push({ ...row, ok: false, error: error.message });
      }
    }
    const addedRows = mergePenunjangFiles(okRows);
    updatePenunjangList();
    summarizePenunjangBtn.disabled = state.penunjangFiles.length === 0;

    if (addedRows.length > 0) {
      setButtonState(pullPenunjangBtn, "success", "✓ Data Ditarik");
      status.className = "status";
      status.textContent =
        summarizePulledKinds(addedRows) +
        `${failedRows.length ? `, ${failedRows.length} gagal` : ""}.`;
      toast("Data penunjang berhasil ditarik", "success");
    } else if (okRows.length > 0) {
      status.className = "status";
      status.textContent = "Data sudah pernah ditarik, tidak ada data baru.";
      toast("Tidak ada data baru", "success");
    } else if (result?.total) {
      status.className = "status is-error";
      status.textContent = filterByPeriod
        ? "Tidak ada data HASIL dalam periode rawat inap."
        : "Label HASIL ditemukan, tetapi PDF belum bisa diambil. Pastikan tombol HASIL berisi link PDF.";
      toast("PDF tidak berhasil ditarik", "error");
    } else {
      status.className = "status is-error";
      status.textContent = "Pastikan sudah di halaman Tindak Lanjut > Radiologi, Lab PK, dll";
      toast("Data HASIL tidak ditemukan", "error");
    }
  } catch (e) {
    console.error(e);
    status.className = "status is-error";
    status.textContent = "Gagal: " + e.message;
    toast("Gagal tarik data", "error");
  } finally {
    pullPenunjangBtn.disabled = false;
  }
}

// ---------------- Tindak Lanjut: Rangkum penunjang PDF ----------------
summarizePenunjangBtn.addEventListener("click", async () => {
  const {
    apiKey,
    model = "gemini-2.0-flash",
    provider = "gemini",
    geminiFallbackApiKey = "",
    geminiFallbackModel = "gemini-2.0-flash",
  } = await chrome.storage.local.get([
    "apiKey",
    "model",
    "provider",
    "geminiFallbackApiKey",
    "geminiFallbackModel",
  ]);
  const status = $("#penunjangStatus");

  if (!apiKey) {
    toast("Isi API Key di Setting dulu", "error");
    return;
  }
  if (!state.penunjangFiles.length) {
    toast("Tarik data penunjang terlebih dahulu", "error");
    return;
  }

  status.hidden = false;
  status.className = "status is-loading";
  status.textContent = `Memproses ${state.penunjangFiles.length} data penunjang...`;
  summarizePenunjangBtn.disabled = true;

  try {
    let summary = "";

    if (provider === "gemini") {
      status.textContent = "Merangkum PDF langsung dengan Gemini...";
      summary = await callGeminiForPenunjangPdf({
        apiKey,
        model,
        files: state.penunjangFiles,
      });
    } else {
      try {
        status.textContent = "Mencoba parser lokal PDF.js...";
        for (const file of state.penunjangFiles) {
          file.parsed = await extractPdfWithPdfJs(file);
          if (!file.resultDate) file.resultDate = file.parsed.structured?.date || "";
        }

        const parsedDocs = compactParsedDocs(state.penunjangFiles);
        status.textContent = `PDF berhasil diekstrak. Merangkum dengan ${PROVIDERS[provider]?.label || provider}...`;
        summary = await callOpenAiCompatibleForPenunjang({
          provider,
          apiKey,
          model,
          parsedDocs,
        });
      } catch (primaryError) {
        if (!geminiFallbackApiKey) {
          throw new Error(
            `${PROVIDERS[provider]?.label || provider}/parser gagal: ${primaryError.message}. Gemini API fallback belum diisi.`
          );
        }
        status.textContent = `Gagal menggunakan ${PROVIDERS[provider]?.label || provider}/parser: ${primaryError.message}. Melanjutkan dengan Gemini API fallback...`;
        summary = await callGeminiForPenunjangPdf({
          apiKey: geminiFallbackApiKey,
          model: geminiFallbackModel,
          files: state.penunjangFiles,
        });
      }
    }

    $("#penunjangSummary").value = summary || "";
    status.className = "status";
    status.textContent = "Selesai. Rangkuman dapat diedit di field Pemeriksaan Penunjang Bermakna.";
    toast("Rangkuman penunjang selesai", "success");
  } catch (e) {
    console.error(e);
    status.className = "status is-error";
    status.textContent = "Gagal: " + e.message;
    toast("Gagal merangkum", "error");
  } finally {
    summarizePenunjangBtn.disabled = state.penunjangFiles.length === 0;
  }
});

// ---------------- CPPT: Masukkan Detail ke halaman ----------------
const insertCPPTConfirm = $("#insertCPPTConfirm");
const confirmInsertCPPT = $("#confirmInsertCPPT");
const cancelInsertCPPT = $("#cancelInsertCPPT");

$("#insertCPPT").addEventListener("click", () => {
  insertCPPTConfirm.hidden = false;
});

cancelInsertCPPT.addEventListener("click", () => {
  insertCPPTConfirm.hidden = true;
});

confirmInsertCPPT.addEventListener("click", async () => {
  insertCPPTConfirm.hidden = true;
  const getVal = (key) =>
    document.querySelector(`#cpptResults textarea[data-key="${key}"]`)?.value ?? "";
  const payload = {
    an: getVal("penunjang"),
    af: getVal("terapi_dirawat"),
    a: getVal("operasi"),
    b: getVal("dx_utama"),
    c: getVal("dx_sekunder"),
    d: getVal("konsul"),
    e: getVal("terapi_pulang"),
  };
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("Tab aktif tidak ditemukan");
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (data) => {
        const setVal = (el, val) => {
          if (!el) return false;
          const proto = Object.getPrototypeOf(el);
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          setter ? setter.call(el, val) : (el.value = val);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        };
        const found = {};
        for (const [name, val] of Object.entries(data)) {
          const el = document.querySelector(
            `input[name="${name}"], textarea[name="${name}"]`
          );
          found[name] = setVal(el, val);
        }
        return found;
      },
      args: [payload],
    });
    const missing = Object.entries(result).filter(([, ok]) => !ok).map(([k]) => k);
    if (missing.length === 0) toast("Detail CPPT dimasukkan", "success");
    else toast("Sebagian field tidak ditemukan: " + missing.join(", "), "error");
  } catch (e) {
    console.error(e);
    toast("Gagal: " + e.message, "error");
  }
});

// ---------------- Tindak Lanjut: Masukkan penunjang ke resume ----------------
$("#insertPenunjangResume").addEventListener("click", async () => {
  const value = $("#penunjangSummary").value;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("Tab aktif tidak ditemukan");
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (val) => {
        const setVal = (el, nextValue) => {
          if (!el) return false;
          const proto = Object.getPrototypeOf(el);
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          setter ? setter.call(el, nextValue) : (el.value = nextValue);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        };
        const el = document.querySelector('input[name="an"], textarea[name="an"]');
        return setVal(el, val);
      },
      args: [value],
    });
    if (result) toast("Penunjang dimasukkan ke resume", "success");
    else toast("Field penunjang resume tidak ditemukan", "error");
  } catch (e) {
    console.error(e);
    toast("Gagal: " + e.message, "error");
  }
});
