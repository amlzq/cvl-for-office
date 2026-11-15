/**
 * 规则一致性测试：Office 内置术语规则必须与浏览器扩展版导出的快照完全一致。
 *
 * 快照来源：cvl-for-mac/scripts/export-shared.mjs 写入 CVLCore Resources 的 term-rules.json，
 * 由 npm run sync:vectors 复制到这里。共享测试向量只能覆盖采样文本，新增规则若不同步
 * 可能一条向量都不命中，所以额外做这份全量比对。
 * 更新快照：npm run sync:vectors
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TERM_RULES } from "./rules/terms";
import type { VariantTermRule } from "./types";

const snapshot = JSON.parse(
  readFileSync(new URL("../../../shared/term-rules.json", import.meta.url), "utf8"),
) as VariantTermRule[];

/** 只比对影响检测结果的字段，忽略序列化顺序与可选字段缺省。 */
function comparable(rule: VariantTermRule) {
  return {
    id: rule.id,
    kind: rule.kind,
    sourceTerm: rule.sourceTerm,
    targets: Object.fromEntries(Object.entries(rule.targets).sort(([a], [b]) => a.localeCompare(b))),
    safe: rule.safe,
    enabled: rule.enabled,
    priority: rule.priority,
    source: rule.source,
    tags: rule.tags ?? [],
  };
}

describe("term rules (parity with the browser extension)", () => {
  it("loads the rule snapshot", () => {
    expect(snapshot.length).toBeGreaterThan(100);
  });

  it("内置术语规则与扩展版快照逐条一致", () => {
    expect(TERM_RULES.map(comparable)).toEqual(snapshot.map(comparable));
  });

  it("规则 id 唯一", () => {
    const ids = TERM_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
