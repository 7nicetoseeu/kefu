import { http } from "./http";
import type { ApiResponse } from "../types/learning";

export interface KnowledgeImportPreviewItem {
  id?: number;
  title: string;
  content: string;
  notes?: string;
}

export interface KnowledgeImportPreview {
  totalRows: number;
  headers: string[];
  items: KnowledgeImportPreviewItem[];
}

export interface KnowledgeImportResult {
  totalParsed: number;
  reviewItemsCreated: number;
  aiEnriched: boolean;
  aiSummary: string | null;
  reviewItems: Array<{
    id: number;
    type: string;
    status: string;
  }>;
  message: string;
}

export async function previewKnowledgeCsv(file: File): Promise<KnowledgeImportPreview> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await http.post<ApiResponse<KnowledgeImportPreview>>(
    "/api/knowledge-import/preview",
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return response.data.data;
}

export async function importKnowledgeCsv(file: File, useAI: boolean): Promise<KnowledgeImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("useAI", String(useAI));

  const response = await http.post<ApiResponse<KnowledgeImportResult>>(
    "/api/knowledge-import/upload",
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return response.data.data;
}
