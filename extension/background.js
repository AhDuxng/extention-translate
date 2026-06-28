"use strict";

const BACKEND_URL = "https://quick-viet-translator-backend.onrender.com/api/translate";

async function getCachedTranslation(text, direction) {
  const key = `${direction}:${text.toLowerCase().trim()}`;
  const result = await chrome.storage.local.get(key);
  return result[key] || null;
}

async function setCachedTranslation(text, direction, data) {
  const key = `${direction}:${text.toLowerCase().trim()}`;
  await chrome.storage.local.set({ [key]: { ...data, cachedAt: Date.now() } });
}

async function translate(text, direction, port, signal) {
  const cached = await getCachedTranslation(text, direction);
  if (cached) {
    port.postMessage({ type: "done", data: { ...cached, fromCache: true } });
    return;
  }

  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, direction }),
      signal,
    });

    const json = await response.json();

    if (!response.ok || !json.success) {
      throw new Error(json?.error?.message || "Không thể dịch lúc này. Vui lòng thử lại.");
    }

    await setCachedTranslation(text, direction, json.data);
    port.postMessage({ type: "done", data: json.data });
  } catch (error) {
    if (error.name === "AbortError") return;
    port.postMessage({ type: "error", message: error.message || "Lỗi không xác định." });
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "translation-stream") return;

  let abortController = null;

  port.onMessage.addListener(async (message) => {
    if (message.type === "TRANSLATE_STREAM") {
      if (abortController) abortController.abort();
      abortController = new AbortController();
      await translate(message.text, message.direction, port, abortController.signal);
    }
  });

  port.onDisconnect.addListener(() => {
    if (abortController) abortController.abort();
    abortController = null;
  });
});
