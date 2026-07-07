(function () {
  const TARGETS = [
    {
      name: "ab",
      title: "Perbaiki anamnesis",
      placeholder: "Isi arahan, misal: anemia",
      waitingLabel: "Memproses anamnesis dengan AI",
      emptyMessage: "Isi arahan terlebih dahulu, misal: anemia, dehidrasi, pneumonia.",
    },
    {
      name: "ae",
      title: "Perbaiki px fisik",
      placeholder: "Isi arahan, misal: anemia",
      waitingLabel: "Memproses px fisik dengan AI",
      emptyMessage: "Isi arahan terlebih dahulu, misal: anemia, sesak, edema.",
    },
  ];

  function isEligiblePage() {
    return /\/resumepulang\//i.test(location.href) || /\/pemeriksaanranap\//i.test(location.href);
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

  function setValue(element, value) {
    const proto = Object.getPrototypeOf(element);
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter ? setter.call(element, value) : (element.value = value);
    autoGrowTextarea(element);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function createButton(text, variant) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `rmr-inline-btn ${variant}`;
    button.textContent = text;
    return button;
  }

  const AI_SOAP_DISABLED_TITLE = "Harap lengkapi tab SOAP dan CPPT untuk memakai AI Powered SOAP. Penunjang opsional.";

  function extractPatientDraftId(url) {
    const text = String(url || "");
    const patterns = [/\/pemeriksaanranap\/([^/?#]+)/i, /\/erm\/(?:c_labpk|r_labpk|c_radiologi|r_radiologi)\/([^/?#]+)/i];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1];
    }
    return "";
  }

  function readValue(selector) {
    const el = document.querySelector(selector);
    return el ? el.value || el.textContent || "" : "";
  }

  function readPageSoapData() {
    return {
      subjektif: readValue('textarea[name="subjektif"]'),
      objektif: readValue('textarea[name="objektive"]'),
      assessment: readValue('textarea[name="assesment"]'),
      planning: readValue('textarea[name="planning"]'),
      konsultasi: readValue('textarea[name="Tindakan"], textarea[name="tindakan"]'),
      vitals: {
        suhu: readValue('input[name="suhu"]'),
        nadi: readValue('input[name="nadi"]'),
        tekanandarah: readValue('input[name="tekanandarah"]'),
        respirasi: readValue('input[name="respirasi"]'),
        saturasi: readValue('input[name="saturasi"]'),
      },
    };
  }

  function fieldSelector(field) {
    const key = String(field || "").toLowerCase();
    const map = {
      subjektif: 'textarea[name="subjektif"]',
      objektif: 'textarea[name="objektive"]',
      objective: 'textarea[name="objektive"]',
      assessment: 'textarea[name="assesment"]',
      assesment: 'textarea[name="assesment"]',
      planning: 'textarea[name="planning"]',
      konsultasi: 'textarea[name="Tindakan"], textarea[name="tindakan"]',
      tindakan: 'textarea[name="Tindakan"], textarea[name="tindakan"]',
    };
    return map[key] || "";
  }

  function appendValue(selector, value) {
    const el = document.querySelector(selector);
    const text = String(value || "").trim();
    if (!el || !text) return;
    const current = String(el.value || "").trim();
    setValue(el, [current, text].filter(Boolean).join("\n"));
  }

  async function getAiSoapReadiness() {
    const patientId = extractPatientDraftId(location.href);
    if (!patientId) return null;
    const key = "aiPoweredSoap:" + patientId;
    const data = await chrome.storage.local.get([key]);
    return data[key] || null;
  }

  function setAiSoapReady(root, button, readiness) {
    const ready = Boolean(readiness?.soapReady && readiness?.cpptReady);
    root._aiSoapReadiness = readiness;
    root.title = ready ? "" : AI_SOAP_DISABLED_TITLE;
    button.disabled = !ready;
    button.title = ready ? "AI Powered SOAP" : AI_SOAP_DISABLED_TITLE;
  }

  function renderAiSoapResult(root, result) {
    root._aiSoapResult = result;
    const draftBox = root.querySelector(".rmr-ai-soap-draft");
    const confirmBox = root.querySelector(".rmr-ai-soap-confirmations");
    const reason = root.querySelector(".rmr-ai-soap-reason");
    const draft = result?.draft || {};
    draftBox.hidden = false;
    draftBox.textContent = "";
    ["subjektif", "objektif", "assessment", "planning"].forEach((field) => {
      const label = document.createElement("label");
      label.className = "rmr-ai-soap-field";
      const title = document.createElement("span");
      title.textContent = field;
      const textarea = document.createElement("textarea");
      textarea.dataset.soapDraft = field;
      textarea.rows = 3;
      textarea.value = String(draft[field] || "");
      autoGrowTextarea(textarea);
      label.append(title, textarea);
      draftBox.append(label);
    });
    reason.hidden = !result?.reason;
    reason.textContent = result?.reason || "";
    const confirmations = Array.isArray(result?.confirmations) ? result.confirmations : [];
    confirmBox.hidden = confirmations.length === 0;
    confirmBox.textContent = "";
    confirmations.forEach((item, index) => {
      const label = document.createElement("label");
      label.className = "rmr-ai-soap-check";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.confirmIndex = String(index);
      const text = document.createElement("span");
      text.textContent = item.label;
      label.append(checkbox, text);
      confirmBox.append(label);
    });
    root.querySelector(".rmr-ai-soap-apply").hidden = false;
    queueAutoGrowTextareas(root);
  }

  function applyAiSoapResult(root) {
    const result = root._aiSoapResult || {};
    root.querySelectorAll("[data-soap-draft]").forEach((textarea) => {
      const selector = fieldSelector(textarea.dataset.soapDraft);
      const target = selector ? document.querySelector(selector) : null;
      if (target) setValue(target, textarea.value.trim());
    });
    const vitals = result.draft?.vitals || {};
    Object.entries({ suhu: "suhu", nadi: "nadi", tekanandarah: "tekanandarah", respirasi: "respirasi", saturasi: "saturasi" }).forEach(([key, name]) => {
      if (vitals[key]) {
        const el = document.querySelector(`input[name="${name}"]`);
        if (el) setValue(el, vitals[key]);
      }
    });
    const confirmations = Array.isArray(result.confirmations) ? result.confirmations : [];
    root.querySelectorAll("[data-confirm-index]:checked").forEach((checkbox) => {
      const item = confirmations[Number(checkbox.dataset.confirmIndex)];
      const selector = fieldSelector(item?.target_field);
      if (selector) appendValue(selector, item.insert_text);
    });
  }

  function createAiPoweredSoapUi() {
    const subjektif = document.querySelector('textarea[name="subjektif"]');
    if (!subjektif || document.querySelector(".rmr-ai-soap-root")) return;
    const root = document.createElement("div");
    root.className = "rmr-ai-soap-root";
    const button = createButton("AI Powered SOAP", "rmr-inline-btn-primary");
    button.classList.add("rmr-ai-soap-main");
    const panel = document.createElement("div");
    panel.className = "rmr-inline-panel rmr-ai-soap-panel";
    panel.hidden = true;
    panel.innerHTML = [
      '<div class="rmr-inline-label">AI Powered SOAP</div>',
      '<textarea class="rmr-inline-input rmr-ai-soap-diagnosis" rows="2" placeholder="Diagnosis target, contoh: pneumonia"></textarea>',
      '<div class="rmr-inline-status" hidden></div>',
      '<div class="rmr-ai-soap-reason" hidden></div>',
      '<div class="rmr-ai-soap-draft" hidden></div>',
      '<div class="rmr-ai-soap-confirmations" hidden></div>',
      '<div class="rmr-inline-actions"><button class="rmr-inline-btn rmr-inline-btn-primary rmr-ai-soap-generate" type="button">Buat Draft</button><button class="rmr-inline-btn rmr-inline-btn-primary rmr-ai-soap-apply" type="button" hidden>Masukkan yang Disetujui ke RM 07</button><button class="rmr-inline-btn rmr-inline-btn-secondary rmr-ai-soap-close" type="button">Tutup</button></div>',
    ].join("");
    root.append(button, panel);
    const anchor = subjektif.closest("label, .form-group, .row, tr") || subjektif;
    anchor.parentNode.insertBefore(root, anchor);
    queueAutoGrowTextareas(root);

    const status = panel.querySelector(".rmr-inline-status");
    const showStatus = (message, kind) => {
      status.hidden = false;
      status.className = `rmr-inline-status ${kind ? `is-${kind}` : ""}`.trim();
      status.textContent = message;
    };
    const refresh = () => getAiSoapReadiness().then((readiness) => setAiSoapReady(root, button, readiness));
    refresh();
    chrome.storage.onChanged.addListener(refresh);

    button.addEventListener("click", () => {
      if (button.disabled) return;
      panel.hidden = !panel.hidden;
      if (!panel.hidden) panel.querySelector(".rmr-ai-soap-diagnosis").focus();
    });
    panel.querySelector(".rmr-ai-soap-close").addEventListener("click", () => {
      panel.hidden = true;
    });
    panel.querySelector(".rmr-ai-soap-generate").addEventListener("click", async () => {
      const diagnosis = panel.querySelector(".rmr-ai-soap-diagnosis").value.trim();
      if (!diagnosis) {
        showStatus("Isi diagnosis target terlebih dahulu.", "error");
        return;
      }
      const readiness = await getAiSoapReadiness();
      setAiSoapReady(root, button, readiness);
      if (button.disabled) {
        showStatus(AI_SOAP_DISABLED_TITLE, "error");
        return;
      }
      showStatus("Memproses AI Powered SOAP...", "loading");
      try {
        const response = await chrome.runtime.sendMessage({
          type: "AI_POWERED_SOAP",
          targetDiagnosis: diagnosis,
          pageData: readPageSoapData(),
          context: readiness.context || {},
        });
        if (!response?.ok) throw new Error(response?.error || "AI Powered SOAP gagal.");
        renderAiSoapResult(root, response.data);
        showStatus("Draft siap. Centang data yang dikonfirmasi dokter sebelum memasukkan.", "success");
      } catch (error) {
        showStatus(error instanceof Error ? error.message : String(error), "error");
      }
    });
    panel.querySelector(".rmr-ai-soap-apply").addEventListener("click", () => {
      applyAiSoapResult(root);
      showStatus("SOAP yang disetujui dimasukkan ke RM 07.", "success");
    });
  }
  function createFieldUi(target) {
    const textarea = document.querySelector(`textarea[name="${target.name}"]`);
    if (!textarea || textarea.dataset.rmrImproveReady === "1") return;
    textarea.dataset.rmrImproveReady = "1";

    const wrapper = document.createElement("div");
    wrapper.className = "rmr-inline-wrap";
    textarea.parentNode.insertBefore(wrapper, textarea);
    wrapper.appendChild(textarea);

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "rmr-inline-trigger";
    trigger.textContent = "\u270e";
    trigger.setAttribute("aria-label", target.title);
    wrapper.appendChild(trigger);

    const panel = document.createElement("div");
    panel.className = "rmr-inline-panel";
    panel.hidden = true;

    const title = document.createElement("div");
    title.className = "rmr-inline-label";
    title.textContent = target.title;

    const instruction = document.createElement("textarea");
    instruction.className = "rmr-inline-input";
    instruction.rows = 2;
    instruction.placeholder = target.placeholder;

    const status = document.createElement("div");
    status.className = "rmr-inline-status";
    status.hidden = true;

    const previewLabel = document.createElement("div");
    previewLabel.className = "rmr-inline-label";
    previewLabel.textContent = "Preview hasil AI";
    previewLabel.hidden = true;

    const preview = document.createElement("textarea");
    preview.className = "rmr-inline-preview";
    preview.rows = 6;
    preview.hidden = true;

    const note = document.createElement("div");
    note.className = "rmr-inline-note";
    note.textContent = "Preview wajib diverifikasi dokter sebelum digunakan.";

    const actions = document.createElement("div");
    actions.className = "rmr-inline-actions";

    const improveButton = createButton("Perbaiki dengan AI", "rmr-inline-btn-primary");
    const applyButton = createButton("Gunakan Hasil", "rmr-inline-btn-primary");
    const cancelButton = createButton("Tutup", "rmr-inline-btn-secondary");
    applyButton.hidden = true;

    actions.append(improveButton, applyButton, cancelButton);
    panel.append(title, instruction, status, previewLabel, preview, note, actions);
    wrapper.appendChild(panel);
    queueAutoGrowTextareas(wrapper);

    function showStatus(message, kind) {
      status.hidden = false;
      status.className = `rmr-inline-status ${kind ? `is-${kind}` : ""}`.trim();
      status.textContent = message;
    }

    function resetPreview() {
      preview.hidden = true;
      previewLabel.hidden = true;
      preview.value = "";
      autoGrowTextarea(preview);
      applyButton.hidden = true;
    }

    trigger.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        instruction.focus();
      }
    });

    cancelButton.addEventListener("click", () => {
      panel.hidden = true;
      status.hidden = true;
      resetPreview();
    });

    improveButton.addEventListener("click", async () => {
      const existingText = String(textarea.value || "").trim();
      const userInstruction = String(instruction.value || "").trim();
      resetPreview();

      if (!userInstruction) {
        showStatus(target.emptyMessage, "error");
        instruction.focus();
        return;
      }
      if (!existingText) {
        showStatus(
          target.name === "ab" ? "Isi anamnesis terlebih dahulu." : "Isi pemeriksaan fisik terlebih dahulu.",
          "error"
        );
        return;
      }

      improveButton.disabled = true;
      applyButton.disabled = true;
      showStatus(`${target.waitingLabel}... Proses 30-180 detik tergantung panjang data dan provider.`, "loading");

      try {
        const response = await chrome.runtime.sendMessage({
          type: "IMPROVE_INLINE_FIELD",
          kind: target.name,
          existingText,
          instruction: userInstruction,
        });

        if (!response?.ok) {
          throw new Error(response?.error || "Perbaikan gagal.");
        }

        preview.value = response.text || "";
        autoGrowTextarea(preview);
        preview.hidden = false;
        previewLabel.hidden = false;
        applyButton.hidden = false;
        applyButton.disabled = false;
        showStatus("Preview siap. Periksa dulu sebelum digunakan.", "success");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        showStatus(message, "error");
      } finally {
        improveButton.disabled = false;
      }
    });

    applyButton.addEventListener("click", () => {
      if (!preview.value.trim()) return;
      setValue(textarea, preview.value.trim());
      showStatus("Hasil AI dimasukkan ke field.", "success");
      panel.hidden = true;
    });
  }

  function boot() {
    if (!isEligiblePage()) return;
    TARGETS.forEach(createFieldUi);
    createAiPoweredSoapUi();
    queueAutoGrowTextareas();
  }


  document.addEventListener("input", (event) => {
    autoGrowTextarea(event.target);
  });
  const observer = new MutationObserver(() => boot());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  boot();
})();
