import { ActiveStatus, KnowledgeBaseItem, LibraryType, ScriptItem } from "../types.js";
import { AppError } from "../utils/response.js";
import {
  knowledgeBaseTable,
  knowledgeCategoryTable,
  riskTipTable,
  ruleItemTable,
  scriptItemTable,
} from "./tables.js";

const libraryTypes: LibraryType[] = ["knowledge", "rule", "script", "risk_tip"];
const activeStatuses: ActiveStatus[] = ["active", "inactive"];

type LibraryRecord = {
  id: number;
  status: ActiveStatus;
  updatedAt: string;
};

export interface LibraryFilters {
  status?: ActiveStatus;
  category?: string;
}

export interface CategoryInfo {
  name: string;
  count: number;
}

const PRESET_CATEGORIES = ["物流", "售后", "退款", "开场", "结束", "等待", "投诉", "通用", "其他"];

export async function seedPresetCategories() {
  const existing = await knowledgeCategoryTable.all();
  if (existing.length > 0) return; // Already seeded or user has categories

  const now = new Date().toISOString();
  for (const name of PRESET_CATEGORIES) {
    await knowledgeCategoryTable.create({
      name,
      createdAt: now,
      updatedAt: now,
    });
  }
  console.log(`Seeded ${PRESET_CATEGORIES.length} preset categories`);
}

export async function listLibraryItems(type: LibraryType, filters: LibraryFilters) {
  assertLibraryType(type);
  let rows = await allFor(type);

  if (filters.status) {
    assertActiveStatus(filters.status);
    rows = rows.filter((row) => row.status === filters.status);
  }

  if (filters.category) {
    if (filters.category === "未分类") {
      rows = rows.filter((row) => !(row as Record<string, unknown>).category);
    } else {
      rows = rows.filter((row) => (row as Record<string, unknown>).category === filters.category);
    }
  }

  return rows.sort((a, b) => b.id - a.id);
}

export async function getLibraryItem(type: LibraryType, id: number) {
  assertLibraryType(type);
  const item = await findFor(type, id);
  if (!item) {
    throw new AppError(404, "library item not found");
  }
  return item;
}

export async function updateLibraryItemCategory(id: number, category: string) {
  const item = await knowledgeBaseTable.findById(id);
  if (!item) throw new AppError(404, "knowledge item not found");
  if (category.trim()) {
    await ensureKnowledgeCategory(category);
  }
  return knowledgeBaseTable.update(id, {
    category: category.trim(),
    updatedAt: new Date().toISOString(),
  } as Partial<LibraryRecord>);
}

export async function getKnowledgeCategories() {
  const rows = await knowledgeBaseTable.all();
  const storedCategories = await knowledgeCategoryTable.all();
  const counts: Record<string, number> = {};
  let uncategorized = 0;
  for (const row of rows) {
    const cat = row.category;
    if (cat) {
      counts[cat] = (counts[cat] || 0) + 1;
    } else {
      uncategorized++;
    }
  }

  for (const category of storedCategories) {
    if (!counts[category.name]) {
      counts[category.name] = 0;
    }
  }

  const result = Object.entries(counts)
    .sort(([nameA, countA], [nameB, countB]) => countB - countA || nameA.localeCompare(nameB, "zh-Hans-CN"))
    .map(([name, count]) => ({ name, count }));
  if (uncategorized > 0) {
    result.unshift({ name: "未分类", count: uncategorized });
  }
  return result;
}

export interface KnowledgeSearchResult extends KnowledgeBaseItem {
  score: number;
}

