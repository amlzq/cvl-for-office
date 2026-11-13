import { VARIANTS, type VariantCode } from "./types";

/** 命中 source 时建议替换为 target；按「文档应使用」的写法（variant）分别存放。 */
export interface UserPhrase {
  variant: VariantCode;
  source: string;
  target: string;
}

/** 允许词：出现在文本中时，与其重叠的问题不再报告。 */
export interface AllowedWord {
  variant: VariantCode;
  text: string;
}

export interface UserDictionary {
  phrases: UserPhrase[];
  allowed: AllowedWord[];
}

export const EMPTY_DICTIONARY: UserDictionary = { phrases: [], allowed: [] };

const CSV_HEADER = "type,variant,source,target";

export function isVariantCode(value: unknown): value is VariantCode {
  return VARIANTS.includes(value as VariantCode);
}

/** 去重并丢弃无效条目。 */
export function normalizeDictionary(input: Partial<UserDictionary> | undefined): UserDictionary {
  const phraseKeys = new Set<string>();
  const phrases: UserPhrase[] = [];
  for (const entry of input?.phrases ?? []) {
    const source = typeof entry?.source === "string" ? entry.source.trim() : "";
    const target = typeof entry?.target === "string" ? entry.target.trim() : "";
    const key = `${entry?.variant}\u0000${source}`;
    if (isVariantCode(entry?.variant) && source && target && source !== target && !phraseKeys.has(key)) {
      phraseKeys.add(key);
      phrases.push({ variant: entry.variant, source, target });
    }
  }
  const allowedKeys = new Set<string>();
  const allowed: AllowedWord[] = [];
  for (const entry of input?.allowed ?? []) {
    const text = typeof entry?.text === "string" ? entry.text.trim() : "";
    const key = `${entry?.variant}\u0000${text}`;
    if (isVariantCode(entry?.variant) && text && !allowedKeys.has(key)) {
      allowedKeys.add(key);
      allowed.push({ variant: entry.variant, text });
    }
  }
  return { phrases, allowed };
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** 导出为 CSV：type 为 phrase / allow；allow 行的 target 为空。 */
export function dictionaryToCsv(dictionary: UserDictionary): string {
  const lines = [CSV_HEADER];
  for (const { variant, source, target } of dictionary.phrases) {
    lines.push(["phrase", variant, source, target].map(csvField).join(","));
  }
  for (const { variant, text } of dictionary.allowed) {
    lines.push(["allow", variant, text, ""].map(csvField).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && csv[i + 1] === "\n") {
        i++;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export interface CsvImportResult {
  dictionary: UserDictionary;
  /** 无法识别而被跳过的行数（不含空行与表头）。 */
  skipped: number;
}

export function dictionaryFromCsv(csv: string): CsvImportResult {
  const phrases: UserPhrase[] = [];
  const allowed: AllowedWord[] = [];
  let skipped = 0;
  const text = csv.replace(/^﻿/, "");
  for (const row of parseCsvRows(text)) {
    const cells = row.map((cell) => cell.trim());
    if (cells.every((cell) => !cell)) {
      continue;
    }
    const [type, variant, source = "", target = ""] = cells;
    if (type?.toLowerCase() === "type") {
      continue;
    }
    if (type === "phrase" && isVariantCode(variant) && source && target) {
      phrases.push({ variant, source, target });
    } else if (type === "allow" && isVariantCode(variant) && source) {
      allowed.push({ variant, text: source });
    } else {
      skipped++;
    }
  }
  return { dictionary: normalizeDictionary({ phrases, allowed }), skipped };
}

/** 合并两个词典（同一 variant + source 以后者为准）。 */
export function mergeDictionaries(base: UserDictionary, extra: UserDictionary): UserDictionary {
  return normalizeDictionary({
    phrases: [
      ...base.phrases.filter(
        (old) => !extra.phrases.some((n) => n.variant === old.variant && n.source === old.source),
      ),
      ...extra.phrases,
    ],
    allowed: [...base.allowed, ...extra.allowed],
  });
}
