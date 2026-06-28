import express from "express";
import cors from "cors";
import translateRoute from "./routes/translate.route.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";

const app = express();

const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";

app.use(
  cors({
    origin: allowedOrigin,
    methods: ["POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json({ limit: "20kb" }));

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Quick Viet Translator backend is running." });
});

app.use("/api/translate", translateRoute);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { message: "Endpoint not found." },
  });
});

app.use(errorMiddleware);

export default app;
