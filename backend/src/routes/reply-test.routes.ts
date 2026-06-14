import { Router } from "express";
import { runReplyTest } from "../services/replyTest.service.js";
import { asyncHandler, sendSuccess } from "../utils/response.js";

const router = Router();

router.post(
  "/generate",
  asyncHandler(async (req, res) => {
    const data = await runReplyTest(req.body);
    sendSuccess(res, data);
  }),
);

export default router;
