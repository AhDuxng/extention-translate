"use strict";

const BACKEND_URL = "https://quick-viet-translator-backend.onrender.com/api/translate";

// --- PDF.js Intercept ---
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) {
    const url = details.url.toLowerCase();
    if (url.endsWith(".pdf") || url.includes(".pdf?")) {
      const viewerUrl = chrome.runtime.getURL("pdf.js/web/viewer.html") + "?file=" + encodeURIComponent(details.url);
      chrome.tabs.update(details.tabId, { url: viewerUrl });
    }
  }
});

// --- Translation Logic ---
async function getCachedTranslation(text, direction) {
  const key = `${direction}:${text.toLowerCase().trim()}`;
  const result = await chrome.storage.local.get(key);
  return result[key] || null;
}

async function setCachedTranslation(text, direction, data) {
  const key = `${direction}:${text.toLowerCase().trim()}`;
  await chrome.storage.local.set({ [key]: { ...data, cachedAt: Date.now() } });
}

async function translateMode(text, direction, mode, translationStr = "", signal) {
  const response = await fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, direction, mode, translation: translationStr }),
    signal,
  });

  const json = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(json?.error?.message || "Không thể dịch lúc này. Vui lòng thử lại.");
  }
  return json.data;
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "translation-stream") return;

  let abortController = null;

  port.onMessage.addListener(async (message) => {
    if (message.type === "TRANSLATE_QUICK") {
      if (abortController) abortController.abort();
      abortController = new AbortController();
      
      const { text, direction } = message;
      
      // Kiểm tra cache (nếu đã cache full thì gửi thẳng full luôn)
      const cached = await getCachedTranslation(text, direction);
      if (cached && cached.explanation) {
        port.postMessage({ type: "done_full", data: { ...cached, fromCache: true } });
        return;
      }

      try {
        // Bước 1: Quick
        const quickData = await translateMode(text, direction, "quick", "", abortController.signal);
        port.postMessage({ type: "done_quick", data: quickData });

        // Bước 2: Details
        const detailsData = await translateMode(text, direction, "details", quickData.translation, abortController.signal);
        
        const fullData = { ...quickData, ...detailsData };
        await setCachedTranslation(text, direction, fullData);
        
        port.postMessage({ type: "done_details", data: fullData });

      } catch (error) {
        if (error.name === "AbortError") return;
        port.postMessage({ type: "error", message: error.message || "Lỗi không xác định." });
      }
    }
  });

  port.onDisconnect.addListener(() => {
    if (abortController) abortController.abort();
    abortController = null;
  });
});
