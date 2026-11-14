import { TERM_RULES } from "./rules/terms";
import { findScriptChanges, type ScriptChange } from "./rules/script";
import type { UserDictionary } from "./dictionary";
import {
  VARIANT_LABELS,
  type DetectSettings,
  type Issue,
  type VariantCode,
  type VariantTermRule,
} from "./types";

interface RankedIssue {
  issue: Issue;
  priority: number;
}

/** 字形问题的优先级：低于所有词汇规则，仅在同一区间内比较时使用。 */
const SCRIPT_PRIORITY = 100;

function sortCandidates(candidates: RankedIssue[]): RankedIssue[] {
  return candidates.sort((left, right) => {
    if (left.issue.start !== right.issue.start) {
      return left.issue.start - right.issue.start;
    }
    const leftLength = left.issue.end - left.issue.start;
    const rightLength = right.issue.end - right.issue.start;
    if (leftLength !== rightLength) {
      return rightLength - leftLength;
    }
    return right.priority - left.priority;
  });
}

function overlaps(left: Issue, right: Issue): boolean {
  return left.start < right.end && right.start < left.end;
}

function pickNonOverlapping(candidates: RankedIssue[]): RankedIssue[] {
  const selected: RankedIssue[] = [];
  for (const candidate of sortCandidates(candidates)) {
    const conflict = selected.find((item) => overlaps(item.issue, candidate.issue));
    if (!conflict) {
      selected.push(candidate);
      continue;
    }
    if (
      conflict.issue.start === candidate.issue.start &&
      conflict.issue.end === candidate.issue.end &&
      candidate.priority > conflict.priority
    ) {
      selected.splice(selected.indexOf(conflict), 1, candidate);
    }
  }
  return sortCandidates(selected);
}

function termIssue(
  rule: VariantTermRule,
  variant: VariantCode,
  replacement: string,
  start: number,
): RankedIssue {
  const end = start + rule.sourceTerm.length;
  const isUser = rule.source === "user";
  return {
    priority: rule.priority,
    issue: {
      id: `${rule.id}:${start}:${end}:${variant}`,
      type: isUser ? "user_phrase" : "variant_term",
      sourceText: rule.sourceTerm,
      replacement,
      targetVariant: variant,
      start,
      end,
      confidence: rule.safe ? "high" : "medium",
      message: isUser
        ? `用户词典：「${rule.sourceTerm}」→「${replacement}」`
        : `${VARIANT_LABELS[variant]}中通常写作「${replacement}」`,
      ruleId: rule.id,
    },
  };
}

function scriptIssue(change: ScriptChange, variant: VariantCode): RankedIssue {
  const ruleId = `opencc:${change.source}>${change.target}`;
  return {
    priority: SCRIPT_PRIORITY,
    issue: {
      id: `${ruleId}:${change.start}:${change.end}:${variant}`,
      type: "script",
      sourceText: change.source,
      replacement: change.target,
      targetVariant: variant,
      start: change.start,
      end: change.end,
      confidence: change.contextSensitive ? "medium" : "high",
      message: change.contextSensitive
        ? `字形与${VARIANT_LABELS[variant]}不一致（该字依赖上下文，请确认）`
        : `字形与${VARIANT_LABELS[variant]}不一致`,
      ruleId,
    },
  };
}

/** 用户词组优先级高于任何内置规则（与扩展版一致）。 */
const USER_PRIORITY = 10_000;

/** 用户词组转为词汇规则，与内置规则一起参与匹配（与扩展版 loadRuleBundle 一致）。 */
function userTermRules(variant: VariantCode, dictionary?: UserDictionary): VariantTermRule[] {
  return (dictionary?.phrases ?? [])
    .filter((phrase) => phrase.variant === variant)
    .map((phrase) => ({
      id: `user:${phrase.source}`,
      kind: "variant_term" as const,
      sourceTerm: phrase.source,
      targets: { [variant]: phrase.target },
      safe: true,
      enabled: true,
      priority: USER_PRIORITY,
      source: "user" as const,
      tags: ["user-phrase"],
    }));
}

function detectTerms(
  text: string,
  variant: VariantCode,
  rules: VariantTermRule[],
  allowed: Set<string>,
): RankedIssue[] {
  const sorted = [...rules].sort(
    (left, right) =>
      right.sourceTerm.length - left.sourceTerm.length || right.priority - left.priority,
  );
  const matches: RankedIssue[] = [];

  for (const rule of sorted) {
    const replacement = rule.targets[variant];
    if (!replacement || replacement === rule.sourceTerm || allowed.has(rule.sourceTerm)) {
      continue;
    }
    let from = 0;
    while (from < text.length) {
      const index = text.indexOf(rule.sourceTerm, from);
      if (index === -1) {
        break;
      }
      matches.push(termIssue(rule, variant, replacement, index));
      from = index + Math.max(1, rule.sourceTerm.length);
    }
  }
  return matches;
}

/** 区间 [start, end) 是否被某个允许词的某次出现完整覆盖。 */
function coveredByAllowed(text: string, start: number, end: number, allowed: Set<string>): boolean {
  for (const word of allowed) {
    if (!word) continue;
    let from = 0;
    while (from < text.length) {
      const index = text.indexOf(word, from);
      if (index === -1) break;
      if (index <= start && end <= index + word.length) return true;
      from = index + Math.max(1, word.length);
    }
  }
  return false;
}

/**
 * 检测一段纯文本，返回按位置排序、互不重叠的问题列表。
 * 行为与浏览器扩展版的 detectText 一致，由共享测试向量（vectors.test.ts）保证：
 *
 * - 标准档：用户词组与内置词汇规则一起匹配（长词、靠前者优先，同区间用户词组优先），再补字形问题；
 *   宽松档：只查字形，用户词组也不生效。
 * - 允许词：原词恰好等于允许词的词汇规则不报告；被允许词完整覆盖的字形问题不报告。
 */
export function detectText(
  text: string,
  settings: DetectSettings,
  dictionary?: UserDictionary,
): Issue[] {
  if (!text.trim()) {
    return [];
  }

  const variant = settings.variant;
  const allowed = new Set(
    (dictionary?.allowed ?? []).filter((word) => word.variant === variant).map((word) => word.text),
  );

  const issues: RankedIssue[] =
    settings.level === "standard"
      ? pickNonOverlapping(
          detectTerms(
            text,
            variant,
            [
              ...userTermRules(variant, dictionary),
              ...TERM_RULES.filter((rule) => rule.enabled && Boolean(rule.targets[variant])),
            ],
            allowed,
          ),
        )
      : [];
  const occupied = issues.map((item) => item.issue);

  const scriptCandidates = pickNonOverlapping(
    findScriptChanges(text, variant)
      .filter(
        (change) =>
          !allowed.has(change.source) && !coveredByAllowed(text, change.start, change.end, allowed),
      )
      .map((change) => scriptIssue(change, variant)),
  );
  for (const candidate of scriptCandidates) {
    if (!occupied.some((issue) => overlaps(issue, candidate.issue))) {
      issues.push(candidate);
    }
  }

  return sortCandidates(issues).map((item) => item.issue);
}
