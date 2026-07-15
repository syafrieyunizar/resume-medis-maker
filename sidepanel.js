const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  cpptMode: "",
  cpptText: "",
  cpptSummary: null,
  cpptPenunjang: "",
  cpptResultReady: false,
  cpptSources: [],
  penunjangFiles: [],
  claimAnalysisRaw: null,
  soapVitals: {},
  draftKey: "",
  draftPatientId: "",
  draftPatientName: "",
  draftRestoring: false,
  draftSaveTimer: null,
  draftSyncTimer: null,
  draftLastSavedAt: "",
  adminProviders: [],
  adminUserResetTarget: "",
  adminBackendAuth: null,
};

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(
    "vendor/pdf.worker.min.js"
  );
}

// ---------------- Tabs ----------------
function activatePanel(target) {
  if (target === "analisa") target = "cppt";
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
  queueAutoGrowTextareas();
  scheduleDraftSave();
}

function enterKnowledgeAdminMode() {
  document.body.classList.add("is-admin-mode");
  $("#settingsMain").hidden = true;
  $("#knowledgeAdminPanel").hidden = false;
  activatePanel("setting");
}

function exitKnowledgeAdminMode() {
  document.body.classList.remove("is-admin-mode");
  $("#settingsMain").hidden = false;
  $("#knowledgeAdminPanel").hidden = true;
  activatePanel("setting");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeErmText(value) {
  return String(value || "").replace(/[→⇒➔➜➝➞]/g, "->");
}

function autoGrowTextarea(element) {
  if (!(element instanceof HTMLTextAreaElement)) return;
  element.style.overflow = "hidden";
  element.style.resize = "none";
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

function autoGrowTextareas(root = document) {
  root.querySelectorAll?.("textarea").forEach(autoGrowTextarea);
}

function queueAutoGrowTextareas(root = document) {
  requestAnimationFrame(() => autoGrowTextareas(root));
}

function createAiProgress({ panel, bar, text, status, mirrorLoadingToStatus = true }) {
  let percent = 0;
  let timer = null;
  const startedAt = Date.now();
  const setProgress = async (message, nextPercent) => {
    percent = Math.max(percent, nextPercent);
    panel.hidden = false;
    bar.className = "progress-fill";
    bar.style.width = `${percent}%`;
    text.textContent = message;
    if (status && mirrorLoadingToStatus) {
      status.hidden = false;
      status.className = "status is-loading";
      status.textContent = message;
    }
    await wait(250);
  };
  const startWaiting = (message) => {
    timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      if (percent < 92) {
        percent += 1;
        bar.style.width = `${percent}%`;
      }
      const next = `${message}... ${elapsed} detik`;
      text.textContent = next;
      if (status && mirrorLoadingToStatus) {
        status.textContent = `${next}. Proses 30-180 detik tergantung panjang data dan provider.`;
      }
    }, 1000);
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const complete = (message) => {
    stop();
    panel.hidden = false;
    bar.style.width = "100%";
    bar.className = "progress-fill is-success";
    text.textContent = message;
    if (status) {
      status.hidden = false;
      status.className = "status is-success";
      status.textContent = message;
    }
  };
  const fail = (message) => {
    stop();
    if (status) {
      status.hidden = false;
      status.className = "status is-error";
      status.textContent = message;
    }
  };
  return { setProgress, startWaiting, stop, complete, fail };
}

function getAiErrorMessage(error, context = "Proses AI") {
  const message = String(error?.message || error || "");
  if (/Sesi admin/i.test(message)) {
    return `${context} gagal karena sesi API key admin sudah tidak aktif.\nSilakan login ulang dengan username dan password akses admin pada menu setting.`;
  }
  if (/\b546\b/.test(message) || /timeout|timed out|too long/i.test(message)) {
    return `${context} terlalu lama atau data terlalu banyak.\nRekomendasi: kurangi panjang data yang dianalisa, gunakan knowledge yang lebih spesifik, coba ulangi, atau gunakan API key pribadi/provider yang lebih cepat.`;
  }
  if (/PDF gagal dibaca:/i.test(message)) {
    return `${context} gagal karena ada PDF yang tidak terbaca.\n${message}`;
  }
  return `${context} gagal: ${message}`;
}

function activateAdminTab(target) {
  $$(".admin-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.adminTab === target);
  });
  $$("[data-admin-panel]").forEach((panel) => {
    const active = panel.dataset.adminPanel === target;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
}

$$("[data-tab]").forEach((tab) => {
  tab.addEventListener("click", () => activatePanel(tab.dataset.tab));
});

$$("[data-admin-tab]").forEach((tab) => {
  tab.addEventListener("click", () => activateAdminTab(tab.dataset.adminTab));
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

let decisionModalResolve = null;

function closeDecisionModal(value) {
  const modal = $("#decisionModal");
  modal.hidden = true;
  if (decisionModalResolve) {
    decisionModalResolve(value);
    decisionModalResolve = null;
  }
}

function showDecisionModal({ title, message, primaryText, secondaryText }) {
  const modal = $("#decisionModal");
  $("#decisionModalTitle").textContent = title;
  $("#decisionModalMessage").textContent = message;
  $("#decisionModalPrimary").textContent = primaryText;
  $("#decisionModalSecondary").textContent = secondaryText;
  modal.hidden = false;
  $("#decisionModalPrimary").focus();
  return new Promise((resolve) => {
    decisionModalResolve = resolve;
  });
}

async function askApiKeySaveMode() {
  const firstChoice = await showDecisionModal({
    title: "Validasi API key?",
    message: "Apikey akan disimpan. Apakah ingin memvalidasi apikey dahulu?",
    primaryText: "Validasi",
    secondaryText: "Tidak",
  });
  if (firstChoice === "primary") return "validate";
  const secondChoice = await showDecisionModal({
    title: "Apikey tidak divalidasi.",
    message: "Tetap Simpan?",
    primaryText: "Iya, Simpan",
    secondaryText: "Tidak",
  });
  return secondChoice === "primary" ? "save_without_validation" : "cancel";
}

$("#decisionModalPrimary")?.addEventListener("click", () => closeDecisionModal("primary"));
$("#decisionModalSecondary")?.addEventListener("click", () => closeDecisionModal("secondary"));

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

const DRAFT_DB_NAME = "resume-medis-reviewer-drafts";
const DRAFT_STORE_NAME = "patientDrafts";
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function openDraftDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DRAFT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFT_STORE_NAME)) {
        db.createObjectStore(DRAFT_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Gagal membuka penyimpanan draft"));
  });
}

async function draftDbRequest(mode, callback) {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE_NAME, mode);
    const store = tx.objectStore(DRAFT_STORE_NAME);
    let request;
    try {
      request = callback(store);
    } catch (error) {
      reject(error);
      return;
    }
    if (request) {
      request.onerror = () => reject(request.error || new Error("Operasi draft gagal"));
    }
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error || new Error("Transaksi draft gagal"));
  }).finally(() => db.close());
}

async function getDraft(key) {
  return draftDbRequest("readonly", (store) => store.get(key));
}

async function saveDraftRecord(record) {
  return draftDbRequest("readwrite", (store) => store.put(record));
}

async function deleteDraftRecord(key) {
  return draftDbRequest("readwrite", (store) => store.delete(key));
}

