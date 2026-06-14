import { http } from "./http";
import { ActiveStatus, ApiResponse, KnowledgeBaseItem, LibraryItem, LibraryType } from "../types/learning";

export interface LibraryFilters {
  status?: ActiveStatus;
  category?: string;
}

export interface CategoryInfo {
  name: string;
  count: number;
}

export async function listLibraryItems(type: LibraryType, filters: LibraryFilters) {
  const response = await http.get<ApiResponse<LibraryItem[]>>(`/api/libraries/${type}`, {
    params: filters,
  });
  return response.data.data;
}

export async function updateLibraryItemStatus(type: LibraryType, id: number, status: ActiveStatus) {
  const response = await http.patch<ApiResponse<LibraryItem>>(`/api/libraries/${type}/${id}/status`, { status });
  return response.data.data;
}

export async function updateKnowledgeItemCategory(id: number, category: string) {
  const response = await http.patch<ApiResponse<LibraryItem>>(`/api/libraries/knowledge/${id}/category`, { category });
  return response.data.data;
}

export async function getKnowledgeCategories() {
  const response = await http.get<ApiResponse<CategoryInfo[]>>("/api/libraries/knowledge/categories");
  return response.data.data;
}

export async function createKnowledgeCategory(name: string) {
  const response = await http.post<ApiResponse<CategoryInfo>>("/api/libraries/knowledge/categories", { name });
  return response.data.data;
}

export async function batchUpdateCategories(renames: Array<{ from: string; to: string }>) {
  const response = await http.put<ApiResponse<Array<{ from: string; to: string; updated: number }>>>(
    "/api/libraries/knowledge/categories",
    { renames },
  );
  return response.data.data;
}

export interface KnowledgeSearchResult extends KnowledgeBaseItem {
  score: number;
}

export async function searchKnowledge(query: string, limit = 5) {
  const response = await http.get<ApiResponse<KnowledgeSearchResult[]>>("/api/libraries/knowledge/search", {
    params: { q: query, limit },
  });
  return response.data.data;
}

