import { describe, expect, it } from "vitest";
import { detectText } from "./detect";
import { dictionaryFromCsv, dictionaryToCsv, normalizeDictionary } from "./dictionary";
import { DEFAULT_SETTINGS } from "./types";

const tw = { ...DEFAULT_SETTINGS, variant: "zh-TW" as const };

describe("user dictionary detection", () => {
  it("suggests the user's replacement, only for its own variant", () => {
    const dictionary = normalizeDictionary({
      phrases: [{ variant: "zh-TW", source: "甲方公司", target: "甲方" }],
    });
    const issues = detectText("甲方公司已確認", tw, dictionary);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ type: "user_phrase", replacement: "甲方", confidence: "high" });
    expect(detectText("甲方公司已确认", { ...tw, variant: "zh-CN" }, dictionary)).toEqual([]);
  });

  it("user phrases win over built-in rules and work in relaxed mode", () => {
    const dictionary = normalizeDictionary({
      phrases: [{ variant: "zh-TW", source: "软件", target: "軟件" }],
    });
    const issues = detectText("软件", { ...tw, level: "relaxed" }, dictionary);
    expect(issues.map((issue) => issue.replacement)).toEqual(["軟件"]);
  });

  it("does not report text overlapping an allowed word", () => {
    expect(detectText("请使用软件", tw).length).toBeGreaterThan(0);
    const dictionary = normalizeDictionary({ allowed: [{ variant: "zh-TW", text: "软件" }] });
    expect(detectText("请使用软件", tw, dictionary).every((i) => i.sourceText !== "软件")).toBe(true);
    const other = { ...tw, variant: "zh-HK" as const };
    expect(detectText("软件", other, dictionary).length).toBeGreaterThan(0);
  });
});

describe("dictionary CSV", () => {
  it("round-trips, including quotes and commas", () => {
    const dictionary = normalizeDictionary({
      phrases: [{ variant: "zh-CN", source: 'a,"b"', target: "c" }],
      allowed: [{ variant: "zh-HK", text: "資料" }],
    });
    const { dictionary: parsed, skipped } = dictionaryFromCsv(dictionaryToCsv(dictionary));
    expect(parsed).toEqual(dictionary);
    expect(skipped).toBe(0);
  });

  it("skips invalid rows and ignores BOM and header", () => {
    const { dictionary, skipped } = dictionaryFromCsv(
      "﻿type,variant,source,target\nphrase,zh-XX,a,b\nphrase,zh-TW,a,b\n\nallow,zh-TW,x,\nbogus\n",
    );
    expect(dictionary.phrases).toHaveLength(1);
    expect(dictionary.allowed).toHaveLength(1);
    expect(skipped).toBe(2);
  });
});