async function cleanupExpiredDrafts() {
  const db = await openDraftDb();
  return new Promise((resolve) => {
    const tx = db.transaction(DRAFT_STORE_NAME, "readwrite");
    const store = tx.objectStore(DRAFT_STORE_NAME);
    const threshold = Date.now() - DRAFT_TTL_MS;
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (Date.parse(cursor.value?.updatedAt || "") < threshold) cursor.delete();
      cursor.continue();
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      resolve();
    };
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function getActiveTabUrl() {
  return (await getActiveTab())?.url || "";
}

function extractPatientDraftId(url) {
  const text = String(url || "");
  const patterns = [
    /\/pemeriksaanranap\/([^/?#]+)/i,
    /\/erm\/(?:c_labpk|r_labpk|c_radiologi|r_radiologi)\/([^/?#]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

async function getActivePatientName(tabId) {
  if (!tabId) return "";
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
        const direct = clean(document.querySelector('td[width="44%"][style*="font-size: 18px"]')?.textContent);
        if (direct) return direct;
        for (const tbody of document.querySelectorAll("tbody")) {
          const rows = tbody.querySelectorAll("tr");
          const name = clean(rows[0]?.cells?.[0]?.textContent);
          const identity = clean(rows[1]?.cells?.[0]?.textContent);
          if (name && /\d+\s*\/\s*\d{4}-\d{2}-\d{2}/.test(identity)) return name;
        }
        return "";
      },
    });
    return String(result || "").trim();
  } catch (error) {
    console.warn("Nama pasien draft tidak terbaca", error);
    return "";
  }
}
function formatDraftTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function hasText(value) {
  return String(value || "").trim() !== "" && String(value || "").trim() !== "-";
}

function draftHasSoap(data = {}) {
  const so = data.so || {};
  return [so.subjektif, so.objektif, so.assessment, so.planning, so.konsultasi, ...Object.values(so.vitals || {})].some(hasText);
}

function draftHasCppt(data = {}) {
  const cppt = data.cppt || {};
  return Boolean(
    hasText(cppt.text) ||
      hasText(cppt.penunjang) ||
      cppt.resultReady ||
      (Array.isArray(cppt.sources) && cppt.sources.length > 0) ||
      Object.values(cppt.results || {}).some(hasText)
  );
}

function draftHasPenunjang(data = {}) {
  const penunjang = data.penunjang || {};
  return hasText(penunjang.summary) || (Array.isArray(penunjang.files) && penunjang.files.length > 0);
}

function draftHasAnalysis(data = {}) {
  return Boolean(data.claim?.raw);
}

function hasMeaningfulDraftData(data = {}) {
  return draftHasSoap(data) || draftHasCppt(data) || draftHasPenunjang(data) || draftHasAnalysis(data);
}

function formatDraftSummary(data = {}) {
  const mark = (value) => (value ? "OK" : "-");
  return `SOAP ${mark(draftHasSoap(data))}  CPPT ${mark(draftHasCppt(data))}  Penunjang ${mark(draftHasPenunjang(data))}  Analisa ${mark(draftHasAnalysis(data))}`;
}

function updateDraftUi() {}

function showDraftBanner(message, data = {}, kind = "", options = {}) {
  const banner = $("#draftBanner");
  const text = $("#draftBannerText");
  const summary = $("#draftBannerSummary");
  if (!banner || !text) return;
  if (options.patientName) {
    text.textContent = "Draft ";
    const name = document.createElement("strong");
    name.textContent = options.patientName;
    text.append(name, ` ${options.suffix || "dipulihkan"}`);
  } else {
    text.textContent = message;
  }
  if (summary) summary.textContent = formatDraftSummary(data);
  banner.classList.toggle("is-warning", kind === "warning");
  banner.hidden = false;
}
function hideDraftBanner() {
  const banner = $("#draftBanner");
  if (banner) {
    banner.hidden = true;
    banner.classList.remove("is-warning");
  }
}

function collectCpptResultFields() {
  const values = {};
  $$("#cpptResults textarea").forEach((ta) => {
    values[ta.dataset.key] = normalizeErmText(ta.value || "");
  });
  return values;
}

function fillCpptResultFields(values = {}) {
  $$("#cpptResults textarea").forEach((ta) => {
    ta.value = normalizeErmText(values[ta.dataset.key] || "");
    autoGrowTextarea(ta);
  });
}

function collectCpptAudit() {
  const reason = $("#cpptDiagnosisReason")?.textContent || "";
  return {
    saran_dx_utama: $("#cpptDxUtamaSuggest .cppt-ai-suggest-text")?.textContent || "",
    saran_dx_sekunder: $("#cpptDxSekunderSuggest .cppt-ai-suggest-text")?.textContent || "",
    alasan_saran_dx: reason.replace(/^Alasan saran diagnosis:\s*/i, ""),
    cppt_gaps: normalizeCpptGaps($("#cpptGapsList")?.dataset.gaps || "[]"),
  };
}

function normalizeCpptGaps(value) {
  if (typeof value === "string") {
    const text = normalizeErmText(value).trim();
    if (!text || text === "-") return [];
    try {
      return normalizeCpptGaps(JSON.parse(text));
    } catch (_error) {
      return [{ gap: text }];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? { gap: item } : item || {}))
    .map((item) => ({
      level: normalizeErmText(item.level || item.tingkat || "").trim(),
      gap: normalizeErmText(item.gap || item.masalah || "").trim(),
      basis: normalizeErmText(item.basis || item.bukti || "").trim(),
      suggestion: normalizeErmText(item.suggestion || item.saran || "").trim(),
    }))
    .filter((item) => item.gap || item.basis || item.suggestion);
}

function setCpptSuggestion(id, value) {
  const box = $("#" + id);
  const text = box?.querySelector(".cppt-ai-suggest-text");
  const clean = normalizeErmText(value).trim();
  if (!box || !text) return;
  if (!clean || clean === "-") {
    box.hidden = true;
    text.textContent = "";
    return;
  }
  text.textContent = clean;
  box.hidden = false;
}

function applyCpptDiagnosisSuggestion(button) {
  const source = $("#" + button.dataset.source + " .cppt-ai-suggest-text");
  const target = $('#cpptResults textarea[data-key="' + button.dataset.targetKey + '"]');
  const suggestion = normalizeErmText(source?.textContent || "").trim();
  if (!target || !suggestion) return;

  target.value = suggestion;
  target.dispatchEvent(new Event("input", { bubbles: true }));
  scheduleDraftSave();
  toast("Saran diagnosis dimasukkan", "success");
}

function renderCpptDiagnosisSupport(data = {}) {
  setCpptSuggestion("cpptDxUtamaSuggest", data.saran_dx_utama || "");
  setCpptSuggestion("cpptDxSekunderSuggest", data.saran_dx_sekunder || "");

  const suggestBox = $("#cpptDiagnosisSuggestBox");
  const hasSuggestion = [data.saran_dx_utama, data.saran_dx_sekunder].some(isMeaningfulText);
  if (suggestBox && hasSuggestion) suggestBox.open = true;

  const reason = $("#cpptDiagnosisReason");
  if (reason) {
    reason.hidden = true;
    reason.textContent = "";
  }

  const gaps = normalizeCpptGaps(data.cppt_gaps);
  const box = $("#cpptGapsBox");
  const count = $("#cpptGapsCount");
  const list = $("#cpptGapsList");
  if (!box || !count || !list) return;
  box.hidden = gaps.length === 0;
  count.textContent = `${gaps.length} catatan`;
  list.textContent = "";
  list.dataset.gaps = JSON.stringify(gaps);
  gaps.forEach((gap) => {
    const item = document.createElement("div");
    item.className = "cppt-gap-item";
    [["Gap", gap.gap], ["Bukti", gap.basis], ["Saran", gap.suggestion]].forEach(([label, value]) => {
      if (!value) return;
      const line = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = `${label}: `;
      line.append(strong, value);
      item.append(line);
    });
    list.append(item);
  });
}

let cpptDiagnosisStatusTimer = null;

function showCpptDiagnosisStatus(className, message, duration = 3500) {
  const status = $("#cpptDiagnosisStatus");
  if (!status) return;
  clearTimeout(cpptDiagnosisStatusTimer);
  status.hidden = false;
  status.className = className;
  status.textContent = message;
  if (duration) {
    cpptDiagnosisStatusTimer = setTimeout(() => {
      status.hidden = true;
      status.textContent = "";
    }, duration);
  }
}

function collectCpptDiagnosisContext() {
  const results = collectCpptResultFields();
  return {
    periode_rawat: state.cpptSummary?.periodText || "",
    soap: {
      subjektif: normalizeErmText($("#soSubjektif")?.value || ""),
      objektif: normalizeErmText($("#soObjektif")?.value || ""),
      assessment: normalizeErmText($("#soAssessment")?.value || ""),
      planning: normalizeErmText($("#soPlanning")?.value || ""),
      konsultasi: normalizeErmText($("#soKonsultasi")?.value || ""),
      vitals: state.soapVitals,
    },
    cppt: {
      raw: truncateText(state.cpptText, 7000),
      hasil_resume: results,
    },
    penunjang: {
      dari_cppt: normalizeErmText(state.cpptPenunjang || results.penunjang || ""),
      ringkasan_pdf: normalizeErmText($("#penunjangSummary")?.value || ""),
    },
  };
}

function getMissingCpptDiagnosisContext(context) {
  const hasSoap = Object.entries(context.soap || {})
    .filter(([key]) => key !== "vitals")
    .some(([, value]) => isMeaningfulText(value));
  const hasCppt = isMeaningfulText(context.cppt?.raw) || Object.values(context.cppt?.hasil_resume || {}).some(isMeaningfulText);
  const hasPenunjang = [context.penunjang?.dari_cppt, context.penunjang?.ringkasan_pdf].some(isMeaningfulText);
  return [!hasSoap && "SOAP", !hasCppt && "CPPT", !hasPenunjang && "Penunjang/Lab"].filter(Boolean);
}

const cpptDiagnosisSchema = {
  type: "object",
  properties: {
    saran_dx_utama: { type: "string" },
    saran_dx_sekunder: { type: "string" },
  },
  required: ["saran_dx_utama", "saran_dx_sekunder"],
};

function formatCpptDiagnosisPrompt(context) {
  return `Tinjau data resume medis secara komprehensif dari SOAP, CPPT, dan penunjang.

ATURAN:
- Output adalah bantuan AI, bukan diagnosis final.
- Jangan tulis dasar temuan/alasan.
- Diagnosis utama maksimal 1 diagnosis, atau 2 bila sangat terkait.
- Diagnosis sekunder maksimal 3-6 diagnosis inti, dipisahkan koma.
- Jangan mengarang diagnosis bila data tidak mendukung.
- Jawaban wajib JSON valid saja dengan key: saran_dx_utama, saran_dx_sekunder.

DATA:
${JSON.stringify(context, null, 2)}`;
}

function normalizeCpptDiagnosisAiResult(parsed = {}) {
  const payload = parsed?.result || parsed?.hasil || parsed?.data || parsed?.output || parsed;
  return {
    saran_dx_utama: firstStringValue(payload, ["saran_dx_utama", "dx_utama", "diagnosis_utama", "diagnosa_utama", "Diagnosis utama (AI)"]),
    saran_dx_sekunder: firstStringValue(payload, ["saran_dx_sekunder", "dx_sekunder", "diagnosis_sekunder", "diagnosa_sekunder", "Diagnosis sekunder (AI)"]),
  };
}
function collectDraftData() {
  return {
    version: 1,
    patientId: state.draftPatientId,
    activePanel: document.querySelector(".panel.is-active")?.dataset.panel || "so",
    so: {
      subjektif: normalizeErmText($("#soSubjektif")?.value || ""),
      objektif: normalizeErmText($("#soObjektif")?.value || ""),
      assessment: normalizeErmText($("#soAssessment")?.value || ""),
      planning: normalizeErmText($("#soPlanning")?.value || ""),
      konsultasi: normalizeErmText($("#soKonsultasi")?.value || ""),
      vitals: state.soapVitals,
    },
    cppt: {
      mode: state.cpptMode,
      text: state.cpptText,
      summary: state.cpptSummary,
      penunjang: state.cpptPenunjang,
      resultReady: state.cpptResultReady,
      sources: state.cpptSources,
      results: collectCpptResultFields(),
      audit: collectCpptAudit(),
    },
    penunjang: {
      summary: normalizeErmText($("#penunjangSummary")?.value || ""),
      files: state.penunjangFiles,
    },
    claim: {
      raw: state.claimAnalysisRaw,
    },
  };
}

async function saveCurrentDraftNow() {
  if (!state.draftKey || state.draftRestoring) return;
  const updatedAt = new Date().toISOString();
  const data = collectDraftData();
  const existing = await getDraft(state.draftKey);
  if (!hasMeaningfulDraftData(data)) {
    if (hasMeaningfulDraftData(existing?.data)) {
      showDraftBanner("Draft lama tidak ditimpa karena panel kosong.", existing.data, "warning");
      updateDraftUi("Draft lama aman - panel kosong tidak disimpan.", existing.data);
    } else {
      updateDraftUi("Panel kosong - belum ada draft yang disimpan.", data);
    }
    return;
  }
  await saveDraftRecord({
    key: state.draftKey,
    patientId: state.draftPatientId,
    updatedAt,
    data,
  });
  state.draftLastSavedAt = updatedAt;
  updateDraftUi(`Tersimpan otomatis ${formatDraftTime(updatedAt)}.`, data);
}
function scheduleDraftSave() {
  if (state.draftRestoring) return;
  clearTimeout(state.draftSaveTimer);
  state.draftSaveTimer = setTimeout(async () => {
    const switched = await switchDraftContextToActiveTab().catch((error) => {
      console.error("Gagal sinkron context draft", error);
      return false;
    });
    if (!switched) await saveCurrentDraftNow().catch((error) => console.error("Gagal autosave draft", error));
  }, 500);
}

function applyDraftData(data = {}) {
  state.draftRestoring = true;
  try {
    if (data.so) {
      $("#soSubjektif").value = data.so.subjektif || "";
      $("#soObjektif").value = data.so.objektif || "";
      $("#soAssessment").value = data.so.assessment || "";
      $("#soPlanning").value = data.so.planning || "";
      $("#soKonsultasi").value = data.so.konsultasi || "";
      state.soapVitals = data.so.vitals || {};
    }
    if (data.cppt) {
      state.cpptMode = data.cppt.mode || "";
      state.cpptText = data.cppt.text || "";
      state.cpptSummary = data.cppt.summary || null;
      state.cpptSources = Array.isArray(data.cppt.sources) ? data.cppt.sources : [];
      state.cpptResultReady = Boolean(data.cppt.resultReady);
      updateCpptPenunjangLinked(data.cppt.penunjang || "");
      fillCpptResultFields(data.cppt.results || {});
      renderCpptDiagnosisSupport(data.cppt.audit || {});
      renderCpptAccessSummary(state.cpptSummary);
      renderCpptSourceList();
      updateCarePeriodNote(state.cpptSummary);
      updateCpptControls();
    }
    if (data.penunjang) {
      $("#penunjangSummary").value = data.penunjang.summary || "";
      state.penunjangFiles = Array.isArray(data.penunjang.files) ? data.penunjang.files : [];
      updatePenunjangList();
    }
    if (data.claim?.raw) {
      renderClaimAnalysis(data.claim.raw);
    }
    if (data.activePanel) {
      activatePanel(data.activePanel);
    }
  } finally {
    state.draftRestoring = false;
    queueAutoGrowTextareas();
  }
}

async function restoreDraftIfAvailable({ manual = false } = {}) {
  if (!state.draftKey) return false;
  const record = await getDraft(state.draftKey);
  if (!record?.data || !hasMeaningfulDraftData(record.data)) {
    if (record?.data) await deleteDraftRecord(state.draftKey);
    return false;
  }
  const age = Date.now() - Date.parse(record.updatedAt || "");
  if (!Number.isFinite(age) || age > DRAFT_TTL_MS) {
    await deleteDraftRecord(state.draftKey);
    return false;
  }
  applyDraftData(record.data);
  const patientName = state.draftPatientName || state.draftPatientId;
  const suffix = `dipulihkan - terakhir ${formatDraftTime(record.updatedAt)}`;
  const message = `Draft ${patientName} ${suffix}`;
  showDraftBanner(message, record.data, "", { patientName, suffix });
  updateDraftUi(message, record.data);
  return true;
}
function resetSidepanelWorkspace() {
  state.draftRestoring = true;
  try {
    hideDraftBanner();
    $("#soSubjektif").value = "";
    $("#soObjektif").value = "";
    $("#soAssessment").value = "";
    $("#soPlanning").value = "";
    $("#soKonsultasi").value = "";
    state.soapVitals = {};
    state.cpptMode = "";
    resetCpptAccessState();
    state.penunjangFiles = [];
    $("#penunjangSummary").value = "";
    updatePenunjangList();
    state.claimAnalysisRaw = null;
    const claimResult = $("#claimAnalysisResult");
    if (claimResult) {
      claimResult.hidden = true;
      claimResult.textContent = "";
    }
    ["penunjangStatus", "claimStatus"].forEach((id) => {
      const el = $("#" + id);
      if (!el) return;
      el.hidden = true;
      el.textContent = "";
    });
    ["penunjangProgress", "claimProgress"].forEach((id) => {
      const el = $("#" + id);
      if (el) el.hidden = true;
    });
    ["penunjangProgressBar", "claimProgressBar"].forEach((id) => {
      const el = $("#" + id);
      if (el) el.style.width = "0%";
    });
    const penunjangProgressText = $("#penunjangProgressText");
    if (penunjangProgressText) penunjangProgressText.textContent = "Menyiapkan penunjang...";
    const claimProgressText = $("#claimProgressText");
    if (claimProgressText) claimProgressText.textContent = "Menyiapkan analisa...";
  } finally {
    state.draftRestoring = false;
    queueAutoGrowTextareas();
  }
}

let draftContextSwitching = false;

async function switchDraftContextToActiveTab({ skipSave = false } = {}) {
  if (draftContextSwitching) return false;
  const tab = await getActiveTab();
  const patientId = extractPatientDraftId(tab?.url || "");
  const patientName = patientId ? await getActivePatientName(tab?.id) : "";
  const nextKey = patientId ? `patient:${patientId}` : "";
  if (nextKey === state.draftKey) {
    state.draftPatientId = patientId;
    if (patientName) state.draftPatientName = patientName;
    if (!state.draftKey) updateDraftUi();
    return false;
  }

  draftContextSwitching = true;
  try {
    clearTimeout(state.draftSaveTimer);
    if (!skipSave && state.draftKey && !state.draftRestoring) {
      await saveCurrentDraftNow();
    }
    state.draftPatientId = patientId;
    state.draftPatientName = patientName;
    state.draftKey = nextKey;
    state.draftLastSavedAt = "";
    resetSidepanelWorkspace();
    updateDraftUi();
    if (nextKey) await restoreDraftIfAvailable();
    return true;
  } finally {
    draftContextSwitching = false;
  }
}

async function restoreCurrentPatientDraft() {
  await switchDraftContextToActiveTab({ skipSave: true });
  if (!state.draftKey) {
    toast("Halaman pasien belum terdeteksi", "error");
    return false;
  }
  clearTimeout(state.draftSaveTimer);
  const restored = await restoreDraftIfAvailable({ manual: true });
  if (restored) {
    toast("Draft dipulihkan ulang", "success");
  } else {
    toast("Tidak ada draft pasien yang bisa dipulihkan", "error");
  }
  return restored;
}
async function clearCurrentPatientDraft() {
  if (!state.draftKey) {
    toast("Halaman pasien belum terdeteksi", "error");
    return;
  }
  const choice = await showDecisionModal({
    title: "Hapus draft pasien ini?",
    message: "Data di sidepanel akan dikosongkan.",
    primaryText: "Hapus",
    secondaryText: "Batal",
  });
  if (choice !== "primary") return;
  clearTimeout(state.draftSaveTimer);
  state.draftRestoring = true;
  await deleteDraftRecord(state.draftKey);
  try {
    resetSidepanelWorkspace();
  } finally {
    state.draftRestoring = false;
  }
  updateDraftUi("Draft pasien ini dihapus. Autosave akan membuat draft baru saat ada perubahan.");
  toast("Draft pasien dihapus", "success");
}

async function initDraftSystem() {
  await cleanupExpiredDrafts();
  await switchDraftContextToActiveTab({ skipSave: true });
  state.draftSyncTimer = setInterval(() => {
    switchDraftContextToActiveTab().catch((error) => console.error("Gagal sinkron context draft", error));
  }, 1500);
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
      scheduleDraftSave();
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
  const text = normalizeErmText(value).trim();
  state.cpptPenunjang = text && text !== "-" ? text : "";
  if (!field || !textarea) return;
  if (!state.cpptPenunjang) {
    field.hidden = true;
    textarea.value = "";
    autoGrowTextarea(textarea);
    scheduleDraftSave();
    return;
  }
  textarea.value = state.cpptPenunjang;
  autoGrowTextarea(textarea);
  field.hidden = false;
  scheduleDraftSave();
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
  if (added.length) scheduleDraftSave();
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

function isWithinDateRange(resultDate, start, end) {
  const date = parseFlexibleDate(resultDate);
  if (!date || !start || !end) return false;
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return day >= startDay && day <= endDay;
}

function isWithinCarePeriod(resultDate) {
  return isWithinDateRange(resultDate, state.cpptSummary?.startDate, state.cpptSummary?.endDate);
}
function isPdfArrayBuffer(buffer) {
  const head = String.fromCharCode(...new Uint8Array(buffer).slice(0, 4));
  return head === "%PDF";
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

  const rawText = pages.map((page) => page.lines.join("\n")).join("\n\n");
  const cleanedPages = removeRepeatedHeaderFooter(pages);
  const text = cleanedPages.map((page) => page.lines.join("\n")).join("\n\n");
  const cleanedLength = text.replace(/\s+/g, "").length;
  const rawLength = rawText.replace(/\s+/g, "").length;
  const finalText = cleanedLength >= 30 ? text : rawLength >= 30 ? rawText : "";
  if (!finalText) {
    const error = new Error("PDF tidak menghasilkan teks bermakna, kemungkinan scan/gambar");
    error.debugInfo = {
      rawLength,
      cleanedLength,
      repeatedLines: [],
    };
    throw error;
  }

  return {
    pageCount: doc.numPages,
    pages: cleanedPages,
    text: finalText,
    rawText,
    cleanedText: text,
    structured: parsePenunjangDocument(finalText, file),
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
    "Mikroba",
    "Epitel",
  ];
  const unitPattern = "(?:g\\/dl|g\\/dL|g\\/gl|mg\\/dL|mg\\/dl|U\\/L|u\\/l|\\/ ul|\\/ul|\\/LPB|%|fl|pg|mmol\\/L|mEq\\/L)";
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

  if (!observations.length && /mikroparasitologi|pewarnaan gram|mikroba|epitel|\/lpb/i.test(text)) {
    const microPatterns = [
      ["Mikroba", /Mikroba\s+([^-\n]+?)(?:\s+-\s+-|\s*$)/i, ""],
      ["Epitel", /Epitel\s+([<>]?\d+(?:[.,]\d+)?)\s+(?:\d+\s*-\s*[<>]?\d+)\s*(\/LPB)/i, null],
      ["Leukosit", /Leukosit\s+([<>]?\d+(?:[.,]\d+)?)\s+(?:<\s*\d+|\d+\s*-\s*[<>]?\d+)?\s*(\/LPB)/i, null],
    ];
    microPatterns.forEach(([name, pattern, fixedUnit]) => {
      const match = text.match(pattern);
      if (!match) return;
      observations.push({
        name,
        values: [
          {
            date: file.resultDate || extractDateFromText(text),
            value: normalizeLine(match[1]),
            unit: fixedUnit ?? normalizeLine(match[2] || "").replace(/\s+/g, ""),
          },
        ],
      });
    });
  }

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
    text.match(/(?:Kesimpulan|Kesan|Impression|Ekspertisi|Expertise)\s*:?\s*([\s\S]{0,1200})/i)?.[1] ||
    text.match(/Hasil Pemeriksaan[\s\S]{0,1200}/i)?.[0] ||
    text.slice(0, 1800);
  const modality =
    text.match(/\b(USG|CT\s*Scan|MRI|Rontgen|Thorax|Abdomen|Echo|Ekokardiografi|EKG|ECG)[^\n:]*/i)?.[0] ||
    file.kind ||
    type;
  const normalizedImpression = normalizeLine(impression)
    .replace(/^Hasil Pemeriksaan\s*/i, "")
    .replace(/^(?:Foto\s+)?/i, "")
    .replace(/\bNo\.\s*CM\s*:.*$/i, "")
    .trim();
  return {
    type,
    modality: normalizeLine(modality),
    date: file.resultDate || extractDateFromText(text),
    impression: normalizedImpression.slice(0, 1800),
    rawExcerpt: text.slice(0, 3000),
  };
}

function parseHtmlPenunjangFallback(html, file) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  const wanted = new Set(["bahan", "dx. klinik", "dx klinik", "makroskopik", "mikroskopik", "kesimpulan"]);
  const rows = Array.from(doc.querySelectorAll("tr"))
    .map((row) => Array.from(row.querySelectorAll("td")).map((cell) => normalizeLine(cell.innerText || cell.textContent || "")))
    .filter((cells) => cells.length >= 2 && wanted.has(cells[0].toLowerCase()) && cells[1]);
  if (!rows.length) return null;
  const text = rows.map(([label, value]) => label + ": " + value).join("\n");
  return {
    pageCount: 1,
    pages: [{ pageNo: 1, lines: text.split("\n"), text }],
    text,
    rawText: text,
    cleanedText: text,
    structured: {
      type: "anatomical_pathology",
      sourceName: file.kind || "Patologi Anatomi",
      date: file.resultDate || extractDateFromText(text),
      rawExcerpt: text.slice(0, 5000),
    },
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

function sanitizePenunjangText(value) {
  return String(value || "")
    .split(/\r?\n/)
    .filter((line) => {
      const text = line.trim();
      if (!text) return false;
      return !/(?:\bnama\b|\bnama pasien\b|\bnik\b|\bno\.?\s*rm\b|\bno\.?\s*rekam\b|\bno\.?\s*sep\b|\bsep\b|\balamat\b|\btgl\.?\s*lahir\b|\btanggal\s*lahir\b|\btempat\s*lahir\b|\btelepon\b|\bno\.?\s*hp\b|\bpenjamin\b|\bpeserta\b)\s*[:=]/i.test(text);
    })
    .join("\n")
    .replace(/\b\d{16}\b/g, "[NIK]")
    .replace(/\b\d{13,18}\b/g, "[ID]")
    .replace(/[A-Z0-9]{8}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{12}/gi, "[ID]")
    .replace(/https?:\/\/\S+/gi, "[URL]")
    .trim();
}

function sanitizePenunjangValue(value) {
  if (typeof value === "string") return sanitizePenunjangText(value);
  if (Array.isArray(value)) return value.map(sanitizePenunjangValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/url|href|link|nama|nik|sep|alamat|telepon|phone|rm|rekam|patient|pasien/i.test(key))
        .map(([key, nextValue]) => [key, sanitizePenunjangValue(nextValue)])
    );
  }
  return value;
}

function compactParsedDocs(files) {
  return files.map((file, index) => ({
    index: index + 1,
    date: file.resultDate,
    kind: file.kind,
    parser: sanitizePenunjangValue(file.parsed?.structured || null),
  }));
}

function getPenunjangDisplayName(file) {
  const parts = [file.kind, file.resultDate, file.code].filter(Boolean);
  return parts.join(" - ") || file.name || file.url || "PDF tanpa nama";
}

async function parsePenunjangFilesWithPdfJs(files) {
  const failures = [];
  for (const file of files) {
    try {
      file.parsed = await extractPdfWithPdfJs(file);
      if (!file.resultDate) file.resultDate = file.parsed.structured?.date || "";
    } catch (error) {
      const fallback = parseHtmlPenunjangFallback(file.htmlText, file);
      if (fallback) {
        file.parsed = fallback;
        if (!file.resultDate) file.resultDate = fallback.structured?.date || "";
        continue;
      }
      failures.push({
        file,
        message: error instanceof Error ? error.message : String(error),
        debugInfo: error?.debugInfo || null,
      });
    }
  }
  if (failures.length) {
    const detail = failures
      .map(({ file, message }) => `${getPenunjangDisplayName(file)} (${message})`)
      .join("; ");
    const error = new Error(`PDF gagal dibaca: ${detail}`);
    error.failures = failures;
    throw error;
  }
  return compactParsedDocs(files);
}

function findFirstJsonObject(text) {
  const start = text.indexOf("{");
  if (start < 0) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
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
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return "";
}

function parseJsonResponse(text) {
  if (!text) throw new Error("Respons kosong dari provider");
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const position = Number(String(error?.message || "").match(/position (\d+)/)?.[1]);
    if (position > 0) {
      try {
        return JSON.parse(cleaned.slice(0, position));
      } catch (_) {
        // lanjut ke ekstraksi object pertama
      }
    }
    const firstObject = findFirstJsonObject(cleaned);
    if (firstObject) {
      try {
        return JSON.parse(firstObject);
      } catch (_) {
        // gunakan pesan error asli agar posisi masalah tetap terlihat
      }
    }
    throw error;
  }
}

function formatPenunjangSummary(text) {
  return normalizeErmText(text)
    .replace(/\r/g, "")
    .replace(/^pemeriksaan penunjang bermakna\s*:?\s*/i, "")
    .replace(/(?:^|\n)(?:Rontgen\/X-Ray|Rontgen|X-Ray|CT Scan|MRI|USG|Ultrasound|Echocardiography|Echo|ECG|EKG|Laboratorium|Mikrobiologi|Kultur|Patologi Anatomi|Endoskopi|Lainnya|Kimia Klinik|Hematologi|Elektrolit|Koagulasi|AGD|Urinalisis|Serologi|Imunologi)\s*:\s*/gi, "")
    .replace(/\n+/g, ", ")
    .replace(/\s*,\s*,\s*/g, ", ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
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
    saran_dx_utama: [
      "saran_dx_utama",
      "suggested_dx_utama",
      "suggested_primary_diagnosis",
      "Saran Diagnosa Utama",
    ],
    saran_dx_sekunder: [
      "saran_dx_sekunder",
      "suggested_dx_sekunder",
      "suggested_secondary_diagnosis",
      "Saran Diagnosa Sekunder",
    ],
    alasan_saran_dx: [
      "alasan_saran_dx",
      "alasan_diagnosa",
      "diagnosis_reason",
      "Alasan Saran Diagnosa",
    ],
  };

  const result = Object.fromEntries(
    Object.entries(aliases).map(([key, names]) => [key, firstStringValue(payload, names)])
  );
  result.cppt_gaps = normalizeCpptGaps(
    payload?.cppt_gaps || payload?.cpptGaps || payload?.gaps || payload?.kelengkapan_cppt
  );
  return result;
}

const CPPT_CORE_KEYS = [
  "penunjang",
  "terapi_dirawat",
  "operasi",
  "dx_utama",
  "dx_sekunder",
  "konsul",
  "terapi_pulang",
];

function isMeaningfulText(value) {
  const clean = String(value || "").trim();
  return Boolean(clean && clean !== "-");
}

function hasMeaningfulCpptResult(result) {
  return CPPT_CORE_KEYS.some((key) => isMeaningfulText(result?.[key]));
}

function parseCommaList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
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
      throw new Error(
        "Supabase menolak akses Edge Function. Pastikan function knowledge-admin sudah deploy dan secret/service role sudah diset."
      );
    }
    if (response.status === 546) {
      throw new Error("Knowledge API 546: proses terlalu lama atau payload terlalu besar");
    }
    throw new Error(data.error || `Knowledge API ${response.status}`);
  }
  return data;
}

