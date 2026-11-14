import { VARIANTS, type VariantCode } from "./types";

/** 命中 source 时建议替换为 target；按「文档应使用」的写法（variant）分别存放。 */
export interface UserPhrase {
  variant: VariantCode;
  source: string;
  target: string;
}

/** 允许词：出现在文本中时，与其重叠的问题不再报告。 */
export interface AllowedWord {
  variant: VariantCode;
  text: string;
}

export interface UserDictionary {
  phrases: UserPhrase[];
  allowed: AllowedWord[];
}

export const EMPTY_DICTIONARY: UserDictionary = { phrases: [], allowed: [] };

export function isVariantCode(value: unknown): value is VariantCode {
  return VARIANTS.includes(value as VariantCode);
}

/** 去重并丢弃无效条目。 */
export function normalizeDictionary(input: Partial<UserDictionary> | undefined): UserDictionary {
  const phraseKeys = new Set<string>();
  const phrases: UserPhrase[] = [];
  for (const entry of input?.phrases ?? []) {
    const source = typeof entry?.source === "string" ? entry.source.trim() : "";
    const target = typeof entry?.target === "string" ? entry.target.trim() : "";
    const key = `${entry?.variant}\u0000${source}`;
    if (isVariantCode(entry?.variant) && source && target && source !== target && !phraseKeys.has(key)) {
      phraseKeys.add(key);
      phrases.push({ variant: entry.variant, source, target });
    }
  }
  const allowedKeys = new Set<string>();
  const allowed: AllowedWord[] = [];
  for (const entry of input?.allowed ?? []) {
    const text = typeof entry?.text === "string" ? entry.text.trim() : "";
    const key = `${entry?.variant}\u0000${text}`;
    if (isVariantCode(entry?.variant) && text && !allowedKeys.has(key)) {
      allowedKeys.add(key);
      allowed.push({ variant: entry.variant, text });
    }
  }
  return { phrases, allowed };
}
