import { http } from "./http";
import { ApiResponse, ReplyTestResult } from "../types/learning";

export interface ChatMessage {
  role: "customer" | "agent";
  content: string;
}

export async function generateReplyTest(customerMessage: string, history?: ChatMessage[]) {
  const response = await http.post<ApiResponse<ReplyTestResult>>("/api/reply-test/generate", {
    customerMessage,
    history: history ?? [],
  });
  return response.data.data;
}
