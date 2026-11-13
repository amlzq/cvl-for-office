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

function findAll(text: string, needle: string): number[] {
  const found: number[] = [];
  if (!needle) {
    return found;
  }
  let from = 0;
  while (from < text.length) {
    const index = text.indexOf(needle, from);
    if (index === -1) {
      break;
    }
    found.push(index);
    from = index + needle.length;
  }
  return found;
}

/** 用户词组优先级高于任何内置规则。 */
const USER_PRIORITY = 1000;

function detectUserPhrases(
  text: string,
  variant: VariantCode,
  dictionary: UserDictionary,
): RankedIssue[] {
  const matches: RankedIssue[] = [];
  for (const phrase of dictionary.phrases) {
    if (phrase.variant !== variant || !phrase.source || phrase.source === phrase.target) {
      continue;
    }
    for (const start of findAll(text, phrase.source)) {
      const end = start + phrase.source.length;
      matches.push({
        priority: USER_PRIORITY,
        issue: {
          id: `user:${phrase.source}:${start}:${end}:${variant}`,
          type: "user_phrase",
          sourceText: phrase.source,
          replacement: phrase.target,
          targetVariant: variant,
          start,
          end,
          confidence: "high",
          message: `用户词典：「${phrase.source}」→「${phrase.target}」`,
          ruleId: `user:${phrase.source}`,
        },
      });
    }
  }
  return pickNonOverlapping(matches);
}

/** 检测一段纯文本，返回按位置排序、互不重叠的问题列表。 */
export function detectText(
  text: string,
  settings: DetectSettings,
  dictionary?: UserDictionary,
): Issue[] {
  if (!text.trim()) {
    return [];
  }

  const variant = settings.variant;
  const userIssues = dictionary ? detectUserPhrases(text, variant, dictionary) : [];
  const issues: Issue[] = userIssues.map((item) => item.issue);

  const termIssues: Issue[] =
    settings.level === "standard"
      ? pickNonOverlapping(detectTerms(text, variant))
          .map((item) => item.issue)
          .filter((issue) => !issues.some((other) => overlaps(other, issue)))
      : [];
  issues.push(...termIssues);

  const scriptCandidates = pickNonOverlapping(
    findScriptChanges(text, variant).map((change) => scriptIssue(change, variant)),
  );
  for (const candidate of scriptCandidates) {
    if (!issues.some((issue) => overlaps(issue, candidate.issue))) {
      issues.push(candidate.issue);
    }
  }

  // 「允许词」：与其任一出现位置有重叠的问题都不报告。
  const allowedSpans: Array<[number, number]> = [];
  for (const word of dictionary?.allowed ?? []) {
    if (word.variant === variant) {
      for (const start of findAll(text, word.text)) {
        allowedSpans.push([start, start + word.text.length]);
      }
    }
  }
  const visible =
    allowedSpans.length === 0
      ? issues
      : issues.filter(
          (issue) => !allowedSpans.some(([start, end]) => issue.start < end && start < issue.end),
        );

  return sortCandidates(visible.map((issue) => ({ issue, priority: 0 }))).map(
    (item) => item.issue,
  );
}
