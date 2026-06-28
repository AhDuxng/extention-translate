export const errorMiddleware = (error, req, res, next) => {
  console.error(`[ERROR] ${new Date().toISOString()} — ${req.method} ${req.path}`);
  console.error(`        ${error.message}`);

  let statusCode = error.statusCode || 500;

  if (error?.status) {
    statusCode = error.status;
  }

  return res.status(statusCode).json({
    success: false,
    error: {
      message:
        statusCode === 429
          ? "Quá nhiều yêu cầu. Vui lòng thử lại sau."
          : "Không thể dịch lúc này. Vui lòng thử lại.",
    },
  });
};
