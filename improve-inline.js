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

  function getSoapSnapshot(fields = getSoapFields()) {
    return {
      s: fields.subjektif?.value || "",
      o: fields.objektif?.value || "",
      a: fields.assessment?.value || "",
      p: fields.planning?.value || "",
    };
  }

  function collectSoapInput(fields = getSoapFields()) {
    const snapshot = getSoapSnapshot(fields);
    return {
      s: snapshot.s.trim(),
      o: snapshot.o.trim(),
      a: snapshot.a.trim(),
      p: snapshot.p.trim(),
    };
  }

  function clearSoapUndoButtons() {
    document.querySelectorAll(".rmr-soap-undo, .rmr-soap-undo-popover").forEach((element) => element.remove());
  }

  function showSoapToast(message) {
    document.querySelector(".rmr-soap-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = "rmr-soap-toast";
    toast.textContent = message;
    document.body.append(toast);
    setTimeout(() => toast.remove(), 1800);
  }

  async function copySoapText(text) {
    try {
      await navigator.clipboard.writeText(text || "");
    } catch (_error) {
      const textarea = document.createElement("textarea");
      textarea.value = text || "";
      textarea.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    showSoapToast("Copied");
  }

  function showSoapUndoPopover(button, value, textarea, label) {
    const current = document.querySelector(".rmr-soap-undo-popover");
    if (current?.dataset.rmrUndoKey === button.dataset.rmrUndoKey) {
      current.remove();
      return;
    }
    current?.remove();
    const popover = document.createElement("div");
    popover.className = "rmr-soap-undo-popover";
    popover.dataset.rmrUndoKey = button.dataset.rmrUndoKey;
    const title = document.createElement("div");
    title.className = "rmr-soap-undo-header";
    title.textContent = `${label} sebelumnya`;
    const preview = document.createElement("textarea");
    preview.readOnly = true;
    preview.rows = 5;
    preview.value = value || "";
    const actions = document.createElement("div");
    actions.className = "rmr-inline-actions";
    const restore = createButton("Pulihkan", "rmr-inline-btn-primary");
    const close = createButton("Tutup", "rmr-inline-btn-secondary");
    actions.append(restore, close);
    popover.append(title, preview, actions);
    document.body.append(popover);
    const rect = button.getBoundingClientRect();
    popover.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - popover.offsetWidth - 8))}px`;
    popover.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - popover.offsetHeight - 8))}px`;
    title.addEventListener("pointerdown", (event) => {
      const startRect = popover.getBoundingClientRect();
      const offsetX = event.clientX - startRect.left;
      const offsetY = event.clientY - startRect.top;
      title.setPointerCapture(event.pointerId);
      const move = (moveEvent) => {
        popover.style.left = `${Math.max(0, Math.min(moveEvent.clientX - offsetX, window.innerWidth - popover.offsetWidth))}px`;
        popover.style.top = `${Math.max(0, Math.min(moveEvent.clientY - offsetY, window.innerHeight - popover.offsetHeight))}px`;
      };
      const stop = () => title.removeEventListener("pointermove", move);
      title.addEventListener("pointermove", move);
      title.addEventListener("pointerup", stop, { once: true });
      title.addEventListener("pointercancel", stop, { once: true });
    });
    restore.addEventListener("click", () => {
      setValue(textarea, value || "");
      button.remove();
      popover.remove();
      showSoapToast("Sudah dipulihkan");
    });
    close.addEventListener("click", () => popover.remove());
  }
  function addSoapUndoButtons(snapshot, result) {
    const fields = getSoapFields();
    [
      ["s", fields.subjektif, "Subjektif"],
      ["o", fields.objektif, "Objektif"],
      ["a", fields.assessment, "Assessment"],
      ["p", fields.planning, "Planning"],
    ].forEach(([key, textarea, label]) => {
      if (!textarea || String(snapshot[key] || "") === String(result[key] || "")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rmr-soap-undo";
      button.textContent = "\u21B6";
      button.title = `Lihat ${label} sebelumnya`;
      button.setAttribute("aria-label", `Lihat ${label} sebelumnya`);
      button.dataset.rmrUndoKey = key;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        showSoapUndoPopover(button, snapshot[key], textarea, label);
      });
      textarea.insertAdjacentElement("beforebegin", button);
    });
  }

  function applySoapResult(result, snapshot = null) {
    const fields = getSoapFields();
    if (!fields.subjektif || !fields.objektif || !fields.assessment || !fields.planning) {
      throw new Error("Field SOAP halaman tidak ditemukan.");
    }
    clearSoapUndoButtons();
    setValue(fields.subjektif, result.s || "");
    setValue(fields.objektif, result.o || "");
    setValue(fields.assessment, result.a || "");
    setValue(fields.planning, result.p || "");
    if (snapshot) addSoapUndoButtons(snapshot, result);
  }

  function getSoapStorageKey() {
    return `rmrSoapResult:${location.origin}${location.pathname}${location.search}`;
  }

  function saveSoapResult(result) {
    return chrome.storage.local.set({ [getSoapStorageKey()]: result });
  }

  function loadSoapResult() {
    return new Promise((resolve) => {
      chrome.storage.local.get(getSoapStorageKey(), (data) => resolve(data[getSoapStorageKey()] || null));
    });
  }

  function showSoapResultModal(result) {
    if (!result) {
      showSoapToast("Belum ada hasil SOAP");
      return;
    }
    const parts = [
      ["Subjektif", "s"],
      ["Objektif", "o"],
      ["Assessment", "a"],
      ["Planning", "p"],
    ];
    let index = 0;
    document.querySelector(".rmr-soap-result-backdrop")?.remove();
    const backdrop = document.createElement("div");
    backdrop.className = "rmr-soap-result-backdrop";
    const modal = document.createElement("div");
    modal.className = "rmr-soap-result-modal";
    const header = document.createElement("div");
    header.className = "rmr-soap-result-header";
    const nav = document.createElement("div");
    nav.className = "rmr-soap-result-nav";
    const prev = document.createElement("button");
    prev.type = "button";
    prev.textContent = "<";
    const labelTitle = document.createElement("strong");
    const counter = document.createElement("span");
    counter.className = "rmr-soap-result-counter";
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = ">";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "rmr-soap-copy";
    copy.textContent = "\u2398";
    const body = document.createElement("pre");
    body.className = "rmr-soap-result-body";
    const close = createButton("Tutup", "rmr-inline-btn-secondary");
    const render = () => {
      const [label, key] = parts[index];
      labelTitle.textContent = label;
      counter.textContent = `${index + 1}/4`;
      body.textContent = result[key] || "";
      copy.title = `Copy ${label}`;
      copy.setAttribute("aria-label", `Copy ${label}`);
      prev.disabled = index === 0;
      next.disabled = index === parts.length - 1;
    };
    prev.addEventListener("click", () => {
      index = Math.max(0, index - 1);
      render();
    });
    next.addEventListener("click", () => {
      index = Math.min(parts.length - 1, index + 1);
      render();
    });
    copy.addEventListener("click", () => copySoapText(result[parts[index][1]] || ""));
    close.addEventListener("click", () => backdrop.remove());
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) backdrop.remove();
    });
    nav.append(labelTitle, prev, counter, next);
    header.append(nav, copy);
    modal.append(header, body, close);
    backdrop.append(modal);
    document.body.append(backdrop);
    render();
  }

  function showMagicSoapHelp(anchor) {
    const current = document.querySelector(".rmr-soap-help-popover");
    if (current) {
      current.rmrCleanup?.();
      current.remove();
      return;
    }
    const popover = document.createElement("div");
    popover.className = "rmr-soap-help-popover";
    popover.innerHTML = `
      <div class="rmr-soap-help-warning">\u26A0\uFE0F Semua keputusan klinis tetap ditangan dokter yang merawat</div>
      <div class="rmr-soap-help-grid">
        <section class="rmr-soap-help-card">
          <strong>Cara Pakai</strong>
          <ol>
            <li>Masukkan S,O,A,P singkat seperti contoh dibawah kedalam masing masing kolom.</li>
            <li>Tekan tombol Magic SOAP, dan pilih pasien rawat inap, rawat jalan, atau dari poli (bukan masuk lewat IGD).</li>
            <li>Output langsung masuk ke masing masing kolom \u{1F44D}</li>
          </ol>
          <p><b>*WAJIB diisi adalah kolom Subjektif. Sisanya Optional.</b></p>
        </section>
        <section class="rmr-soap-help-card">
          <strong>Contoh cara pengisian</strong>
          <p>Input dokter pada kolom S,O,A,P :</p>
          <pre>S : bab cair, mual, muntah
O : dehidrasi
A : gea
P : RL 500cc, ranitidin, ondancetron 4mg</pre>
        </section>
        <section class="rmr-soap-help-card rmr-soap-help-card-wide">
          <strong>Aturan BPJS IGD</strong>
          <p>Berdasarkan Matriks Ketentuan Penjaminan dan Penagihan Klaim IGD pada BA Kesepakatan No. 1247/BA/1124, kasus IGD harus memenuhi salah satu kriteria gawat darurat:</p>
          <ol type="a">
            <li>Mengancam nyawa, membahayakan diri dan orang lain/lingkungan.</li>
            <li>Adanya gangguan pada jalan napas, pernafasan, dan sirkulasi.</li>
            <li>Adanya penurunan kesadaran.</li>
            <li>Adanya gangguan hemodinamik; dan/atau.</li>
            <li>Memerlukan tindakan segera.</li>
          </ol>
        </section>
      </div>`;
    const close = createButton("Tutup", "rmr-inline-btn-secondary");
    popover.append(close);
    document.body.append(popover);
    const rect = anchor.getBoundingClientRect();
    popover.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - popover.offsetWidth - 8))}px`;
    popover.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - popover.offsetHeight - 8))}px`;
    const closePopover = () => {
      document.removeEventListener("pointerdown", outsideClick);
      popover.remove();
    };
    const outsideClick = (event) => {
      if (!popover.contains(event.target) && event.target !== anchor) closePopover();
    };
    popover.rmrCleanup = () => document.removeEventListener("pointerdown", outsideClick);
    setTimeout(() => document.addEventListener("pointerdown", outsideClick), 0);
    const handle = popover.querySelector(".rmr-soap-help-warning");
    handle.addEventListener("pointerdown", (event) => {
      const startRect = popover.getBoundingClientRect();
      const offsetX = event.clientX - startRect.left;
      const offsetY = event.clientY - startRect.top;
      handle.setPointerCapture(event.pointerId);
      const move = (moveEvent) => {
        popover.style.left = `${Math.max(0, Math.min(moveEvent.clientX - offsetX, window.innerWidth - popover.offsetWidth))}px`;
        popover.style.top = `${Math.max(0, Math.min(moveEvent.clientY - offsetY, window.innerHeight - popover.offsetHeight))}px`;
      };
      const stop = () => handle.removeEventListener("pointermove", move);
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", stop, { once: true });
      handle.addEventListener("pointercancel", stop, { once: true });
    });
    close.addEventListener("click", closePopover);
  }

  function showBpjsScenarioHelp(anchor) {
    const current = document.querySelector(".rmr-bpjs-help-popover");
    if (current) {
      current.rmrCleanup?.();
      current.remove();
      return;
    }
    const popover = document.createElement("div");
    popover.className = "rmr-soap-help-popover rmr-bpjs-help-popover";
    popover.innerHTML = `
      <div class="rmr-soap-help-warning">\u26A0\uFE0F Semua keputusan klaim tetap mengikuti ketentuan JKN/BPJS dan verifikator.</div>
      <div class="rmr-soap-help-grid">
        <section class="rmr-soap-help-card">
          <strong>Cara Pakai</strong>
          <ol>
            <li>Masukkan skenario kejadian secara singkat.</li>
            <li>Masukkan akibat/cedera yang dialami pasien.</li>
            <li>Tekan tombol Buat Skenario BPJS.</li>
            <li>AI akan menyusun kronologi final dan menampilkan warning berdasarkan input asli bila mengarah ke kondisi tidak ditanggung JKN.</li>
          </ol>
        </section>
        <section class="rmr-soap-help-card">
          <strong>Contoh input</strong>
          <pre>Skenario:
Pasien naik meja memperbaiki lampu lalu jatuh.

Akibat:
Patah tangan kiri.</pre>
        </section>
        <section class="rmr-soap-help-card rmr-soap-help-card-wide">
          <strong>21 Kondisi/Pelayanan Tidak Ditanggung JKN</strong>
          <ol>
            <li>Pelayanan yang tidak sesuai aturan perundang-undangan, misalnya minta rujukan atas permintaan sendiri.</li>
            <li>Pelayanan di fasilitas kesehatan yang tidak bekerja sama dengan BPJS, kecuali keadaan gawat darurat.</li>
            <li>Penyakit atau cedera akibat kecelakaan kerja/hubungan kerja yang sudah dijamin BPJamsostek, Taspen, ASABRI, pemberi kerja, atau penjamin lain.</li>
            <li>Kecelakaan lalu lintas yang sudah dijamin oleh program jaminan kecelakaan lalu lintas wajib, misalnya Jasa Raharja, sampai batas ketentuan.</li>
            <li>Pelayanan kesehatan yang dilakukan di luar negeri.</li>
            <li>Perawatan untuk tujuan estetik/kosmetik, misalnya operasi plastik untuk mempercantik diri, bukan karena indikasi medis.</li>
            <li>Pelayanan terkait infertilitas/program kehamilan.</li>
            <li>Pelayanan untuk meratakan gigi/ortodonti, misalnya pemasangan behel.</li>
            <li>Gangguan kesehatan akibat ketergantungan obat dan/atau alkohol.</li>
            <li>Gangguan kesehatan akibat sengaja menyakiti diri sendiri atau hobi yang membahayakan diri.</li>
            <li>Pengobatan komplementer, alternatif, dan tradisional yang belum terbukti efektif berdasarkan penilaian teknologi kesehatan.</li>
            <li>Pengobatan atau tindakan medis yang masih bersifat percobaan/eksperimen.</li>
            <li>Alat dan obat kontrasepsi serta kosmetik.</li>
            <li>Perbekalan kesehatan rumah tangga, misalnya kebutuhan kesehatan untuk penggunaan rumah tangga tertentu.</li>
            <li>Pelayanan akibat bencana, kejadian luar biasa, atau wabah pada masa tanggap darurat, karena dijamin skema pemerintah.</li>
            <li>Pelayanan pada kejadian tak diharapkan yang dapat dicegah, sesuai ketentuan Menteri.</li>
            <li>Pelayanan kesehatan dalam rangka bakti sosial, karena ditanggung penyelenggara/sponsor/donatur.</li>
            <li>Pelayanan yang tidak berhubungan dengan manfaat jaminan kesehatan, misalnya pemeriksaan untuk syarat administrasi, seleksi kerja, CPNS, dan sejenisnya.</li>
            <li>Pelayanan akibat tindak pidana tertentu, seperti penganiayaan, kekerasan seksual, korban terorisme, dan perdagangan orang, bila sudah dijamin oleh skema lain seperti LPSK atau pemerintah daerah.</li>
            <li>Pelayanan kesehatan tertentu yang berkaitan dengan Kementerian Pertahanan, TNI, dan Polri.</li>
            <li>Pelayanan yang sudah ditanggung oleh program lain, sehingga tidak boleh ditagihkan ganda ke BPJS.</li>
          </ol>
        </section>
      </div>`;
    const close = createButton("Tutup", "rmr-inline-btn-secondary");
    popover.append(close);
    document.body.append(popover);
    const rect = anchor.getBoundingClientRect();
    popover.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - popover.offsetWidth - 8))}px`;
    popover.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - popover.offsetHeight - 8))}px`;
    const closePopover = () => {
      document.removeEventListener("pointerdown", outsideClick);
      popover.remove();
    };
    const outsideClick = (event) => {
      if (!popover.contains(event.target) && event.target !== anchor) closePopover();
    };
    popover.rmrCleanup = () => document.removeEventListener("pointerdown", outsideClick);
    setTimeout(() => document.addEventListener("pointerdown", outsideClick), 0);
    const handle = popover.querySelector(".rmr-soap-help-warning");
    handle.addEventListener("pointerdown", (event) => {
      const startRect = popover.getBoundingClientRect();
      const offsetX = event.clientX - startRect.left;
      const offsetY = event.clientY - startRect.top;
      handle.setPointerCapture(event.pointerId);
      const move = (moveEvent) => {
        popover.style.left = `${Math.max(0, Math.min(moveEvent.clientX - offsetX, window.innerWidth - popover.offsetWidth))}px`;
        popover.style.top = `${Math.max(0, Math.min(moveEvent.clientY - offsetY, window.innerHeight - popover.offsetHeight))}px`;
      };
      const stop = () => handle.removeEventListener("pointermove", move);
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", stop, { once: true });
      handle.addEventListener("pointercancel", stop, { once: true });
    });
    close.addEventListener("click", closePopover);
  }

  function getBpjsScenarioStorageKey() {
    return `rmrBpjsScenario:${location.origin}${location.pathname}${location.search}`;
  }

  function saveBpjsScenarioResult(result) {
    return chrome.storage.local.set({ [getBpjsScenarioStorageKey()]: result });
  }

  function loadBpjsScenarioResult() {
    return new Promise((resolve) => {
      chrome.storage.local.get(getBpjsScenarioStorageKey(), (data) => resolve(data[getBpjsScenarioStorageKey()] || null));
    });
  }

  function showBpjsScenarioResultModal(result) {
    document.querySelector(".rmr-bpjs-result-backdrop")?.remove();
    const backdrop = document.createElement("div");
    backdrop.className = "rmr-soap-result-backdrop rmr-bpjs-result-backdrop";
    const modal = document.createElement("div");
    modal.className = "rmr-soap-result-modal";
    modal.innerHTML = `
      <div class="rmr-soap-result-header"><strong>Kronologi Final</strong></div>
      <pre class="rmr-soap-result-body"></pre>`;
    modal.querySelector("pre").textContent = result.kronologi || "";
    if (result.warning || result.warning_rule) {
      const warning = document.createElement("div");
      warning.className = "rmr-bpjs-warning-card";
      const warningText = result.warning || "Potensi tidak dijamin JKN:";
      warning.textContent = `\u26A0\uFE0F ${warningText.replace(/^\u26A0\uFE0F\s*/, "")}\n${result.warning_rule || ""}`.trim();
      modal.append(warning);
    }
    const actions = document.createElement("div");
    actions.className = "rmr-inline-actions";
    const copy = createButton("Copy", "rmr-inline-btn-primary");
    const close = createButton("Tutup", "rmr-inline-btn-secondary");
    actions.append(copy, close);
    modal.append(actions);
    backdrop.append(modal);
    document.body.append(backdrop);
    copy.addEventListener("click", () => copySoapText(result.kronologi || ""));
    close.addEventListener("click", () => backdrop.remove());
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) backdrop.remove();
    });
  }

  function showBpjsScenarioModal() {
    document.querySelector(".rmr-bpjs-modal-backdrop")?.remove();
    const backdrop = document.createElement("div");
    backdrop.className = "rmr-soap-result-backdrop rmr-bpjs-modal-backdrop";
    const modal = document.createElement("div");
    modal.className = "rmr-soap-result-modal rmr-bpjs-modal";
    modal.innerHTML = `
      <div class="rmr-soap-result-header"><strong>Kronologi BPJS</strong></div>
      <label>Skenario Kejadian<textarea rows="5" data-rmr-bpjs-skenario placeholder="Ceritakan kejadiannya... (Contoh: Pasien naik meja memperbaiki lampu lalu jatuh)"></textarea></label>
      <label>Akibat / Cedera<textarea rows="4" data-rmr-bpjs-akibat placeholder="Sebutkan akibat dari kejadian tersebut... (Contoh: patah tangan kiri)"></textarea></label>
      <div class="rmr-inline-status" data-rmr-bpjs-status hidden></div>
      <div class="rmr-inline-actions">
        <button type="button" class="rmr-inline-btn rmr-inline-btn-primary" data-rmr-bpjs-generate>Buat Skenario BPJS</button>
        <button type="button" class="rmr-inline-btn rmr-inline-btn-primary" data-rmr-bpjs-preview hidden>Preview hasil</button>
        <button type="button" class="rmr-inline-btn rmr-inline-btn-secondary" data-rmr-bpjs-close>Tutup</button>
      </div>`;
    backdrop.append(modal);
    document.body.append(backdrop);
    const skenario = modal.querySelector("[data-rmr-bpjs-skenario]");
    const akibat = modal.querySelector("[data-rmr-bpjs-akibat]");
    const status = modal.querySelector("[data-rmr-bpjs-status]");
    const generate = modal.querySelector("[data-rmr-bpjs-generate]");
    const preview = modal.querySelector("[data-rmr-bpjs-preview]");
    const showStatus = (message, kind) => {
      status.hidden = false;
      status.className = `rmr-inline-status ${kind ? `is-${kind}` : ""}`.trim();
      status.textContent = message;
    };
    let timer = null;
    const stopTimer = () => clearInterval(timer);
    const startTimer = () => {
      const started = Date.now();
      const render = () => showStatus(`Menyusun Skenario Verifikasi BPJS... ${Math.floor((Date.now() - started) / 1000)} detik.`, "loading");
      stopTimer();
      render();
      timer = setInterval(render, 1000);
    };
    loadBpjsScenarioResult().then((saved) => {
      preview.hidden = !saved;
    });
    preview.addEventListener("click", async () => showBpjsScenarioResultModal(await loadBpjsScenarioResult()));
    modal.querySelector("[data-rmr-bpjs-close]").addEventListener("click", () => {
      stopTimer();
      backdrop.remove();
    });
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        stopTimer();
        backdrop.remove();
      }
    });
    generate.addEventListener("click", async () => {
      const skenarioText = skenario.value.trim();
      const akibatText = akibat.value.trim();
      if (!skenarioText || !akibatText) {
        showStatus("Skenario dan akibat wajib diisi.", "error");
        return;
      }
      generate.disabled = true;
      startTimer();
      try {
        const response = await chrome.runtime.sendMessage({ type: "GENERATE_BPJS_SCENARIO", skenario: skenarioText, akibat: akibatText });
        if (!response?.ok) throw new Error(response?.error || "Gagal membuat skenario BPJS.");
        await saveBpjsScenarioResult(response.result || {});
        stopTimer();
        backdrop.remove();
        showBpjsScenarioResultModal(response.result || {});
      } catch (error) {
        stopTimer();
        generate.disabled = false;
        showStatus(error instanceof Error ? error.message : String(error), "error");
      }
    });
    skenario.focus();
  }
  function createSoapGeneratorUi() {
    const title = document.querySelector("#muncul1");
    if (!title || title.dataset.rmrSoapGeneratorReady === "1") return;
    if ((title.textContent || "").trim().toUpperCase() !== "SOAP") return;
    title.dataset.rmrSoapGeneratorReady = "1";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "rmr-soap-gen-trigger";
    trigger.textContent = "Magic SOAP \u{1F9E0}";
    title.insertAdjacentElement("afterend", trigger);

    const help = document.createElement("button");
    help.type = "button";
    help.className = "rmr-soap-help-trigger";
    help.textContent = "?";
    help.setAttribute("aria-label", "Bantuan Magic SOAP");
    trigger.insertAdjacentElement("afterend", help);

    const scenario = document.createElement("button");
    scenario.type = "button";
    scenario.className = "rmr-bpjs-trigger";
    scenario.textContent = "Kronologi BPJS";
    help.insertAdjacentElement("afterend", scenario);

    const scenarioHelp = document.createElement("button");
    scenarioHelp.type = "button";
    scenarioHelp.className = "rmr-soap-help-trigger";
    scenarioHelp.textContent = "?";
    scenarioHelp.setAttribute("aria-label", "Bantuan Kronologi BPJS");
    scenario.insertAdjacentElement("afterend", scenarioHelp);

    const panel = document.createElement("div");
    panel.className = "rmr-soap-gen-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <button type="button" class="rmr-soap-gen-close" data-rmr-soap-close aria-label="Tutup">\u00D7</button>
      <div class="rmr-soap-gen-identity" data-rmr-soap-identity>Identitas anonim: -</div>
      <div class="rmr-inline-status" data-rmr-soap-status hidden></div>
      <div class="rmr-inline-actions">
        <button type="button" class="rmr-inline-btn rmr-inline-btn-primary" data-rmr-soap-mode="rawat_inap">Rawat inap</button>
        <button type="button" class="rmr-inline-btn rmr-inline-btn-primary" data-rmr-soap-mode="rawat_jalan">Rawat jalan</button>
        <button type="button" class="rmr-inline-btn rmr-inline-btn-primary" data-rmr-soap-mode="dari_poli">Dari poli</button>
        <button type="button" class="rmr-inline-btn rmr-inline-btn-primary" data-rmr-soap-regenerate hidden>Generate ulang</button>
        <button type="button" class="rmr-inline-btn rmr-inline-btn-primary" data-rmr-soap-preview hidden>Preview</button>
      </div>`;
    (title.closest(".box-rm03biru") || title.parentElement || title).insertAdjacentElement("afterend", panel);

    const identity = panel.querySelector("[data-rmr-soap-identity]");
    const status = panel.querySelector("[data-rmr-soap-status]");
    const modeButtons = [...panel.querySelectorAll("[data-rmr-soap-mode]")];
    const regenerate = panel.querySelector("[data-rmr-soap-regenerate]");
    const preview = panel.querySelector("[data-rmr-soap-preview]");

    const showStatus = (message, kind) => {
      status.hidden = false;
      status.className = `rmr-inline-status ${kind ? `is-${kind}` : ""}`.trim();
      status.textContent = message;
    };
    let loadingTimer = null;
    const stopLoadingTimer = () => {
      clearInterval(loadingTimer);
      loadingTimer = null;
    };
    const startLoadingTimer = () => {
      const started = Date.now();
      const render = () => {
        const seconds = Math.floor((Date.now() - started) / 1000);
        showStatus(
          `Membuat Magic SOAP... ${seconds} detik. Proses 30-180 detik tergantung panjang data dan kecepatan provider.`,
          "loading"
        );
      };
      stopLoadingTimer();
      render();
      loadingTimer = setInterval(render, 1000);
    };

    trigger.addEventListener("click", async () => {
      panel.hidden = !panel.hidden;
      if (panel.hidden) stopLoadingTimer();
      identity.textContent = `Identitas anonim: ${getAnonymousPatientIdentity() || "tidak terbaca"}`;
      if (!panel.hidden) preview.hidden = !(await loadSoapResult());
    });
    help.addEventListener("click", () => showMagicSoapHelp(help));
    scenario.addEventListener("click", showBpjsScenarioModal);
    scenarioHelp.addEventListener("click", () => showBpjsScenarioHelp(scenarioHelp));
    panel.querySelector("[data-rmr-soap-close]").addEventListener("click", () => {
      stopLoadingTimer();
      panel.hidden = true;
      status.hidden = true;
    });
    regenerate.addEventListener("click", () => {
      stopLoadingTimer();
      regenerate.hidden = true;
      status.hidden = true;
      modeButtons.forEach((item) => (item.disabled = false));
    });
    preview.addEventListener("click", async () => showSoapResultModal(await loadSoapResult()));
    panel.addEventListener("click", async (event) => {
      const button = event.target.closest?.("[data-rmr-soap-mode]");
      if (!button) return;
      const fields = getSoapFields();
      const patientIdentity = getAnonymousPatientIdentity();
      if (!patientIdentity) {
        showStatus("Umur/jenis kelamin pasien tidak terbaca dari header.", "error");
        return;
      }
      if (!fields.subjektif || !fields.objektif || !fields.assessment || !fields.planning) {
        showStatus("Field SOAP halaman tidak ditemukan.", "error");
        return;
      }
      const soapInput = collectSoapInput(fields);
      if (!soapInput.s) {
        showStatus("Subjektif wajib diisi minimal keluhan utama.", "error");
        return;
      }
      if (!soapInput.o && !confirm("Objektif kosong. Magic SOAP akan membuat objektif terarah yang wajib diverifikasi dokter. Lanjutkan?")) return;
      const snapshot = getSoapSnapshot(fields);
      modeButtons.forEach((item) => (item.disabled = true));
      regenerate.hidden = true;
      startLoadingTimer();
      try {
        const response = await chrome.runtime.sendMessage({
          type: "GENERATE_SOAP_BPJS",
          identity: patientIdentity,
          serviceMode: button.dataset.rmrSoapMode,
          soapInput,
        });
        if (!response?.ok) throw new Error(response?.error || "Gagal membuat SOAP.");
        const result = response.result || {};
        await saveSoapResult(result);
        applySoapResult(result, snapshot);
        regenerate.hidden = false;
        preview.hidden = false;
        stopLoadingTimer();
        status.hidden = true;
        panel.hidden = true;
      } catch (error) {
        stopLoadingTimer();
        showStatus(error instanceof Error ? error.message : String(error), "error");
        modeButtons.forEach((item) => (item.disabled = false));
      }
    });
  }
  function boot() {
    createSoapGeneratorUi();
    // Inline improve ab/ae dinonaktifkan; workflow sekarang lewat Magic SOAP.
    return;
  }


  document.addEventListener("input", (event) => {
    autoGrowTextarea(event.target);
  });
  const observer = new MutationObserver(() => boot());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  boot();
})();
