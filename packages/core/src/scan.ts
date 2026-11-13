import { detectText } from "./detect";
import type { IssueTarget, TextSegment } from "./host";
import type { DetectSettings, Issue } from "./types";

export interface LocatedIssue extends IssueTarget {
  /** 全局唯一，用于 React key。 */
  key: string;
  /** 与位置无关的稳定标识，用于「忽略」：规则 + 原词 + 前后各 3 个字。 */
  ignoreKey: string;
  issue: Issue;
  /** 问题前后的上下文，用于列表展示。 */
  before: string;
  after: string;
}

/**
 * sourceText 在 text 中从左到右（不重叠）匹配时，位于 start 的那一处是第几次出现。
 * 与 Word `search()` 的匹配顺序一致。找不到返回 -1。
 */
export function occurrenceIndex(text: string, sourceText: string, start: number): number {
  if (!sourceText) {
    return -1;
  }
  let count = 0;
  let from = 0;
  while (from <= text.length) {
    const index = text.indexOf(sourceText, from);
    if (index === -1 || index > start) {
      return -1;
    }
    if (index === start) {
      return count;
    }
    count++;
    from = index + sourceText.length;
  }
  return -1;
}

const CONTEXT = 8;

export function scanSegments(
  segments: TextSegment[],
  settings: DetectSettings,
  ignored: ReadonlySet<string> = new Set(),
): LocatedIssue[] {
  const result: LocatedIssue[] = [];

  for (const segment of segments) {
    for (const issue of detectText(segment.text, settings)) {
      // Word 的 search() 把 ^ 当作特殊字符，且单次查找最长 255 字符；这类情况无法可靠定位，跳过。
      if (issue.sourceText.includes("^") || issue.sourceText.length > 255) {
        continue;
      }
      const occurrence = occurrenceIndex(segment.text, issue.sourceText, issue.start);
      if (occurrence < 0) {
        continue;
      }

      const around =
        segment.text.slice(Math.max(0, issue.start - 3), issue.start) +
        "|" +
        segment.text.slice(issue.end, issue.end + 3);
      const ignoreKey = `${issue.ruleId}:${issue.sourceText}:${around}`;
      if (ignored.has(ignoreKey)) {
        continue;
      }

      result.push({
        key: `${segment.ref}:${issue.id}`,
        ignoreKey,
        ref: segment.ref,
        segmentText: segment.text,
        sourceText: issue.sourceText,
        occurrence,
        issue,
        before: segment.text.slice(Math.max(0, issue.start - CONTEXT), issue.start),
        after: segment.text.slice(issue.end, issue.end + CONTEXT),
      });
    }
  }

  return result;
}
