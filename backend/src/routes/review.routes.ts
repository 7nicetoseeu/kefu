import { Router } from "express";
import {
  approveReviewItem,
  batchReview,
  getReviewItem,
  listReviewItems,
  rejectReviewItem,
  updateReviewItemPayload,
} from "../services/review.service.js";
import { asyncHandler, sendSuccess } from "../utils/response.js";
import { ReviewItemType, ReviewStatus } from "../types.js";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const data = await listReviewItems({
      status: req.query.status as ReviewStatus | undefined,
      type: req.query.type as ReviewItemType | undefined,
    });
    sendSuccess(res, data);
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = await getReviewItem(Number(req.params.id));
    sendSuccess(res, data);
  }),
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = await updateReviewItemPayload(Number(req.params.id), req.body.payload);
    sendSuccess(res, data);
  }),
);

router.post(
  "/:id/approve",
  asyncHandler(async (req, res) => {
    const data = await approveReviewItem(Number(req.params.id));
    sendSuccess(res, { reviewItem: data });
  }),
);

router.post(
  "/:id/reject",
  asyncHandler(async (req, res) => {
    const data = await rejectReviewItem(Number(req.params.id));
    sendSuccess(res, { reviewItem: data });
  }),
);

router.post(
  "/batch",
  asyncHandler(async (req, res) => {
    const { action, ids } = req.body as { action: "approve" | "reject"; ids: number[] };
    if (action !== "approve" && action !== "reject") {
      throw new Error("action must be 'approve' or 'reject'");
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error("ids must be a non-empty array");
    }
    const data = await batchReview(action, ids);
    sendSuccess(res, data);
  }),
);

export default router;