async function getOrCreateDeviceId() {
  const { adminAccessDeviceId = "" } = await chrome.storage.local.get(["adminAccessDeviceId"]);
  if (adminAccessDeviceId) return adminAccessDeviceId;
  const nextId =
    (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`) || `${Date.now()}`;
  await chrome.storage.local.set({ adminAccessDeviceId: nextId });
  return nextId;
}

async function getStoredAdminUserSession() {
  const { adminUserSession = null } = await chrome.storage.local.get(["adminUserSession"]);
  return adminUserSession;
}

async function setStoredAdminUserSession(session) {
  await chrome.storage.local.set({ adminUserSession: session });
}

async function clearStoredAdminUserSession() {
  await chrome.storage.local.remove(["adminUserSession"]);
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
    await setStoredAdminUserSession(nextSession);
    return nextSession;
  } catch (_error) {
    await clearStoredAdminUserSession();
    return null;
  }
}

async function renderActiveApiKeyStatus() {
  const box = $("#activeApiKeyStatus");
  if (!box) return;
  const settings = await chrome.storage.local.get([
    "apiKeySource",
    "apiKey",
    "model",
    "provider",
    "customProviderLabel",
    "personalApiKeyValidated",
  ]);
  const setStatus = (className, text) => {
    box.className = `active-apikey-status ${className}`;
    box.textContent = text;
  };
  if (settings.apiKeySource === "personal") {
    if (!settings.apiKey || !settings.model || !settings.provider) {
      setStatus("is-error", "Tidak ada apikey aktif");
      return;
    }
    const providerLabel = getProviderDisplay(settings.provider, settings.customProviderLabel || "");
    if (settings.personalApiKeyValidated) {
      setStatus("is-success", `${providerLabel} Aktif dari Apikey Pribadi`);
    } else {
      setStatus("is-warning", `${providerLabel} tersimpan dari Apikey Pribadi, belum divalidasi`);
    }
    return;
  }
  const session = await validateStoredAdminUserSession();
  if (!session) {
    setStatus("is-error", "Tidak ada apikey aktif");
    return;
  }
  try {
    const data = await knowledgeApi("get_ai_config");
    if (!data.config?.hasApiKey) {
      setStatus("is-error", "Tidak ada apikey aktif");
      return;
    }
    setStatus(
      "is-success",
      `${getProviderLabel(data.config.provider, data.config.providerLabel)} Aktif dari Apikey Admin, user : ${session.username}`
    );
  } catch (_error) {
    setStatus("is-warning", `Apikey Admin dipilih, user : ${session.username}. Status provider belum terbaca`);
  }
}

async function callAdminAiText({
  systemPrompt = "",
  userPrompt = "",
  prompt = "",
  responseJson = false,
  responseSchema = null,
  userSession = null,
}) {
  const data = await knowledgeApi("ai_generate", {
    systemPrompt,
    userPrompt,
    prompt,
    responseJson,
    responseSchema,
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
    "geminiFallbackApiKey",
    "geminiFallbackModel",
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
      geminiFallbackApiKey: settings.geminiFallbackApiKey || "",
      geminiFallbackModel: settings.geminiFallbackModel || "gemini-2.0-flash",
    };
  }
  const data = await knowledgeApi("get_ai_config");
  if (!data.config?.hasApiKey) throw new Error("API key admin belum diset");
  const adminUserSession = await validateStoredAdminUserSession();
  if (!adminUserSession) {
    throw new Error("Sesi admin di perangkat ini sudah tidak aktif. Silakan login ulang.");
  }
  return {
    source: "admin",
    provider: data.config.provider,
    model: data.config.model,
    hasGeminiFallback: data.config.hasGeminiFallback,
    geminiFallbackModel: data.config.geminiFallbackModel || "gemini-2.0-flash",
    adminUserSession,
  };
}

function getKnowledgeAuth() {
  if (state.adminBackendAuth?.username && state.adminBackendAuth?.password) {
    return {
      username: state.adminBackendAuth.username,
      password: state.adminBackendAuth.password,
    };
  }
  return {
    username: $("#knowledgeAdminUser").value.trim(),
    password: $("#knowledgeAdminPassword").value,
  };
}

function getAdminAccessHelpText(message) {
  if (/Password salah/i.test(message) || /Username tidak terdaftar/i.test(message)) {
    return `${message}\nSilakan menghubungi dr. Syafrie Yunizar untuk mendapatkan akses apikey admin.`;
  }
  return message;
}

let adminAccessStatusTimer = null;
let settingsStatusTimer = null;

function showTimedStatus(element, className, message, duration = 10000) {
  if (!element) return;
  element.hidden = false;
  element.className = className;
  element.textContent = message;
  const isAdminAccess = element.id === "adminUserAccessStatus";
  clearTimeout(isAdminAccess ? adminAccessStatusTimer : settingsStatusTimer);
  const timer = setTimeout(() => {
    element.hidden = true;
    element.textContent = "";
  }, duration);
  if (isAdminAccess) adminAccessStatusTimer = timer;
  else settingsStatusTimer = timer;
}

function updateSettingsSaveButton(session = null) {
  const saveButton = $("#saveSettings");
  const useAdmin = $("#apiKeySource")?.value === "admin";
  if (saveButton) saveButton.hidden = useAdmin && !session?.username;
}

function renderAdminAccessSession(session) {
  const info = $("#adminUserSessionInfo");
  const loginForm = $("#adminUserLoginForm");
  const loginButton = $("#loginAdminAccess");
  const logoutButton = $("#logoutAdminAccess");
  const usernameInput = $("#adminAccessUsername");
  const passwordInput = $("#adminAccessPassword");
  if (!info || !loginForm || !loginButton || !logoutButton) return;
  updateSettingsSaveButton(session);
  if (session?.username) {
    info.hidden = false;
    info.className = "status is-success";
    info.textContent = `Login sebagai ${session.username}${session.expiresAt ? ` sampai ${new Date(session.expiresAt).toLocaleString("id-ID")}` : ""}`;
    loginButton.hidden = true;
    logoutButton.hidden = false;
    if (usernameInput) {
      usernameInput.value = session.username;
      usernameInput.disabled = true;
    }
    if (passwordInput) {
      passwordInput.value = "";
      passwordInput.disabled = true;
    }
  } else {
    info.hidden = true;
    info.textContent = "";
    loginButton.hidden = false;
    logoutButton.hidden = true;
    if (usernameInput) usernameInput.disabled = false;
    if (passwordInput) passwordInput.disabled = false;
  }
}

async function refreshAdminAccessUi() {
  const session = await validateStoredAdminUserSession();
  renderAdminAccessSession(session);
  return session;
}

function renderAdminUserList(users) {
  const list = $("#adminUserList");
  if (!list) return;
  if (!users?.length) {
    list.className = "pulled-list is-empty";
    list.textContent = "Belum ada user terdaftar.";
    return;
  }
  list.className = "pulled-list";
  list.textContent = "";
  users.forEach((user) => {
    const row = document.createElement("div");
    row.className = "pulled-item";
    const main = document.createElement("div");
    main.className = "pulled-item-main";
    const title = document.createElement("div");
    title.className = "pulled-item-title";
    title.textContent = user.username;
    const meta = document.createElement("div");
    meta.className = "pulled-item-meta";
    meta.textContent = user.hasActiveDevice
      ? `Device aktif${user.sessionExpiresAt ? ` · sesi sampai ${new Date(user.sessionExpiresAt).toLocaleString("id-ID")}` : ""}`
      : "Belum ada device aktif";
    const actions = document.createElement("div");
    actions.className = "inline-actions";
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "btn btn-outline btn-small";
    resetBtn.textContent = "Reset Password";
    resetBtn.addEventListener("click", () => {
      state.adminUserResetTarget = user.username;
      $("#adminUserResetTarget").textContent = `User: ${user.username}`;
      $("#resetAdminUserPassword").value = "";
      $("#adminUserResetForm").hidden = false;
      $("#adminUserForm").hidden = true;
    });
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-remove";
    deleteBtn.textContent = "🗑";
    deleteBtn.setAttribute("aria-label", `Hapus user ${user.username}`);
    deleteBtn.addEventListener("click", async () => {
      if (!confirm(`Hapus user ${user.username}?`)) return;
      const status = $("#knowledgeStatus");
      status.hidden = false;
      status.className = "status is-loading";
      status.textContent = `Menghapus ${user.username}...`;
      try {
        await knowledgeApi("delete_user", {
          ...getKnowledgeAuth(),
          user: { username: user.username },
        });
        status.className = "status is-success";
        status.textContent = `User ${user.username} dihapus.`;
        await loadAdminUsers();
      } catch (e) {
        status.className = "status is-error";
        status.textContent = "Gagal hapus user: " + e.message;
      }
    });
    actions.append(resetBtn, deleteBtn);
    main.append(title, meta);
    row.append(main, actions);
    list.append(row);
  });
}

async function loadAdminUsers() {
  const status = $("#knowledgeStatus");
  try {
    const data = await knowledgeApi("list_users", getKnowledgeAuth());
    renderAdminUserList(data.users || []);
  } catch (e) {
    status.hidden = false;
    status.className = "status is-error";
    status.textContent = "Gagal memuat user: " + e.message;
  }
}

function renderKnowledgeList(chunks) {
  const list = $("#knowledgeList");
  if (!chunks?.length) {
    list.className = "pulled-list is-empty";
    list.textContent = "Belum ada data knowledge.";
    return;
  }
  list.className = "pulled-list";
  list.textContent = "";
  chunks.forEach((chunk) => {
    const row = document.createElement("div");
    row.className = "pulled-item";

    const main = document.createElement("div");
    main.className = "pulled-item-main";

    const title = document.createElement("div");
    title.className = "pulled-item-title";
    title.textContent = chunk.title || "Knowledge";

    const meta = document.createElement("div");
    meta.className = "pulled-item-meta";
    meta.textContent = `${chunk.category || "Tanpa kategori"} - ${(chunk.keywords || []).join(", ")}`;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn-remove";
    remove.textContent = "X";
    remove.setAttribute("aria-label", "Hapus knowledge");
    remove.addEventListener("click", async () => {
      const status = $("#knowledgeStatus");
      try {
        await knowledgeApi("delete", { ...getKnowledgeAuth(), id: chunk.id });
        status.hidden = false;
        status.className = "status";
        status.textContent = "Knowledge dihapus.";
        await loadKnowledgeList();
      } catch (e) {
        status.hidden = false;
        status.className = "status is-error";
        status.textContent = "Gagal hapus: " + e.message;
      }
    });

    main.append(title, meta);
    row.append(main, remove);
    list.append(row);
  });
}

function renderChunkPreview(chunks) {
  const preview = $("#knowledgeChunkPreview");
  if (!chunks.length) {
    preview.className = "pulled-list is-empty";
    preview.textContent = "Belum ada chunk PDF.";
    return;
  }
  preview.className = "pulled-list";
  preview.textContent = "";
  chunks.slice(0, 8).forEach((chunk, idx) => {
    const row = document.createElement("div");
    row.className = "pulled-item";
    const main = document.createElement("div");
    main.className = "pulled-item-main";
    const title = document.createElement("div");
    title.className = "pulled-item-title";
    title.textContent = `${idx + 1}. ${chunk.title}`;
    const meta = document.createElement("div");
    meta.className = "pulled-item-meta";
    meta.textContent = chunk.content.slice(0, 160);
    main.append(title, meta);
    row.append(main);
    preview.append(row);
  });
}

function splitTextIntoChunks(text, maxLength = 1800) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks = [];
  let current = "";
  paragraphs.forEach((paragraph) => {
    if ((current + "\n\n" + paragraph).length > maxLength && current) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  });
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function extractKnowledgePdfChunks(file) {
  if (!window.pdfjsLib) throw new Error("PDF.js belum tersedia");
  const buffer = await file.arrayBuffer();
  const doc = await window.pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
  const chunks = [];
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    const textContent = await page.getTextContent();
    const lines = groupTextItemsIntoLines(textContent.items);
    const pageText = lines.join("\n");
    splitTextIntoChunks(pageText).forEach((content, idx) => {
      chunks.push({
        title: `${file.name} - Hal ${pageNo}${idx ? `.${idx + 1}` : ""}`,
        content,
        category: $("#knowledgeCategory").value.trim() || "aturan bpjs",
        keywords: parseCommaList($("#knowledgeKeywords").value),
        diagnosis_tags: parseCommaList($("#knowledgeDiagnosisTags").value),
        source_name: file.name,
        source_page: pageNo,
        active: true,
      });
    });
  }
  return chunks;
}

function collectResumeForClaimAnalysis() {
  const cppt = {};
  $$("#cpptResults textarea").forEach((ta) => {
    cppt[ta.dataset.key] = ta.value || "";
  });
  return {
    periode_rawat: state.cpptSummary?.periodText || "",
    subjektif: $("#soSubjektif").value || "",
    objektif: $("#soObjektif").value || "",
    cppt: {
      penunjang: cppt.penunjang || "",
      terapi_dirawat: cppt.terapi_dirawat || "",
      operasi: cppt.operasi || "",
      dx_utama: cppt.dx_utama || "",
      dx_sekunder: cppt.dx_sekunder || "",
      konsul: cppt.konsul || "",
      terapi_pulang: cppt.terapi_pulang || "",
    },
    penunjang_dari_cppt: state.cpptPenunjang || "",
    penunjang_tindak_lanjut: $("#penunjangSummary").value || "",
  };
}

function extractClaimKeywords(resume) {
  const text = JSON.stringify(resume).toLowerCase();
  const medicalTerms = [
    "anemia",
    "transfusi",
    "prc",
    "hb",
    "sepsis",
    "pneumonia",
    "ckd",
    "aki",
    "gagal ginjal",
    "stroke",
    "diabetes",
    "dm",
    "hipertensi",
    "operasi",
    "icu",
    "ventilator",
    "infeksi",
    "kultur",
    "syok",
    "perdarahan",
    "chf",
    "cad",
  ];
  const found = medicalTerms.filter((term) => text.includes(term));
  const dxWords = `${resume.cppt?.dx_utama || ""},${resume.cppt?.dx_sekunder || ""}`
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((word) => word.length >= 4);
  return Array.from(new Set([...found, ...dxWords])).slice(0, 20);
}

function truncateText(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + " ...[dipotong]";
}

function compactObject(value) {
  if (Array.isArray(value)) return value.map(compactObject).filter((item) => item !== "" && item != null);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, compactObject(item)])
      .filter(([, item]) => {
        if (item == null) return false;
        if (typeof item === "string") return item.trim() !== "";
        if (Array.isArray(item)) return item.length > 0;
        if (typeof item === "object") return Object.keys(item).length > 0;
        return true;
      })
  );
}

function compactResumeForClaim(resume, compact = false) {
  const limits = compact
    ? { subjektif: 1200, objektif: 1200, penunjang: 1400, penunjang_tindak_lanjut: 1800, other: 900 }
    : { subjektif: 2000, objektif: 2000, penunjang: 2200, penunjang_tindak_lanjut: 3000, other: 1400 };
  return compactObject({
    periode_rawat: resume.periode_rawat,
    subjektif: truncateText(resume.subjektif, limits.subjektif),
    objektif: truncateText(resume.objektif, limits.objektif),
    cppt: {
      penunjang: truncateText(resume.cppt?.penunjang, limits.penunjang),
      terapi_dirawat: truncateText(resume.cppt?.terapi_dirawat, limits.other),
      operasi: truncateText(resume.cppt?.operasi, limits.other),
      dx_utama: truncateText(resume.cppt?.dx_utama, limits.other),
      dx_sekunder: truncateText(resume.cppt?.dx_sekunder, limits.other),
      konsul: truncateText(resume.cppt?.konsul, limits.other),
      terapi_pulang: truncateText(resume.cppt?.terapi_pulang, limits.other),
    },
    penunjang_dari_cppt: truncateText(resume.penunjang_dari_cppt, limits.penunjang),
    penunjang_tindak_lanjut: truncateText(resume.penunjang_tindak_lanjut, limits.penunjang_tindak_lanjut),
  });
}

function compactKnowledgeChunks(chunks, compact = false) {
  const contentLimit = compact ? 700 : 1100;
  return chunks.map((chunk) => ({
    title: truncateText(chunk.title, 140),
    category: truncateText(chunk.category, 80),
    source_name: truncateText(chunk.source_name, 120),
    source_page: chunk.source_page ?? null,
    keywords: Array.isArray(chunk.keywords) ? chunk.keywords.slice(0, 8) : [],
    content: truncateText(chunk.content, contentLimit),
  }));
}

function formatClaimAnalysisPrompt(resume, chunks) {
  return `Kamu adalah seorang dokter casemix. Analisa kelengkapan dokumentasi resume medis agar risiko pending klaim BPJS lebih kecil.

BATASAN:
- Jangan menyarankan manipulasi diagnosis/klaim.
- Jangan menyarankan tindakan medis baru demi klaim.
- Fokus pada gap dokumentasi: diagnosis, bukti klinis, penunjang, terapi, monitoring, tindakan, dan konsistensi resume.
- Gunakan knowledge yang diberikan sebagai dasar.
- Jika data tidak ditemukan di RESUME, tulis sebagai bukti belum ditemukan, bukan mengarang.
- Jika data ada di RESUME, jangan menyebut kosong.
- Jawaban wajib JSON valid saja, tanpa markdown, tanpa teks pembuka/penutup.

FORMAT JSON WAJIB:
{
  "risk": "Rendah|Sedang|Tinggi",
  "summary": "Ringkasan singkat risiko pending.",
  "critical_findings": [
    {
      "title": "Judul temuan",
      "evidence_found": ["Bukti yang ditemukan dari resume"],
      "missing_evidence": ["Bukti yang belum ditemukan"],
      "suggestion": "Saran kelengkapan resume, bukan manipulasi klaim.",
      "severity": "critical|warning|info"
    }
  ],
  "found_evidence": ["Bukti penting yang sudah ada"],
  "missing_evidence": ["Bukti penting yang belum ada"],
  "recommendations": ["Saran kelengkapan resume"]
}

RESUME:
${JSON.stringify(resume, null, 2)}

KNOWLEDGE RELEVAN:
${JSON.stringify(chunks, null, 2)}`;
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
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) throw new Error("Gemini API " + res.status + ": " + (await res.text()).slice(0, 200));
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  const endpoint = getProviderEndpoint(provider, baseUrl);
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
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error("API " + res.status + ": " + (await res.text()).slice(0, 200));
  const data = parseJsonResponse(await res.text());
  return data?.choices?.[0]?.message?.content || "";
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function normalizeClaimAnalysis(data) {
  const risk = ["Rendah", "Sedang", "Tinggi"].includes(data?.risk) ? data.risk : "Sedang";
  const findings = Array.isArray(data?.critical_findings) ? data.critical_findings : [];
  return {
    risk,
    summary: String(data?.summary || "").trim(),
    critical_findings: findings.map((item) => ({
      title: String(item?.title || "Temuan").trim(),
      evidence_found: normalizeArray(item?.evidence_found),
      missing_evidence: normalizeArray(item?.missing_evidence),
      suggestion: String(item?.suggestion || "").trim(),
      severity: ["critical", "warning", "info"].includes(item?.severity) ? item.severity : "warning",
    })),
    found_evidence: normalizeArray(data?.found_evidence),
    missing_evidence: normalizeArray(data?.missing_evidence),
    recommendations: normalizeArray(data?.recommendations),
  };
}

function appendList(parent, title, items, extraClass = "") {
  if (!items.length) return;
  const section = document.createElement("div");
  section.className = "claim-section" + (extraClass ? " " + extraClass : "");
  const heading = document.createElement("div");
  heading.className = "claim-section-title";
  heading.textContent = title;
  const list = document.createElement("ul");
  list.className = "claim-list";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.append(li);
  });
  section.append(heading, list);
  parent.append(section);
}

function renderClaimAnalysis(rawAnalysis) {
  const result = $("#claimAnalysisResult");
  const analysis = normalizeClaimAnalysis(rawAnalysis);
  state.claimAnalysisRaw = rawAnalysis;
  result.hidden = false;
  result.className = "claim-result";
  result.textContent = "";

  const riskCard = document.createElement("div");
  const riskClass = analysis.risk === "Tinggi" ? "is-high" : analysis.risk === "Sedang" ? "is-medium" : "is-low";
  riskCard.className = `claim-card claim-risk ${riskClass}`;
  const riskTitle = document.createElement("div");
  riskTitle.className = "claim-card-title";
  riskTitle.textContent = `Risiko pending: ${analysis.risk}`;
  const summary = document.createElement("p");
  summary.className = "claim-summary";
  summary.textContent = analysis.summary || "Tidak ada ringkasan.";
  riskCard.append(riskTitle, summary);
  result.append(riskCard);

  if (analysis.critical_findings.length) {
    const wrap = document.createElement("div");
    wrap.className = "claim-section";
    const heading = document.createElement("div");
    heading.className = "claim-section-title";
    heading.textContent = "Temuan Utama";
    wrap.append(heading);
    analysis.critical_findings.forEach((finding) => {
      const card = document.createElement("div");
      card.className = "claim-card";
      const badge = document.createElement("span");
      badge.className = `claim-badge is-${finding.severity}`;
      badge.textContent = finding.severity;
      const title = document.createElement("div");
      title.className = "claim-card-title";
      title.textContent = finding.title;
      card.append(badge, title);
      appendList(card, "Bukti ditemukan", finding.evidence_found);
      appendList(card, "Bukti belum ditemukan", finding.missing_evidence);
      if (finding.suggestion) appendList(card, "Saran", [finding.suggestion], "claim-recommendations");
      wrap.append(card);
    });
    result.append(wrap);
  }

  appendList(result, "Bukti Ditemukan", analysis.found_evidence);
  appendList(result, "Bukti Belum Ditemukan", analysis.missing_evidence);
  appendList(result, "Saran Kelengkapan Resume", analysis.recommendations, "claim-card claim-recommendations");
  scheduleDraftSave();
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

function adjustCarePeriodStart(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return date;
  const hours = date.getHours();
  const minutes = date.getMinutes();
  if (hours < 0 || hours > 2) return date;
  if (hours === 0 && minutes === 0) return date;
  if (hours === 2 && minutes > 0) return date;
  const adjusted = new Date(date.getTime());
  adjusted.setDate(adjusted.getDate() - 1);
  adjusted.setHours(0, 0, 0, 0);
  return adjusted;
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
  const startDate = parsedDates[0] ? adjustCarePeriodStart(parsedDates[0]) : null;
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

function hashText(text) {
  let hash = 0;
  const input = String(text || "");
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

function makeCpptSource(result, index) {
  const summary = summarizeCpptTable(result.table, result.text);
  return {
    id: hashText(`${result.text}\n${JSON.stringify(result.table || {})}`),
    label: `CPPT ${index}`,
    text: result.text,
    table: result.table,
    summary,
  };
}

function summarizeCpptSources(sources) {
  if (!sources.length) return null;
  const parsedDates = sources
    .flatMap((source) => source.table?.dates || [])
    .map(parseFlexibleDate)
    .filter((date) => date && !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  const startDate = parsedDates[0] ? adjustCarePeriodStart(parsedDates[0]) : null;
  const endDate = parsedDates[parsedDates.length - 1] || null;
  const periodText =
    startDate && endDate ? `${formatDateId(startDate)} - ${formatDateId(endDate)}` : "-";
  return {
    rowCount: sources.reduce((total, source) => total + (source.summary?.rowCount || 0), 0),
    startDate,
    endDate,
    periodText,
  };
}

function combineCpptSources() {
  state.cpptText = state.cpptSources
    .map((source, index) => {
      const period = source.summary?.periodText && source.summary.periodText !== "-"
        ? ` (${source.summary.periodText})`
        : "";
      return `=== CPPT Ruangan ${index + 1}${period} ===\n${source.text}`;
    })
    .join("\n\n");
  state.cpptSummary = summarizeCpptSources(state.cpptSources);
}

function renderCpptAccessSummary(summary) {
  const box = $("#cpptAccessSummary");
  if (!box) return;
  if (!summary) {
    box.hidden = true;
    box.textContent = "";
    return;
  }
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

function renderCpptSourceList() {
  const list = $("#cpptSourceList");
  if (!list) return;
  if (state.cpptMode !== "multi" || !state.cpptSources.length) {
    list.hidden = true;
    list.textContent = "";
    return;
  }
  list.hidden = false;
  list.classList.remove("is-empty");
  list.textContent = "";
  state.cpptSources.forEach((source, index) => {
    const item = document.createElement("div");
    item.className = "pulled-item";
    const main = document.createElement("div");
    main.className = "pulled-item-main";
    const title = document.createElement("strong");
    title.className = "pulled-item-title";
    title.textContent = `${index + 1}. ${source.label} diakses`;
    const meta = document.createElement("span");
    meta.className = "pulled-item-meta";
    meta.style.display = "block";
    meta.textContent = `Jumlah baris ${source.summary?.rowCount || 0}, periode ${source.summary?.periodText || "-"}`;
    main.append(title, meta);
    item.append(main);
    list.append(item);
  });
}

function updateCpptRoomStatus(message = "") {
  const status = $("#cpptRoomStatus");
  if (!status) return;
  if (!message) {
    status.hidden = true;
    status.textContent = "";
    return;
  }
  status.hidden = false;
  status.className = "status";
  status.textContent = message;
}

function clearCpptResultFields() {
  state.cpptResultReady = false;
  const results = $("#cpptResults");
  if (results) results.hidden = true;
  $$("#cpptResults textarea").forEach((ta) => {
    ta.value = "";
    autoGrowTextarea(ta);
  });
  updateCpptPenunjangLinked("");
  renderCpptDiagnosisSupport({});
}

function updateCpptControls() {
  const singleBtn = $("#cpptModeSingle");
  const multiBtn = $("#cpptModeMulti");
  const guide = $("#cpptMultiGuide");
  const modeStep = $("#cpptModeStep");
  const workflow = $("#cpptWorkflow");
  const results = $("#cpptResults");
  if (singleBtn && multiBtn) {
    singleBtn.className = `btn ${state.cpptMode === "single" ? "btn-primary" : "btn-outline"}`;
    multiBtn.className = `btn ${state.cpptMode === "multi" ? "btn-primary" : "btn-outline"}`;
  }
  if (modeStep) modeStep.hidden = Boolean(state.cpptMode);
  if (workflow) workflow.hidden = !state.cpptMode;
  if (results) results.hidden = !state.cpptResultReady;
  if (guide) guide.hidden = state.cpptMode !== "multi";
  const nextIndex = state.cpptSources.length + 1;
  const accessText = state.cpptMode === "multi" ? `Akses CPPT ${nextIndex}` : "Akses CPPT";
  if (aksesBtn) {
    aksesBtn.dataset.defaultText = accessText;
    aksesBtn.textContent = accessText;
    aksesBtn.classList.remove("btn-success", "btn-error", "btn-outline");
    aksesBtn.classList.add("btn-primary");
  }
  if (extractBtn) {
    const canProcess =
      state.cpptMode === "multi" ? state.cpptSources.length >= 2 : Boolean(state.cpptText);
    extractBtn.hidden = !canProcess;
    extractBtn.disabled = !canProcess;
    extractBtn.classList.remove("btn-primary", "btn-success", "btn-error");
    extractBtn.classList.add("btn-outline");
  }
  renderCpptSourceList();
  if (state.cpptMode === "multi" && state.cpptSources.length === 1) {
    updateCpptRoomStatus("CPPT diakses. Silakan pindah ke ruangan berikutnya, lalu tekan Akses CPPT 2.");
  } else if (state.cpptMode === "multi" && state.cpptSources.length > 1) {
    updateCpptRoomStatus("CPPT beberapa ruangan sudah digabung. Anda masih dapat akses ruangan berikutnya bila ada.");
  } else {
    updateCpptRoomStatus("");
  }
}

function resetCpptAccessState() {
  state.cpptText = "";
  state.cpptSummary = null;
  state.cpptSources = [];
  clearCpptResultFields();
  $("#cpptStatus").hidden = true;
  $("#cpptStatus").textContent = "";
  $("#cpptProgress").hidden = true;
  $("#cpptProgressBar").style.width = "0%";
  renderCpptAccessSummary(null);
  renderCpptSourceList();
  updateCarePeriodNote(null);
  updateCpptRoomStatus("");
  updateCpptControls();
}

function returnToCpptModeStep() {
  const hasData =
    state.cpptSources.length > 0 || Boolean(state.cpptText) || Boolean(state.cpptResultReady);
  if (hasData && !window.confirm("Data CPPT yang sudah diakses akan dihapus. Lanjutkan?")) {
    return;
  }
  state.cpptMode = "";
  resetCpptAccessState();
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
  x5lab: { label: "X5Lab", url: "https://api.x5lab.dev/v1/chat/completions" },
};

function getProviderLabel(provider, customLabel = "") {
  if (provider === "custom") return customLabel || "Provider Lain";
  return PROVIDERS[provider]?.label || provider || "Provider";
}

function isBuiltInAdminProvider(provider) {
  return ["gemini", "sumopod", "aimurah", "x5lab"].includes(String(provider || "").trim());
}

function normalizeAdminProviderKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getAdminProviderMeta(provider) {
  return state.adminProviders.find((item) => item.provider === provider) || null;
}

function getProviderEndpoint(provider, baseUrl = "") {
  return provider === "custom" ? baseUrl : PROVIDERS[provider]?.url || baseUrl;
}

function getProviderDisplay(provider, customLabel = "") {
  return getProviderLabel(provider, customLabel || (provider === "custom" ? "Provider Lain" : ""));
}

function renderAdminProviderOptions(providers = [], activeProvider = "gemini") {
  const select = $("#adminProvider");
  if (!select) return;
  const previousValue = activeProvider || select.value || "gemini";
  const options = [
    { value: "gemini", label: "Gemini (Google)" },
    { value: "sumopod", label: "Sumopod" },
    { value: "aimurah", label: "AImurah" },
    { value: "x5lab", label: "X5Lab" },
  ];
  const seen = new Set(options.map((item) => item.value));
  providers.forEach((provider) => {
    if (!provider?.provider || seen.has(provider.provider)) return;
    options.push({
      value: provider.provider,
      label: provider.providerLabel || getProviderLabel(provider.provider),
    });
    seen.add(provider.provider);
  });
  options.push({ value: "custom", label: "Provider Lain" });
  select.textContent = "";
  options.forEach((optionData) => {
    const option = document.createElement("option");
    option.value = optionData.value;
    option.textContent = optionData.label;
    select.append(option);
  });
  if (!seen.has(previousValue) && previousValue !== "custom") {
    const option = document.createElement("option");
    option.value = previousValue;
    option.textContent = getAdminProviderMeta(previousValue)?.providerLabel || previousValue;
    select.insertBefore(option, select.lastElementChild);
  }
  select.value = previousValue;
}

function applyAdminProviderSelection(provider, fallbackModel = "") {
  const config = getAdminProviderMeta(provider);
  if (provider === "custom") {
    $("#adminProviderLabel").value = "";
    $("#adminBaseUrl").value = "";
    if (fallbackModel) $("#adminModel").value = fallbackModel;
    $("#adminApiKey").value = "";
    $("#adminGeminiFallbackApiKey").value = "";
    syncAdminSettingsFields(provider, fallbackModel);
    return;
  }
  if (config) {
    $("#adminProviderLabel").value = config.providerLabel || "";
    $("#adminBaseUrl").value = config.baseUrl || "";
    $("#adminModel").value = config.model || fallbackModel || "";
    $("#adminGeminiFallbackModel").value = config.geminiFallbackModel || "gemini-2.0-flash";
  }
  $("#adminApiKey").value = "";
  $("#adminGeminiFallbackApiKey").value = "";
  syncAdminSettingsFields(provider, config?.model || fallbackModel || $("#adminModel").value.trim());
}

const KNOWLEDGE_FUNCTION_URL =
  "https://yvcqgwpfjoxhuyhxuiry.supabase.co/functions/v1/knowledge-admin";
const APP_ID = "resume-medis-reviewer";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2Y3Fnd3Bmam94aHV5aHh1aXJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NzkxOTIsImV4cCI6MjA5NDA1NTE5Mn0.cSVjIjIpC9hlm8Sb5nISxUitoRHtEL0pC6ZphQ9SxLw";

const penunjangSystemPrompt =
  `Kamu adalah dokter DPJP yang merangkum pemeriksaan penunjang bermakna dari data rekam medis.

OUTPUT FORMAT:
- Tulis output dalam Bahasa Indonesia.
- Output satu field saja: pemeriksaan penunjang bermakna.
- Buat satu paragraf ringkas, dipisahkan koma atau titik koma; jangan buat heading seperti Laboratorium/Rontgen/CT Scan.
- Jangan menulis judul "pemeriksaan penunjang bermakna".
- Jangan menulis kategori/subkategori lab seperti Kimia Klinik, Hematologi, Elektrolit, dll.
- Untuk nilai laboratorium serial, gabungkan menjadi rantai singkat: nama_pemeriksaan nilai_awal->nilai_berikutnya->nilai_akhir satuan.
- Tanggal lab hanya ditulis bila benar-benar bermakna, misalnya untuk nilai awal/akhir yang perlu konteks; jangan ulangi tanggal pada setiap nilai serial seperti GDS.
- Untuk pemeriksaan radiologi/CT/MRI/USG/Echo/EKG serial, tulis modalitas dan rentang tanggal bila membantu: Rontgen thoraks (08-11/05): temuan inti.
- Gunakan format tanggal singkat DD/MM atau rentang DD-DD/MM.
- Terjemahkan istilah penting ke Bahasa Indonesia bila lazim: cardiomegaly menjadi kardiomegali, bilateral lung edema menjadi edema paru bilateral, chronic cerebral infarction menjadi infark serebri kronik, brain atrophy menjadi atrofi serebri.
- Interpretasi singkat dalam tanda kurung boleh hanya jika sangat langsung dan perlu.
- Jangan gunakan tabel.
- Jangan gunakan bullet point.
- Abaikan hasil normal yang tidak relevan.
- Abaikan detail yang tidak mengubah makna klinis.
- Jaga sangat ringkas dan bergaya resume medis dokter saat pasien pulang.

CONTOH:
Albumin 1,29 (07/05)->1,68 g/dL (09/05), GDS 242->53->166->307->314->166->180 mg/dL, Kreatinin 0,42 mg/dL (12/05), Rontgen thoraks (08-11/05): kardiomegali, aortosklerosis/kalsifikasi aorta, infiltrat pneumonia bilateral, perivascular haziness, edema paru bilateral, CT scan kepala (07/05): infark serebri kronik bilateral, atrofi serebri, hidrosefalus, penyakit Fahr.`;

const penunjangSchema = {
  type: "object",
  properties: {
    penunjang: { type: "string" },
  },
  required: ["penunjang"],
};

async function callGeminiForPenunjangParsedDocs({ apiKey, model, parsedDocs }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    systemInstruction: { parts: [{ text: penunjangSystemPrompt }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              "Berikut JSON hasil parser lokal dari PDF penunjang yang sudah dihilangkan data identitas pasien. Ambil hanya data klinis bermakna dan kembalikan JSON sesuai skema.\n\n" +
              JSON.stringify(parsedDocs),
          },
        ],
      },
    ],
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

async function callOpenAiCompatibleForPenunjang({ provider, apiKey, model, parsedDocs, baseUrl = "", providerLabel = "" }) {
  const endpoint = getProviderEndpoint(provider, baseUrl);
  if (!endpoint) throw new Error("Provider tidak dikenal: " + provider);
  const body = {
    model,
    messages: [
      { role: "system", content: penunjangSystemPrompt },
      {
        role: "user",
        content:
          "Berikut JSON hasil parser lokal dari PDF penunjang yang sudah dihilangkan data identitas pasien. Ambil hanya data bermakna, gabungkan lab serial bila ada, dan kembalikan JSON {\"penunjang\":\"...\"}.\n\n" +
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
    throw new Error(`${getProviderDisplay(provider, providerLabel)} API ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = parseJsonResponse(await res.text());
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

async function validateOpenAiCompatibleKey({ provider, apiKey, model, baseUrl = "", providerLabel = "" }) {
  const endpoint = getProviderEndpoint(provider, baseUrl);
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
    throw new Error(`${getProviderDisplay(provider, providerLabel)} API ${res.status}: ${errText.slice(0, 160)}`);
  }
  await res.json();
}

function syncSettingsFields(provider, modelValue) {
  const isGemini = provider === "gemini";
  const modelInput = $("#model");
  const fallbackFields = $("#geminiFallbackFields");
  const customFields = $("#personalCustomProviderFields");
  // update API key label text
  const apiKeyField = $("#apiKey").closest(".field");
  if (apiKeyField) {
    apiKeyField.querySelector(".label").textContent = getProviderDisplay(provider, $("#customProviderLabel")?.value.trim()) + " API Key";
  }
  if (fallbackFields) fallbackFields.hidden = isGemini;
  if (customFields) customFields.hidden = provider !== "custom";
  if (modelInput) modelInput.value = modelValue || (isGemini ? "gemini-2.0-flash" : "");
}

function syncApiKeySourceFields() {
  const useAdmin = $("#apiKeySource").value === "admin";
  $("#settingsMain")?.classList.toggle("is-admin-source", useAdmin);
  const personalGroup = $("#personalApiSettings");
  const adminAccessPanel = $("#adminUserAccessPanel");
  if (personalGroup) personalGroup.hidden = useAdmin;
  if (adminAccessPanel) adminAccessPanel.hidden = !useAdmin;
  updateSettingsSaveButton();
  ["provider", "apiKey", "model", "customProviderLabel", "customBaseUrl", "geminiFallbackApiKey", "geminiFallbackModel"].forEach((id) => {
    const el = $("#" + id);
    if (el) el.disabled = useAdmin;
  });
}

function syncAdminSettingsFields(provider, modelValue) {
  const isGemini = provider === "gemini";
  const fallbackFields = $("#adminGeminiFallbackFields");
  const customFields = $("#adminCustomProviderFields");
  if (fallbackFields) fallbackFields.hidden = isGemini;
  if (customFields) customFields.hidden = provider !== "custom" && isBuiltInAdminProvider(provider);
  if ($("#adminModel")) $("#adminModel").value = modelValue || (isGemini ? "gemini-2.0-flash" : "");
}

async function loadSettings() {
  const {
    apiKeySource = "admin",
    apiKey = "",
    model = "gemini-2.0-flash",
    provider = "gemini",
    customProviderLabel = "",
    customBaseUrl = "",
    geminiFallbackApiKey = "",
    geminiFallbackModel = "gemini-2.0-flash",
  } = await chrome.storage.local.get([
    "apiKeySource",
    "apiKey",
    "model",
    "provider",
    "customProviderLabel",
    "customBaseUrl",
    "geminiFallbackApiKey",
    "geminiFallbackModel",
  ]);
  $("#apiKeySource").value = apiKeySource;
  $("#apiKey").value = apiKey;
  $("#provider").value = provider;
  $("#customProviderLabel").value = customProviderLabel;
  $("#customBaseUrl").value = customBaseUrl;
  $("#geminiFallbackApiKey").value = geminiFallbackApiKey;
  $("#geminiFallbackModel").value = geminiFallbackModel;
  syncSettingsFields(provider, model);
  syncApiKeySourceFields();
  await refreshAdminAccessUi();
  await renderActiveApiKeyStatus();
}
loadSettings();

$("#provider").addEventListener("change", () => {
  syncSettingsFields($("#provider").value, $("#model").value.trim());
});

$("#customProviderLabel").addEventListener("input", () => {
  if ($("#provider").value === "custom") {
    syncSettingsFields("custom", $("#model").value.trim());
  }
});

$("#apiKeySource").addEventListener("change", async () => {
  syncApiKeySourceFields();
  if ($("#apiKeySource").value === "admin") {
    await refreshAdminAccessUi();
  }
  await renderActiveApiKeyStatus();
});

$("#adminProvider").addEventListener("change", () => {
  applyAdminProviderSelection($("#adminProvider").value, $("#adminModel").value.trim());
});

$("#adminProviderLabel").addEventListener("input", () => {
  if ($("#adminProvider").value !== "custom") return;
});

function getCurrentModel() {
  return $("#model").value.trim();
}

function collectPersonalAiForm() {
  const provider = $("#provider").value;
  const customLabel = $("#customProviderLabel").value.trim();
  return {
    apiKeySource: $("#apiKeySource").value,
    apiKey: $("#apiKey").value.trim(),
    model: getCurrentModel(),
    provider,
    customProviderLabel: customLabel,
    customBaseUrl: $("#customBaseUrl").value.trim(),
    geminiFallbackApiKey: $("#geminiFallbackApiKey").value.trim(),
    geminiFallbackModel: $("#geminiFallbackModel").value.trim() || "gemini-2.0-flash",
  };
}

async function validatePersonalAiConfig(config, status) {
  if (!config.apiKey || !config.model) {
    throw new Error("API key dan model utama wajib diisi.");
  }
  if (config.provider === "custom" && (!config.customProviderLabel || !config.customBaseUrl)) {
    throw new Error("Nama provider dan endpoint URL wajib diisi untuk Provider Lain.");
  }
  const label = getProviderDisplay(config.provider, config.customProviderLabel);
  status.hidden = false;
  status.className = "status is-loading";
  status.textContent = `Memvalidasi ${label}...`;
  if (config.provider === "gemini") {
    await validateGeminiKey({ apiKey: config.apiKey, model: config.model });
    return `${label} aktif.`;
  }
  await validateOpenAiCompatibleKey({
    provider: config.provider,
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.customBaseUrl,
    providerLabel: config.customProviderLabel,
  });
  if (config.geminiFallbackApiKey) {
    status.textContent = `${label} aktif. Memvalidasi Gemini fallback...`;
    await validateGeminiKey({
      apiKey: config.geminiFallbackApiKey,
      model: config.geminiFallbackModel,
    });
    return `${label} aktif. Gemini fallback aktif.`;
  }
  return `${label} aktif. Gemini fallback belum diisi.`;
}

$("#saveSettings").addEventListener("click", async () => {
  const status = $("#settingsStatus");
  const config = collectPersonalAiForm();
  if (config.apiKeySource !== "personal") {
    status.hidden = false;
    status.className = "status is-loading";
    status.textContent = "Memeriksa akses API key admin...";
    const session = await validateStoredAdminUserSession();
    if (!session) {
      showTimedStatus(status, "status is-error", "Login akses admin terlebih dahulu untuk memakai API key admin.");
      toast("Login akses admin diperlukan", "error");
      await refreshAdminAccessUi();
      return;
    }
    await chrome.storage.local.set({ apiKeySource: "admin" });
    setButtonState($("#saveSettings"), "success", "\u2713 Tersimpan", { duration: 2500 });
    showTimedStatus(status, "status is-success", "API key admin siap digunakan.", 3000);
    toast("API key admin siap digunakan", "success");
    await renderActiveApiKeyStatus();
    return;
  }
  if (config.apiKeySource === "personal" && !config.model) {
    status.hidden = false;
    status.className = "status is-error";
    status.textContent = "Model wajib diisi.";
    toast("Model wajib diisi", "error");
    return;
  }
  if (config.provider === "custom" && (!config.customProviderLabel || !config.customBaseUrl)) {
    status.hidden = false;
    status.className = "status is-error";
    status.textContent = "Nama provider dan endpoint URL wajib diisi untuk Provider Lain.";
    toast("Provider Lain belum lengkap", "error");
    return;
  }
  const saveMode = await askApiKeySaveMode();
  if (saveMode === "cancel") {
    status.hidden = false;
    status.className = "status";
    status.textContent = "API key tidak disimpan. Pengaturan lama tetap digunakan.";
    toast("API key tidak disimpan", "error");
    return;
  }
  try {
    let validationMessage = "";
    if (config.apiKeySource === "personal" && saveMode === "validate") {
      validationMessage = await validatePersonalAiConfig(config, status);
    }
    await chrome.storage.local.set({
      ...config,
      personalApiKeyValidated: saveMode === "validate",
      personalApiKeyValidatedAt: saveMode === "validate" ? new Date().toISOString() : "",
      personalApiKeyProviderLabel: getProviderDisplay(config.provider, config.customProviderLabel),
    });
    status.hidden = false;
    status.className = "status is-success";
    status.textContent = validationMessage || "API key tersimpan tanpa validasi.";
    toast(validationMessage || "Pengaturan disimpan", "success");
    await renderActiveApiKeyStatus();
  } catch (e) {
    console.error(e);
    status.className = "status is-error";
    status.textContent = `Validasi gagal: ${e.message}. API key tidak tersimpan.`;
    toast("API key tidak tersimpan", "error");
  }
});

let pendingKnowledgeChunks = [];

async function loadKnowledgeList() {
  const status = $("#knowledgeStatus");
  try {
    const data = await knowledgeApi("list", getKnowledgeAuth());
    renderKnowledgeList(data.chunks || []);
  } catch (e) {
    status.hidden = false;
    status.className = "status is-error";
    status.textContent = "Gagal memuat knowledge: " + e.message;
  }
}

function collectAdminAiForm() {
  const selectedProvider = $("#adminProvider").value;
  const customLabel = $("#adminProviderLabel").value.trim();
  const provider = selectedProvider === "custom" ? normalizeAdminProviderKey(customLabel) : selectedProvider;
  return {
    provider,
    provider_label: customLabel || getAdminProviderMeta(selectedProvider)?.providerLabel || getProviderLabel(selectedProvider),
    base_url: $("#adminBaseUrl").value.trim(),
    api_key: $("#adminApiKey").value.trim(),
    model: $("#adminModel").value.trim(),
    gemini_fallback_api_key: $("#adminGeminiFallbackApiKey").value.trim(),
    gemini_fallback_model: $("#adminGeminiFallbackModel").value.trim() || "gemini-2.0-flash",
  };
}

async function loadAdminAiConfig() {
  const data = await knowledgeApi("get_ai_config");
  const config = data.config;
  state.adminProviders = Array.isArray(data.providers) ? data.providers : [];
  renderAdminProviderOptions(state.adminProviders, config?.provider || "gemini");
  if (!config) {
    $("#adminProviderLabel").value = "";
    $("#adminBaseUrl").value = "";
    $("#adminModel").value = "gemini-2.0-flash";
    $("#adminGeminiFallbackModel").value = "gemini-2.0-flash";
    applyAdminProviderSelection($("#adminProvider").value, $("#adminModel").value.trim());
    return;
  }
  $("#adminProvider").value = config.provider || "gemini";
  $("#adminProviderLabel").value = config.providerLabel || "";
  $("#adminBaseUrl").value = config.baseUrl || "";
  $("#adminModel").value = config.model || "gemini-2.0-flash";
  $("#adminApiKey").value = "";
  $("#adminGeminiFallbackApiKey").value = "";
  $("#adminGeminiFallbackModel").value = config.geminiFallbackModel || "gemini-2.0-flash";
  applyAdminProviderSelection($("#adminProvider").value, $("#adminModel").value.trim());
}

async function handleKnowledgeAdminLogin() {
  const status = $("#knowledgeStatus");
  const credentials = {
    username: $("#knowledgeAdminUser").value.trim(),
    password: $("#knowledgeAdminPassword").value,
  };
  status.hidden = false;
  status.className = "status is-loading";
  status.textContent = "Memeriksa login admin...";
  try {
    await knowledgeApi("login", credentials);
    state.adminBackendAuth = credentials;
    enterKnowledgeAdminMode();
    status.className = "status is-success";
    status.textContent = "Admin aktif. Knowledge bisa dikelola.";
    await loadAdminAiConfig();
    await loadKnowledgeList();
    await loadAdminUsers();
  } catch (e) {
    state.adminBackendAuth = null;
    $("#knowledgeAdminPanel").hidden = true;
    status.className = "status is-error";
    status.textContent = "Login gagal: " + e.message;
  }
}

$("#knowledgeLogin").addEventListener("click", handleKnowledgeAdminLogin);

["knowledgeAdminUser", "knowledgeAdminPassword"].forEach((id) => {
  $("#" + id)?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    handleKnowledgeAdminLogin();
  });
});

