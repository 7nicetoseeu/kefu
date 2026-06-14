import { Router } from "express";
import {
  createMapping,
  deleteMapping,
  listMappings,
  searchMappings,
  updateMapping,
} from "../services/keywordMapping.service.js";
import { asyncHandler, sendSuccess } from "../utils/response.js";

const router = Router();

// 列出所有映射
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const data = await listMappings();
    sendSuccess(res, data);
  }),
);

// 按关键词搜索映射
router.get(
  "/search",
  asyncHandler(async (req, res) => {
    const keyword = (req.query.keyword as string) ?? "";
    const data = await searchMappings(keyword);
    sendSuccess(res, data);
  }),
);

// 创建映射
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { keyword, script, priority } = req.body as {
      keyword?: string;
      script?: string;
      priority?: number;
    };
    if (!keyword?.trim() || !script?.trim()) {
      return res
        .status(400)
        .json({ success: false, error: { message: "keyword and script are required" } });
    }
    const data = await createMapping({ keyword: keyword.trim(), script: script.trim(), priority });
    sendSuccess(res, data);
  }),
);

// 更新映射
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { keyword, script, priority } = req.body as {
      keyword?: string;
      script?: string;
      priority?: number;
    };
    const data = await updateMapping(id, { keyword, script, priority });
    if (!data) {
      return res.status(404).json({ success: false, error: { message: "mapping not found" } });
    }
    sendSuccess(res, data);
  }),
);

// 删除映射
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const deleted = await deleteMapping(id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: { message: "mapping not found" } });
    }
    sendSuccess(res, { deleted: true });
  }),
);

export default router;
