import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const translateQuick = async (text, direction = "en-vi") => {
  const system = direction === "vi-en" 
    ? `Translate Vietnamese to English. Return valid JSON only: {"translation":"...","type":"noun|verb|adjective|phrase"}`
    : `Translate English to Vietnamese. Return valid JSON only: {"translation":"...","type":"noun|verb|adjective|phrase|technical"}`;
  
  const userPrompt = `"${text}"`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 50, // siêu ngắn, siêu nhanh
    temperature: 0.1,
  });

  return parseJsonResponse(response.choices[0]?.message?.content, text, direction, "quick");
};

export const translateDetails = async (text, direction = "en-vi", translation = "") => {
  const system = direction === "vi-en"
    ? `You are an English teacher. The user translated Vietnamese "${text}" to English "${translation}". 
Provide explanation and example in valid JSON only:
{"explanation":"(Short English explanation)","example":"(English example sentence)"}`
    : `You are an English teacher. The user translated English "${text}" to Vietnamese "${translation}". 
Provide explanation and example in valid JSON only:
{"explanation":"(Short Vietnamese explanation)","example":"(English example sentence)","example_vi":"(Vietnamese translation of the example)"}`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Please provide details.` },
    ],
    max_tokens: 250,
    temperature: 0.2,
  });

  return parseJsonResponse(response.choices[0]?.message?.content, text, direction, "details");
};

const parseJsonResponse = (rawText, originalText, direction, mode) => {
  if (!rawText || rawText.trim() === "") {
    throw new Error("Model trả về nội dung rỗng.");
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText.trim());
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { parsed = null; }
    }
  }

  if (!parsed) throw new Error("Model không trả về JSON hợp lệ.");

  if (mode === "quick") {
    return {
      original: originalText,
      translation: parsed.translation || "(Không có bản dịch)",
      type: parsed.type || "",
      direction
    };
  } else {
    const out = {
      explanation: parsed.explanation || "",
      example: parsed.example || "",
    };
    if (direction === "en-vi") {
      out.example_vi = parsed.example_vi || "";
    }
    return out;
  }
};
