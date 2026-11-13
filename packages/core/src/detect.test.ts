import { describe, expect, it } from "vitest";
import { detectText } from "./detect";
import { DEFAULT_SETTINGS, type DetectSettings } from "./types";

const cn: DetectSettings = { ...DEFAULT_SETTINGS, variant: "zh-CN" };
const tw: DetectSettings = { ...DEFAULT_SETTINGS, variant: "zh-TW" };

describe("detectText", () => {
  it("returns nothing for blank or already-consistent text", () => {
    expect(detectText("   ", cn)).toEqual([]);
    expect(detectText("这是一段简体中文。", cn)).toEqual([]);
    expect(detectText("這是一段繁體中文。", tw)).toEqual([]);
  });

  it("flags traditional characters when the target is zh-CN", () => {
    const issues = detectText("這是繁體", cn);
    expect(issues.map((i) => [i.sourceText, i.replacement])).toEqual([
      ["這", "这"],
      ["體", "体"],
    ]);
    expect(issues.every((i) => i.type === "script")).toBe(true);
  });

  it("flags region terms when the target is zh-TW", () => {
    const issues = detectText("请使用软件登录", tw);
    const terms = issues.filter((i) => i.type === "variant_term");
    expect(terms.map((i) => [i.sourceText, i.replacement])).toEqual([
      ["软件", "軟體"],
      ["登录", "登入"],
    ]);
    // 词汇区间内不再重复报字形问题
    for (const term of terms) {
      expect(
        issues.some((i) => i.type === "script" && i.start < term.end && term.start < i.end),
      ).toBe(false);
    }
  });

  it("only reports script problems at the relaxed level", () => {
    const issues = detectText("软件", { ...tw, level: "relaxed" });
    expect(issues.every((i) => i.type === "script")).toBe(true);
    expect(issues.map((i) => i.replacement).join("")).toBe("軟");
  });

  it("returns issues sorted by position without overlaps", () => {
    const issues = detectText("软件和網絡，登录。", cn);
    for (let i = 1; i < issues.length; i++) {
      expect(issues[i]!.start).toBeGreaterThanOrEqual(issues[i - 1]!.end);
    }
  });

  it("does not touch characters valid in both scripts", () => {
    expect(detectText("干擾", tw).filter((i) => i.sourceText === "干")).toEqual([]);
  });
});
