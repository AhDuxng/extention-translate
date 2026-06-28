import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EN_VI_SYSTEM = `You are an English-to-Vietnamese translator for a browser extension.
Translate the English word or phrase. Return ONLY valid JSON, no markdown, no extra text.
Required JSON (all fields required, keep values concise):
{"original":"...","translation":"...","type":"noun|verb|adjective|phrase|technical","explanation":"...","example":"...","example_vi":"..."}`.trim();

const VI_EN_SYSTEM = `You are a Vietnamese-to-English translator for a browser extension.
Translate the Vietnamese word or phrase. Return ONLY valid JSON, no markdown, no extra text.
Required JSON (all fields required, keep values concise):
{"original":"...","translation":"...","type":"noun|verb|adjective|phrase","explanation":"...","example":"..."}`.trim();

export const translateWithOpenAI = async (text, direction = "en-vi") => {
  const system = direction === "vi-en" ? VI_EN_SYSTEM : EN_VI_SYSTEM;
  const userPrompt = direction === "vi-en"
    ? `Translate to English: "${text}"`
    : `Translate to Vietnamese: "${text}"`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 300,
    temperature: 0.2,
  });

  const rawText = response.choices[0]?.message?.content;
  if (!rawText || rawText.trim() === "") {
    throw new Error("Model trả về nội dung rỗng.");
  }

  try {
    return sanitizeOutput(JSON.parse(rawText.trim()), text, direction);
  } catch {
    const extracted = extractJsonFromText(rawText);
    if (extracted) return sanitizeOutput(extracted, text, direction);
    throw new Error("Model không trả về JSON hợp lệ. Vui lòng thử lại.");
  }
};

export const translateWithOpenAIStream = async (text, direction = "en-vi", onField) => {
  const system = direction === "vi-en" ? VI_EN_SYSTEM : EN_VI_SYSTEM;
  const userPrompt = direction === "vi-en"
    ? `Translate to English: "${text}"`
    : `Translate to Vietnamese: "${text}"`;

  const stream = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 300,
    temperature: 0.2,
    stream: true,
  });

  let accumulated = "";
  const emitted = {};

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || "";
    accumulated += delta;

    const partial = extractPartialFields(accumulated);
    for (const [key, value] of Object.entries(partial)) {
      if (emitted[key] !== value) {
        emitted[key] = value;
        onField({ type: "field", key, value });
      }
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(accumulated.trim());
  } catch {
    parsed = extractJsonFromText(accumulated);
  }

  if (!parsed) throw new Error("Model không trả về JSON hợp lệ.");

  const result = sanitizeOutput(parsed, text, direction);
  onField({ type: "done", data: result });
  return result;
};

const sanitizeOutput = (data, originalText, direction) => {
  const out = {
    original: data.original || originalText,
    translation: data.translation || "(Không có bản dịch)",
    type: data.type || "",
    explanation: data.explanation || "",
    example: data.example || "",
    direction,
  };
  if (direction === "en-vi") {
    out.example_vi = data.example_vi || "";
  }
  return out;
};

const extractPartialFields = (text) => {
  const fields = {};
  const patterns = {
    original: /"original"\s*:\s*"((?:[^"\\]|\\.)*)"/,
    translation: /"translation"\s*:\s*"((?:[^"\\]|\\.)*)"/,
    type: /"type"\s*:\s*"((?:[^"\\]|\\.)*)"/,
    explanation: /"explanation"\s*:\s*"((?:[^"\\]|\\.)*)"/,
    example: /"example"\s*:\s*"((?:[^"\\]|\\.)*)"/,
    example_vi: /"example_vi"\s*:\s*"((?:[^"\\]|\\.)*)"/,
  };
  for (const [key, pattern] of Object.entries(patterns)) {
    const match = text.match(pattern);
    if (match) fields[key] = match[1];
  }
  return fields;
};

const extractJsonFromText = (text) => {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { return null; }
  }
  return null;
};
