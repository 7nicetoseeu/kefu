import { AppError } from "../utils/response.js";
import { generateLearningResult } from "./ai.service.js";
import { learningTaskTable, reviewItemTable } from "./tables.js";
import { LearningInputType, LearningTask, ReviewItem, ReviewItemType } from "../types.js";

const allowedInputTypes: LearningInputType[] = ["natural_language", "chat_history", "business_rule"];

export interface GenerateLearningRequest {
  inputType: LearningInputType;
  content: string;
  instruction?: string;
}

export async function listLearningTasks(): Promise<LearningTask[]> {
  const rows = await learningTaskTable.all();
  return rows.sort((a, b) => b.id - a.id);
}

export async function getLearningTask(id: number): Promise<LearningTask> {
  const task = await learningTaskTable.findById(id);
  if (!task) {
    throw new AppError(404, "learning task not found");
  }
  return task;
}

export async function generateLearning(input: GenerateLearningRequest) {
  if (!allowedInputTypes.includes(input.inputType)) {
    throw new AppError(400, "inputType is invalid");
  }

  if (!input.content || input.content.trim().length === 0) {
    throw new AppError(400, "content is required");
  }

  const now = new Date().toISOString();
  const result = await generateLearningResult(input);
  const learningTask = await learningTaskTable.create({
    inputType: input.inputType,
    content: input.content,
    instruction: input.instruction,
    status: "generated",
    rawResult: result,
    createdAt: now,
    updatedAt: now,
  });

  const reviewItemsInput: Array<Omit<ReviewItem, "id">> = [
    ...result.knowledgeSuggestions.map((payload) => toReviewItem(learningTask.id, "knowledge", { ...payload })),
    ...result.ruleSuggestions.map((payload) => toReviewItem(learningTask.id, "rule", { ...payload })),
    ...result.scriptSuggestions.map((payload) => toReviewItem(learningTask.id, "script", { ...payload })),
    ...result.riskTips.map((payload) => toReviewItem(learningTask.id, "risk_tip", { ...payload })),
  ];

  const reviewItems: ReviewItem[] = [];
  for (const reviewItem of reviewItemsInput) {
    reviewItems.push(await reviewItemTable.create(reviewItem));
  }

  return {
    learningTask,
    result,
    reviewItems: reviewItems.map(({ id, type, status }) => ({ id, type, status })),
  };
}

function toReviewItem(
  learningTaskId: number,
  type: ReviewItemType,
  payload: Record<string, unknown>,
): Omit<ReviewItem, "id"> {
  const now = new Date().toISOString();
  return {
    learningTaskId,
    type,
    status: "pending",
    payload,
    createdAt: now,
    updatedAt: now,
  };
}
