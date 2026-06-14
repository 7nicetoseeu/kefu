import { Router } from "express";
import { ActiveStatus, LibraryType } from "../types.js";
import {
  batchUpdateCategories,
  createKnowledgeCategory,
  getKnowledgeCategories,
  getLibraryItem,
  listLibraryItems,
  searchKnowledge,
  updateLibraryItemCategory,
  updateLibraryItemStatus,
} from "../services/library.service.js";
import { asyncHandler, sendSuccess } from "../utils/response.js";

const router = Router();

router.get(
  "/knowledge/categories",
  asyncHandler(async (_req, res) => {
    const data = await getKnowledgeCategories();
    sendSuccess(res, data);
  }),
);

router.put(
  "/knowledge/categories",
  asyncHandler(async (req, res) => {
    const { renames } = req.body as { renames: Array<{ from: string; to: string }> };
    if (!Array.isArray(renames) || renames.length === 0) {
      throw new Error("renames must be a non-empty array");
    }
    const data = await batchUpdateCategories(renames);
    sendSuccess(res, data);
  }),
);

router.post(
  "/knowledge/categories",
  asyncHandler(async (req, res) => {
    const { name } = req.body as { name?: string };
    if (name === undefined || name === null) {
      throw new Error("name is required");
    }
    const data = await createKnowledgeCategory(name);
    sendSuccess(res, data);
  }),
);

router.get(
  "/knowledge/search",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string) || "";
    const limit = Number(req.query.limit) || 5;
    const data = await searchKnowledge(q, Math.min(limit, 20));
    sendSuccess(res, data);
  }),
);

router.patch(
  "/knowledge/:id/category",
  asyncHandler(async (req, res) => {
    const { category } = req.body as { category: string };
    // Allow empty string to clear category
    if (category === undefined || category === null) throw new Error("category is required");
    const data = await updateLibraryItemCategory(Number(req.params.id), category);
    sendSuccess(res, data);
  }),
);

router.get(
  "/:type",
  asyncHandler(async (req, res) => {
    const data = await listLibraryItems(req.params.type as LibraryType, {
      status: req.query.status as ActiveStatus | undefined,
      category: req.query.category as string | undefined,
    });
    sendSuccess(res, data);
  }),
);

router.get(
  "/:type/:id",
  asyncHandler(async (req, res) => {
    const data = await getLibraryItem(req.params.type as LibraryType, Number(req.params.id));
    sendSuccess(res, data);
  }),
);

router.patch(
  "/:type/:id/status",
  asyncHandler(async (req, res) => {
    const data = await updateLibraryItemStatus(
      req.params.type as LibraryType,
      Number(req.params.id),
      req.body.status as ActiveStatus,
    );
    sendSuccess(res, data);
  }),
);

export default router;
