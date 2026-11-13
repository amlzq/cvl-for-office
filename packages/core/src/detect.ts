import { TERM_RULES } from "./rules/terms";
import { findScriptChanges, type ScriptChange } from "./rules/script";
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
  return {
    priority: rule.priority,
    issue: {
      id: `${rule.id}:${start}:${end}:${variant}`,
      type: "variant_term",
      sourceText: rule.sourceTerm,
      replacement,
      targetVariant: variant,
      start,
      end,
      confidence: rule.safe ? "high" : "medium",
      message: `${VARIANT_LABELS[variant]}中通常写作「${replacement}」`,
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

function detectTerms(text: string, variant: VariantCode): RankedIssue[] {
  const rules = TERM_RULES.filter((rule) => rule.enabled && rule.targets[variant]).sort(
    (left, right) =>
      right.sourceTerm.length - left.sourceTerm.length || right.priority - left.priority,
  );
  const matches: RankedIssue[] = [];

  for (const rule of rules) {
    const replacement = rule.targets[variant];
    if (!replacement || replacement === rule.sourceTerm) {
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

/** 检测一段纯文本，返回按位置排序、互不重叠的问题列表。 */
export function detectText(text: string, settings: DetectSettings): Issue[] {
  if (!text.trim()) {
    return [];
  }

  const variant = settings.variant;
  const issues: Issue[] =
    settings.level === "standard"
      ? pickNonOverlapping(detectTerms(text, variant)).map((item) => item.issue)
      : [];
  const termIssues = [...issues];

  const scriptCandidates = pickNonOverlapping(
    findScriptChanges(text, variant).map((change) => scriptIssue(change, variant)),
  );
  for (const candidate of scriptCandidates) {
    if (!termIssues.some((issue) => overlaps(issue, candidate.issue))) {
      issues.push(candidate.issue);
    }
  }

  return sortCandidates(issues.map((issue) => ({ issue, priority: 0 }))).map(
    (item) => item.issue,
  );
}
