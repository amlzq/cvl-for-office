import type { Issue } from "@cvl/core";
import { t, variantLabel, type Lang } from "./i18n";

/**
 * 在 UI 层生成问题说明，而不是直接用 core 的 `issue.message`（那是固定的简体中文）。
 * 这样界面语言变化时说明也跟着变，core 也能在后续版本里去掉 `message`。
 */
export function describeIssue(issue: Issue, lang: Lang): string {
  if (issue.type === "user_phrase") {
    return t(lang, "issue.user", { from: issue.sourceText, to: issue.replacement });
  }
  const variant = variantLabel(lang, issue.targetVariant);
  if (issue.type === "script") {
    return t(lang, issue.confidence === "medium" ? "issue.scriptMedium" : "issue.script", {
      variant,
    });
  }
  return t(lang, "issue.term", { variant, to: issue.replacement });
}
