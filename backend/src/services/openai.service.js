import OpenAI from "openai";

let client;

const getClient = () => {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("Backend chưa cấu hình OPENAI_API_KEY.");
    error.statusCode = 503;
    throw error;
  }

  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return client;
};

export const translateQuick = async (text, direction = "en-vi") => {
  const system = direction === "vi-en" 
    ? `You are a senior translator for computer science and information technology research papers.
Translate Vietnamese to precise academic English for IT/CS papers.
Preserve technical meaning, acronyms, algorithm names, dataset names, model names, citations, formulas, code identifiers, units, and variable names.
Prefer standard research-paper terminology over casual wording. Do not add information.
Return valid JSON only:
{"translation":"...","type":"term|acronym|phrase|sentence|technical expression"}`
    : `You are a senior translator for computer science and information technology research papers.
Translate English to precise academic Vietnamese for IT/CS papers.
Preserve standard technical terms when they are commonly used in English in Vietnamese papers, e.g. API, cache, embedding, pipeline, framework, benchmark, dataset, transformer.
Preserve acronyms, algorithm names, dataset names, model names, citations, formulas, code identifiers, units, and variable names.
Use concise, natural Vietnamese suitable for reading academic papers. Do not add information.
Return valid JSON only:
{"translation":"...","type":"term|acronym|phrase|sentence|technical expression"}`;
  
  const userPrompt = `"${text}"`;

  const response = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 360,
    temperature: 0.1,
  });

  return parseJsonResponse(response.choices[0]?.message?.content, text, direction, "quick");
};

export const translateDetails = async (text, direction = "en-vi", translation = "") => {
  const system = direction === "vi-en"
    ? `You are a computer science paper translator.
The Vietnamese source is "${text}" and the English translation is "${translation}".
Explain briefly why the translation fits an IT/CS research-paper context. Mention key terminology only when useful.
Return valid JSON only:
{"explanation":"(Brief explanation in English)","example":"(Academic English example sentence using the term naturally)"}`
    : `You are a computer science paper translator.
The English source is "${text}" and the Vietnamese translation is "${translation}".
Explain briefly in Vietnamese why this wording fits an IT/CS research-paper context. Mention key terminology only when useful.
Return valid JSON only:
{"explanation":"(Giải thích ngắn bằng tiếng Việt)","example":"(Academic English example sentence using the term naturally)","example_vi":"(Bản dịch tiếng Việt của example)"}`;

  const response = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Please provide details.` },
    ],
    max_tokens: 360,
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