$("#loginAdminAccess").addEventListener("click", async () => {
  const status = $("#adminUserAccessStatus");
  const username = $("#adminAccessUsername").value.trim();
  const password = $("#adminAccessPassword").value;
  if (!username || !password) {
    updateSettingsSaveButton();
    showTimedStatus(status, "status is-error", "Username dan password wajib diisi.");
    return;
  }
  status.hidden = false;
  status.className = "status is-loading";
  status.textContent = "Memeriksa akses API key admin...";
  try {
    const deviceId = await getOrCreateDeviceId();
    const data = await knowledgeApi("login_user", {
      username,
      password,
      device_id: deviceId,
    });
    await setStoredAdminUserSession({
      username: data.session?.username || username.toLowerCase(),
      sessionToken: data.session?.sessionToken,
      deviceId: data.session?.deviceId || deviceId,
      expiresAt: data.session?.expiresAt || null,
    });
    $("#adminAccessPassword").value = "";
    showTimedStatus(status, "status is-success", "Akses API key admin aktif.", 3000);
    await refreshAdminAccessUi();
    await renderActiveApiKeyStatus();
  } catch (e) {
    updateSettingsSaveButton();
    showTimedStatus(status, "status is-error", getAdminAccessHelpText(String(e.message || e)));
  }
});

