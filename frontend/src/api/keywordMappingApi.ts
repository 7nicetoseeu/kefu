import { http } from "./http";
import type { ApiResponse } from "../types/learning";

export interface KeywordMapping {
  id: number;
  keyword: string;
  script: string;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export async function listKeywordMappings() {
  const response = await http.get<ApiResponse<KeywordMapping[]>>("/api/keyword-mappings");
  return response.data.data;
}

export async function searchKeywordMappings(keyword: string) {
  const response = await http.get<ApiResponse<KeywordMapping[]>>("/api/keyword-mappings/search", {
    params: { keyword },
  });
  return response.data.data;
}

export async function createKeywordMapping(input: {
  keyword: string;
  script: string;
  priority?: number;
}) {
  const response = await http.post<ApiResponse<KeywordMapping>>("/api/keyword-mappings", input);
  return response.data.data;
}

export async function updateKeywordMapping(
  id: number,
  patch: { keyword?: string; script?: string; priority?: number },
) {
  const response = await http.patch<ApiResponse<KeywordMapping>>(`/api/keyword-mappings/${id}`, patch);
  return response.data.data;
}

export async function deleteKeywordMapping(id: number) {
  const response = await http.delete<ApiResponse<{ deleted: boolean }>>(`/api/keyword-mappings/${id}`);
  return response.data.data;
}
