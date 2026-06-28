import "dotenv/config";
import app from "./app.js";

const PORT = process.env.PORT || 3000;

if (!process.env.OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY is not set in .env file");
  console.error("   Create a .env file and add: OPENAI_API_KEY=sk-...");
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`Backend proxy running at http://localhost:${PORT}`);
  console.log(`Endpoint: POST http://localhost:${PORT}/api/translate`);
  console.log(`Health:   GET  http://localhost:${PORT}/health`);
});
