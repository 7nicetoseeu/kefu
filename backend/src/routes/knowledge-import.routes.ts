import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { AppError, asyncHandler, sendSuccess } from "../utils/response.js";
import { reviewItemTable } from "../services/tables.js";
import { generateLearningResult } from "../services/ai.service.js";
import { ReviewItem } from "../types.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".csv") {
      cb(null, true);
    } else {
      cb(new AppError(400, `仅支持 CSV 文件，当前文件类型: ${ext}`));
    }
  },
});

const router = Router();

/**
 * POST /api/knowledge-import/upload
 *
 * Upload a CSV file (huashu.csv format: id, title=场景, content=回复话术, notes=特殊情况说明)
 * AI processes the content and generates pending review items for the 人工审核 page.
 * After human approval, items flow into knowledge_base_items.csv.
 */
router.post(
  "/upload",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      throw new AppError(400, "请上传一个 CSV 文件");
    }

    const useAI = req.body.useAI === "true" || req.body.useAI === true;
    const content = file.buffer.toString("utf-8").trim();
    if (!content) {
      throw new AppError(400, "CSV 文件内容为空");
    }

    // Parse CSV (huashu.csv format: id, title=场景, content=话术, notes=特殊情况说明)
    const parsedItems = parseHuashuCsv(content);
    if (parsedItems.length === 0) {
      throw new AppError(400, "CSV 文件中没有有效的数据行");
    }

    let aiSummary = "";
    let knowledgePayloads: Array<Record<string, unknown>>;

    // Count items with missing titles to flag in the prompt
    const emptyTitleCount = parsedItems.filter((item) => !item.title).length;

    if (useAI) {
      // Build the content for AI processing — explicitly flag empty titles
      const csvPreview = parsedItems
        .map((item, idx) => {
          const titleLabel = item.title || "【标题缺失，请根据话术内容总结一个简洁的场景标题】";
          const notesLine = item.notes ? `\n特殊情况说明：${item.notes}` : "";
          return `条目${idx + 1}：\n场景：${titleLabel}\n话术：${item.content}${notesLine}`;
        })
        .join("\n\n---\n\n");

      try {
        const aiResult = await generateLearningResult({
          inputType: "business_rule",
          content: csvPreview,
          instruction: [
            "以上是官方话术知识库（话书）的内容。每个条目包含「场景」「话术」和可选的「特殊情况说明」。",
            "请逐条分析并整理为结构化的知识条目（knowledge），务必遵守以下规则：",
            emptyTitleCount > 0
              ? `1) 有 ${emptyTitleCount} 个条目标题为空（已标注「标题缺失」），你必须根据话术内容（content）自行总结一个精准简洁的场景标题，不超过15个字；`
              : "1) title 用场景作为标题，保持精准简洁，不超过15个字；",
            "2) content 将原始话术整理完善，使其可直接用于客服辅助；如果原始条目有「特殊情况说明」，将其融入 content 中作为补充说明；",
            "3) keywords 必须根据话术内容自行提取，至少3个，覆盖该场景的核心关键词便于检索（如：问候、物流、退款、安抚等），不允许留空或照搬原标题；",
            "4) category 根据场景合理归类（如：物流、售后、退款、开场、结束、通用等），不允许留空。",
            "返回完整的 knowledgeSuggestions 列表，条目数量必须与输入条目数量一致。",
          ].join(" "),
        });

        aiSummary = aiResult.summary;

        // Use AI-generated knowledge suggestions, merging with original items
        knowledgePayloads = aiResult.knowledgeSuggestions.map((s, index) => {
          const original = parsedItems[index] ?? parsedItems[parsedItems.length - 1];
          return {
            // If AI returned empty title, fall back to original; if original also empty, use content snippet
            title: s.title || original.title || truncateForTitle(original.content),
            content: s.content || original.content,
            keywords: s.keywords?.length ? s.keywords : generateFallbackKeywords(original.content),
            category: s.category || "通用",
          };
        });

        // If AI returned fewer items than parsed, fill the rest from originals
        if (knowledgePayloads.length < parsedItems.length) {
          for (let i = knowledgePayloads.length; i < parsedItems.length; i++) {
            const item = parsedItems[i];
            knowledgePayloads.push({
              title: item.title || truncateForTitle(item.content),
              content: item.content,
              keywords: generateFallbackKeywords(item.content),
              category: "通用",
            });
          }
        }
      } catch (error) {
        console.warn("AI enrichment failed, using raw parsed items:", error instanceof Error ? error.message : error);
        // Fallback: use parsed items with auto-generated titles and keywords where missing
        knowledgePayloads = parsedItems.map((item) => ({
          title: item.title || truncateForTitle(item.content),
          content: item.content,
          keywords: generateFallbackKeywords(item.content),
          category: "通用",
        }));
      }
    } else {
      // No AI — use parsed items directly, with fallback title generation for empty titles
      knowledgePayloads = parsedItems.map((item) => ({
        title: item.title || truncateForTitle(item.content),
        content: item.content,
        keywords: generateFallbackKeywords(item.content),
        category: "通用",
      }));
    }

    // Create pending review items — they will go through 人工审核 before entering the knowledge base
    const now = new Date().toISOString();
    const createdReviewItems: Array<Pick<ReviewItem, "id" | "type" | "status">> = [];

    for (const payload of knowledgePayloads) {
      const reviewItem = await reviewItemTable.create({
        learningTaskId: 0, // 0 = imported from external knowledge base (not from a learning task)
        type: "knowledge",
        status: "pending",
        payload,
        createdAt: now,
        updatedAt: now,
      });
      createdReviewItems.push({
        id: reviewItem.id,
        type: reviewItem.type,
        status: reviewItem.status,
      });
    }

    sendSuccess(res, {
      totalParsed: parsedItems.length,
      reviewItemsCreated: createdReviewItems.length,
      aiEnriched: useAI,
      aiSummary: aiSummary || null,
      reviewItems: createdReviewItems,
      message: `已生成 ${createdReviewItems.length} 条待审核知识条目，请前往「人工审核」页面批量审核通过后即可加入正式知识库。`,
    });
  }),
);

