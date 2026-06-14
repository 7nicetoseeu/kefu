import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { AppError, asyncHandler, sendSuccess } from "../utils/response.js";
import { generateLearning } from "../services/learning.service.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 10,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [".txt", ".csv", ".json", ".log"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext) || !ext) {
      cb(null, true);
    } else {
      cb(new AppError(400, `不支持的文件类型: ${ext}，仅支持 ${allowed.join(", ")}`));
    }
  },
});

const router = Router();

router.post(
  "/upload",
  upload.array("files", 10),
  asyncHandler(async (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      throw new AppError(400, "请上传至少一个文件");
    }

    const results: Array<{ fileName: string; taskId: number; reviewCount: number }> = [];

    for (const file of files) {
      const content = file.buffer.toString("utf-8").trim();
      if (!content) {
        continue;
      }

      // Parse CSV if applicable
      let processedContent: string;
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === ".csv") {
        try {
          processedContent = parseChatCsv(content);
        } catch {
          // If CSV parsing fails, use the raw content
          processedContent = content;
        }
      } else {
        processedContent = content;
      }

      const result = await generateLearning({
        inputType: "chat_history",
        content: processedContent,
        instruction: `请从以下客服聊天记录中总结客服辅助 Agent 可以学习的知识点、处理规则、推荐话术和风险提示。`,
      });

      results.push({
        fileName: file.originalname,
        taskId: result.learningTask.id,
        reviewCount: result.reviewItems.length,
      });
    }

    sendSuccess(res, {
      processed: results.length,
      totalReviewItems: results.reduce((sum, r) => sum + r.reviewCount, 0),
      results,
    });
  }),
);

/**
 * Simple CSV parser for chat history.
 * Expects columns: 时间, 角色, 内容  or  time, role, content
 * Falls back to raw content if parsing fails.
 */
function parseChatCsv(text: string): string {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return text;
  }

  const header = lines[0].toLowerCase();
  const hasRole = header.includes("角色") || header.includes("role") || header.includes("发送方");

  if (!hasRole) {
    // If no role column, treat as plain text chat log
    return lines.slice(1).join("\n");
  }

  // Parse structured CSV into readable chat format
  const rows = lines.slice(1);
  const formatted: string[] = [];

  for (const row of rows) {
    // Simple CSV parsing (no quoted fields for simplicity)
    const cols = row.split(",");
    if (cols.length >= 2) {
      // Assume: time, role, content  or  role, content  or  content, role
      // Try to identify role column
      const trimmed = cols.map((c) => c.trim());
      const roleIdx = trimmed.findIndex(
        (c) => c === "客服" || c === "客户" || c === "agent" || c === "customer" || c === "系统",
      );
      if (roleIdx >= 0) {
        const role = trimmed[roleIdx];
        const content = trimmed.filter((_, i) => i !== roleIdx).join(" ");
        formatted.push(`${role}: ${content}`);
      } else {
        formatted.push(trimmed.join(" "));
      }
    } else {
      formatted.push(row);
    }
  }

  return formatted.join("\n");
}

export default router;
