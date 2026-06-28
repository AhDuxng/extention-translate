import { z } from "zod";
import { translateWithOpenAI } from "../services/openai.service.js";
import { isValidTextForTranslation, autoDetectDirection } from "../utils/validate-text.js";

const translateSchema = z.object({
  text: z
    .string({ required_error: "Field 'text' là bắt buộc." })
    .trim()
    .min(1, { message: "Text không được để trống." })
    .max(200, { message: "Text không được quá 200 ký tự." }),
  direction: z.enum(["en-vi", "vi-en", "auto"]).optional().default("auto"),
});

export const translateController = async (req, res, next) => {
  try {
    const { text, direction: reqDirection } = translateSchema.parse(req.body);

    if (!isValidTextForTranslation(text)) {
      return res.status(400).json({
        success: false,
        error: { message: "Text không hợp lệ. Vui lòng nhập từ hoặc cụm từ cần dịch." },
      });
    }

    const direction = reqDirection === "auto" ? autoDetectDirection(text) : reqDirection;
    const result = await translateWithOpenAI(text, direction);

    return res.json({ success: true, data: result });
  } catch (error) {
    if (error.name === "ZodError") {
      return res.status(400).json({
        success: false,
        error: {
          message: error.errors[0]?.message || "Dữ liệu đầu vào không hợp lệ.",
        },
      });
    }
    next(error);
  }
};
