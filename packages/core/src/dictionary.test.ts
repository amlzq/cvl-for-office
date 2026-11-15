import { describe, expect, it } from "vitest";
import { detectText } from "./detect";
import { normalizeDictionary } from "./dictionary";
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

  it("user phrases win over built-in rules on the same span", () => {
    const dictionary = normalizeDictionary({
      phrases: [{ variant: "zh-TW", source: "软件", target: "軟件" }],
    });
    const issues = detectText("软件", tw, dictionary);
    expect(issues.map((issue) => issue.replacement)).toEqual(["軟件"]);
  });

  it("relaxed level checks script only, so user phrases do not apply (same as the extension)", () => {
    const dictionary = normalizeDictionary({
      phrases: [{ variant: "zh-TW", source: "甲方公司", target: "甲方" }],
    });
    expect(detectText("甲方公司", { ...tw, level: "relaxed" }, dictionary)).toEqual([]);
  });

  it("disabled phrases stay in the dictionary but stop matching", () => {
    const dictionary = normalizeDictionary({
      phrases: [{ variant: "zh-TW", source: "甲方公司", target: "甲方", enabled: false }],
    });
    expect(dictionary.phrases[0].enabled).toBe(false);
    expect(detectText("甲方公司已確認", tw, dictionary)).toEqual([]);

    const enabled = normalizeDictionary({ phrases: [{ variant: "zh-TW", source: "甲方公司", target: "甲方" }] });
    expect(enabled.phrases[0].enabled).toBe(true);
  });

  it("does not report an allowed word or script changes inside it", () => {
    expect(detectText("请使用软件", tw).length).toBeGreaterThan(0);
    const dictionary = normalizeDictionary({ allowed: [{ variant: "zh-TW", text: "软件" }] });
    expect(detectText("请使用软件", tw, dictionary).every((i) => i.sourceText !== "软件")).toBe(true);
    const other = { ...tw, variant: "zh-HK" as const };
    expect(detectText("软件", other, dictionary).length).toBeGreaterThan(0);
  });
});
