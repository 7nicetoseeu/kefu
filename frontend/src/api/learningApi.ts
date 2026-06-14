import { http } from "./http";
import { ApiResponse, GenerateLearningResponse, LearningInputType, LearningTask } from "../types/learning";

export interface GenerateLearningPayload {
  inputType: LearningInputType;
  content: string;
  instruction?: string;
}

export async function generateLearning(payload: GenerateLearningPayload) {
  const response = await http.post<ApiResponse<GenerateLearningResponse>>("/api/learning/generate", payload);
  return response.data.data;
}

export interface UploadResult {
  processed: number;
  totalReviewItems: number;
  results: Array<{ fileName: string; taskId: number; reviewCount: number }>;
}

export async function uploadChatFiles(files: File[]) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  const response = await http.post<ApiResponse<UploadResult>>("/api/learning/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data.data;
}

export async function listLearningTasks() {
  const response = await http.get<ApiResponse<LearningTask[]>>("/api/learning");
  return response.data.data;
}

export async function getLearningTask(id: number) {
  const response = await http.get<ApiResponse<LearningTask>>(`/api/learning/${id}`);
  return response.data.data;
}
