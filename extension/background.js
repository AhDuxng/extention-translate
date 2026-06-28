"use strict";

const BACKEND_URL = "http://localhost:3000/api/translate";

async function getCachedTranslation(text, direction) {
  const key = `${direction}:${text.toLowerCase().trim()}`;
  const result = await chrome.storage.local.get(key);
  return result[key] || null;
}

async function setCachedTranslation(text, direction, data) {
  const key = `${direction}:${text.toLowerCase().trim()}`;
  await chrome.storage.local.set({ [key]: { ...data, cachedAt: Date.now() } });
}

async function streamTranslation(text, direction, port, signal) {
  const cached = await getCachedTranslation(text, direction);
  if (cached) {
    port.postMessage({ type: "done", data: { ...cached, fromCache: true } });
    return;
  }

  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, direction, stream: true }),
      signal,
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson?.error?.message || "Không thể kết nối backend.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalData = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") break;

        try {
          const event = JSON.parse(raw);
          if (event.type === "field") {
            port.postMessage({ type: "field", key: event.key, value: event.value });
          } else if (event.type === "done") {
            finalData = event.data;
            port.postMessage({ type: "done", data: event.data });
          } else if (event.type === "error") {
            port.postMessage({ type: "error", message: event.message });
          }
        } catch {}
      }
    }

    if (finalData) {
      await setCachedTranslation(text, direction, finalData);
    }
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
      await streamTranslation(message.text, message.direction, port, abortController.signal);
    }
  });

  port.onDisconnect.addListener(() => {
    if (abortController) abortController.abort();
    abortController = null;
  });
});
