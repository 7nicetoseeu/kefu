import { ReviewItem, ReviewItemType, ReviewStatus } from "../types.js";
import { AppError } from "../utils/response.js";
import {
  knowledgeBaseTable,
  reviewItemTable,
  riskTipTable,
  ruleItemTable,
  scriptItemTable,
} from "./tables.js";

export interface ReviewFilters {
  status?: ReviewStatus;
  type?: ReviewItemType;
}

const reviewStatuses: ReviewStatus[] = ["pending", "approved", "rejected"];
const reviewTypes: ReviewItemType[] = ["knowledge", "rule", "script", "risk_tip"];

export async function listReviewItems(filters: ReviewFilters) {
  let rows = await reviewItemTable.all();

  if (filters.status) {
    if (!reviewStatuses.includes(filters.status)) {
      throw new AppError(400, "status is invalid");
    }
    rows = rows.filter((row) => row.status === filters.status);
  }

  if (filters.type) {
    if (!reviewTypes.includes(filters.type)) {
      throw new AppError(400, "type is invalid");
    }
    rows = rows.filter((row) => row.type === filters.type);
  }

  return rows.sort((a, b) => b.id - a.id);
}

export async function getReviewItem(id: number) {
  const reviewItem = await reviewItemTable.findById(id);
  if (!reviewItem) {
    throw new AppError(404, "review item not found");
  }
  return reviewItem;
}

export async function updateReviewItemPayload(id: number, payload: unknown) {
  const reviewItem = await getReviewItem(id);

  if (reviewItem.status !== "pending") {
    throw new AppError(400, "only pending review items can be edited");
  }

  if (!isJsonObject(payload)) {
    throw new AppError(400, "payload must be a JSON object");
  }

  const updated = await reviewItemTable.update(id, {
    payload,
    updatedAt: new Date().toISOString(),
  } as Partial<ReviewItem>);

  return updated as ReviewItem;
}

export async function approveReviewItem(id: number) {
  const reviewItem = await getReviewItem(id);

  if (reviewItem.status !== "pending") {
    throw new AppError(400, "only pending review items can be approved");
  }

  const now = new Date().toISOString();
  const target = await createTargetRecord(reviewItem, now);
  const updated = await reviewItemTable.update(id, {
    status: "approved",
    targetId: target.id,
    reviewedAt: now,
    updatedAt: now,
  } as Partial<ReviewItem>);

  return updated as ReviewItem;
}

export async function rejectReviewItem(id: number) {
  const reviewItem = await getReviewItem(id);

  if (reviewItem.status !== "pending") {
    throw new AppError(400, "only pending review items can be rejected");
  }

  const now = new Date().toISOString();
  const updated = await reviewItemTable.update(id, {
    status: "rejected",
    reviewedAt: now,
    updatedAt: now,
  } as Partial<ReviewItem>);

  return updated as ReviewItem;
}

async function createTargetRecord(reviewItem: ReviewItem, now: string) {
  const payload = reviewItem.payload;

  switch (reviewItem.type) {
    case "knowledge":
      return knowledgeBaseTable.create({
        title: String(payload.title ?? ""),
        content: String(payload.content ?? ""),
        keywords: Array.isArray(payload.keywords) ? payload.keywords.map(String) : [],
        category: payload.category ? String(payload.category) : undefined,
        status: "active",
        sourceReviewId: reviewItem.id,
        createdAt: now,
        updatedAt: now,
      });
    case "rule":
      return ruleItemTable.create({
        name: String(payload.name ?? ""),
        trigger: String(payload.trigger ?? ""),
        triggerKeywords: Array.isArray(payload.triggerKeywords) ? payload.triggerKeywords.map(String) : [],
        action: String(payload.action ?? ""),
        priority: Number(payload.priority ?? 50),
        riskLevel: String(payload.riskLevel ?? "low"),
        status: "active",
        sourceReviewId: reviewItem.id,
        createdAt: now,
        updatedAt: now,
      });
    case "script":
      return scriptItemTable.create({
        scene: String(payload.scene ?? ""),
        content: String(payload.content ?? ""),
        tone: payload.tone ? String(payload.tone) : undefined,
        priority: 0,
        status: "active",
        sourceReviewId: reviewItem.id,
        createdAt: now,
        updatedAt: now,
      });
    case "risk_tip":
      return riskTipTable.create({
        scene: String(payload.scene ?? ""),
        content: String(payload.content ?? ""),
        status: "active",
        sourceReviewId: reviewItem.id,
        createdAt: now,
        updatedAt: now,
      });
    default:
      throw new AppError(400, "review item type is invalid");
  }
}

export interface BatchReviewResult {
  id: number;
  status: "approved" | "rejected" | "skipped";
  reason?: string;
}

export async function batchReview(action: "approve" | "reject", ids: number[]): Promise<BatchReviewResult[]> {
  const results: BatchReviewResult[] = [];

  for (const id of ids) {
    try {
      if (action === "approve") {
        await approveReviewItem(id);
        results.push({ id, status: "approved" });
      } else {
        await rejectReviewItem(id);
        results.push({ id, status: "rejected" });
      }
    } catch (error) {
      const reason = error instanceof AppError ? error.message : "处理失败";
      results.push({ id, status: "skipped", reason });
    }
  }

  return results;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
