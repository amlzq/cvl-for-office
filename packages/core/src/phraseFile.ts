/**
 * 自定义词组文件的导入导出，与浏览器扩展（chinese-variants-linter/src/shared/phraseCsv.ts）
 * 和 macOS 版（CVLCore/PhraseFile.swift）格式一致，同一份文件三端通用：
 *
 * - CSV：两列 `from,to`，首行可选表头；支持引号、转义引号（""）、字段内换行、UTF-8 BOM。
 * - OpenCC 词条：每行 `原词<Tab>目标词`，目标词有多个候选时只取第一个。
 * - 两种格式都忽略 `#` 注释行；原词重复时以最后一条为准。
 *
 * 一个文件只对应一种写法（目标变体），由导入时当前选择的写法决定；允许词不在文件中。
 */
import type { UserDictionary } from "./dictionary";
import type { VariantCode } from "./types";

export interface PhraseRow {
  from: string;
  to: string;
}

export const PHRASE_CSV_HEADER = ["from", "to"] as const;
/** 每种写法最多保存的自定义词组数。 */
export const MAX_PHRASES_PER_VARIANT = 1000;
/** 导入文件大小上限（字节），避免误选超大文件。 */
export const MAX_IMPORT_FILE_BYTES = 1024 * 1024;
/** 词典页每批渲染的词组数，与浏览器扩展版一致。 */
export const PHRASE_PAGE_SIZE = 100;

/**
 * 按原词或替换词做不区分大小写的包含匹配；空查询返回全部。
 * 与浏览器扩展版 filterPhrases 行为一致。
 */
export function filterPhrases<T>(items: readonly T[], query: string, columns: (item: T) => readonly [string, string]): T[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...items];
  }
  return items.filter((item) => columns(item).some((value) => value.toLowerCase().includes(q)));
}

export const PHRASE_TEMPLATE_ROWS: readonly PhraseRow[] = [
  { from: "软件", to: "軟體" },
  { from: "视频", to: "影片" },
];

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") {
        i += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * CSV 公式注入防护：以 = + - @ 开头的单元格在 Excel / Sheets 中会被当作公式，
 * 导出时前置一个单引号，导入时再去掉，保证往返一致。
 */
function guardFormula(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function unguardFormula(value: string): string {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

function escapeCsvField(raw: string): string {
  const value = guardFormula(raw);
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function dedupeKeepLast(rows: PhraseRow[]): PhraseRow[] {
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.from, row.to);
  }
  return [...map].map(([from, to]) => ({ from, to }));
}

/** 解析 CSV，丢弃表头、空行及 from / to 任一为空的行。 */
export function parsePhraseCsv(text: string): PhraseRow[] {
  const out: PhraseRow[] = [];
  parseCsvRows(text).forEach((cells, index) => {
    const from = (cells[0] ?? "").trim();
    const to = (cells[1] ?? "").trim();
    if (index === 0 && from.toLowerCase() === PHRASE_CSV_HEADER[0] && to.toLowerCase() === PHRASE_CSV_HEADER[1]) {
      return;
    }
    if (from && to) {
      out.push({ from: unguardFormula(from), to: unguardFormula(to) });
    }
  });
  return out;
}

/** 解析 OpenCC 风格词条：`原词<Tab>目标词`，`#` 开头为注释。 */
export function parseTabDictionary(text: string): PhraseRow[] {
  const out: PhraseRow[] = [];
  for (const line of text.replace(/^﻿/, "").split(/\r\n|\n|\r/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) {
      continue;
    }
    const tab = line.indexOf("\t");
    if (tab < 0) {
      continue;
    }
    const from = line.slice(0, tab).trim();
    const to = line.slice(tab + 1).trim().split(/\s+/)[0] ?? "";
    if (from && to) {
      out.push({ from, to });
    }
  }
  return dedupeKeepLast(out);
}

/** 导入入口：含制表符的非注释行视为 OpenCC 词条格式，否则按 CSV 解析。 */
export function parsePhraseFile(text: string): PhraseRow[] {
  const lines = text.split(/\r\n|\n|\r/);
  const isTab = lines.some((line) => !line.trimStart().startsWith("#") && line.includes("\t"));
  if (isTab) {
    return parseTabDictionary(text);
  }
  const withoutComments = lines.filter((line) => !line.trimStart().startsWith("#")).join("\n");
  return dedupeKeepLast(parsePhraseCsv(withoutComments));
}

/**
 * 解码导入文件：先严格按 UTF-8，失败（Windows 上 Excel 默认保存的 GBK / ANSI CSV）
 * 再按 GB18030，避免导入乱码词条。
 */
export function decodePhraseFile(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("gb18030").decode(buffer);
  }
}

/** 导出为 CSV；带 BOM，让 Excel 以 UTF-8 打开。 */
export function serializePhraseCsv(phrases: readonly PhraseRow[]): string {
  const lines = [PHRASE_CSV_HEADER.join(",")];
  for (const phrase of phrases) {
    lines.push(`${escapeCsvField(phrase.from)},${escapeCsvField(phrase.to)}`);
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function buildPhraseTemplateCsv(): string {
  return serializePhraseCsv(PHRASE_TEMPLATE_ROWS);
}

/** 导出某种写法的自定义词组。 */
export function exportPhrases(dictionary: UserDictionary, variant: VariantCode): string {
  return serializePhraseCsv(
    dictionary.phrases.filter((p) => p.variant === variant).map((p) => ({ from: p.source, to: p.target })),
  );
}

export interface PhraseImportResult {
  dictionary: UserDictionary;
  added: number;
  updated: number;
  /** 超出 MAX_PHRASES_PER_VARIANT 而未导入的条数。 */
  skipped: number;
}

/**
 * 把导入的词组并入指定写法：原词已存在则更新替换词，否则追加；
 * 达到数量上限后的新词组跳过。原词与替换词相同的行不算有效词组，直接忽略。
 */
export function importPhrases(
  dictionary: UserDictionary,
  variant: VariantCode,
  rows: readonly PhraseRow[],
): PhraseImportResult {
  const phrases = [...dictionary.phrases];
  let count = phrases.filter((p) => p.variant === variant).length;
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const { from, to } of rows) {
    const source = from.trim();
    const target = to.trim();
    if (!source || !target || source === target) {
      continue;
    }
    const existing = phrases.findIndex((p) => p.variant === variant && p.source === source);
    if (existing >= 0) {
      // 保留停用状态：更新替换词不应把用户停用过的词条重新启用。
      phrases[existing] = { ...phrases[existing], variant, source, target };
      updated += 1;
    } else if (count >= MAX_PHRASES_PER_VARIANT) {
      skipped += 1;
    } else {
      phrases.push({ variant, source, target, enabled: true });
      count += 1;
      added += 1;
    }
  }
  return { dictionary: { ...dictionary, phrases }, added, updated, skipped };
}
