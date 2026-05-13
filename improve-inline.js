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

  function setValue(element, value) {
    const proto = Object.getPrototypeOf(element);
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter ? setter.call(element, value) : (element.value = value);
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
    trigger.textContent = "✎";
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

    function showStatus(message, kind) {
      status.hidden = false;
      status.className = `rmr-inline-status ${kind ? `is-${kind}` : ""}`.trim();
      status.textContent = message;
    }

    function resetPreview() {
      preview.hidden = true;
      previewLabel.hidden = true;
      preview.value = "";
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
  }

  const observer = new MutationObserver(() => boot());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  boot();
})();
