import type { Issue } from "@cvl/core";
import { afterEach, describe, expect, it } from "vitest";
import { describeIssue } from "../describe";
import { en } from "./en";
import { resolveLang, t } from "./index";
import { zhHans } from "./zh-Hans";
import { zhHant } from "./zh-Hant";

const globals = globalThis as { Office?: unknown };

function withDisplayLanguage(language: string, run: () => void): void {
  globals.Office = { context: { displayLanguage: language } };
  try {
    run();
  } finally {
    globals.Office = undefined;
  }
}

afterEach(() => {
  globals.Office = undefined;
});

describe("resolveLang", () => {
  it("明确指定的语言直接生效", () => {
    expect(resolveLang("en")).toBe("en");
    expect(resolveLang("zh-Hant")).toBe("zh-Hant");
  });

  it("auto 跟随 Office 显示语言", () => {
    withDisplayLanguage("zh-TW", () => expect(resolveLang("auto")).toBe("zh-Hant"));
    withDisplayLanguage("zh-HK", () => expect(resolveLang("auto")).toBe("zh-Hant"));
    withDisplayLanguage("zh-CN", () => expect(resolveLang("auto")).toBe("zh-Hans"));
    withDisplayLanguage("en-US", () => expect(resolveLang("auto")).toBe("en"));
    withDisplayLanguage("ja-JP", () => expect(resolveLang("auto")).toBe("en"));
  });

  it("拿不到 Office 语言时回落到简体中文", () => {
    expect(resolveLang("auto")).toBe("zh-Hans");
  });
});

describe("t", () => {
  it("替换占位符", () => {
    expect(t("en", "status.found", { count: 3, scope: "the selection" })).toBe(
      "Found 3 in the selection.",
    );
    expect(t("zh-Hans", "bar.total", { count: 2 })).toBe("共 2 处");
  });

  it("缺失的键回落到简体中文", () => {
    expect(t("en", "group.check")).toBe("Settings");
  });
});

describe("文案表", () => {
  it("三种语言的键完全一致", () => {
    const base = Object.keys(zhHans).sort();
    expect(Object.keys(zhHant).sort()).toEqual(base);
    expect(Object.keys(en).sort()).toEqual(base);
  });

  it("没有空文案", () => {
    for (const table of [zhHans, zhHant, en]) {
      for (const [key, value] of Object.entries(table)) {
        expect(value.trim(), key).not.toBe("");
      }
    }
  });
});

describe("describeIssue", () => {
  const issue = (patch: Partial<Issue>): Issue => ({
    id: "x",
    type: "variant_term",
    sourceText: "软件",
    replacement: "軟體",
    targetVariant: "zh-TW",
    start: 0,
    end: 2,
    confidence: "high",
    message: "不该被使用",
    ruleId: "x",
    ...patch,
  });

  it("按语言生成说明，而不是用 core 的中文 message", () => {
    expect(describeIssue(issue({}), "zh-Hans")).toBe("繁體中文（台灣）中通常写作「軟體」");
    expect(describeIssue(issue({}), "en")).toBe(
      "Usually written “軟體” in Traditional Chinese (Taiwan)",
    );
  });

  it("区分用户词典、依赖上下文的字形问题", () => {
    expect(describeIssue(issue({ type: "user_phrase" }), "en")).toBe(
      "User dictionary: “软件” → “軟體”",
    );
    expect(describeIssue(issue({ type: "script", confidence: "medium" }), "zh-Hans")).toBe(
      "字形与繁體中文（台灣）不一致（该字依赖上下文，请确认）",
    );
  });
});
