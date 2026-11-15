import type { DetectionLevel, SegmentArea, VariantCode } from "@cvl/core";
import { en } from "./en";
import { zhHans } from "./zh-Hans";
import { zhHant } from "./zh-Hant";

export type Lang = "zh-Hans" | "zh-Hant" | "en";
/** `auto` 表示跟随 Office 的显示语言。 */
export type LangPref = "auto" | Lang;

const TABLES: Record<Lang, Record<string, string>> = { "zh-Hans": zhHans, "zh-Hant": zhHant, en };

/** 语言自身的名称：切换语言时用母语显示，避免用户看不懂当前界面语言。 */
export const LANG_NATIVE_LABELS: Record<Lang, string> = {
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
  en: "English",
};

/** 跟随 Office 的显示语言；zh-TW / zh-HK / zh-Hant 归到繁体。 */
export function resolveLang(pref: LangPref = "auto"): Lang {
  if (pref !== "auto") {
    return pref;
  }
  const office = (globalThis as {
    Office?: { context?: { displayLanguage?: string } };
  }).Office;
  const tag = (office?.context?.displayLanguage ?? "zh-CN").toLowerCase();
  if (tag.startsWith("zh")) {
    return /(tw|hk|mo|hant)/.test(tag) ? "zh-Hant" : "zh-Hans";
  }
  return "en";
}

/** 取文案并替换 `{name}` 占位符；缺失的键回落到简体中文，再回落到键名本身。 */
export function t(
  lang: Lang,
  key: string,
  vars: Record<string, string | number> = {},
): string {
  const template = TABLES[lang][key] ?? zhHans[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function variantLabel(lang: Lang, code: VariantCode): string {
  return t(lang, `variant.${code}`);
}

export function levelLabel(lang: Lang, level: DetectionLevel): string {
  return t(lang, `level.${level}`);
}

export function areaLabel(lang: Lang, area: SegmentArea): string {
  return t(lang, `area.${area}`);
}
