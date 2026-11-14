import { describe, expect, it } from "vitest";
import { normalizeDictionary } from "./dictionary";
import {
  MAX_PHRASES_PER_VARIANT,
  buildPhraseTemplateCsv,
  decodePhraseFile,
  exportPhrases,
  importPhrases,
  parsePhraseFile,
  serializePhraseCsv,
} from "./phraseFile";

describe("phrase file format (shared with the extension and macOS)", () => {
  it("round-trips CSV with quotes, commas, newlines and formula guards", () => {
    const rows = [
      { from: 'a,"b"', to: "c\nd" },
      { from: "=SUM(1)", to: "+1" },
    ];
    const csv = serializePhraseCsv(rows);
    expect(csv.startsWith("﻿from,to\r\n")).toBe(true);
    expect(csv).toContain("'=SUM(1)");
    expect(parsePhraseFile(csv)).toEqual(rows);
  });

  it("skips header, comments, blank and incomplete rows; last duplicate wins", () => {
    const text = "from,to\n# comment\n软件,軟體\n\n视频,\n软件,軟件\n";
    expect(parsePhraseFile(text)).toEqual([{ from: "软件", to: "軟件" }]);
  });

  it("parses OpenCC tab entries and keeps the first candidate", () => {
    const text = "# opencc\n软件\t軟體 軟件\n视频\t影片\n";
    expect(parsePhraseFile(text)).toEqual([
      { from: "软件", to: "軟體" },
      { from: "视频", to: "影片" },
    ]);
  });

  it("falls back to GB18030 for non-UTF-8 files", () => {
    // "软件,軟體" 的 GBK 编码（軟體 在 GBK 中为 dc9b f377）
    const gbk = new Uint8Array([0xc8, 0xed, 0xbc, 0xfe, 0x2c, 0xdc, 0x9b, 0xf3, 0x77]);
    expect(decodePhraseFile(gbk.buffer)).toBe("软件,軟體");
    const utf8 = new TextEncoder().encode("软件,軟體");
    expect(decodePhraseFile(utf8.buffer as ArrayBuffer)).toBe("软件,軟體");
  });

  it("template parses back to its rows", () => {
    expect(parsePhraseFile(buildPhraseTemplateCsv())).toEqual([
      { from: "软件", to: "軟體" },
      { from: "视频", to: "影片" },
    ]);
  });
});

describe("importPhrases / exportPhrases", () => {
  const base = normalizeDictionary({
    phrases: [
      { variant: "zh-TW", source: "软件", target: "軟件" },
      { variant: "zh-HK", source: "软件", target: "軟件" },
    ],
    allowed: [{ variant: "zh-TW", text: "資料" }],
  });

  it("adds and updates only the chosen variant, keeping allowed words", () => {
    const result = importPhrases(base, "zh-TW", [
      { from: "软件", to: "軟體" },
      { from: "视频", to: "影片" },
      { from: "同", to: "同" },
    ]);
    expect(result).toMatchObject({ added: 1, updated: 1, skipped: 0 });
    expect(result.dictionary.phrases).toEqual([
      { variant: "zh-TW", source: "软件", target: "軟體" },
      { variant: "zh-HK", source: "软件", target: "軟件" },
      { variant: "zh-TW", source: "视频", target: "影片" },
    ]);
    expect(result.dictionary.allowed).toEqual(base.allowed);
  });

  it("stops adding at the per-variant limit but still updates", () => {
    const rows = Array.from({ length: MAX_PHRASES_PER_VARIANT + 5 }, (_, i) => ({ from: `w${i}`, to: `x${i}` }));
    const result = importPhrases(base, "zh-TW", [{ from: "软件", to: "軟體" }, ...rows]);
    expect(result.updated).toBe(1);
    expect(result.added).toBe(MAX_PHRASES_PER_VARIANT - 1);
    expect(result.skipped).toBe(6);
  });

  it("exports only the chosen variant in from,to format", () => {
    expect(exportPhrases(base, "zh-HK")).toBe("﻿from,to\r\n软件,軟件\r\n");
  });
});
