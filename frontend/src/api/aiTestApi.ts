import { http } from "./http";
import { ApiResponse } from "../types/learning";

export interface AiTestResult {
  ok: boolean;
  provider: string;
  model: string;
  message: string;
  latencyMs: number;
}

export async function testAiConnection() {
  const response = await http.post<ApiResponse<AiTestResult>>("/api/ai/test");
  return response.data.data;
}
