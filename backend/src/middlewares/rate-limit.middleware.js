import rateLimit from "express-rate-limit";

export const translateRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    error: {
      message: "Quá nhiều yêu cầu. Vui lòng thử lại sau 1 phút.",
    },
  },

  handler: (req, res, next, options) => {
    res.status(options.statusCode).json(options.message);
  },
});
