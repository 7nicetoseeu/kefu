import { Router } from "express";
import { testAiConnection } from "../services/ai.service.js";
import { asyncHandler, sendSuccess } from "../utils/response.js";

const router = Router();

router.post(
  "/test",
  asyncHandler(async (_req, res) => {
    const data = await testAiConnection();
    sendSuccess(res, data);
  }),
);

export default router;
