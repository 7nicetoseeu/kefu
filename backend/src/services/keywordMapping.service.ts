/**
 * 关键词 → 话术 自定义映射服务
 * 数据以 JSON 文件存储在 backend/data/keyword_mappings.json
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDir = path.resolve(process.cwd(), "data");
const filePath = path.join(dataDir, "keyword_mappings.json");

export interface KeywordMapping {
  id: number;
  keyword: string;
  script: string;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

interface Store {
  mappings: KeywordMapping[];
}

async function readStore(): Promise<Store> {
  await mkdir(dataDir, { recursive: true });
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return { mappings: Array.isArray(parsed.mappings) ? parsed.mappings : [] };
  } catch {
    const empty: Store = { mappings: [] };
    await writeFile(filePath, JSON.stringify(empty, null, 2), "utf8");
    return empty;
  }
}

async function writeStore(store: Store): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(filePath, JSON.stringify(store, null, 2), "utf8");
}

/** 列出所有映射（按优先级降序，再按更新时间降序） */
export async function listMappings(): Promise<KeywordMapping[]> {
  const store = await readStore();
  return store.mappings.sort(
    (a, b) => b.priority - a.priority || b.updatedAt.localeCompare(a.updatedAt),
  );
}

/** 按关键词搜索映射（模糊匹配，大小写不敏感） */
export async function searchMappings(keyword: string): Promise<KeywordMapping[]> {
  const store = await readStore();
  const lower = keyword.trim().toLowerCase();
  if (!lower) return [];

  // 按匹配度+优先级排序
  const scored = store.mappings
    .map((m) => {
      let score = 0;
      const kwLower = m.keyword.toLowerCase();
      if (kwLower === lower) score += 100;
      else if (kwLower.startsWith(lower)) score += 60;
      else if (kwLower.includes(lower)) score += 30;
      return { mapping: m, score };
    })
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.mapping.priority - a.mapping.priority ||
        b.mapping.updatedAt.localeCompare(a.mapping.updatedAt),
    );

  return scored.map((item) => item.mapping);
}

/** 根据ID获取单个映射 */
export async function getMapping(id: number): Promise<KeywordMapping | undefined> {
  const store = await readStore();
  return store.mappings.find((m) => m.id === id);
}

/** 创建映射 */
export async function createMapping(input: {
  keyword: string;
  script: string;
  priority?: number;
}): Promise<KeywordMapping> {
  const store = await readStore();
  const nextId = store.mappings.reduce((max, m) => Math.max(max, m.id), 0) + 1;
  const now = new Date().toISOString();
  const mapping: KeywordMapping = {
    id: nextId,
    keyword: input.keyword.trim(),
    script: input.script.trim(),
    priority: input.priority ?? 0,
    createdAt: now,
    updatedAt: now,
  };
  store.mappings.push(mapping);
  await writeStore(store);
  return mapping;
}

/** 更新映射 */
export async function updateMapping(
  id: number,
  patch: { keyword?: string; script?: string; priority?: number },
): Promise<KeywordMapping | undefined> {
  const store = await readStore();
  const index = store.mappings.findIndex((m) => m.id === id);
  if (index === -1) return undefined;

  const existing = store.mappings[index];
  const updated: KeywordMapping = {
    ...existing,
    ...(patch.keyword !== undefined ? { keyword: patch.keyword.trim() } : {}),
    ...(patch.script !== undefined ? { script: patch.script.trim() } : {}),
    ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    updatedAt: new Date().toISOString(),
  };
  store.mappings[index] = updated;
  await writeStore(store);
  return updated;
}

/** 删除映射 */
export async function deleteMapping(id: number): Promise<boolean> {
  const store = await readStore();
  const index = store.mappings.findIndex((m) => m.id === id);
  if (index === -1) return false;
  store.mappings.splice(index, 1);
  await writeStore(store);
  return true;
}
