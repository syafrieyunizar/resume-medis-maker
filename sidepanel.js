const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  cpptText: "",
};

// ---------------- Tabs ----------------
$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    $$(".tab").forEach((t) => t.classList.toggle("is-active", t === tab));
    $$(".panel").forEach((p) => {
      const active = p.dataset.panel === target;
      p.classList.toggle("is-active", active);
      p.hidden = !active;
    });
  });
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

// ---------------- Settings ----------------
async function loadSettings() {
  const { apiKey = "", model = "gemini-2.0-flash" } =
    await chrome.storage.local.get(["apiKey", "model"]);
  $("#apiKey").value = apiKey;
  $("#model").value = model;
}
loadSettings();

$("#saveSettings").addEventListener("click", async () => {
  await chrome.storage.local.set({
    apiKey: $("#apiKey").value.trim(),
    model: $("#model").value,
  });
  toast("Pengaturan disimpan", "success");
});

// ---------------- SO: Insert detail ----------------
$("#insertSO").addEventListener("click", async () => {
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
    if (result.a && result.b) toast("Detail dimasukkan", "success");
    else if (result.a || result.b) toast("Sebagian field tidak ditemukan", "error");
    else toast("Field tujuan tidak ditemukan", "error");
  } catch (e) {
    console.error(e);
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
      func: () => {
        const el = document.querySelector("#example1_wrapper > div:nth-child(2) > div");
        return el ? el.innerText : null;
      },
    });
    if (!result) {
      toast("Element CPPT tidak ditemukan di halaman", "error");
      return;
    }
    state.cpptText = result;
    aksesBtn.classList.remove("btn-primary");
    aksesBtn.classList.add("btn-success");
    aksesBtn.textContent = "✓ CPPT Diakses";
    extractBtn.disabled = false;
    toast("CPPT berhasil di akses", "success");
  } catch (e) {
    console.error(e);
    toast("Gagal: " + e.message, "error");
  }
});

// ---------------- CPPT: Extract via Gemini ----------------
extractBtn.addEventListener("click", async () => {
  const { apiKey, model = "gemini-2.0-flash" } = await chrome.storage.local.get([
    "apiKey",
    "model",
  ]);
  if (!apiKey) {
    toast("Isi API Key di tab Setting dulu", "error");
    return;
  }
  if (!state.cpptText) {
    toast("Akses CPPT terlebih dahulu", "error");
    return;
  }

  const status = $("#cpptStatus");
  status.hidden = false;
  status.className = "status is-loading";
  status.textContent = "Memproses dengan Gemini...";
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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "Data CPPT:\n\n" +
                state.cpptText +
                "\n\nKembalikan hasil sebagai JSON sesuai skema. Setiap field berisi rangkuman naratif lengkap dan detail. Jika tidak ada data, isi dengan '-'.",
            },
          ],
        },
      ],
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
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Respons kosong dari Gemini");
    const parsed = JSON.parse(text);

    $("#cpptResults").hidden = false;
    $$("#cpptResults textarea").forEach((ta) => {
      ta.value = parsed[ta.dataset.key] ?? "";
    });

    status.className = "status";
    status.textContent = "Selesai. Hasil dapat diedit di bawah.";
    toast("Ekstraksi selesai", "success");
  } catch (e) {
    console.error(e);
    status.className = "status is-error";
    status.textContent = "Gagal: " + e.message;
    toast("Gagal extract", "error");
  } finally {
    extractBtn.disabled = false;
  }
});

// ---------------- CPPT: Masukkan Detail ke halaman ----------------
$("#insertCPPT").addEventListener("click", async () => {
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