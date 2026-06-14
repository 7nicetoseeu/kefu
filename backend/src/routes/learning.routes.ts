import { Router } from "express";
import { generateLearning, getLearningTask, listLearningTasks } from "../services/learning.service.js";
import { asyncHandler, sendSuccess } from "../utils/response.js";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const data = await listLearningTasks();
    sendSuccess(res, data);
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = await getLearningTask(Number(req.params.id));
    sendSuccess(res, data);
  }),
);

router.post(
  "/generate",
  asyncHandler(async (req, res) => {
    const data = await generateLearning(req.body);
    sendSuccess(res, data);
  }),
);

export default router;
