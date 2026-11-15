import {
  DEFAULT_SCAN_OPTIONS,
  DEFAULT_SETTINGS,
  LEVEL_LABELS,
  VARIANTS,
  normalizeDictionary,
  type DetectSettings,
  type ScanOptions,
  type UserDictionary,
} from "@cvl/core";

const SETTINGS_KEY = "cvl.settings.v1";

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储不可用（隐私模式等）时静默降级为仅当前会话有效。
  }
}

export function loadSettings(): DetectSettings {
  const stored = read(SETTINGS_KEY) as Partial<DetectSettings> | undefined;
  return {
    variant: VARIANTS.includes(stored?.variant as never) ? stored!.variant! : DEFAULT_SETTINGS.variant,
    level: stored?.level && stored.level in LEVEL_LABELS ? stored.level : DEFAULT_SETTINGS.level,
  };
}

export function saveSettings(settings: DetectSettings): void {
  write(SETTINGS_KEY, settings);
}

const PREFS_KEY = "cvl.prefs.v1";
const DICTIONARY_KEY = "cvl.dictionary.v1";

export interface Prefs extends ScanOptions {
  /** 替换时以修订（Track Changes）方式写入。 */
  trackChanges: boolean;
  /** 总开关：关闭后所有扫描入口都不执行，与另两端的「启用检查」一致。 */
  enabled: boolean;
}

export const DEFAULT_PREFS: Prefs = { ...DEFAULT_SCAN_OPTIONS, trackChanges: false, enabled: true };

export function loadPrefs(): Prefs {
  const stored = read(PREFS_KEY) as Partial<Prefs> | undefined;
  const pick = (key: keyof Prefs) =>
    typeof stored?.[key] === "boolean" ? stored[key]! : DEFAULT_PREFS[key];
  return {
    enabled: pick("enabled"),
    trackChanges: pick("trackChanges"),
    headerFooter: pick("headerFooter"),
    notes: pick("notes"),
  };
}

export function savePrefs(prefs: Prefs): void {
  write(PREFS_KEY, prefs);
}

export function loadDictionary(): UserDictionary {
  return normalizeDictionary(read(DICTIONARY_KEY) as Partial<UserDictionary> | undefined);
}

export function saveDictionary(dictionary: UserDictionary): void {
  write(DICTIONARY_KEY, dictionary);
}
