"use strict";

const toggleEl = document.getElementById("toggle-enabled");
const statusBadge = document.getElementById("status-badge");
const statusText = document.getElementById("status-text");
const cacheCountEl = document.getElementById("cache-count");
const btnClearCache = document.getElementById("btn-clear-cache");
const dirSelector = document.getElementById("dir-selector");
const backendUrlEl = document.getElementById("backend-url");
const btnSaveBackend = document.getElementById("btn-save-backend");

const DEFAULT_BACKEND_BASE = "https://quick-viet-translator-backend.onrender.com";

chrome.storage.local.get(["enabled", "direction", "backendUrl"], (result) => {
  const isEnabled = result.enabled !== false;
  toggleEl.checked = isEnabled;
  updateStatusBadge(isEnabled);

  const dir = result.direction || "auto";
  updateDirButtons(dir);

  backendUrlEl.value = toBackendBase(result.backendUrl || DEFAULT_BACKEND_BASE);
});

function refreshCacheCount() {
  chrome.storage.local.get(null, (items) => {
    const count = Object.keys(items).filter(
      (k) => !["enabled", "direction", "backendUrl"].includes(k)
    ).length;
    cacheCountEl.textContent = count;
  });
}

refreshCacheCount();

toggleEl.addEventListener("change", () => {
  const isEnabled = toggleEl.checked;
  chrome.storage.local.set({ enabled: isEnabled });
  updateStatusBadge(isEnabled);
  broadcastToTabs({ type: "TOGGLE_ENABLED", enabled: isEnabled });
});

function updateStatusBadge(isEnabled) {
  if (isEnabled) {
    statusBadge.className = "status-badge active";
    statusText.textContent = "Đang hoạt động";
  } else {
    statusBadge.className = "status-badge inactive";
    statusText.textContent = "Đã tắt";
  }
}

dirSelector.addEventListener("click", (e) => {
  const btn = e.target.closest(".dir-btn");
  if (!btn) return;
  const dir = btn.dataset.dir;
  chrome.storage.local.set({ direction: dir });
  updateDirButtons(dir);
  broadcastToTabs({ type: "CHANGE_DIRECTION", direction: dir });
});

function updateDirButtons(dir) {
  document.querySelectorAll(".dir-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.dir === dir);
  });
}

function broadcastToTabs(message) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message, () => {
          chrome.runtime.lastError;
        });
      }
    });
  });
}

btnSaveBackend.addEventListener("click", () => {
  const backendUrl = toBackendBase(backendUrlEl.value);

  if (!/^https?:\/\//i.test(backendUrl)) {
    showFeedback(btnSaveBackend, "URL sai", "!");
    return;
  }

  chrome.storage.local.set({ backendUrl }, () => {
    showFeedback(btnSaveBackend, "Đã lưu", "OK");
  });
});

function toBackendBase(value) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/translate$/i, "");
}

btnClearCache.addEventListener("click", () => {
  chrome.storage.local.get(null, (items) => {
    const keysToRemove = Object.keys(items).filter(
      (k) => !["enabled", "direction", "backendUrl"].includes(k)
    );

    if (keysToRemove.length === 0) {
      showFeedback(btnClearCache, "Trống rồi!", "🗒️");
      return;
    }

    chrome.storage.local.remove(keysToRemove, () => {
      refreshCacheCount();
      showFeedback(btnClearCache, "Đã xóa!", "✅");
    });
  });
});

function showFeedback(btn, message, icon) {
  const originalText = btn.textContent;
  btn.textContent = `${icon} ${message}`;
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = originalText;
    btn.disabled = false;
  }, 1500);
}
