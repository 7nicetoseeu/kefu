import { http } from "./http";
import { ApiResponse, ReviewItem, ReviewItemType, ReviewStatus } from "../types/learning";

export interface ReviewFilters {
  status?: ReviewStatus;
  type?: ReviewItemType;
}

export async function listReviewItems(filters: ReviewFilters) {
  const response = await http.get<ApiResponse<ReviewItem[]>>("/api/review-items", {
    params: filters,
  });
  return response.data.data;
}

export async function getReviewItem(id: number) {
  const response = await http.get<ApiResponse<ReviewItem>>(`/api/review-items/${id}`);
  return response.data.data;
}

export async function updateReviewItem(id: number, payload: Record<string, unknown>) {
  const response = await http.put<ApiResponse<ReviewItem>>(`/api/review-items/${id}`, { payload });
  return response.data.data;
}

export async function approveReviewItem(id: number) {
  const response = await http.post<ApiResponse<{ reviewItem: ReviewItem }>>(`/api/review-items/${id}/approve`);
  return response.data.data.reviewItem;
}

export async function rejectReviewItem(id: number) {
  const response = await http.post<ApiResponse<{ reviewItem: ReviewItem }>>(`/api/review-items/${id}/reject`);
  return response.data.data.reviewItem;
}

export interface BatchReviewResult {
  id: number;
  status: "approved" | "rejected" | "skipped";
  reason?: string;
}

export async function batchReviewItems(action: "approve" | "reject", ids: number[]) {
  const response = await http.post<ApiResponse<BatchReviewResult[]>>("/api/review-items/batch", { action, ids });
  return response.data.data;
}
