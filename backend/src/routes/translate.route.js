import { Router } from "express";
import { translateController } from "../controllers/translate.controller.js";
import { translateRateLimit } from "../middlewares/rate-limit.middleware.js";

const router = Router();

router.post("/", translateRateLimit, translateController);

export default router;
