import "dotenv/config";
import app from "./app.js";

const PORT = process.env.PORT || 3000;

if (!process.env.OPENAI_API_KEY) {
  console.warn("Warning: OPENAI_API_KEY is not set. /health will work, but /api/translate will return 503.");
}

app.listen(PORT, () => {
  console.log(`Backend proxy running at http://localhost:${PORT}`);
  console.log(`Endpoint: POST http://localhost:${PORT}/api/translate`);
  console.log(`Health:   GET  http://localhost:${PORT}/health`);
});