$("#logoutAdminAccess").addEventListener("click", async () => {
  const status = $("#adminUserAccessStatus");
  const session = await getStoredAdminUserSession();
  try {
    if (session?.username) {
      await knowledgeApi("logout_user", {
        username: session.username,
      });
    }
  } catch (_error) {
    // best effort
  }
  await clearStoredAdminUserSession();
  renderAdminAccessSession(null);
  $("#adminAccessUsername").value = "";
  $("#adminAccessPassword").value = "";
  status.hidden = false;
  status.className = "status";
  status.textContent = "Akses API key admin telah keluar.";
  await renderActiveApiKeyStatus();
});

$("#saveAdminApiKey").addEventListener("click", async () => {
  const status = $("#knowledgeStatus");
  let config;
  try {
    config = collectAdminAiForm();
    if ($("#adminProvider").value === "custom" && !config.provider) {
      throw new Error("Nama provider custom wajib diisi");
    }
    if ($("#adminProvider").value === "custom" && !config.base_url) {
      throw new Error("Endpoint URL provider custom wajib diisi");
    }
  } catch (e) {
    status.hidden = false;
    status.className = "status is-error";
    status.textContent = e.message;
    return;
  }
  const providerLabel = getProviderLabel(config.provider, config.provider_label);
  const saveMode = await askApiKeySaveMode();
  if (saveMode === "cancel") {
    status.className = "status";
    status.textContent = "API key admin tidak disimpan. Pengaturan lama tetap digunakan.";
    toast("API key admin tidak disimpan", "error");
    return;
  }
  try {
    status.hidden = false;
    status.className = "status is-loading";
    if (saveMode === "validate") {
      status.textContent = `Memvalidasi ${providerLabel}...`;
      await knowledgeApi("validate_ai_config", {
        ...getKnowledgeAuth(),
        config,
      });
    }
    status.textContent = "Menyimpan API key admin...";
    const data = await knowledgeApi("save_ai_config", {
      ...getKnowledgeAuth(),
      config,
    });
    state.adminProviders = Array.isArray(data.providers) ? data.providers : state.adminProviders;
    renderAdminProviderOptions(state.adminProviders, data.config?.provider || config.provider);
    $("#adminProvider").value = data.config?.provider || config.provider;
    $("#adminProviderLabel").value = data.config?.providerLabel || config.provider_label || "";
    $("#adminBaseUrl").value = data.config?.baseUrl || config.base_url || "";
    $("#adminModel").value = data.config?.model || config.model || "";
    $("#adminApiKey").value = "";
    $("#adminGeminiFallbackApiKey").value = "";
    $("#adminGeminiFallbackModel").value =
      data.config?.geminiFallbackModel || config.gemini_fallback_model || "gemini-2.0-flash";
    applyAdminProviderSelection($("#adminProvider").value, $("#adminModel").value.trim());
    status.className = "status is-success";
    status.textContent = saveMode === "validate"
      ? `${providerLabel} aktif. API key admin tersimpan.`
      : "API key admin tersimpan tanpa validasi.";
    toast(status.textContent, "success");
    await renderActiveApiKeyStatus();
  } catch (e) {
    status.className = "status is-error";
    status.textContent = saveMode === "validate"
      ? `Validasi admin gagal: ${e.message}. API key tidak tersimpan.`
      : "Gagal simpan API key admin: " + e.message;
  }
});

