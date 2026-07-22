(function () {
  const TARGETS = [
    {
      name: "ab",
      title: "Perbaiki anamnesis",
      placeholder: "Isi dengan gejala/diagnosis yang ingin ditambahkan",
      waitingLabel: "Memproses anamnesis dengan AI",
      emptyMessage: "Isi dengan gejala/diagnosis yang ingin ditambahkan.",
    },
    {
      name: "ae",
      title: "Perbaiki px fisik",
      placeholder: "Isi dengan gejala/diagnosis yang ingin ditambahkan",
      waitingLabel: "Memproses px fisik dengan AI",
      emptyMessage: "Isi dengan gejala/diagnosis yang ingin ditambahkan.",
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
    trigger.textContent = "\ud83e\udde0";
    trigger.setAttribute("aria-label", target.title);
    trigger.title = target.title;
    wrapper.appendChild(trigger);

    const panel = document.createElement("div");
    panel.className = "rmr-inline-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", target.title);

    const header = document.createElement("div");
    header.className = "rmr-inline-header";

    const title = document.createElement("div");
    title.className = "rmr-inline-label";
    title.textContent = target.title;

    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "rmr-inline-back";
    backButton.textContent = "\u21B6";
    backButton.title = "Kembali untuk mengedit arahan";
    backButton.setAttribute("aria-label", "Kembali untuk mengedit arahan");
    backButton.hidden = true;
    header.append(title);

    const instruction = document.createElement("textarea");
    instruction.className = "rmr-inline-input";
    instruction.rows = 2;
    instruction.placeholder = target.placeholder;

    const status = document.createElement("div");
    status.className = "rmr-inline-status";
    status.hidden = true;

    const questionsLabel = document.createElement("div");
    questionsLabel.className = "rmr-inline-label";
    questionsLabel.textContent = "Konfirmasi yang disarankan AI";
    questionsLabel.hidden = true;

    const questions = document.createElement("textarea");
    questions.className = "rmr-inline-preview";
    questions.readOnly = true;
    questions.hidden = true;

    const suggestionHeader = document.createElement("div");
    suggestionHeader.className = "rmr-inline-suggestion-header";
    suggestionHeader.hidden = true;

    const suggestionLabel = document.createElement("div");
    suggestionLabel.className = "rmr-inline-label";
    suggestionLabel.textContent = "Contoh jawaban AI (bukan data pasien)";

    const useSuggestionButton = createButton("Gunakan", "rmr-inline-btn-primary rmr-inline-btn-small");
    suggestionHeader.append(suggestionLabel, useSuggestionButton);

    const suggestedAnswer = document.createElement("textarea");
    suggestedAnswer.className = "rmr-inline-preview";
    suggestedAnswer.readOnly = true;
    suggestedAnswer.hidden = true;

    const confirmationLabel = document.createElement("div");
    confirmationLabel.className = "rmr-inline-label";
    confirmationLabel.textContent = "Jawaban konfirmasi dokter";
    confirmationLabel.hidden = true;

    const confirmation = document.createElement("textarea");
    confirmation.className = "rmr-inline-input";
    confirmation.rows = 3;
    confirmation.placeholder = "Jawab bebas sesuai hasil konfirmasi kepada pasien atau pemeriksaan dokter.";
    confirmation.hidden = true;

    const previewLabel = document.createElement("div");
    previewLabel.className = "rmr-inline-label";
    previewLabel.textContent = "Preview hasil AI";
    previewLabel.hidden = true;

    const preview = document.createElement("textarea");
    preview.className = "rmr-inline-preview";
    preview.rows = 6;
    preview.hidden = true;

    const generatedWarning = document.createElement("div");
    generatedWarning.className = "rmr-inline-warning";
    generatedWarning.textContent = "\u26A0 AI menyusun hasil dari jawaban konfirmasi dokter. Cocokkan kembali dengan kondisi klinis pasien.";
    generatedWarning.hidden = true;

    const note = document.createElement("div");
    note.className = "rmr-inline-note";
    note.textContent = "Preview wajib diverifikasi dokter sebelum digunakan.";

    const actions = document.createElement("div");
    actions.className = "rmr-inline-actions";

    const askButton = createButton("Saran Tambahan AI", "rmr-inline-btn-primary");
    const improveButton = createButton(
      target.name === "ab" ? "Buat Anamnesis" : "Buat Pemeriksaan Fisik",
      "rmr-inline-btn-primary"
    );
    const applyButton = createButton("Gunakan Hasil", "rmr-inline-btn-primary");
    const cancelButton = createButton("Tutup", "rmr-inline-btn-secondary");
    improveButton.hidden = true;
    applyButton.hidden = true;

    actions.append(askButton, improveButton, applyButton, backButton, cancelButton);
    panel.append(
      header,
      instruction,
      status,
      questionsLabel,
      questions,
      suggestionHeader,
      suggestedAnswer,
      confirmationLabel,
      confirmation,
      previewLabel,
      preview,
      generatedWarning,
      note,
      actions
    );
    wrapper.appendChild(panel);
    queueAutoGrowTextareas(panel);

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
      generatedWarning.hidden = true;
    }

    function resetToInstruction() {
      resetPreview();
      instruction.readOnly = false;
      confirmation.readOnly = false;
      questionsLabel.hidden = true;
      questions.hidden = true;
      suggestionHeader.hidden = true;
      suggestedAnswer.hidden = true;
      confirmationLabel.hidden = true;
      confirmation.hidden = true;
      questions.value = "";
      suggestedAnswer.value = "";
      confirmation.value = "";
      askButton.hidden = false;
      improveButton.hidden = true;
      backButton.hidden = true;
      status.hidden = true;
      instruction.focus();
    }

    trigger.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) instruction.focus();
    });

    backButton.addEventListener("click", resetToInstruction);

    useSuggestionButton.addEventListener("click", () => {
      if (!suggestedAnswer.value.trim()) return;
      setValue(confirmation, suggestedAnswer.value.trim());
      showStatus("Contoh disalin. Sesuaikan dengan jawaban pasien dan hasil pemeriksaan dokter.", "success");
      confirmation.focus();
    });

    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") cancelButton.click();
    });

    cancelButton.addEventListener("click", () => {
      panel.hidden = true;
      status.hidden = true;
      resetPreview();
    });

    askButton.addEventListener("click", async () => {
      const existingText = String(textarea.value || "").trim();
      const userInstruction = String(instruction.value || "").trim();
      resetPreview();
      questionsLabel.hidden = true;
      questions.hidden = true;
      suggestionHeader.hidden = true;
      suggestedAnswer.hidden = true;
      confirmationLabel.hidden = true;
      confirmation.hidden = true;
      questions.value = "";
      suggestedAnswer.value = "";
      confirmation.value = "";
      improveButton.hidden = true;

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

      askButton.disabled = true;
      showStatus("Menyusun pertanyaan konfirmasi...", "loading");
      try {
        const response = await chrome.runtime.sendMessage({
          type: "IMPROVE_INLINE_FIELD",
          phase: "questions",
          kind: target.name,
          existingText,
          instruction: userInstruction,
          anamnesisText: String(document.querySelector('textarea[name="ab"]')?.value || "").trim(),
        });
        if (!response?.ok) throw new Error(response?.error || "Gagal membuat pertanyaan konfirmasi.");

        questions.value = response.questions || "";
        suggestedAnswer.value = response.suggestedAnswer || "";
        autoGrowTextarea(questions);
        autoGrowTextarea(suggestedAnswer);
        instruction.readOnly = true;
        questionsLabel.hidden = false;
        questions.hidden = false;
        suggestionHeader.hidden = !suggestedAnswer.value.trim();
        suggestedAnswer.hidden = !suggestedAnswer.value.trim();
        confirmationLabel.hidden = false;
        confirmation.hidden = false;
        askButton.hidden = true;
        improveButton.hidden = false;
        backButton.hidden = false;
        showStatus("Jawab pertanyaan yang relevan berdasarkan konfirmasi klinis.", "success");
        confirmation.focus();
      } catch (error) {
        showStatus(error instanceof Error ? error.message : String(error), "error");
      } finally {
        askButton.disabled = false;
      }
    });

    improveButton.addEventListener("click", async () => {
      const existingText = String(textarea.value || "").trim();
      const userInstruction = String(instruction.value || "").trim();
      const doctorConfirmation = String(confirmation.value || "").trim();
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
      if (!doctorConfirmation) {
        showStatus("Isi jawaban konfirmasi dokter terlebih dahulu.", "error");
        confirmation.focus();
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
          confirmation: doctorConfirmation,
          anamnesisText: String(document.querySelector('textarea[name="ab"]')?.value || "").trim(),
        });

        if (!response?.ok) {
          throw new Error(response?.error || "Perbaikan gagal.");
        }

        preview.value = response.text || "";
        autoGrowTextarea(preview);
        preview.hidden = false;
        previewLabel.hidden = false;
        generatedWarning.hidden = false;
        confirmation.readOnly = true;
        improveButton.hidden = true;
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

  function getAnonymousPatientIdentity() {
    const text = (document.querySelector(".box-header")?.innerText || "").replace(/\s+/g, " ").trim();
    const gender = /\b(Laki[-\s]?Laki|Perempuan)\b/i.exec(text)?.[1] || "";
    const age = /\b(\d+\s+tahun(?:\s+\d+\s+bulan)?(?:\s+\d+\s+hari)?)\b/i.exec(text)?.[1] || "";
    return [gender, age].filter(Boolean).join(" / ");
  }

  function getSoapFields() {
    return {
      subjektif: document.querySelector('textarea[name="subjektif"]'),
      objektif: document.querySelector('textarea[name="objektive"]'),
      assessment: document.querySelector('textarea[name="assesment"]'),
      planning: document.querySelector('textarea[name="planning"]'),
    };
  }

  function applySoapResult(result) {
    const fields = getSoapFields();
    if (!fields.subjektif || !fields.objektif || !fields.assessment || !fields.planning) {
      throw new Error("Field SOAP halaman tidak ditemukan.");
    }
    setValue(fields.subjektif, result.s || "");
    setValue(fields.objektif, result.o || "");
    setValue(fields.assessment, result.a || "");
    setValue(fields.planning, result.p || "");
  }

  function getSoapStorageKey() {
    return `rmrSoapResult:${location.origin}${location.pathname}${location.search}`;
  }

  function saveSoapResult(result) {
    return chrome.storage.local.set({ [getSoapStorageKey()]: result });
  }

  async function loadSoapResult() {
    return (await chrome.storage.local.get(getSoapStorageKey()))[getSoapStorageKey()] || null;
  }

  function showSoapPreview(result, onApply) {
    document.querySelector(".rmr-soap-preview-modal")?.remove();
    const modal = document.createElement("div");
    modal.className = "rmr-soap-preview-modal";
    modal.innerHTML = `
      <div class="rmr-soap-preview-dialog" role="dialog" aria-modal="true" aria-label="Preview SOAP">
        <div class="rmr-soap-preview-title">Preview SOAP</div>
        <label>S<textarea rows="5" data-soap-key="s"></textarea></label>
        <label>O<textarea rows="7" data-soap-key="o"></textarea></label>
        <div class="rmr-soap-preview-next">
          <button type="button" class="rmr-inline-btn rmr-inline-btn-primary" data-soap-next>Generate A dan P</button>
          <span data-soap-loading hidden>Menyusun A dan P...</span>
        </div>
        <label data-soap-ap hidden>A<textarea rows="3" data-soap-key="a"></textarea></label>
        <label data-soap-ap hidden>P<textarea rows="4" data-soap-key="p"></textarea></label>
        <div class="rmr-inline-actions">
          <button type="button" class="rmr-inline-btn rmr-inline-btn-primary" data-soap-apply hidden>OK, masukkan</button>
          <button type="button" class="rmr-inline-btn rmr-inline-btn-secondary" data-soap-cancel>Batal</button>
        </div>
      </div>`;
    document.body.append(modal);
    ["s", "o", "a", "p"].forEach((key) => {
      const textarea = modal.querySelector(`[data-soap-key="${key}"]`);
      textarea.value = result[key] || "";
      autoGrowTextarea(textarea);
    });
    modal.querySelector("[data-soap-cancel]").addEventListener("click", () => modal.remove());
    modal.querySelector("[data-soap-next]").addEventListener("click", (event) => {
      const button = event.currentTarget;
      const loading = modal.querySelector("[data-soap-loading]");
      button.disabled = true;
      loading.hidden = false;
      setTimeout(() => {
        modal.querySelectorAll("[data-soap-ap]").forEach((element) => (element.hidden = false));
        modal.querySelector("[data-soap-apply]").hidden = false;
        modal.querySelector(".rmr-soap-preview-next").hidden = true;
        queueAutoGrowTextareas(modal);
      }, 700);
    });
    modal.querySelector("[data-soap-apply]").addEventListener("click", async () => {
      const edited = { ...result };
      ["s", "o", "a", "p"].forEach((key) => {
        edited[key] = modal.querySelector(`[data-soap-key="${key}"]`).value.trim();
      });
      await onApply(edited);
      modal.remove();
    });
  }

  function createSoapGeneratorUi() {
    const title = document.querySelector("#muncul1");
    if (!title || title.dataset.rmrSoapGeneratorReady === "1") return;
    if ((title.textContent || "").trim().toUpperCase() !== "SOAP") return;
    title.dataset.rmrSoapGeneratorReady = "1";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "rmr-soap-gen-trigger";
    trigger.textContent = "SOAP generator";
    title.insertAdjacentElement("afterend", trigger);

    const panel = document.createElement("div");
    panel.className = "rmr-soap-gen-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="rmr-soap-gen-identity" data-rmr-soap-identity>Identitas anonim: -</div>
      <textarea class="rmr-inline-input" rows="3" data-rmr-soap-complaint placeholder="Keluhan pasien"></textarea>
      <div class="rmr-inline-status" data-rmr-soap-status hidden></div>
      <div class="rmr-inline-actions">
        <button type="button" class="rmr-inline-btn rmr-inline-btn-primary" data-rmr-soap-generate>Buat SOAP</button>
        <button type="button" class="rmr-inline-btn rmr-inline-btn-secondary" data-rmr-soap-preview hidden>Preview</button>
        <button type="button" class="rmr-inline-btn rmr-inline-btn-secondary" data-rmr-soap-close>Tutup</button>
      </div>`;
    (title.closest(".box-rm03biru") || title.parentElement || title).insertAdjacentElement("afterend", panel);

    const identity = panel.querySelector("[data-rmr-soap-identity]");
    const complaint = panel.querySelector("[data-rmr-soap-complaint]");
    const status = panel.querySelector("[data-rmr-soap-status]");
    const generate = panel.querySelector("[data-rmr-soap-generate]");
    const previewSaved = panel.querySelector("[data-rmr-soap-preview]");

    const refreshSavedPreview = async () => {
      previewSaved.hidden = !(await loadSoapResult());
    };

    const showStatus = (message, kind) => {
      status.hidden = false;
      status.className = `rmr-inline-status ${kind ? `is-${kind}` : ""}`.trim();
      status.textContent = message;
    };

    trigger.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      identity.textContent = `Identitas anonim: ${getAnonymousPatientIdentity() || "tidak terbaca"}`;
      refreshSavedPreview();
      if (!panel.hidden) complaint.focus();
    });
    panel.querySelector("[data-rmr-soap-close]").addEventListener("click", () => {
      panel.hidden = true;
      status.hidden = true;
    });
    previewSaved.addEventListener("click", async () => {
      const saved = await loadSoapResult();
      if (!saved) return;
      showSoapPreview(saved, async (edited) => {
        await saveSoapResult(edited);
        applySoapResult(edited);
        showStatus("SOAP berhasil dimasukkan ke halaman.", "success");
      });
    });
    generate.addEventListener("click", async () => {
      const patientIdentity = getAnonymousPatientIdentity();
      const patientComplaint = complaint.value.trim();
      if (!patientIdentity) {
        showStatus("Umur/jenis kelamin pasien tidak terbaca dari header.", "error");
        return;
      }
      if (!patientComplaint) {
        showStatus("Isi keluhan pasien terlebih dahulu.", "error");
        return;
      }
      generate.disabled = true;
      showStatus("Membuat SOAP BPJS...", "loading");
      try {
        const response = await chrome.runtime.sendMessage({
          type: "GENERATE_SOAP_BPJS",
          identity: patientIdentity,
          complaint: patientComplaint,
        });
        if (!response?.ok) throw new Error(response?.error || "Gagal membuat SOAP.");
        const result = response.result || {};
        await saveSoapResult(result);
        await refreshSavedPreview();
        showSoapPreview(result, async (edited) => {
          await saveSoapResult(edited);
          applySoapResult(edited);
          showStatus("SOAP berhasil dimasukkan ke halaman.", "success");
        });
        showStatus("Preview SOAP siap diedit.", "success");
      } catch (error) {
        showStatus(error instanceof Error ? error.message : String(error), "error");
      } finally {
        generate.disabled = false;
      }
    });
  }

  function boot() {
    createSoapGeneratorUi();
    if (!isEligiblePage()) return;
    TARGETS.forEach(createFieldUi);
  }


  document.addEventListener("input", (event) => {
    autoGrowTextarea(event.target);
  });
  const observer = new MutationObserver(() => boot());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  boot();
})();
