import { DEFAULT_SETTINGS, LEVEL_LABELS, VARIANTS, type DetectSettings } from "@cvl/core";

const SETTINGS_KEY = "cvl.settings.v1";
const IGNORED_KEY = "cvl.ignored.v1";
const IGNORED_LIMIT = 1000;

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

export function loadIgnored(): Set<string> {
  const stored = read(IGNORED_KEY);
  return new Set(Array.isArray(stored) ? stored.filter((v): v is string => typeof v === "string") : []);
}

export function saveIgnored(ignored: ReadonlySet<string>): void {
  write(IGNORED_KEY, [...ignored].slice(-IGNORED_LIMIT));
}
