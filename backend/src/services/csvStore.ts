import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type CsvValue = string | number | boolean | null | undefined | object;
type CsvRecord = Record<string, CsvValue>;

const dataDir = path.resolve(process.cwd(), "data");

function encodeValue(value: CsvValue): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function escapeCsv(value: CsvValue): string {
  const raw = encodeValue(value);
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentLine = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      currentLine += '""';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      if (currentLine.length > 0) {
        rows.push(parseCsvLine(currentLine));
      }
      currentLine = "";
      continue;
    }

    currentLine += char;
  }

  if (currentLine.length > 0) {
    rows.push(parseCsvLine(currentLine));
  }

  return rows;
}

function parseField(value: string): unknown {
  if (value === "") {
    return undefined;
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if ((value.startsWith("{") && value.endsWith("}")) || (value.startsWith("[") && value.endsWith("]"))) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
}

export class CsvTable<T extends { id: number }> {
  private filePath: string;

  constructor(
    fileName: string,
    private headers: string[],
  ) {
    this.filePath = path.join(dataDir, fileName);
  }

  async all(): Promise<T[]> {
    await this.ensureFile();
    const text = await readFile(this.filePath, "utf8");
    const rows = parseCsv(text);

    if (rows.length <= 1) {
      return [];
    }

    const [headers, ...dataRows] = rows;
    return dataRows.map((row) => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        const value = parseField(row[index] ?? "");
        if (value !== undefined) {
          record[header] = value;
        }
      });
      return record as T;
    });
  }

  async findById(id: number): Promise<T | undefined> {
    const rows = await this.all();
    return rows.find((row) => row.id === id);
  }

  async create(input: Omit<T, "id">): Promise<T> {
    const rows = await this.all();
    const nextId = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
    const record = { ...input, id: nextId } as T;
    await this.writeAll([...rows, record]);
    return record;
  }

  async update(id: number, patch: Partial<T>): Promise<T | undefined> {
    const rows = await this.all();
    const index = rows.findIndex((row) => row.id === id);
    if (index === -1) {
      return undefined;
    }

    const updated = { ...rows[index], ...patch, id } as T;
    rows[index] = updated;
    await this.writeAll(rows);
    return updated;
  }

  async writeAll(rows: T[]): Promise<void> {
    await mkdir(dataDir, { recursive: true });
    const headerLine = this.headers.join(",");
    const lines = rows.map((row) => this.headers.map((header) => escapeCsv((row as CsvRecord)[header])).join(","));
    await writeFile(this.filePath, `${[headerLine, ...lines].join("\n")}\n`, "utf8");
  }

  private async ensureFile(): Promise<void> {
    await mkdir(dataDir, { recursive: true });
    try {
      await readFile(this.filePath, "utf8");
    } catch {
      await writeFile(this.filePath, `${this.headers.join(",")}\n`, "utf8");
    }
  }
}
