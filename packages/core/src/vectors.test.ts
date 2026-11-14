/**
 * 共享测试向量：由浏览器扩展版的 detectText 生成（见 cvl-for-mac/scripts/export-shared.mjs），
 * macOS 版用同一份文件验证。这里保证 Office 版的检测结果与扩展版一致。
 * 更新向量：npm run sync:vectors
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectText } from "./detect";
import { normalizeDictionary, type UserDictionary } from "./dictionary";
import { VARIANTS, type DetectionLevel, type VariantCode } from "./types";

interface VectorIssue {
  type: string;
  sourceText: string;
  start: number;
  end: number;
  confidence: string;
  ruleId: string;
  suggestion: string | null;
}

interface Vector {
  name: string;
  text: string;
  settings: {
    defaultVariant: VariantCode;
    detectionLevel: DetectionLevel;
    userDictionary: {
      allowPhrases?: Partial<Record<VariantCode, string[]>>;
      phrases?: Partial<Record<VariantCode, Array<{ id: string; from: string; to: string; enabled: boolean }>>>;
    } | null;
  };
  expected: VectorIssue[];
}

const vectors = JSON.parse(
  readFileSync(new URL("../../../shared/test-vectors.json", import.meta.url), "utf8"),
) as Vector[];

/** 扩展版的词典结构（按写法分组、带启用开关）转换为 Office 版的扁平结构。 */
function toDictionary(input: Vector["settings"]["userDictionary"]): UserDictionary | undefined {
  if (!input) return undefined;
  return normalizeDictionary({
    phrases: VARIANTS.flatMap((variant) =>
      (input.phrases?.[variant] ?? [])
        .filter((p) => p.enabled)
        .map((p) => ({ variant, source: p.from, target: p.to })),
    ),
    allowed: VARIANTS.flatMap((variant) => (input.allowPhrases?.[variant] ?? []).map((text) => ({ variant, text }))),
  });
}

/** 用户词组的 ruleId 在两端各自生成（扩展用词条 id），只比对其余字段。 */
function comparable(issue: VectorIssue, userPhrase: boolean) {
  return {
    type: userPhrase ? "user_phrase" : issue.type,
    sourceText: issue.sourceText,
    start: issue.start,
    end: issue.end,
    confidence: issue.confidence,
    ruleId: userPhrase ? "(user)" : issue.ruleId,
    suggestion: issue.suggestion,
  };
}

describe("shared test vectors (parity with the browser extension)", () => {
  it("loads the vector file", () => {
    expect(vectors.length).toBeGreaterThan(300);
  });

  it.each(vectors.map((v) => [v.name, v] as const))("%s", (_name, vector) => {
    const { defaultVariant: variant, detectionLevel: level, userDictionary } = vector.settings;
    const userRuleIds = new Set(
      Object.values(userDictionary?.phrases ?? {}).flatMap((list) => (list ?? []).map((p) => p.id)),
    );
    const actual = detectText(vector.text, { variant, level }, toDictionary(userDictionary)).map((issue) =>
      comparable(
        { ...issue, suggestion: issue.replacement },
        issue.type === "user_phrase",
      ),
    );
    const expected = vector.expected.map((issue) => comparable(issue, userRuleIds.has(issue.ruleId)));
    expect(actual).toEqual(expected);
  });
});