$("#resetAdminApiKey").addEventListener("click", async () => {
  const status = $("#knowledgeStatus");
  const selectedProvider = $("#adminProvider").value;
  const providerKey =
    selectedProvider === "custom"
      ? normalizeAdminProviderKey($("#adminProviderLabel").value.trim())
      : selectedProvider;
  if (!providerKey) {
    status.hidden = false;
    status.className = "status is-error";
    status.textContent = "Pilih provider admin yang ingin direset.";
    return;
  }
  status.hidden = false;
  status.className = "status is-loading";
  status.textContent = `Mereset ${getProviderLabel(providerKey, $("#adminProviderLabel").value.trim())}...`;
  try {
    const data = await knowledgeApi("reset_ai_config", {
      ...getKnowledgeAuth(),
      provider: providerKey,
    });
    state.adminProviders = Array.isArray(data.providers) ? data.providers : state.adminProviders;
    renderAdminProviderOptions(state.adminProviders, data.config?.provider || providerKey);
    $("#adminProvider").value = data.config?.provider || providerKey;
    $("#adminProviderLabel").value = data.config?.providerLabel || getAdminProviderMeta(providerKey)?.providerLabel || "";
    $("#adminBaseUrl").value = data.config?.baseUrl || getAdminProviderMeta(providerKey)?.baseUrl || "";
    $("#adminModel").value = data.config?.model || getAdminProviderMeta(providerKey)?.model || "";
    $("#adminApiKey").value = "";
    $("#adminGeminiFallbackApiKey").value = "";
    $("#adminGeminiFallbackModel").value =
      data.config?.geminiFallbackModel ||
      getAdminProviderMeta(providerKey)?.geminiFallbackModel ||
      "gemini-2.0-flash";
    applyAdminProviderSelection($("#adminProvider").value, $("#adminModel").value.trim());
    status.className = "status is-success";
    status.textContent = "API key admin berhasil dikosongkan. Silakan isi API key baru.";
    toast("API key admin direset", "success");
    await renderActiveApiKeyStatus();
  } catch (e) {
    status.className = "status is-error";
    status.textContent = "Reset API key admin gagal: " + e.message;
    toast("Reset API key admin gagal", "error");
  }
});

$("#exitKnowledgeAdmin").addEventListener("click", () => {
  exitKnowledgeAdminMode();
  state.adminBackendAuth = null;
  const status = $("#knowledgeStatus");
  status.hidden = true;
});

$("#saveKnowledgeManual").addEventListener("click", async () => {
  const status = $("#knowledgeStatus");
  status.hidden = false;
  status.className = "status is-loading";
  status.textContent = "Menyimpan knowledge manual...";
  try {
    await knowledgeApi("create", {
      ...getKnowledgeAuth(),
      chunk: {
        title: $("#knowledgeTitle").value,
        content: $("#knowledgeContent").value,
        category: $("#knowledgeCategory").value,
        keywords: parseCommaList($("#knowledgeKeywords").value),
        diagnosis_tags: parseCommaList($("#knowledgeDiagnosisTags").value),
        source_name: $("#knowledgeSource").value,
        active: true,
      },
    });
    status.className = "status";
    status.textContent = "Knowledge manual tersimpan.";
    $("#knowledgeTitle").value = "";
    $("#knowledgeContent").value = "";
    await loadKnowledgeList();
  } catch (e) {
    status.className = "status is-error";
    status.textContent = "Gagal simpan: " + e.message;
  }
});

$("#chunkKnowledgePdf").addEventListener("click", async () => {
  const status = $("#knowledgeStatus");
  const file = $("#knowledgePdfFile").files?.[0];
  if (!file) {
    toast("Pilih PDF dulu", "error");
    return;
  }
  status.hidden = false;
  status.className = "status is-loading";
  status.textContent = "Mengekstrak PDF knowledge...";
  try {
    pendingKnowledgeChunks = await extractKnowledgePdfChunks(file);
    renderChunkPreview(pendingKnowledgeChunks);
    $("#saveKnowledgeChunks").disabled = pendingKnowledgeChunks.length === 0;
    status.className = "status";
    status.textContent = `${pendingKnowledgeChunks.length} chunk berhasil dibuat dari PDF.`;
  } catch (e) {
    pendingKnowledgeChunks = [];
    renderChunkPreview([]);
    $("#saveKnowledgeChunks").disabled = true;
    status.className = "status is-error";
    status.textContent = "Gagal ekstrak PDF: " + e.message;
  }
});

$("#saveKnowledgeChunks").addEventListener("click", async () => {
  const status = $("#knowledgeStatus");
  if (!pendingKnowledgeChunks.length) return;
  status.hidden = false;
  status.className = "status is-loading";
  status.textContent = "Menyimpan chunk PDF ke Supabase...";
  try {
    await knowledgeApi("bulk_create", {
      ...getKnowledgeAuth(),
      chunks: pendingKnowledgeChunks,
    });
    status.className = "status";
    status.textContent = `${pendingKnowledgeChunks.length} chunk tersimpan.`;
    pendingKnowledgeChunks = [];
    renderChunkPreview([]);
    $("#saveKnowledgeChunks").disabled = true;
    await loadKnowledgeList();
  } catch (e) {
    status.className = "status is-error";
    status.textContent = "Gagal simpan chunk: " + e.message;
  }
});

$("#refreshKnowledgeList").addEventListener("click", loadKnowledgeList);

$("#showAddAdminUser").addEventListener("click", () => {
  $("#adminUserForm").hidden = false;
  $("#adminUserResetForm").hidden = true;
  $("#newAdminUserUsername").value = "";
  $("#newAdminUserPassword").value = "";
});

$("#cancelAddAdminUser").addEventListener("click", () => {
  $("#adminUserForm").hidden = true;
  $("#newAdminUserUsername").value = "";
  $("#newAdminUserPassword").value = "";
});

$("#saveAdminUser").addEventListener("click", async () => {
  const status = $("#knowledgeStatus");
  const username = $("#newAdminUserUsername").value.trim();
  const password = $("#newAdminUserPassword").value;
  if (!username || !password) {
    status.hidden = false;
    status.className = "status is-error";
    status.textContent = "Username dan password user wajib diisi.";
    return;
  }
  status.hidden = false;
  status.className = "status is-loading";
  status.textContent = "Menyimpan user baru...";
  try {
    await knowledgeApi("create_user", {
      ...getKnowledgeAuth(),
      user: {
        username,
        password,
      },
    });
    $("#adminUserForm").hidden = true;
    $("#newAdminUserUsername").value = "";
    $("#newAdminUserPassword").value = "";
    status.className = "status is-success";
    status.textContent = `User ${username} tersimpan.`;
    await loadAdminUsers();
  } catch (e) {
    status.className = "status is-error";
    status.textContent = "Gagal simpan user: " + e.message;
  }
});

$("#cancelResetAdminUser").addEventListener("click", () => {
  state.adminUserResetTarget = "";
  $("#adminUserResetForm").hidden = true;
  $("#resetAdminUserPassword").value = "";
});

$("#confirmResetAdminUser").addEventListener("click", async () => {
  const status = $("#knowledgeStatus");
  const password = $("#resetAdminUserPassword").value;
  if (!state.adminUserResetTarget) {
    status.hidden = false;
    status.className = "status is-error";
    status.textContent = "User reset tidak ditemukan.";
    return;
  }
  if (!password) {
    status.hidden = false;
    status.className = "status is-error";
    status.textContent = "Password baru wajib diisi.";
    return;
  }
  status.hidden = false;
  status.className = "status is-loading";
  status.textContent = `Mereset password ${state.adminUserResetTarget}...`;
  try {
    await knowledgeApi("reset_user_password", {
      ...getKnowledgeAuth(),
      user: {
        username: state.adminUserResetTarget,
        password,
      },
    });
    $("#adminUserResetForm").hidden = true;
    $("#resetAdminUserPassword").value = "";
    status.className = "status is-success";
    status.textContent = `Password ${state.adminUserResetTarget} diperbarui.`;
    state.adminUserResetTarget = "";
    await loadAdminUsers();
  } catch (e) {
    status.className = "status is-error";
    status.textContent = "Reset password gagal: " + e.message;
  }
});

// ---------------- SOAP: tarik dan insert ----------------
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
        const read = (selector) => {
          const el = document.querySelector(selector);
          return el ? el.value || el.textContent || "" : "";
        };
        const seenKonsultasi = new Set();
        const konsultasi = Array.from(document.querySelectorAll("th, td"))
          .filter((cell) => /^hasil\s+konsultasi$/i.test((cell.innerText || "").trim()))
          .flatMap((headerCell) => {
            const table = headerCell.closest("table");
            const headerRow = headerCell.closest("tr");
            if (!table || !headerRow) return [];
            const index = headerCell.cellIndex;
            return Array.from(table.rows)
              .filter((row) => row.rowIndex > headerRow.rowIndex && /^\d+$/.test((row.cells[0]?.innerText || "").trim()))
              .map((row) => (row.cells[index]?.innerText || "").trim())
              .filter((text) => text && !seenKonsultasi.has(text) && seenKonsultasi.add(text));
          })
          .join("\n");
        const subjektif = read('textarea[name="subjektif"]');
        const objektif = read('textarea[name="objektive"]');
        if (!subjektif && !objektif) return { ok: false };
        return {
          ok: true,
          subjektif,
          objektif,
          assessment: read('textarea[name="assesment"]'),
          planning: read('textarea[name="planning"]'),
          konsultasi,
          vitals: {
            suhu: read('input[name="suhu"]'),
            nadi: read('input[name="nadi"]'),
            tekanandarah: read('input[name="tekanandarah"]'),
            respirasi: read('input[name="respirasi"]'),
            saturasi: read('input[name="saturasi"]'),
          },
        };
      },
    });

    if (!result?.ok) {
      setButtonState(pullSOButton, "error", "Pastikan sudah berada di halaman kajian dokter IGD");
      toast("Pastikan sudah berada di halaman kajian dokter IGD", "error");
      return;
    }

    $("#soSubjektif").value = result.subjektif || "";
    $("#soObjektif").value = result.objektif || "";
    $("#soAssessment").value = result.assessment || "";
    $("#soPlanning").value = result.planning || "";
    $("#soKonsultasi").value = result.konsultasi || "";
    state.soapVitals = result.vitals || {};
    queueAutoGrowTextareas();
    scheduleDraftSave();
    setButtonState(pullSOButton, "success", "Data SOAP Ditarik");
    toast("Data SOAP berhasil ditarik", "success");
  } catch (e) {
    console.error(e);
    setButtonState(pullSOButton, "error", "Pastikan sudah berada di halaman kajian dokter IGD");
    toast("Gagal: " + e.message, "error");
  }
});

const insertSOButton = $("#insertSO");
const insertSOAPRM07Button = $("#insertSOAPRM07");

insertSOButton.addEventListener("click", async () => {
  try {
    const subjektif = $("#soSubjektif").value;
    const objektif = $("#soObjektif").value;
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

insertSOAPRM07Button?.addEventListener("click", async () => {
  try {
    const data = {
      subjektif: $("#soSubjektif").value,
      objektif: $("#soObjektif").value,
      assessment: $("#soAssessment").value,
      planning: $("#soPlanning").value,
      konsultasi: $("#soKonsultasi").value,
      vitals: state.soapVitals,
    };
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("Tab aktif tidak ditemukan");
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (values) => {
        const setVal = (selector, val) => {
          const el = document.querySelector(selector);
          if (!el) return false;
          const proto = Object.getPrototypeOf(el);
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          setter ? setter.call(el, val) : (el.value = val);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        };
        return {
          subjektif: setVal('textarea[name="subjektif"]', values.subjektif),
          objektif: setVal('textarea[name="objektive"]', values.objektif),
          assessment: setVal('textarea[name="assesment"]', values.assessment),
          planning: setVal('textarea[name="planning"]', values.planning),
          konsultasi: setVal('textarea[name="Tindakan"], textarea[name="tindakan"]', values.konsultasi),
          suhu: setVal('input[name="suhu"]', values.vitals?.suhu || ""),
          nadi: setVal('input[name="nadi"]', values.vitals?.nadi || ""),
          tekanandarah: setVal('input[name="tekanandarah"]', values.vitals?.tekanandarah || ""),
          respirasi: setVal('input[name="respirasi"]', values.vitals?.respirasi || ""),
          saturasi: setVal('input[name="saturasi"]', values.vitals?.saturasi || ""),
        };
      },
      args: [data],
    });
    if (result?.subjektif && result?.objektif && result?.assessment && result?.planning && result?.konsultasi && result?.suhu && result?.nadi && result?.tekanandarah && result?.respirasi && result?.saturasi) {
      setButtonState(insertSOAPRM07Button, "success", "SOAP Masuk ke RM 07");
      toast("SOAP dimasukkan ke RM 07", "success");
    } else {
      setButtonState(insertSOAPRM07Button, "error", "Pastikan sudah berada di halaman RM 07");
      toast("Pastikan sudah berada di halaman RM 07", "error");
    }
  } catch (e) {
    console.error(e);
    setButtonState(insertSOAPRM07Button, "error", "Pastikan sudah berada di halaman RM 07");
    toast("Pastikan sudah berada di halaman RM 07", "error");
  }
});

$("#cpptResults")?.addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-dx-action]");
  if (button) applyCpptDiagnosisSuggestion(button);
});

