"use strict";

const DEFAULT_BACKEND_URL = "https://quick-viet-translator-backend.onrender.com/api/translate";
const LOCAL_BACKEND_URL = "http://localhost:3000/api/translate";
const EXTENSION_ORIGIN = chrome.runtime.getURL("");

// --- PDF.js Intercept ---
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0 || isExtensionUrl(details.url) || !isPdfUrl(details.url)) {
    return;
  }

  const viewerUrl = chrome.runtime.getURL("pdf.js/web/viewer.html") + "?file=" + encodeURIComponent(details.url);
  chrome.tabs.update(details.tabId, { url: viewerUrl }, () => {
    chrome.runtime.lastError;
  });
});

function isExtensionUrl(url) {
  return url.startsWith(EXTENSION_ORIGIN);
}

function isPdfUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return ["http:", "https:", "file:", "ftp:"].includes(url.protocol) && url.pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return /\.pdf(?:[?#].*)?$/i.test(rawUrl);
  }
}

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
  const backendUrl = await getBackendUrl();

  try {
    return await requestTranslation(backendUrl, text, direction, mode, translationStr, signal);
  } catch (error) {
    if (backendUrl === DEFAULT_BACKEND_URL && isNetworkError(error)) {
      return requestTranslation(LOCAL_BACKEND_URL, text, direction, mode, translationStr, signal);
    }
    throw error;
  }
}

async function getBackendUrl() {
  const result = await chrome.storage.local.get("backendUrl");
  return normalizeBackendUrl(result.backendUrl) || DEFAULT_BACKEND_URL;
}

function normalizeBackendUrl(value) {
  if (!value || typeof value !== "string") return "";
  const url = value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(url)) return "";
  return url.endsWith("/api/translate") ? url : `${url}/api/translate`;
}

async function requestTranslation(url, text, direction, mode, translationStr, signal) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, direction, mode, translation: translationStr }),
    signal,
  });

  const json = await readJsonResponse(response);
  if (!response.ok || !json.success) {
    throw new Error(json?.error?.message || "Không thể dịch lúc này. Vui lòng thử lại.");
  }
  return json.data;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Backend trả về dữ liệu không hợp lệ. Vui lòng kiểm tra lại endpoint.");
  }
}

function isNetworkError(error) {
  return error instanceof TypeError || /failed to fetch|network/i.test(error?.message || "");
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