/**
 * POST /api/knowledge-import/preview
 *
 * Preview a CSV file without saving — returns parsed items for frontend preview.
 */
router.post(
  "/preview",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      throw new AppError(400, "请上传一个 CSV 文件");
    }

    const content = file.buffer.toString("utf-8").trim();
    if (!content) {
      throw new AppError(400, "CSV 文件内容为空");
    }

    const parsedItems = parseHuashuCsv(content);
    if (parsedItems.length === 0) {
      throw new AppError(
        400,
        "CSV 文件中没有有效的数据行，请检查格式是否为: id,title,content,notes（title=场景, content=话术, notes=特殊情况说明）",
      );
    }

    sendSuccess(res, {
      totalRows: parsedItems.length,
      headers: ["id", "title(场景)", "content(话术)", "notes(特殊情况说明)"],
      items: parsedItems,
    });
  }),
);

// ---------------------------------------------------------------------------
// CSV Parsing (huashu.csv format: id, title=场景, content=话术, notes=特殊情况说明)
// ---------------------------------------------------------------------------

interface ParsedHuashuItem {
  id?: number;
  title: string;
  content: string;
  notes?: string;
}

function parseHuashuCsv(text: string): ParsedHuashuItem[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) {
    return [];
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const dataRows = rows.slice(1);

  // Map column indices — support both Chinese and English headers
  const idIdx = header.findIndex((h) => h === "id");
  const titleIdx = header.findIndex((h) => h === "title" || h === "标题" || h === "场景");
  const contentIdx = header.findIndex((h) => h === "content" || h === "内容" || h === "话术");
  const notesIdx = header.findIndex((h) => h === "notes" || h === "备注" || h === "特殊情况说明" || h === "特殊情况");

  if (titleIdx === -1 || contentIdx === -1) {
    throw new AppError(
      400,
      "CSV 文件必须包含 title（场景）和 content（话术）列。当前检测到的列: " + header.join(", "),
    );
  }

  return dataRows
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => {
      const title = row[titleIdx]?.trim() ?? "";
      const content = row[contentIdx]?.trim() ?? "";
      const notes = notesIdx >= 0 ? (row[notesIdx] ?? "").trim() : undefined;

      const result: ParsedHuashuItem = { title, content };
      if (notes) result.notes = notes;
      if (idIdx >= 0) {
        const idVal = Number(row[idIdx]);
        if (!Number.isNaN(idVal)) result.id = idVal;
      }

      return result;
    });
}

// ---------------------------------------------------------------------------
// Low-level CSV row parser (handles quoted fields with commas/newlines)
// ---------------------------------------------------------------------------

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let currentLine = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      currentLine += '""';
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i++;
      }
      if (currentLine.length > 0) {
        rows.push(parseCsvLine(currentLine));
      }
      currentLine = "";
      continue;
    }

    currentLine += char;
  }

  if (currentLine.length > 0) {
    rows.push(parseCsvLine(currentLine));
  }

  return rows;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a short title from content when the original title is empty. */
function truncateForTitle(content: string): string {
  // Remove common punctuation and take first ~15 chars
  const cleaned = content.replace(/[，,。！!？?：:；;、\s]+/g, "").trim();
  if (cleaned.length <= 15) return cleaned;
  return cleaned.slice(0, 15) + "…";
}

/** Generate basic keywords from content as fallback when AI is unavailable. */
function generateFallbackKeywords(content: string): string[] {
  // Simple keyword extraction: split by common delimiters, keep meaningful tokens
  const tokens = content
    .replace(/[，,。！!？?：:；;、\s~～]+/g, " ")
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && t.length <= 8)
    .slice(0, 5);

  return tokens.length > 0 ? tokens : ["客服"];
}

export default router;