$("#generateCpptDiagnosis")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const defaultText = button.dataset.defaultText || button.textContent;
  button.dataset.defaultText = defaultText;
  const context = collectCpptDiagnosisContext();
  const missing = getMissingCpptDiagnosisContext(context);
  if (missing.length) {
    showCpptDiagnosisStatus("status is-error", `Data belum lengkap: ${missing.join(", ")}.`, 3500);
    button.classList.remove("btn-outline");
    button.classList.add("btn-error");
    button.textContent = "Data belum lengkap";
    clearTimeout(button._stateTimer);
    button._stateTimer = setTimeout(() => {
      button.classList.remove("btn-error");
      button.classList.add("btn-outline");
      button.textContent = defaultText;
    }, 3000);
    return;
  }

  try {
    button.disabled = true;
    button.textContent = "Menganalisis diagnosis...";
    showCpptDiagnosisStatus("status is-loading", "Menganalisis diagnosis dengan AI...", 0);
    const ai = await getEffectiveAiSettings();
    const prompt = formatCpptDiagnosisPrompt(context);
    const text = ai.source === "admin"
      ? await callAdminAiText({ prompt, responseJson: true, responseSchema: cpptDiagnosisSchema, userSession: ai.adminUserSession })
      : await callProviderText({
          provider: ai.provider,
          apiKey: ai.apiKey,
          model: ai.model,
          prompt,
          baseUrl: ai.baseUrl,
          providerLabel: ai.providerLabel,
        });
    const result = normalizeCpptDiagnosisAiResult(parseJsonResponse(text));
    if (![result.saran_dx_utama, result.saran_dx_sekunder].some(isMeaningfulText)) {
      throw new Error("Respons diagnosis kosong dari provider");
    }
    renderCpptDiagnosisSupport(result);
    scheduleDraftSave();
    showCpptDiagnosisStatus("status is-success", "Diagnosis AI selesai dibuat.", 2500);
    toast("Diagnosis AI selesai", "success");
  } catch (e) {
    console.error(e);
    showCpptDiagnosisStatus("status is-error", getAiErrorMessage(e, "Diagnosis dengan AI"), 5000);
    toast("Gagal membuat diagnosis AI", "error");
  } finally {
    button.disabled = false;
    button.classList.remove("btn-error");
    button.classList.add("btn-outline");
    button.textContent = defaultText;
  }
});

$("#usePenunjangSummaryForCppt")?.addEventListener("click", (event) => {
  const button = event.currentTarget;
  const value = normalizeErmText($("#penunjangSummary")?.value || "").trim();
  const target = $('#cpptResults textarea[data-key="penunjang"]');
  if (!value || !target) {
    toast("Belum ada penunjang yang bisa dimasukkan", "error");
    return;
  }
  target.value = value;
  target.dispatchEvent(new Event("input", { bubbles: true }));
  updateCpptPenunjangLinked(value);
  button.classList.remove("btn-outline");
  button.classList.add("btn-success");
  button.textContent = "Sudah masuk ke Tab CPPT";
  clearTimeout(button._stateTimer);
  button._stateTimer = setTimeout(() => {
    button.classList.remove("btn-success");
    button.classList.add("btn-outline");
    button.textContent = "Gunakan";
  }, 2500);
});

// ---------------- CPPT: Akses ----------------
const aksesBtn = $("#aksesCPPT");
const extractBtn = $("#extractCPPT");
const cpptModeSingleBtn = $("#cpptModeSingle");
const cpptModeMultiBtn = $("#cpptModeMulti");
const cpptModeBackBtn = $("#cpptModeBack");

cpptModeSingleBtn?.addEventListener("click", () => {
  state.cpptMode = "single";
  resetCpptAccessState();
  scheduleDraftSave();
});

cpptModeMultiBtn?.addEventListener("click", () => {
  state.cpptMode = "multi";
  resetCpptAccessState();
  scheduleDraftSave();
});

cpptModeBackBtn?.addEventListener("click", () => {
  returnToCpptModeStep();
});

updateCpptControls();

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
      setButtonState(aksesBtn, "error", "CPPT tidak terbaca");
      toast("Pastikan sudah berada di halaman CPPT Ruangan", "error");
      return;
    }
    clearCpptResultFields();
    const source = makeCpptSource(result, state.cpptSources.length + 1);
    if (state.cpptMode === "multi") {
      const duplicate = state.cpptSources.some((item) => item.id === source.id);
      if (duplicate) {
        toast("CPPT ruangan ini sudah pernah diakses", "error");
        return;
      }
      state.cpptSources.push(source);
      combineCpptSources();
    } else {
      state.cpptSources = [source];
      state.cpptText = result.text;
      state.cpptSummary = source.summary;
    }
    renderCpptAccessSummary(state.cpptSummary);
    updateCarePeriodNote(state.cpptSummary);
    renderCpptSourceList();
    const nextText =
      state.cpptMode === "multi" ? `Akses CPPT ${state.cpptSources.length + 1}` : "Akses CPPT";
    aksesBtn.dataset.defaultText = nextText;
    setButtonState(aksesBtn, "success", "CPPT diakses", { duration: 3000 });
    const canProcess =
      state.cpptMode === "multi" ? state.cpptSources.length >= 2 : Boolean(state.cpptText);
    extractBtn.hidden = !canProcess;
    extractBtn.disabled = !canProcess;
    extractBtn.classList.remove("btn-primary", "btn-success", "btn-error");
    extractBtn.classList.add("btn-outline");
    if (state.cpptMode === "multi" && state.cpptSources.length === 1) {
      updateCpptRoomStatus("CPPT diakses. Silakan pindah ke ruangan berikutnya, lalu tekan Akses CPPT 2.");
    } else if (state.cpptMode === "multi" && state.cpptSources.length > 1) {
      updateCpptRoomStatus("CPPT beberapa ruangan sudah digabung. Anda masih dapat akses ruangan berikutnya bila ada.");
    }
    scheduleDraftSave();
    toast("CPPT berhasil di akses", "success");
  } catch (e) {
    console.error(e);
    setButtonState(aksesBtn, "error", "CPPT tidak terbaca");
    toast("Pastikan sudah berada di halaman CPPT Ruangan", "error");
  }
});

// ---------------- CPPT: Extract via Gemini ----------------
extractBtn.addEventListener("click", async () => {
  if (!state.cpptText) {
    toast("Akses CPPT terlebih dahulu", "error");
    return;
  }
  if (state.cpptMode === "multi" && state.cpptSources.length < 2) {
    toast("Akses CPPT minimal 2 ruangan terlebih dahulu", "error");
    return;
  }

  const status = $("#cpptStatus");
  const progress = createAiProgress({
    panel: $("#cpptProgress"),
    bar: $("#cpptProgressBar"),
    text: $("#cpptProgressText"),
    status,
    mirrorLoadingToStatus: false,
  });
  status.hidden = true;
  status.textContent = "";
  extractBtn.disabled = true;

  const systemPrompt =
    `Kamu adalah dokter DPJP yang membuat resume medis pasien dari data CPPT. 

ATURAN PENULISAN (WAJIB):
- Gaya bahasa: SANGAT RINGKAS, PADAT, TELEGRAFIS — seperti catatan medis dokter, bukan paragraf naratif.
- JANGAN menjelaskan, JANGAN menarasikan, JANGAN gunakan kalimat lengkap dengan subjek-predikat seperti "pasien mendapatkan...", "dilakukan...", "menunjukkan...".
- Pisahkan item dengan koma. Tanpa kata penghubung yang tidak perlu.
- Gunakan singkatan medis baku (IV, PO, tpm, mg, mL, g/dL, U/L, mcg/kgBB/menit, dll).
- Gunakan koma desimal Indonesia (mis. 0,1 bukan 0.1) dan titik ribuan (mis. 10.600).
- Untuk nilai lab atau terapi yang berubah gunakan format ASCII nama nilai_awal->nilai_akhir satuan (mis. ureum 154->63 mg/dL). Jangan gunakan simbol panah Unicode.
- Sertakan satuan untuk semua nilai lab/dosis.
- Ambil HANYA data yang bermakna/penting. Abaikan info redundant.
- Field "Operasi/Tindakan" berarti tindakan, prosedur, atau intervensi bermakna selama perawatan, bukan hanya operasi.
- Masukkan bila ada: operasi, tindakan invasif/non-bedah, pemasangan alat (NGT, DC/kateter, dll), transfusi, HD, oksigenasi, nebulisasi, suction, ventilator, EKG, EEG, Echo, endoskopi, atau tindakan/prosedur bermakna lain.
- Jangan masukkan tindakan rutin umum seperti infus biasa, injeksi obat rutin, atau pemberian obat oral biasa kecuali benar-benar merupakan tindakan bermakna.

CONTOH GAYA YANG BENAR:
Penunjang: "Hb 7,1 g/dL, ureum 154->63 mg/dL, SGOT/SGPT 75/134 U/L, USG abdomen: hydrops GB, cholelithiasis, Echo: LVEF 55,64%, TR mild."
Terapi: "Sp. Vascon 0,1 mcg/kgBB/menit, infus NS 14 tpm, Lansoprazole inj 2x30 mg IV, Ceftazidime 2x1 g IV, transfusi PRC 3 kolf/12 jam."

CONTOH GAYA YANG SALAH (jangan tiru):
"Pasien mendapatkan infus NS 14 tpm untuk hidrasi. Dilakukan transfusi PRC sebanyak 3 kolf..."

Berikan output untuk: Pemeriksaan Penunjang Bermakna, Terapi Selama Dirawat, Operasi/Tindakan, Diagnosa Utama, Diagnosa Sekunder, Konsultasi bidang lain, Terapi saat pulang.`;

  const cpptGapPrompt = `
ATURAN KELENGKAPAN CPPT:
- cppt_gaps berisi catatan kelengkapan CPPT, bukan perintah.
- Gunakan bahasa: Pertimbangkan dokumentasi ... bila sesuai klinis.
`;

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
      cppt_gaps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            level: { type: "string" },
            gap: { type: "string" },
            basis: { type: "string" },
            suggestion: { type: "string" },
          },
        },
      },
    },
    required: [
      "penunjang",
      "terapi_dirawat",
      "operasi",
      "dx_utama",
      "dx_sekunder",
      "konsul",
      "terapi_pulang",
      "cppt_gaps",
    ],
  };

  try {
    await progress.setProgress("Menyiapkan CPPT...", 10);
    const ai = await getEffectiveAiSettings();
    await progress.setProgress(
      `Memproses dengan ${ai.source === "admin" ? "API key admin" : getProviderDisplay(ai.provider, ai.providerLabel)}...`,
      25
    );
    const userMsg =
      "Data CPPT:\n\n" +
      state.cpptText +
      "\n\n" +
      cpptGapPrompt +
      "\n\nKembalikan JSON object dengan key PERSIS berikut: penunjang, terapi_dirawat, operasi, dx_utama, dx_sekunder, konsul, terapi_pulang, cppt_gaps. Jangan gunakan key lain. Field operasi harus berisi tindakan/prosedur/intervensi bermakna termasuk NGT, DC, oksigenasi, nebulisasi, EKG, EEG, Echo, transfusi, HD, dan sejenisnya bila ada. Jangan masukkan tindakan rutin umum seperti infus biasa atau injeksi obat rutin. Jika tidak ada data, isi string dengan '-' dan cppt_gaps dengan array kosong.";

    let text;
    await progress.setProgress("Menghubungi AI untuk memproses CPPT...", 45);
    progress.startWaiting("Menunggu respons AI CPPT");
    if (ai.source === "admin") {
      text = await callAdminAiText({
        systemPrompt,
        userPrompt: userMsg,
        responseJson: true,
        responseSchema: schema,
        userSession: ai.adminUserSession,
      });
    } else if (ai.provider === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        ai.model
      )}:generateContent?key=${encodeURIComponent(ai.apiKey)}`;
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
      const endpoint = getProviderEndpoint(ai.provider, ai.baseUrl);
      if (!endpoint) throw new Error("Provider tidak dikenal: " + ai.provider);
      const body = {
        model: ai.model,
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
          Authorization: `Bearer ${ai.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error("API " + res.status + ": " + errText.slice(0, 200));
      }
      const data = parseJsonResponse(await res.text());
      text = data?.choices?.[0]?.message?.content;
    }
    progress.stop();
    if (!text) throw new Error("Respons kosong dari provider");
    await progress.setProgress("Menyusun hasil CPPT...", 94);
    const parsed = parseJsonResponse(text);
    const normalized = normalizeCpptResult(parsed);

    state.cpptResultReady = true;
    updateCpptControls();
    $$("#cpptResults textarea").forEach((ta) => {
      ta.value = normalizeErmText(normalized[ta.dataset.key] ?? "");
      autoGrowTextarea(ta);
    });
    updateCpptPenunjangLinked(normalized.penunjang);
    renderCpptDiagnosisSupport(normalized);

    if (!hasMeaningfulCpptResult(normalized)) {
      updateCpptPenunjangLinked("");
      renderCpptDiagnosisSupport({});
      const keys = Object.keys(parsed || {}).join(", ") || "tidak ada key";
      progress.fail(`Provider merespons sukses, tetapi 7 field kosong/tidak cocok. Key respons: ${keys}`);
      toast("Hasil extract kosong", "error");
    } else {
      const filled = CPPT_CORE_KEYS.filter((key) => isMeaningfulText(normalized[key])).length;
      scheduleDraftSave();
      progress.complete(`Selesai. ${filled}/7 field terisi dan dapat diedit di bawah.`);
      toast("Ekstraksi selesai", "success");
    }
  } catch (e) {
    console.error(e);
    progress.fail(getAiErrorMessage(e, "Proses CPPT dengan AI"));
    toast("Gagal extract", "error");
  } finally {
    updateCpptControls();
  }
});

// ---------------- Tindak Lanjut: Tarik data penunjang PDF ----------------
const pullPenunjangBtn = $("#pullPenunjang");
const summarizePenunjangBtn = $("#summarizePenunjang");
const pullPeriodConfirm = $("#pullPeriodConfirm");
const pullPeriodYes = $("#pullPeriodYes");
const pullPeriodManual = $("#pullPeriodManual");
const pullPeriodNo = $("#pullPeriodNo");
const pullPeriodChoices = $("#pullPeriodChoices");
const pullPeriodCalendar = $("#pullPeriodCalendar");
const pullPeriodApply = $("#pullPeriodApply");
const MIN_PENUNJANG_FILE_SIZE = 10 * 1024;
const DATE_RANGE_WEEKDAYS = ["Sn", "Sl", "Rb", "Km", "Jm", "Sb", "Mg"];
let dateRangeViewMonth = null;
let dateRangeStart = null;
let dateRangeEnd = null;

function setPullConfirmVisible(visible) {
  if (pullPeriodConfirm) pullPeriodConfirm.hidden = !visible;
}

function sameCalendarDay(a, b) {
  return Boolean(a && b) &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function renderDateRangeMonth(month, title, grid) {
  title.textContent = month.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  grid.replaceChildren();
  DATE_RANGE_WEEKDAYS.forEach((label) => {
    const weekday = document.createElement("span");
    weekday.className = "date-range-weekday";
    weekday.textContent = label;
    grid.append(weekday);
  });

  const firstDayOffset = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  for (let i = 0; i < firstDayOffset; i += 1) {
    const empty = document.createElement("span");
    empty.className = "date-range-empty";
    grid.append(empty);
  }

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const today = new Date();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(month.getFullYear(), month.getMonth(), day);
    const button = document.createElement("button");
    const dateValue = date.getTime();
    button.type = "button";
    button.className = "date-range-day";
    button.dataset.date = String(dateValue);
    button.setAttribute("aria-label", formatDateId(date));
    if (sameCalendarDay(date, today)) button.classList.add("is-today");
    if (dateRangeStart && dateRangeEnd && dateValue >= dateRangeStart.getTime() && dateValue <= dateRangeEnd.getTime()) {
      button.classList.add("is-in-range");
    }
    if (sameCalendarDay(date, dateRangeStart) || sameCalendarDay(date, dateRangeEnd)) {
      button.classList.add("is-endpoint");
    }
    const number = document.createElement("span");
    number.textContent = String(day);
    button.append(number);
    grid.append(button);
  }
}

function renderDateRangePicker() {
  const secondMonth = new Date(dateRangeViewMonth.getFullYear(), dateRangeViewMonth.getMonth() + 1, 1);
  renderDateRangeMonth(dateRangeViewMonth, $("#dateRangeMonthFirst"), $("#dateRangeGridFirst"));
  renderDateRangeMonth(secondMonth, $("#dateRangeMonthSecond"), $("#dateRangeGridSecond"));
  $("#dateRangeStart").textContent = dateRangeStart ? formatDateId(dateRangeStart) : "-";
  $("#dateRangeEnd").textContent = dateRangeEnd ? formatDateId(dateRangeEnd) : "-";
  pullPeriodApply.disabled = !(dateRangeStart && dateRangeEnd);
}

function showManualDateRange() {
  const initialDate = state.cpptSummary?.startDate || new Date();
  dateRangeViewMonth = new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
  dateRangeStart = null;
  dateRangeEnd = null;
  pullPeriodChoices.hidden = true;
  pullPeriodCalendar.hidden = false;
  renderDateRangePicker();
}

