import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  VARIANTS,
  scanSegments,
  type DetectSettings,
  type DetectionLevel,
  type HostAdapter,
  type IssueTarget,
  type LocatedIssue,
  type UserDictionary,
  type ScanScope,
  type VariantCode,
} from "@cvl/core";
import { DictionaryPanel } from "./DictionaryPanel";
import { describeIssue } from "./describe";
import {
  LANG_NATIVE_LABELS,
  areaLabel,
  levelLabel,
  resolveLang,
  t,
  variantLabel,
  type Lang,
  type LangPref,
} from "./i18n";
import {
  loadDictionary,
  loadPrefs,
  loadSettings,
  saveDictionary,
  savePrefs,
  saveSettings,
  type Prefs,
} from "./storage";
import { CSS } from "./styles";

type Status =
  | { kind: "idle" }
  | { kind: "busy"; text: string }
  | { kind: "info"; text: string }
  | { kind: "error"; text: string };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const LANG_PREFS: readonly LangPref[] = ["auto", "zh-Hans", "zh-Hant", "en"];
const LEVELS: readonly DetectionLevel[] = ["standard", "relaxed"];

export function App({ host }: { host: HostAdapter }) {
  const [settings, setSettings] = useState<DetectSettings>(loadSettings);
  // 忽略只在本次面板会话内有效；永久不提示请用「允许」。
  const [ignored, setIgnored] = useState<Set<string>>(() => new Set());
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [dictionary, setDictionary] = useState<UserDictionary>(loadDictionary);
  /** 已在文档中用高亮标出的位置。 */
  const [marked, setMarked] = useState<IssueTarget[]>([]);
  const [issues, setIssues] = useState<LocatedIssue[]>([]);
  const [scope, setScope] = useState<ScanScope | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const lang = resolveLang(prefs.language);

  // 回调里始终读取最新的设置与忽略列表，避免闭包过期。
  const latest = useRef({ settings, ignored, prefs, dictionary, marked });
  latest.current = { settings, ignored, prefs, dictionary, marked };

  const busy = status.kind === "busy";

  const scan = useCallback(
    async (target: ScanScope, note?: string) => {
      const current = latest.current.prefs;
      const text = resolveLang(current.language);
      const label = t(text, `scope.${target}`);
      if (!current.enabled) {
        setStatus({ kind: "info", text: t(text, "status.disabled") });
        return;
      }
      setStatus({ kind: "busy", text: t(text, "status.scanning", { scope: label }) });
      try {
        const { settings, ignored, dictionary } = latest.current;
        const segments = await host.readSegments(target, {
          headerFooter: current.headerFooter,
          notes: current.notes,
        });
        const found = scanSegments(segments, settings, ignored, dictionary);
        setIssues(found);
        setScope(target);
        setStatus({
          kind: "info",
          text:
            (note ? `${note}　` : "") +
            (found.length === 0
              ? t(text, "status.noIssues", { scope: label })
              : t(text, "status.found", { scope: label, count: found.length })),
        });
      } catch (error) {
        setStatus({ kind: "error", text: t(text, "status.scanFailed", { error: errorText(error) }) });
      }
    },
    [host],
  );

  // 设置变化后，如果已扫描过，则按新设置自动重扫。
  const firstRender = useRef(true);
  useEffect(() => {
    saveSettings(settings);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (scope) {
      void scan(scope);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // 词典或检查区域变化后同样自动重扫。
  const firstExtra = useRef(true);
  useEffect(() => {
    saveDictionary(dictionary);
    if (firstExtra.current) {
      firstExtra.current = false;
      return;
    }
    if (scope) {
      void scan(scope);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictionary, prefs.headerFooter, prefs.notes]);

  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  // 切换界面语言后清空状态行，避免残留上一种语言的提示（问题列表会随语言实时重绘）。
  useEffect(() => {
    setStatus({ kind: "idle" });
  }, [prefs.language]);

  const replace = useCallback(
    async (items: LocatedIssue[]) => {
      if (!scope || items.length === 0) {
        return;
      }
      const text = resolveLang(latest.current.prefs.language);
      setStatus({ kind: "busy", text: t(text, "status.replacing") });
      try {
        const result = await host.replace(
          items.map((item) => ({
            ref: item.ref,
            segmentText: item.segmentText,
            sourceText: item.sourceText,
            occurrence: item.occurrence,
            text: item.issue.replacement,
          })),
          { trackChanges: latest.current.prefs.trackChanges, clearMarks: latest.current.marked.length > 0 },
        );
        const note =
          t(text, "note.replaced", { count: result.replaced }) +
          (result.tracked ? t(text, "note.tracked") : "") +
          (result.skipped > 0 ? t(text, "note.skipped", { count: result.skipped }) : "") +
          t(text, "note.end") +
          (result.documentTracking ? t(text, "note.documentTracking") : "");
        await scan(scope, note);
      } catch (error) {
        setStatus({ kind: "error", text: t(text, "status.replaceFailed", { error: errorText(error) }) });
      }
    },
    [host, scan, scope],
  );

  const reveal = useCallback(
    async (item: LocatedIssue) => {
      try {
        await host.reveal(item);
      } catch (error) {
        if (scope && errorText(error) === "STALE") {
          await scan(scope, t(resolveLang(latest.current.prefs.language), "note.staleRescan"));
        } else {
          const text = resolveLang(latest.current.prefs.language);
          setStatus({ kind: "error", text: t(text, "status.revealFailed", { error: errorText(error) }) });
        }
      }
    },
    [host, scan, scope],
  );

  const ignore = useCallback((item: LocatedIssue) => {
    // 与另两端一致：忽略只在本次会话内有效，不写本地存储。
    setIgnored((previous) => new Set(previous).add(item.ignoreKey));
    setIssues((previous) => previous.filter((entry) => entry.key !== item.key));
  }, []);

  const clearIgnored = useCallback(() => {
    const empty = new Set<string>();
    latest.current = { ...latest.current, ignored: empty };
    setIgnored(empty);
    if (scope) {
      void scan(scope, t(resolveLang(latest.current.prefs.language), "status.restored"));
    }
  }, [scan, scope]);

  const markIssues = useCallback(async () => {
    const text = resolveLang(latest.current.prefs.language);
    setStatus({ kind: "busy", text: t(text, "status.marking") });
    try {
      const count = await host.mark(issues);
      setMarked(issues);
      setStatus({ kind: "info", text: t(text, "status.marked", { count }) });
    } catch (error) {
      setStatus({ kind: "error", text: t(text, "status.markFailed", { error: errorText(error) }) });
    }
  }, [host, issues]);

  const clearMarks = useCallback(async () => {
    const text = resolveLang(latest.current.prefs.language);
    setStatus({ kind: "busy", text: t(text, "status.clearingMarks") });
    try {
      const count = await host.clearMarks(latest.current.marked);
      setMarked([]);
      setStatus({ kind: "info", text: t(text, "status.clearedMarks", { count }) });
    } catch (error) {
      setStatus({ kind: "error", text: t(text, "status.clearFailed", { error: errorText(error) }) });
    }
  }, [host]);

  const allow = useCallback((item: LocatedIssue) => {
    setDictionary((previous) => ({
      ...previous,
      allowed: [...previous.allowed, { variant: latest.current.settings.variant, text: item.sourceText }],
    }));
  }, []);

  const safeItems = useMemo(
    () => issues.filter((item) => item.issue.confidence === "high"),
    [issues],
  );
  const reviewCount = issues.length - safeItems.length;

  return (
    <div className="cvl">
      <style>{CSS}</style>
      <h1>{t(lang, "app.title")}</h1>

      <h2 className="group">{t(lang, "group.check")}</h2>
      <label htmlFor="cvl-language">{t(lang, "lang.label")}</label>
      <select
        id="cvl-language"
        value={prefs.language}
        onChange={(event) => setPrefs({ ...prefs, language: event.target.value as LangPref })}
      >
        {LANG_PREFS.map((value) => (
          <option key={value} value={value}>
            {value === "auto" ? t(lang, "lang.auto") : LANG_NATIVE_LABELS[value as Lang]}
          </option>
        ))}
      </select>

      <label className="check">
        <input
          type="checkbox"
          checked={prefs.enabled}
          onChange={(event) => setPrefs({ ...prefs, enabled: event.target.checked })}
        />
        {t(lang, "opt.enabled")}
      </label>

      <label htmlFor="cvl-variant">{t(lang, "opt.variant")}</label>
      <select
        id="cvl-variant"
        value={settings.variant}
        onChange={(event) =>
          setSettings({ ...settings, variant: event.target.value as VariantCode })
        }
      >
        {VARIANTS.map((code) => (
          <option key={code} value={code}>
            {variantLabel(lang, code)}
          </option>
        ))}
      </select>

      <label htmlFor="cvl-level">{t(lang, "opt.level")}</label>
      <select
        id="cvl-level"
        value={settings.level}
        onChange={(event) =>
          setSettings({ ...settings, level: event.target.value as DetectionLevel })
        }
      >
        {LEVELS.map((level) => (
          <option key={level} value={level}>
            {levelLabel(lang, level)}
          </option>
        ))}
      </select>

      <label className="check">
        <input
          type="checkbox"
          checked={prefs.headerFooter}
          onChange={(event) => setPrefs({ ...prefs, headerFooter: event.target.checked })}
        />
        {t(lang, "opt.headerFooter")}
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={prefs.notes}
          onChange={(event) => setPrefs({ ...prefs, notes: event.target.checked })}
        />
        {t(lang, "opt.notes")}
      </label>
      <label className="check" title={t(lang, "opt.trackChangesHint")}>
        <input
          type="checkbox"
          checked={prefs.trackChanges}
          onChange={(event) => setPrefs({ ...prefs, trackChanges: event.target.checked })}
        />
        {t(lang, "opt.trackChanges")}
      </label>

      <div className="row">
        <button className="primary" disabled={busy} onClick={() => void scan("document")}>
          {t(lang, "btn.scanDocument")}
        </button>
        <button disabled={busy} onClick={() => void scan("selection")}>
          {t(lang, "btn.scanSelection")}
        </button>
      </div>

      {status.kind !== "idle" && (
        <div className={`status${status.kind === "error" ? " error" : ""}`} role="status">
          {status.text}
        </div>
      )}

      {issues.length > 0 && (
        <>
          <div className="bar">
            <span>
              {t(lang, "bar.total", { count: issues.length })}
              {reviewCount > 0 ? t(lang, "bar.needsReview", { count: reviewCount }) : ""}
            </span>
            <button
              disabled={busy || safeItems.length === 0}
              title={t(lang, "bar.replaceAllHint")}
              onClick={() => void replace(safeItems)}
            >
              {t(lang, "bar.replaceAll", { count: safeItems.length })}
            </button>
          </div>
          <div className="row">
            <button disabled={busy} onClick={() => void markIssues()}>
              {t(lang, "btn.mark")}
            </button>
            <button disabled={busy || marked.length === 0} onClick={() => void clearMarks()}>
              {t(lang, "btn.clearMarks")}
            </button>
          </div>
          <ul>
            {issues.map((item) => (
              <li key={item.key} onClick={() => void reveal(item)}>
                <div className="ctx">
                  {item.area !== "body" && <span className="area">{areaLabel(lang, item.area)}</span>}
                  {item.before}
                  <span className="src">{item.sourceText}</span>
                  <span className="arrow">→</span>
                  <span className="dst">{item.issue.replacement}</span>
                  {item.after}
                  {item.issue.confidence === "medium" && (
                    <span className="badge">{t(lang, "badge.needsReview")}</span>
                  )}
                </div>
                <div className="msg">{describeIssue(item.issue, lang)}</div>
                <div className="actions">
                  <button
                    disabled={busy}
                    onClick={(event) => {
                      event.stopPropagation();
                      void replace([item]);
                    }}
                  >
                    {t(lang, "btn.replace")}
                  </button>
                  <button
                    disabled={busy}
                    onClick={(event) => {
                      event.stopPropagation();
                      ignore(item);
                    }}
                  >
                    {t(lang, "btn.ignore")}
                  </button>
                  <button
                    disabled={busy}
                    title={t(lang, "btn.allowHint")}
                    onClick={(event) => {
                      event.stopPropagation();
                      allow(item);
                    }}
                  >
                    {t(lang, "btn.allow")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <DictionaryPanel
        variant={settings.variant}
        dictionary={dictionary}
        lang={lang}
        onChange={setDictionary}
      />

      <details className="dict">
        <summary>{t(lang, "about.summary")}</summary>
        <div className="msg">{t(lang, "about.version")}</div>
        <div className="msg">{t(lang, "about.privacy")}</div>
        <div className="msg">{t(lang, "about.storage")}</div>
        <div className="msg">{t(lang, "about.engine")}</div>
      </details>

      <div className="foot">
        {t(lang, "foot.text")}
        {ignored.size > 0 && (
          <>
            {" · "}
            <button className="link" onClick={clearIgnored}>
              {t(lang, "foot.restoreIgnored", { count: ignored.size })}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
