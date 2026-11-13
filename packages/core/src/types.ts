export type VariantCode = "zh-CN" | "zh-TW" | "zh-HK" | "zh-Hant";
export type DetectionLevel = "standard" | "relaxed";
export type IssueType = "script" | "variant_term" | "user_phrase";
export type Confidence = "high" | "medium";

export const VARIANTS: readonly VariantCode[] = ["zh-CN", "zh-TW", "zh-HK", "zh-Hant"];

export const VARIANT_LABELS: Record<VariantCode, string> = {
  "zh-CN": "简体中文（中国大陆）",
  "zh-TW": "繁體中文（台灣）",
  "zh-HK": "繁體中文（香港）",
  "zh-Hant": "通用繁體",
};

export const LEVEL_LABELS: Record<DetectionLevel, string> = {
  standard: "标准（字形 + 地区用词）",
  relaxed: "宽松（仅字形）",
};

export interface DetectSettings {
  /** 文档应使用的写法（目标变体）。 */
  variant: VariantCode;
  /** standard：字形 + 用词；relaxed：仅字形。 */
  level: DetectionLevel;
}

export const DEFAULT_SETTINGS: DetectSettings = {
  variant: "zh-CN",
  level: "standard",
};

export interface Issue {
  id: string;
  type: IssueType;
  sourceText: string;
  replacement: string;
  targetVariant: VariantCode;
  /** UTF-16 下标，相对于被检测的文本。 */
  start: number;
  end: number;
  confidence: Confidence;
  message: string;
  ruleId: string;
}

export interface VariantTermRule {
  id: string;
  kind: "variant_term";
  sourceTerm: string;
  targets: Partial<Record<VariantCode, string>>;
  safe: boolean;
  enabled: boolean;
  priority: number;
  source: "builtin" | "user";
  tags?: string[];
}
