(function () {
  "use strict";

  const POPUP_ID = "quick-viet-popup";
  const MAX_LENGTH = 200;
  const VI_CHARS = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ]/u;
  const ANY_LETTER = /[a-zA-Zàáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/ui;

  let selectionTimer = null;
  let isEnabled = true;
  let currentDirection = "auto";
  let currentPort = null;
  let streamState = null;

  chrome.storage.local.get(["enabled", "direction"], (result) => {
    if (result.enabled === false) isEnabled = false;
    if (result.direction) currentDirection = result.direction;
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "TOGGLE_ENABLED") {
      isEnabled = message.enabled;
      if (!isEnabled) removePopup();
    }
    if (message.type === "CHANGE_DIRECTION") {
      currentDirection = message.direction;
    }
  });

  function detectLanguage(text) {
    return VI_CHARS.test(text) ? "vi" : "en";
  }

  function resolveDirection(text) {
    if (currentDirection === "auto") {
      return detectLanguage(text) === "vi" ? "vi-en" : "en-vi";
    }
    return currentDirection;
  }

  function isValidSelection(text) {
    if (!text || text.length < 1 || text.length > MAX_LENGTH) return false;
    return ANY_LETTER.test(text);
  }

  function getOrCreatePopup() {
    let popup = document.getElementById(POPUP_ID);
    if (!popup) {
      popup = document.createElement("div");
      popup.id = POPUP_ID;
      document.body.appendChild(popup);
    }
    return popup;
  }

  function removePopup() {
    disconnectPort();
    const popup = document.getElementById(POPUP_ID);
    if (popup) popup.remove();
    streamState = null;
  }

  function disconnectPort() {
    if (currentPort) {
      try { currentPort.disconnect(); } catch { }
      currentPort = null;
    }
  }

  function positionPopup(popup, rect) {
    const margin = 10;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const sx = window.scrollX;
    const sy = window.scrollY;

    let top = rect.bottom + sy + margin;
    let left = rect.left + sx;

    const pw = 360;
    const ph = 220;

    if (left + pw > W + sx) left = W + sx - pw - margin;
    if (left < sx) left = sx + margin;
    if (top + ph > H + sy) top = rect.top + sy - ph - margin;
    if (top < sy) top = sy + margin;

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;
  }

  function dirLabel(direction) {
    return direction === "vi-en" ? "VI → EN" : "EN → VI";
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showLoadingPopup(rect, direction) {
    const popup = getOrCreatePopup();
    popup.innerHTML = `
      <div class="qvt-header">
        <span class="qvt-logo">🔤 Quick Viet</span>
        <span class="qvt-dir-badge">${dirLabel(direction)}</span>
        <button class="qvt-close" title="Đóng">✕</button>
      </div>
      <div class="qvt-loading">
        <div class="qvt-dots"><span></span><span></span><span></span></div>
        <span class="qvt-loading-text">Đang dịch...</span>
      </div>
    `;
    popup.style.display = "block";
    positionPopup(popup, rect);
    popup.querySelector(".qvt-close").addEventListener("click", removePopup);
  }

  function applyField(key, value, direction) {
    const popup = document.getElementById(POPUP_ID);
    if (!popup) return;

    if (key === "translation") {
      const loading = popup.querySelector(".qvt-loading");
      if (loading) {
        loading.outerHTML = `
          <div class="qvt-body">
            <div class="qvt-original"></div>
            <div class="qvt-type"></div>
            <div class="qvt-translation-row">
              <span class="qvt-translation qvt-appear">${escapeHtml(value)}</span>
              <button class="qvt-copy" title="Copy" data-copy="${escapeHtml(value)}">📋</button>
            </div>
            <div class="qvt-explanation"></div>
            <div class="qvt-example-block" style="display:none"></div>
          </div>
        `;
        setupCopyButton(popup);
      } else {
        const el = popup.querySelector(".qvt-translation");
        if (el) {
          el.textContent = value;
          const copyBtn = popup.querySelector(".qvt-copy");
          if (copyBtn) copyBtn.dataset.copy = value;
        }
      }
    } else if (key === "original") {
      const el = popup.querySelector(".qvt-original");
      if (el) el.textContent = value;
    } else if (key === "type") {
      const el = popup.querySelector(".qvt-type");
      if (el) el.textContent = value;
    } else if (key === "explanation") {
      const el = popup.querySelector(".qvt-explanation");
      if (el) {
        el.textContent = value;
        el.classList.add("qvt-appear");
      }
    } else if (key === "example") {
      const block = popup.querySelector(".qvt-example-block");
      if (block) {
        const label = direction === "vi-en" ? "Example" : "Ví dụ";
        block.style.display = "block";
        block.innerHTML = `
          <div class="qvt-example-label">${label}</div>
          <div class="qvt-example qvt-appear">${escapeHtml(value)}</div>
          <div class="qvt-example-vi"></div>
        `;
      }
    } else if (key === "example_vi") {
      const el = popup.querySelector(".qvt-example-vi");
      if (el) {
        el.textContent = value;
        el.classList.add("qvt-appear");
      }
    }
  }

  function renderFullTranslation(data, direction) {
    const popup = document.getElementById(POPUP_ID);
    if (!popup) return;

    const exampleSection = data.example ? `
      <div class="qvt-example-block">
        <div class="qvt-example-label">${direction === "vi-en" ? "Example" : "Ví dụ"}</div>
        <div class="qvt-example">${escapeHtml(data.example)}</div>
        ${data.example_vi ? `<div class="qvt-example-vi">${escapeHtml(data.example_vi)}</div>` : ""}
      </div>
    ` : "";

    const header = popup.querySelector(".qvt-header");
    if (header) {
      const body = popup.querySelector(".qvt-body");
      if (body) {
        body.innerHTML = `
          <div class="qvt-original">${escapeHtml(data.original)}</div>
          <div class="qvt-type">${escapeHtml(data.type || "")}</div>
          <div class="qvt-translation-row">
            <span class="qvt-translation">${escapeHtml(data.translation)}</span>
            <button class="qvt-copy" title="Copy" data-copy="${escapeHtml(data.translation)}">📋</button>
          </div>
          <div class="qvt-explanation">${escapeHtml(data.explanation || "")}</div>
          ${exampleSection}
          ${data.fromCache ? '<div class="qvt-cache-badge">⚡ Cache</div>' : ""}
        `;
        setupCopyButton(popup);
      }
    } else {
      popup.innerHTML = `
        <div class="qvt-header">
          <span class="qvt-logo">Quick Viet</span>
          <span class="qvt-dir-badge">${dirLabel(direction)}</span>
          <button class="qvt-close" title="Đóng">✕</button>
        </div>
        <div class="qvt-body">
          <div class="qvt-original">${escapeHtml(data.original)}</div>
          <div class="qvt-type">${escapeHtml(data.type || "")}</div>
          <div class="qvt-translation-row">
            <span class="qvt-translation">${escapeHtml(data.translation)}</span>
            <button class="qvt-copy" title="Copy" data-copy="${escapeHtml(data.translation)}">📋</button>
          </div>
          <div class="qvt-explanation">${escapeHtml(data.explanation || "")}</div>
          ${exampleSection}
          ${data.fromCache ? '<div class="qvt-cache-badge">⚡ Cache</div>' : ""}
        </div>
      `;
      popup.querySelector(".qvt-close").addEventListener("click", removePopup);
      setupCopyButton(popup);
    }
  }

  function setupCopyButton(popup) {
    const btn = popup.querySelector(".qvt-copy");
    if (!btn) return;
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(btn.dataset.copy).then(() => {
        btn.textContent = "✔";
        setTimeout(() => (btn.textContent = "📋"), 1500);
      });
    });
  }

  function renderError(message) {
    const popup = document.getElementById(POPUP_ID);
    if (!popup) return;
    popup.innerHTML = `
      <div class="qvt-header">
        <span class="qvt-logo">Quick Viet</span>
        <button class="qvt-close" title="Đóng">✕</button>
      </div>
      <div class="qvt-error">⚠️ ${escapeHtml(message || "Không thể dịch. Vui lòng thử lại.")}</div>
    `;
    popup.querySelector(".qvt-close").addEventListener("click", removePopup);
  }

  async function handleSelection() {
    if (!isEnabled) return;

    const selection = window.getSelection();
    const selectedText = selection ? selection.toString().trim() : "";
    if (!isValidSelection(selectedText)) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const direction = resolveDirection(selectedText);

    showLoadingPopup(rect, direction);
    disconnectPort();

    const port = chrome.runtime.connect({ name: "translation-stream" });
    currentPort = port;
    streamState = { direction };

    port.onMessage.addListener((message) => {
      const dir = streamState?.direction || "en-vi";
      if (message.type === "field") {
        applyField(message.key, message.value, dir);
      } else if (message.type === "done") {
        renderFullTranslation(message.data, dir);
        disconnectPort();
        streamState = null;
      } else if (message.type === "error") {
        renderError(message.message);
        disconnectPort();
        streamState = null;
      }
    });

    port.onDisconnect.addListener(() => {
      currentPort = null;
    });

    port.postMessage({ type: "TRANSLATE_STREAM", text: selectedText, direction });
  }

  document.addEventListener("mouseup", () => {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(handleSelection, 250);
  });

  document.addEventListener("mousedown", (e) => {
    const popup = document.getElementById(POPUP_ID);
    if (popup && !popup.contains(e.target)) removePopup();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") removePopup();
  });
})();