function selectDateRangeDay(date) {
  if (!dateRangeStart || dateRangeEnd) {
    dateRangeStart = date;
    dateRangeEnd = null;
  } else if (date.getTime() < dateRangeStart.getTime()) {
    dateRangeEnd = dateRangeStart;
    dateRangeStart = date;
  } else {
    dateRangeEnd = date;
  }
  renderDateRangePicker();
}

pullPenunjangBtn.addEventListener("click", () => {
  pullPeriodChoices.hidden = false;
  pullPeriodCalendar.hidden = true;
  setPullConfirmVisible(true);
});

pullPeriodYes.addEventListener("click", () => pullPenunjangData({ filterByPeriod: true }));
pullPeriodManual.addEventListener("click", showManualDateRange);
pullPeriodNo.addEventListener("click", () => pullPenunjangData({ filterByPeriod: false }));
$("#pullPeriodBack").addEventListener("click", () => {
  pullPeriodCalendar.hidden = true;
  pullPeriodChoices.hidden = false;
});
$("#dateRangePrevious").addEventListener("click", () => {
  dateRangeViewMonth = new Date(dateRangeViewMonth.getFullYear(), dateRangeViewMonth.getMonth() - 2, 1);
  renderDateRangePicker();
});
$("#dateRangeNext").addEventListener("click", () => {
  dateRangeViewMonth = new Date(dateRangeViewMonth.getFullYear(), dateRangeViewMonth.getMonth() + 2, 1);
  renderDateRangePicker();
});
pullPeriodCalendar.addEventListener("click", (event) => {
  const day = event.target.closest(".date-range-day");
  if (day) selectDateRangeDay(new Date(Number(day.dataset.date)));
});
pullPeriodApply.addEventListener("click", () => {
  if (dateRangeStart && dateRangeEnd) {
    pullPenunjangData({ filterByPeriod: false, dateRange: { start: dateRangeStart, end: dateRangeEnd } });
  }
});

async function pullPenunjangData({ filterByPeriod, dateRange = null }) {
  setPullConfirmVisible(false);
  const status = $("#penunjangStatus");
  status.hidden = false;
  status.className = "status is-loading";
  status.textContent = dateRange
    ? "Mencari data HASIL tanggal " + formatDateId(dateRange.start) + " - " + formatDateId(dateRange.end) + "..."
    : filterByPeriod
      ? "Mencari data HASIL sesuai periode rawat inap..."
      : "Mencari dan membuka seluruh data HASIL...";
  pullPenunjangBtn.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("Tab aktif tidak ditemukan");

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        let wrapper = document.querySelector("#DataTables_Table_1_wrapper");
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const setSelectValue = (select, value) => {
          if (!select) return false;
          const option = Array.from(select.options || []).find((item) => item.value === value);
          if (!option) return false;
          select.value = value;
          select.dispatchEvent(new Event("input", { bubbles: true }));
          select.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        };
        const lengthSelect =
          document.querySelector('select[name="DataTables_Table_1_length"]') ||
          wrapper?.querySelector?.('select[name$="_length"]') ||
          document.querySelector("#DataTables_Table_1_length select");
        if (setSelectValue(lengthSelect, "50")) {
          await wait(650);
          wrapper = document.querySelector("#DataTables_Table_1_wrapper");
        }
        const table = wrapper?.querySelector?.("table");
        const bodyRows = Array.from(table?.querySelectorAll?.("tbody tr") || []).filter((row) => {
          const style = window.getComputedStyle(row);
          return style.display !== "none" && style.visibility !== "hidden";
        });

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
        for (let i = 0; i < bodyRows.length; i += 1) {
          const tr = bodyRows[i];
          const label = Array.from(tr.querySelectorAll("label.btn-xs.btn-success")).find(
            (el) => (el.textContent || "").trim().toUpperCase() === "HASIL"
          );
          if (!label) continue;
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
        return { total: bodyRows.length, rows };
      },
    });

    let candidateRows = (result?.rows || []).filter((row) => row.ok && row.url);
    if (dateRange) {
      candidateRows = candidateRows.filter((row) => isWithinDateRange(row.resultDate, dateRange.start, dateRange.end));
    } else if (filterByPeriod) {
      candidateRows = candidateRows.filter((row) => isWithinCarePeriod(row.resultDate));
    }
    const okRows = [];
    const smallRows = [];
    const failedRows = (result?.rows || []).filter((row) => !row.ok);
    for (const row of candidateRows) {
      try {
        const response = await fetch(row.url, { credentials: "include" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (blob.size <= MIN_PENUNJANG_FILE_SIZE) {
          smallRows.push({ ...row, ok: false, size: blob.size, error: "Ukuran file kurang dari 10 KB" });
          continue;
        }
        const arrayBuffer = await blob.arrayBuffer();
        const mimeType = blob.type || response.headers.get("content-type") || "application/pdf";
        const htmlText = !isPdfArrayBuffer(arrayBuffer) ? new TextDecoder().decode(arrayBuffer) : "";
        const base64 = arrayBufferToBase64(arrayBuffer);
        okRows.push({
          ...row,
          size: blob.size,
          mimeType,
          arrayBuffer,
          base64,
          htmlText,
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
        `${smallRows.length ? `, ${smallRows.length} diabaikan karena kurang dari 10 KB` : ""}` +
        `${failedRows.length ? `, ${failedRows.length} gagal` : ""}.`;
      if (smallRows.length) {
        toast(`${smallRows.length} data penunjang diabaikan karena ukuran file kurang dari 10 KB`, "error");
      } else {
        toast("Data penunjang berhasil ditarik", "success");
      }
    } else if (okRows.length > 0) {
      status.className = "status";
      status.textContent =
        "Data sudah pernah ditarik, tidak ada data baru." +
        `${smallRows.length ? ` ${smallRows.length} data diabaikan karena kurang dari 10 KB.` : ""}`;
      toast(
        smallRows.length
          ? `${smallRows.length} data penunjang diabaikan karena ukuran file kurang dari 10 KB`
          : "Tidak ada data baru",
        smallRows.length ? "error" : "success"
      );
    } else if (smallRows.length > 0) {
      status.className = "status is-error";
      status.textContent = "Data penunjang ditemukan, tetapi semuanya kurang dari 10 KB. Tidak dimasukkan.";
      toast(`${smallRows.length} data penunjang diabaikan karena ukuran file kurang dari 10 KB`, "error");
    } else if (result?.total) {
      status.className = "status is-error";
      status.textContent = dateRange
        ? "Tidak ada data HASIL dalam rentang tanggal yang dipilih."
        : filterByPeriod
          ? "Tidak ada data HASIL dalam periode rawat inap."
          : "Label HASIL ditemukan, tetapi PDF belum bisa diambil. Pastikan tombol HASIL berisi link PDF.";
      toast("PDF tidak berhasil ditarik", "error");
    } else {
      status.className = "status is-error";
      status.textContent = "Pastikan sudah di halaman Riwayat pada halaman awal RM Pasien";
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
  const status = $("#penunjangStatus");
  const progress = createAiProgress({
    panel: $("#penunjangProgress"),
    bar: $("#penunjangProgressBar"),
    text: $("#penunjangProgressText"),
    status,
  });

  if (!state.penunjangFiles.length) {
    toast("Tarik data penunjang terlebih dahulu", "error");
    return;
  }

  status.hidden = false;
  status.className = "status is-loading";
  summarizePenunjangBtn.disabled = true;

  try {
    await progress.setProgress(`Memproses ${state.penunjangFiles.length} data penunjang...`, 10);
    const ai = await getEffectiveAiSettings();
    await progress.setProgress("Menyiapkan data penunjang...", 22);
    let summary = "";

    if (ai.source === "admin") {
      await progress.setProgress("Mencoba parser lokal PDF.js untuk API key admin...", 35);
      const parsedDocs = await parsePenunjangFilesWithPdfJs(state.penunjangFiles);
      await progress.setProgress("Merangkum dengan API key admin...", 60);
      progress.startWaiting("Menunggu respons AI penunjang");
      summary = await callAdminAiText({
        systemPrompt: penunjangSystemPrompt,
        userPrompt:
          "Rangkum pemeriksaan penunjang bermakna dari hasil ekstraksi PDF berikut. Data identitas pasien sudah dihilangkan; gunakan hanya data klinis bermakna:\n\n" +
          JSON.stringify(parsedDocs),
        userSession: ai.adminUserSession,
      });
      progress.stop();
    } else if (ai.provider === "gemini") {
      await progress.setProgress("Mengekstrak PDF lokal sebelum dikirim ke Gemini...", 35);
      const parsedDocs = await parsePenunjangFilesWithPdfJs(state.penunjangFiles);
      await progress.setProgress("Merangkum data penunjang tersanitasi dengan Gemini...", 60);
      progress.startWaiting("Menunggu respons AI penunjang");
      summary = await callGeminiForPenunjangParsedDocs({
        apiKey: ai.apiKey,
        model: ai.model,
        parsedDocs,
      });
      progress.stop();
    } else {
      await progress.setProgress("Mencoba parser lokal PDF.js...", 35);
      const parsedDocs = await parsePenunjangFilesWithPdfJs(state.penunjangFiles);
      try {
        const providerLabel = getProviderDisplay(ai.provider, ai.providerLabel);
        await progress.setProgress(`PDF berhasil diekstrak dan disanitasi. Merangkum dengan ${providerLabel}...`, 60);
        progress.startWaiting("Menunggu respons AI penunjang");
        summary = await callOpenAiCompatibleForPenunjang({
          provider: ai.provider,
          apiKey: ai.apiKey,
          model: ai.model,
          parsedDocs,
          baseUrl: ai.baseUrl,
          providerLabel: ai.providerLabel,
        });
        progress.stop();
      } catch (primaryError) {
        progress.stop();
        if (!ai.geminiFallbackApiKey) {
          throw new Error(
            `${getProviderDisplay(ai.provider, ai.providerLabel)} gagal: ${primaryError.message}. Gemini API fallback belum diisi.`
          );
        }
        await progress.setProgress(`Gagal menggunakan ${getProviderDisplay(ai.provider, ai.providerLabel)}. Melanjutkan dengan Gemini API fallback memakai data tersanitasi...`, 68);
        progress.startWaiting("Menunggu respons Gemini fallback");
        summary = await callGeminiForPenunjangParsedDocs({
          apiKey: ai.geminiFallbackApiKey,
          model: ai.geminiFallbackModel,
          parsedDocs,
        });
        progress.stop();
      }
    }

    await progress.setProgress("Menyusun rangkuman penunjang...", 94);
    $("#penunjangSummary").value = formatPenunjangSummary(summary);
    queueAutoGrowTextareas();
    scheduleDraftSave();
    progress.complete("Selesai. Rangkuman dapat diedit di field Pemeriksaan Penunjang Bermakna.");
    toast("Rangkuman penunjang selesai", "success");
  } catch (e) {
    console.error(e);
    progress.fail(getAiErrorMessage(e, "Rangkuman penunjang"));
    toast("Gagal merangkum", "error");
  } finally {
    summarizePenunjangBtn.disabled = state.penunjangFiles.length === 0;
  }
});

// ---------------- CPPT: Masukkan Detail ke halaman ----------------
$("#insertCPPT").addEventListener("click", async () => {
  if (!window.confirm("Apakah semua data sudah benar?")) return;
  try {
    const getVal = (key) =>
      normalizeErmText(document.querySelector(`#cpptResults textarea[data-key="${key}"]`)?.value ?? "");
    const payload = {
      an: getVal("penunjang"),
      af: getVal("terapi_dirawat"),
      a: getVal("operasi"),
      b: getVal("dx_utama"),
      c: getVal("dx_sekunder"),
      d: getVal("konsul"),
      e: getVal("terapi_pulang"),
    };
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
        const findResumeField = (name) => {
          const fields = [
            ...document.querySelectorAll(`input[name="${name}"], textarea[name="${name}"]`),
          ];
          return (
            fields.find(
              (el) =>
                el.type !== "hidden" &&
                !el.disabled &&
                !el.readOnly &&
                Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
            ) ||
            fields.find((el) => el.type !== "hidden" && !el.disabled && !el.readOnly) ||
            fields[0]
          );
        };
        const found = {};
        for (const [name, val] of Object.entries(data)) {
          const el = findResumeField(name);
          found[name] = setVal(el, val);
        }
        return found;
      },
      args: [payload],
    });
    const missing = Object.entries(result).filter(([, ok]) => !ok).map(([k]) => k);
    if (missing.length === 0) toast("Detail CPPT dimasukkan", "success");
    else toast("Pastikan anda sudah berada di Halaman Pengeditan Resume Medis", "error");
  } catch (e) {
    console.error(e);
    toast("Gagal: " + e.message, "error");
  }
});

// ---------------- Tindak Lanjut: Masukkan penunjang ke resume ----------------
$("#insertPenunjangResume").addEventListener("click", async () => {
  try {
    const value = normalizeErmText($("#penunjangSummary").value);
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
        const fields = [...document.querySelectorAll('input[name="an"], textarea[name="an"]')];
        const el =
          fields.find(
            (field) =>
              field.type !== "hidden" &&
              !field.disabled &&
              !field.readOnly &&
              Boolean(field.offsetWidth || field.offsetHeight || field.getClientRects().length)
          ) ||
          fields.find((field) => field.type !== "hidden" && !field.disabled && !field.readOnly) ||
          fields[0];
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

// ---------------- Analisa: Kelayakan klaim BPJS ----------------
$("#analyzeClaimBpjs").addEventListener("click", async () => {
  const status = $("#claimStatus");
  const progress = $("#claimProgress");
  const progressBar = $("#claimProgressBar");
  const progressText = $("#claimProgressText");
  const result = $("#claimAnalysisResult");
  const button = $("#analyzeClaimBpjs");
  const progressCtl = createAiProgress({
    panel: progress,
    bar: progressBar,
    text: progressText,
    status,
  });
  button.disabled = true;
  result.hidden = true;
  result.textContent = "";
  state.claimAnalysisRaw = null;
  scheduleDraftSave();

  try {
    await progressCtl.setProgress("Membaca form extension...", 8);
    const resume = collectResumeForClaimAnalysis();
    await progressCtl.setProgress("Memeriksa Subjektif...", 18);
    await progressCtl.setProgress("Memeriksa Objektif...", 28);
    await progressCtl.setProgress("Memeriksa Rangkuman CPPT...", 42);
    await progressCtl.setProgress("Memeriksa Penunjang...", 55);
    await progressCtl.setProgress("Memeriksa Knowledge...", 68);
    const keywords = extractClaimKeywords(resume);
    const knowledge = await knowledgeApi("search", { keywords });
    const chunks = (knowledge.chunks || []).slice(0, 8);
    let compactResume = compactResumeForClaim(resume, false);
    let compactChunks = compactKnowledgeChunks(chunks, false);
    let prompt = formatClaimAnalysisPrompt(compactResume, compactChunks);
    if (prompt.length > 14000) {
      await progressCtl.setProgress("Data analisa besar. Menggunakan mode ringkas otomatis...", 72);
      compactResume = compactResumeForClaim(resume, true);
      compactChunks = compactKnowledgeChunks(chunks.slice(0, 5), true);
      prompt = formatClaimAnalysisPrompt(compactResume, compactChunks);
    }

    await progressCtl.setProgress(`Proses Analisa dengan AI memakai ${compactChunks.length} knowledge relevan...`, 78);
    progressCtl.startWaiting("Proses Analisa dengan AI");
    const ai = await getEffectiveAiSettings();
    const analysis =
      ai.source === "admin"
        ? await callAdminAiText({ prompt, responseJson: true, userSession: ai.adminUserSession })
        : await callProviderText({
            provider: ai.provider,
            apiKey: ai.apiKey,
            model: ai.model,
            prompt,
            baseUrl: ai.baseUrl,
            providerLabel: ai.providerLabel,
          });
    if (!analysis.trim()) throw new Error("Respons analisa kosong dari provider");

    progressCtl.stop();
    await progressCtl.setProgress("Hampir selesai...", 96);
    const parsed = parseJsonResponse(analysis);
    renderClaimAnalysis(parsed);
    progressCtl.complete("Analisa telah selesai.");
    toast("Analisa klaim selesai", "success");
  } catch (e) {
    console.error(e);
    progressCtl.fail(getAiErrorMessage(e, "Analisa klaim"));
    toast("Gagal analisa klaim", "error");
  } finally {
    button.disabled = false;
  }
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  autoGrowTextarea(target);
  if (
    target.matches(
      "#soSubjektif, #soObjektif, #soAssessment, #soPlanning, #soKonsultasi, #penunjangSummary, #cpptResults textarea"
    )
  ) {
    scheduleDraftSave();
  }
});

async function handleRestoreDraftClick(event) {
  const button = event.currentTarget;
  setButtonState(button, "primary", "Memulihkan...");
  try {
    const restored = await restoreCurrentPatientDraft();
    setButtonState(button, restored ? "success" : "error", restored ? "Dipulihkan" : "Tidak ada draft");
  } catch (error) {
    console.error(error);
    setButtonState(button, "error", "Gagal memulihkan");
    toast("Gagal memulihkan draft", "error");
  }
}

$("#restoreDraftBanner")?.addEventListener("click", handleRestoreDraftClick);

$("#clearDraftBanner")?.addEventListener("click", () => {
  clearCurrentPatientDraft().catch((error) => {
    console.error(error);
    toast("Gagal menghapus draft", "error");
  });
});


queueAutoGrowTextareas();

initDraftSystem().catch((error) => {
  console.error("Gagal memulai autosave draft", error);
  updateDraftUi("Autosave draft belum aktif. Muat ulang extension bila perlu.");
});
