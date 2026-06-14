import { http } from "./http";
import { ActiveStatus, ApiResponse, PersonaConfig } from "../types/learning";

export interface PersonaPayload {
  name: string;
  description: string;
  tone: string;
  styleRules: string[];
  forbiddenPhrases: string[];
  status?: ActiveStatus;
}

export async function listPersonas(status?: ActiveStatus) {
  const response = await http.get<ApiResponse<PersonaConfig[]>>("/api/personas", {
    params: { status },
  });
  return response.data.data;
}

export async function createPersona(payload: PersonaPayload) {
  const response = await http.post<ApiResponse<PersonaConfig>>("/api/personas", payload);
  return response.data.data;
}

export async function updatePersona(id: number, payload: PersonaPayload) {
  const response = await http.put<ApiResponse<PersonaConfig>>(`/api/personas/${id}`, payload);
  return response.data.data;
}

export async function updatePersonaStatus(id: number, status: ActiveStatus) {
  const response = await http.patch<ApiResponse<PersonaConfig>>(`/api/personas/${id}/status`, { status });
  return response.data.data;
}