export async function searchKnowledge(query: string, limit = 5): Promise<KnowledgeSearchResult[]> {
  const normalized = query.trim();
  if (!normalized) return [];

  const all = await knowledgeBaseTable.all();
  const active = all.filter((item) => item.status === "active");
  if (active.length === 0) return [];

  // Split query into individual terms (by whitespace and common Chinese punctuation)
  const terms = normalized
    .split(/[\s,，。！？、；：""''【】《》（）()\s]+/)
    .filter((t) => t.length > 0);
  const lowerQuery = normalized.toLowerCase();

  const scored = active.map((item) => {
    let score = 0;
    const title = (item.title || "").toLowerCase();
    const content = (item.content || "").toLowerCase();
    const keywords = (item.keywords || []).map((k: string) => k.toLowerCase());

    // Exact title match
    if (title === lowerQuery) score += 50;
    // Title starts with query
    else if (title.startsWith(lowerQuery)) score += 30;
    // Title contains full query
    else if (title.includes(lowerQuery)) score += 20;

    // Title contains individual terms
    for (const term of terms) {
      const lowerTerm = term.toLowerCase();
      if (title.includes(lowerTerm)) score += 8;
      // Keyword exact match
      if (keywords.some((k: string) => k === lowerTerm)) score += 10;
      // Keyword partial match
      if (keywords.some((k: string) => k.includes(lowerTerm))) score += 6;
      // Content contains term (capped per term)
      const contentMatches = (content.match(new RegExp(escapeRegex(lowerTerm), "gi")) || []).length;
      score += Math.min(contentMatches, 5) * 2;
    }

    // Content contains full query
    if (content.includes(lowerQuery)) score += 12;

    return { ...item, score };
  });

  // Sort by score descending, then by id descending as tiebreaker
  scored.sort((a, b) => b.score - a.score || b.id - a.id);

  return scored.slice(0, limit);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function createKnowledgeCategory(name: string): Promise<CategoryInfo> {
  const normalized = normalizeCategoryName(name);
  if (normalized === "未分类") {
    throw new AppError(400, "未分类不能作为自定义分类");
  }

  const categories = await getKnowledgeCategories();
  if (categories.some((category) => category.name === normalized)) {
    throw new AppError(409, "分类已存在");
  }

  const now = new Date().toISOString();
  await knowledgeCategoryTable.create({
    name: normalized,
    createdAt: now,
    updatedAt: now,
  });

  return { name: normalized, count: 0 };
}

export async function batchUpdateCategories(renames: Array<{ from: string; to: string }>) {
  const rows = await knowledgeBaseTable.all();
  const now = new Date().toISOString();
  const results: Array<{ from: string; to: string; updated: number }> = [];

  for (const { from, to } of renames) {
    const normalizedFrom = normalizeCategoryName(from);
    const normalizedTo = normalizeCategoryName(to);
    let updated = 0;
    for (const row of rows) {
      const cat = row.category || "";
      if ((cat || "未分类") === normalizedFrom) {
        await knowledgeBaseTable.update(row.id, {
          category: normalizedTo === "未分类" ? "" : normalizedTo,
          updatedAt: now,
        } as Partial<LibraryRecord>);
        updated++;
      }
    }

    await replaceStoredCategory(normalizedFrom, normalizedTo, now);
    results.push({ from: normalizedFrom, to: normalizedTo, updated });
  }

  return results;
}

export async function updateLibraryItemStatus(type: LibraryType, id: number, status: ActiveStatus) {
  assertLibraryType(type);
  assertActiveStatus(status);
  const item = await getLibraryItem(type, id);
  return updateStatusFor(type, item.id, status);
}

async function allFor(type: LibraryType): Promise<LibraryRecord[]> {
  switch (type) {
    case "knowledge":
      return knowledgeBaseTable.all();
    case "rule":
      return ruleItemTable.all();
    case "script":
      return scriptItemTable.all();
    case "risk_tip":
      return riskTipTable.all();
    default:
      throw new AppError(400, "library type is invalid");
  }
}

async function findFor(type: LibraryType, id: number): Promise<LibraryRecord | undefined> {
  switch (type) {
    case "knowledge":
      return knowledgeBaseTable.findById(id);
    case "rule":
      return ruleItemTable.findById(id);
    case "script":
      return scriptItemTable.findById(id);
    case "risk_tip":
      return riskTipTable.findById(id);
    default:
      throw new AppError(400, "library type is invalid");
  }
}

async function updateStatusFor(type: LibraryType, id: number, status: ActiveStatus): Promise<LibraryRecord | undefined> {
  const patch = {
    status,
    updatedAt: new Date().toISOString(),
  };

  switch (type) {
    case "knowledge":
      return knowledgeBaseTable.update(id, patch);
    case "rule":
      return ruleItemTable.update(id, patch);
    case "script":
      return scriptItemTable.update(id, patch);
    case "risk_tip":
      return riskTipTable.update(id, patch);
    default:
      throw new AppError(400, "library type is invalid");
  }
}

function assertLibraryType(type: string): asserts type is LibraryType {
  if (!libraryTypes.includes(type as LibraryType)) {
    throw new AppError(400, "library type is invalid");
  }
}

function assertActiveStatus(status: string): asserts status is ActiveStatus {
  if (!activeStatuses.includes(status as ActiveStatus)) {
    throw new AppError(400, "status is invalid");
  }
}

function normalizeCategoryName(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new AppError(400, "category name is required");
  }
  return normalized;
}

async function ensureKnowledgeCategory(name: string) {
  const normalized = normalizeCategoryName(name);
  if (normalized === "未分类") {
    return;
  }

  const categories = await getKnowledgeCategories();
  if (categories.some((category) => category.name === normalized)) {
    return;
  }

  const now = new Date().toISOString();
  await knowledgeCategoryTable.create({
    name: normalized,
    createdAt: now,
    updatedAt: now,
  });
}

async function replaceStoredCategory(from: string, to: string, now: string) {
  const categories = await knowledgeCategoryTable.all();
  const fromCategory = categories.find((category) => category.name === from);
  const toCategory = categories.find((category) => category.name === to);

  if (fromCategory) {
    await knowledgeCategoryTable.writeAll(categories.filter((category) => category.id !== fromCategory.id));
  }

  if (to !== "未分类" && !toCategory) {
    await knowledgeCategoryTable.create({
      name: to,
      createdAt: now,
      updatedAt: now,
    });
  }
}
