import { z } from "zod";
import { translateQuick, translateDetails } from "../services/openai.service.js";
import { isValidTextForTranslation, autoDetectDirection } from "../utils/validate-text.js";

const translateSchema = z.object({
  text: z
    .string({ required_error: "Field 'text' là bắt buộc." })
    .trim()
    .min(1, { message: "Text không được để trống." })
    .max(200, { message: "Text không được quá 200 ký tự." }),
  direction: z.enum(["en-vi", "vi-en", "auto"]).optional().default("auto"),
  mode: z.enum(["quick", "details"]).optional().default("quick"),
  translation: z.string().optional(), // Dùng cho mode details
});

export const translateController = async (req, res, next) => {
  try {
    const { text, direction: reqDirection, mode, translation } = translateSchema.parse(req.body);

    if (!isValidTextForTranslation(text)) {
      return res.status(400).json({
        success: false,
        error: { message: "Text không hợp lệ. Vui lòng nhập từ hoặc cụm từ cần dịch." },
      });
    }

    const direction = reqDirection === "auto" ? autoDetectDirection(text) : reqDirection;
    
    let result;
    if (mode === "quick") {
      result = await translateQuick(text, direction);
    } else {
      result = await translateDetails(text, direction, translation);
    }

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
