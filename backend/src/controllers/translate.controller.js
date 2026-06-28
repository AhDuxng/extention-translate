import { z } from "zod";
import { translateWithOpenAI, translateWithOpenAIStream } from "../services/openai.service.js";
import { isValidTextForTranslation, autoDetectDirection } from "../utils/validate-text.js";

const translateSchema = z.object({
  text: z
    .string({ required_error: "Field 'text' là bắt buộc." })
    .trim()
    .min(1, { message: "Text không được để trống." })
    .max(200, { message: "Text không được quá 200 ký tự." }),
  direction: z.enum(["en-vi", "vi-en", "auto"]).optional().default("auto"),
  stream: z.boolean().optional().default(false),
});

export const translateController = async (req, res, next) => {
  try {
    const { text, direction: reqDirection, stream } = translateSchema.parse(req.body);

    if (!isValidTextForTranslation(text)) {
      return res.status(400).json({
        success: false,
        error: { message: "Text không hợp lệ. Vui lòng nhập từ hoặc cụm từ cần dịch." },
      });
    }

    const direction = reqDirection === "auto" ? autoDetectDirection(text) : reqDirection;

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      await translateWithOpenAIStream(text, direction, ({ type, key, value, data }) => {
        if (type === "field") {
          res.write(`data: ${JSON.stringify({ type: "field", key, value })}\n\n`);
        } else if (type === "done") {
          res.write(`data: ${JSON.stringify({ type: "done", data })}\n\n`);
        }
      });

      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      const result = await translateWithOpenAI(text, direction);
      return res.json({ success: true, data: result });
    }
  } catch (error) {
    if (error.name === "ZodError") {
      return res.status(400).json({
        success: false,
        error: {
          message: error.errors[0]?.message || "Dữ liệu đầu vào không hợp lệ.",
        },
      });
    }
    if (!res.headersSent) {
      next(error);
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", message: "Lỗi khi dịch. Vui lòng thử lại." })}\n\n`);
      res.end();
    }
  }
};
