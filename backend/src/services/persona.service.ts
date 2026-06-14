import { ActiveStatus, PersonaConfig } from "../types.js";
import { AppError } from "../utils/response.js";
import { personaConfigTable } from "./tables.js";

const activeStatuses: ActiveStatus[] = ["active", "inactive"];

export async function listPersonaConfigs(status?: ActiveStatus) {
  let rows = await personaConfigTable.all();

  if (status) {
    assertActiveStatus(status);
    rows = rows.filter((row) => row.status === status);
  }

  return rows.sort((a, b) => b.id - a.id);
}

export async function getPersonaConfig(id: number) {
  const persona = await personaConfigTable.findById(id);
  if (!persona) {
    throw new AppError(404, "persona config not found");
  }
  return persona;
}

export async function createPersonaConfig(input: unknown) {
  const payload = parsePersonaPayload(input);
  const now = new Date().toISOString();

  return personaConfigTable.create({
    ...payload,
    status: payload.status ?? "active",
    createdAt: now,
    updatedAt: now,
  });
}

export async function updatePersonaConfig(id: number, input: unknown) {
  await getPersonaConfig(id);
  const payload = parsePersonaPayload(input, true);
  const updated = await personaConfigTable.update(id, {
    ...payload,
    updatedAt: new Date().toISOString(),
  } as Partial<PersonaConfig>);
  return updated as PersonaConfig;
}

export async function updatePersonaConfigStatus(id: number, status: ActiveStatus) {
  assertActiveStatus(status);
  await getPersonaConfig(id);
  const updated = await personaConfigTable.update(id, {
    status,
    updatedAt: new Date().toISOString(),
  });
  return updated as PersonaConfig;
}

export async function getActivePersonaConfig() {
  const personas = await listPersonaConfigs("active");
  return personas[0];
}

function parsePersonaPayload(input: unknown, partial = false): Partial<PersonaConfig> & Pick<PersonaConfig, "name" | "description" | "tone" | "styleRules" | "forbiddenPhrases"> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AppError(400, "persona payload must be a JSON object");
  }

  const payload = input as Record<string, unknown>;
  const name = stringValue(payload.name);
  const description = stringValue(payload.description);
  const tone = stringValue(payload.tone);
  const styleRules = stringArrayValue(payload.styleRules);
  const forbiddenPhrases = stringArrayValue(payload.forbiddenPhrases);
  const status = payload.status === undefined ? undefined : stringValue(payload.status);

  if (!partial && !name) {
    throw new AppError(400, "name is required");
  }

  if (status) {
    assertActiveStatus(status);
  }

  return {
    name: name ?? "",
    description: description ?? "",
    tone: tone ?? "polite",
    styleRules: styleRules ?? [],
    forbiddenPhrases: forbiddenPhrases ?? [],
    status: status as ActiveStatus | undefined,
  };
}

function stringValue(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return String(value);
}

function stringArrayValue(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new AppError(400, "array fields must be string arrays");
  }
  return value.map(String);
}

function assertActiveStatus(status: string): asserts status is ActiveStatus {
  if (!activeStatuses.includes(status as ActiveStatus)) {
    throw new AppError(400, "status is invalid");
  }
}
