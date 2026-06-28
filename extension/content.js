(function () {
  "use strict";

  if (
    typeof chrome === "undefined" ||
    !chrome.runtime?.connect ||
    !chrome.runtime?.onMessage ||
    !chrome.storage?.local
  ) {
    return;
  }

  if (globalThis.__quickVietTranslatorInitialized) {
    return;
  }
  globalThis.__quickVietTranslatorInitialized = true;

  const POPUP_ID = "quick-viet-popup";
  const MAX_LENGTH = 1500;
  const VI_CHARS = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ]/u;
  const ANY_LETTER = /[a-zA-Zàáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/ui;
  const TEXT_INPUT_TYPES = new Set(["", "email", "number", "password", "search", "tel", "text", "url"]);

  let selectionTimer = null;
  let isEnabled = true;
  let currentDirection = "auto";
  let currentPort = null;
  let activeAnchorRect = null;
  let lastRequestKey = "";
  let lastSelectionSnapshot = null;

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

  function resolveDirection(text) {
    if (currentDirection === "auto") {
      return VI_CHARS.test(text) ? "vi-en" : "en-vi";
    }
    return currentDirection;
  }

  function normalizeSelectionText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function isValidSelection(text) {
    return !!text && text.length <= MAX_LENGTH && ANY_LETTER.test(text);
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
    activeAnchorRect = null;
    const popup = document.getElementById(POPUP_ID);
    if (popup) popup.remove();
  }

  function disconnectPort() {
    if (currentPort) {
      try { currentPort.disconnect(); } catch {}
      currentPort = null;
    }
  }

  function positionPopup(popup, rect) {
    const margin = 10;
    const W = window.innerWidth;
    const H = window.innerHeight;

    popup.style.maxHeight = `${Math.max(180, H - margin * 2)}px`;

    const popupRect = popup.getBoundingClientRect();
    const pw = Math.min(popupRect.width || 420, W - margin * 2);
    const ph = Math.min(popupRect.height || 220, H - margin * 2);

    let top = rect.bottom + margin;
    let left = rect.left;

    if (left + pw > W - margin) left = W - pw - margin;
    if (left < margin) left = margin;
    if (top + ph > H - margin) top = rect.top - ph - margin;
    if (top < margin) top = margin;

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
        <span class="qvt-logo">Quick Viet</span>
        <span class="qvt-dir-badge">${dirLabel(direction)}</span>
        <button class="qvt-close" title="Đóng">Đóng</button>
      </div>
      <div class="qvt-loading">
        <div class="qvt-dots"><span></span><span></span><span></span></div>
        <span class="qvt-loading-text">Đang dịch...</span>
      </div>
    `;
    popup.style.display = "block";
    activeAnchorRect = rect;
    positionPopup(popup, rect);
    popup.querySelector(".qvt-close").addEventListener("click", removePopup);
  }

  function renderQuick(data, direction) {
    const popup = document.getElementById(POPUP_ID);
    if (!popup) return;

    popup.innerHTML = `
      <div class="qvt-header">
        <span class="qvt-logo">Quick Viet</span>
        <span class="qvt-dir-badge">${dirLabel(direction)}</span>
        <button class="qvt-close" title="Đóng">Đóng</button>
      </div>
      <div class="qvt-body">
        <div class="qvt-original qvt-appear">${escapeHtml(data.original)}</div>
        <div class="qvt-type qvt-appear">${escapeHtml(data.type || "")}</div>
        <div class="qvt-translation-row qvt-appear">
          <span class="qvt-translation">${escapeHtml(data.translation)}</span>
          <button class="qvt-copy" title="Copy" data-copy="${escapeHtml(data.translation)}">Copy</button>
        </div>
        <div id="qvt-explanation-slot" class="qvt-fetching-details">
           <div class="qvt-dots"><span></span><span></span><span></span></div>
        </div>
        <div id="qvt-example-slot"></div>
      </div>
    `;
    popup.querySelector(".qvt-close").addEventListener("click", removePopup);
    setupCopyButton(popup);
    if (activeAnchorRect) positionPopup(popup, activeAnchorRect);
  }

  function renderDetails(data, direction) {
    const popup = document.getElementById(POPUP_ID);
    if (!popup) return;

    if (data.explanation) {
      const slot = document.getElementById("qvt-explanation-slot");
      if (slot) {
        const el = document.createElement("div");
        el.className = "qvt-explanation qvt-appear";
        el.textContent = data.explanation;
        slot.replaceWith(el);
      }
    }

    if (data.example) {
      const slot = document.getElementById("qvt-example-slot");
      if (slot) {
        const label = direction === "vi-en" ? "Example" : "Ví dụ";
        const block = document.createElement("div");
        block.className = "qvt-example-block qvt-appear";
        block.innerHTML = `
          <div class="qvt-example-label">${label}</div>
          <div class="qvt-example">${escapeHtml(data.example)}</div>
          ${data.example_vi ? `<div class="qvt-example-vi">${escapeHtml(data.example_vi)}</div>` : ""}
        `;
        slot.replaceWith(block);
      }
    }

    if (activeAnchorRect) positionPopup(popup, activeAnchorRect);
  }

  function renderFull(data, direction) {
    renderQuick(data, direction);
    renderDetails(data, direction);
    const popup = document.getElementById(POPUP_ID);
    if (popup && data.fromCache) {
      const body = popup.querySelector(".qvt-body");
      if (body) body.insertAdjacentHTML('beforeend', '<div class="qvt-cache-badge">Cache</div>');
    }
  }

  function renderError(message) {
    const popup = document.getElementById(POPUP_ID);
    if (!popup) return;
    popup.innerHTML = `
      <div class="qvt-header">
        <span class="qvt-logo">Quick Viet</span>
        <button class="qvt-close" title="Đóng">Đóng</button>
      </div>
      <div class="qvt-error">${escapeHtml(message || "Không thể dịch. Vui lòng thử lại.")}</div>
    `;
    popup.querySelector(".qvt-close").addEventListener("click", removePopup);
    if (activeAnchorRect) positionPopup(popup, activeAnchorRect);
  }

  function setupCopyButton(popup) {
    const btn = popup.querySelector(".qvt-copy");
    if (!btn) return;
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(btn.dataset.copy).then(() => {
        btn.textContent = "Đã copy";
        setTimeout(() => (btn.textContent = "Copy"), 1500);
      });
    });
  }

  function getSelectionText() {
    const currentSelection = readCurrentSelection();
    if (currentSelection.text && currentSelection.rect) return currentSelection;

    if (lastSelectionSnapshot && Date.now() - lastSelectionSnapshot.createdAt < 1500) {
      return {
        text: lastSelectionSnapshot.text,
        rect: lastSelectionSnapshot.rect,
      };
    }

    return currentSelection;
  }

  function readCurrentSelection() {
    let text = "";
    let rect = null;

    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      text = normalizeSelectionText(selection.toString());
      rect = getRangeRect(selection);
    }
    else if (isSelectableInput(document.activeElement)) {
      const el = document.activeElement;
      if (el.selectionStart !== undefined && el.selectionEnd !== undefined) {
        text = normalizeSelectionText(el.value.substring(el.selectionStart, el.selectionEnd));
        rect = el.getBoundingClientRect();
      }
    }

    return { text, rect };
  }

  function saveSelectionSnapshot() {
    const { text, rect } = readCurrentSelection();
    if (!isValidSelection(text) || !rect) return;
    lastSelectionSnapshot = { text, rect, createdAt: Date.now() };
  }

  function isSelectableInput(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;
    return el.tagName === "INPUT" && TEXT_INPUT_TYPES.has((el.type || "").toLowerCase());
  }

  function getRangeRect(selection) {
    if (!selection.rangeCount) return null;

    const range = selection.getRangeAt(0);
    const rect = normalizeRect(range.getBoundingClientRect());
    if (rect) return rect;

    const rects = Array.from(range.getClientRects()).map(normalizeRect).filter(Boolean);
    return rects.length ? rects[rects.length - 1] : null;
  }

  function normalizeRect(rect) {
    if (!rect) return null;
    const width = Math.max(rect.width || 0, 1);
    const height = Math.max(rect.height || 0, 1);
    if (!Number.isFinite(rect.top) || !Number.isFinite(rect.left)) return null;
    return {
      top: rect.top,
      right: rect.right || rect.left + width,
      bottom: rect.bottom || rect.top + height,
      left: rect.left,
      width,
      height,
    };
  }

  function isInsidePopup(target) {
    const popup = document.getElementById(POPUP_ID);
    return !!popup && !!target && popup.contains(target);
  }

  function scheduleSelectionCheck(delay = 180) {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(handleSelection, delay);
  }

  async function handleSelection() {
    if (!isEnabled) return;

    const { text, rect } = getSelectionText();
    if (!isValidSelection(text) || !rect) return;

    const direction = resolveDirection(text);
    const requestKey = `${direction}:${text}`;
    if (requestKey === lastRequestKey && document.getElementById(POPUP_ID)) return;
    lastRequestKey = requestKey;

    showLoadingPopup(rect, direction);
    disconnectPort();

    const port = chrome.runtime.connect({ name: "translation-stream" });
    currentPort = port;

    port.onMessage.addListener((message) => {
      if (message.type === "done_quick") {
        renderQuick(message.data, direction);
      } else if (message.type === "done_details") {
        renderDetails(message.data, direction);
        disconnectPort();
      } else if (message.type === "done_full") {
        renderFull(message.data, direction);
        disconnectPort();
      } else if (message.type === "error") {
        renderError(message.message);
        disconnectPort();
      }
    });

    port.onDisconnect.addListener(() => {
      currentPort = null;
    });

    port.postMessage({ type: "TRANSLATE_QUICK", text, direction });
  }

  document.addEventListener("mouseup", (event) => {
    if (!isInsidePopup(event.target)) scheduleSelectionCheck(160);
  }, { capture: true });

  document.addEventListener("pointerup", (event) => {
    if (!isInsidePopup(event.target)) scheduleSelectionCheck(160);
  }, { capture: true });

  document.addEventListener("touchend", (event) => {
    if (!isInsidePopup(event.target)) scheduleSelectionCheck(280);
  }, { capture: true, passive: true });

  document.addEventListener("keyup", (event) => {
    if (event.key === "Escape") return;
    scheduleSelectionCheck(220);
  }, { capture: true });

  document.addEventListener("selectionchange", () => {
    saveSelectionSnapshot();
    scheduleSelectionCheck(520);
  }, { capture: true });

  document.addEventListener("mousedown", (e) => {
    if (!isInsidePopup(e.target)) removePopup();
  }, { capture: true });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") removePopup();
  });
})();
