import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LEVEL_LABELS,
  VARIANTS,
  VARIANT_LABELS,
  scanSegments,
  type DetectSettings,
  type DetectionLevel,
  AREA_LABELS,
  type HostAdapter,
  type IssueTarget,
  type LocatedIssue,
  type UserDictionary,
  type ScanScope,
  type VariantCode,
} from "@cvl/core";
import { DictionaryPanel } from "./DictionaryPanel";
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

const SCOPE_LABEL: Record<ScanScope, string> = { document: "全文", selection: "选中段落" };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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

  // 回调里始终读取最新的设置与忽略列表，避免闭包过期。
  const latest = useRef({ settings, ignored, prefs, dictionary, marked });
  latest.current = { settings, ignored, prefs, dictionary, marked };

  const busy = status.kind === "busy";

  const scan = useCallback(
    async (target: ScanScope, note?: string) => {
      if (!latest.current.prefs.enabled) {
        setStatus({ kind: "info", text: "检查已关闭。勾选上方「启用检查」后再试，或到「用户词典」临时处理单条。" });
        return;
      }
      setStatus({ kind: "busy", text: `正在扫描${SCOPE_LABEL[target]}…` });
      try {
        const { settings, ignored, prefs, dictionary } = latest.current;
        const segments = await host.readSegments(target, {
          headerFooter: prefs.headerFooter,
          notes: prefs.notes,
        });
        const found = scanSegments(segments, settings, ignored, dictionary);
        setIssues(found);
        setScope(target);
        setStatus({
          kind: "info",
          text:
            (note ? `${note}　` : "") +
            (found.length === 0
              ? `${SCOPE_LABEL[target]}未发现问题。`
              : `${SCOPE_LABEL[target]}发现 ${found.length} 处。`),
        });
      } catch (error) {
        setStatus({ kind: "error", text: `扫描失败：${errorText(error)}` });
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

  const replace = useCallback(
    async (items: LocatedIssue[]) => {
      if (!scope || items.length === 0) {
        return;
      }
      setStatus({ kind: "busy", text: "正在替换…" });
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
          `已替换 ${result.replaced} 处` +
          (result.tracked ? "（修订方式，可在「审阅」中接受 / 拒绝）" : "") +
          (result.skipped > 0 ? `，${result.skipped} 处因文档已变化被跳过` : "") +
          "。" +
          (result.documentTracking ? "文档已开启修订，本次替换按修订记录。" : "");
        await scan(scope, note);
      } catch (error) {
        setStatus({ kind: "error", text: `替换失败：${errorText(error)}` });
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
          await scan(scope, "文档已变化，已重新扫描。");
        } else {
          setStatus({ kind: "error", text: `定位失败：${errorText(error)}` });
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
      void scan(scope, "已恢复本次忽略的项。");
    }
  }, [scan, scope]);

  const markIssues = useCallback(async () => {
    setStatus({ kind: "busy", text: "正在标出…" });
    try {
      const count = await host.mark(issues);
      setMarked(issues);
      setStatus({ kind: "info", text: `已用高亮标出 ${count} 处。` });
    } catch (error) {
      setStatus({ kind: "error", text: `标出失败：${errorText(error)}` });
    }
  }, [host, issues]);

  const clearMarks = useCallback(async () => {
    setStatus({ kind: "busy", text: "正在清除标记…" });
    try {
      const count = await host.clearMarks(latest.current.marked);
      setMarked([]);
      setStatus({ kind: "info", text: `已清除 ${count} 处高亮标记。` });
    } catch (error) {
      setStatus({ kind: "error", text: `清除失败：${errorText(error)}` });
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
      <h1>CVL · 中文用字检查</h1>

      <h2 className="group">检查设置</h2>
      <label className="check">
        <input
          type="checkbox"
          checked={prefs.enabled}
          onChange={(event) => setPrefs({ ...prefs, enabled: event.target.checked })}
        />
        启用检查
      </label>

      <label htmlFor="cvl-variant">文档应使用</label>
      <select
        id="cvl-variant"
        value={settings.variant}
        onChange={(event) =>
          setSettings({ ...settings, variant: event.target.value as VariantCode })
        }
      >
        {VARIANTS.map((code) => (
          <option key={code} value={code}>
            {VARIANT_LABELS[code]}
          </option>
        ))}
      </select>

      <label htmlFor="cvl-level">检查范围</label>
      <select
        id="cvl-level"
        value={settings.level}
        onChange={(event) =>
          setSettings({ ...settings, level: event.target.value as DetectionLevel })
        }
      >
        {(Object.keys(LEVEL_LABELS) as DetectionLevel[]).map((level) => (
          <option key={level} value={level}>
            {LEVEL_LABELS[level]}
          </option>
        ))}
      </select>

      <label className="check">
        <input
          type="checkbox"
          checked={prefs.headerFooter}
          onChange={(event) => setPrefs({ ...prefs, headerFooter: event.target.checked })}
        />
        检查页眉页脚（全文扫描）
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={prefs.notes}
          onChange={(event) => setPrefs({ ...prefs, notes: event.target.checked })}
        />
        检查脚注 / 尾注（全文扫描）
      </label>
      <label className="check" title="替换以 Track Changes 写入，可在 Word「审阅」中接受或拒绝">
        <input
          type="checkbox"
          checked={prefs.trackChanges}
          onChange={(event) => setPrefs({ ...prefs, trackChanges: event.target.checked })}
        />
        以修订方式替换
      </label>

      <div className="row">
        <button className="primary" disabled={busy} onClick={() => void scan("document")}>
          扫描全文
        </button>
        <button disabled={busy} onClick={() => void scan("selection")}>
          扫描选中段落
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
              共 {issues.length} 处
              {reviewCount > 0 ? `（${reviewCount} 处需确认）` : ""}
            </span>
            <button
              disabled={busy || safeItems.length === 0}
              title="只替换高置信度项；标有「需确认」的请逐条处理"
              onClick={() => void replace(safeItems)}
            >
              全部替换（{safeItems.length}）
            </button>
          </div>
          <div className="row">
            <button disabled={busy} onClick={() => void markIssues()}>
              高亮标出
            </button>
            <button disabled={busy || marked.length === 0} onClick={() => void clearMarks()}>
              清除标记
            </button>
          </div>
          <ul>
            {issues.map((item) => (
              <li key={item.key} onClick={() => void reveal(item)}>
                <div className="ctx">
                  {item.area !== "body" && <span className="area">{AREA_LABELS[item.area]}</span>}
                  {item.before}
                  <span className="src">{item.sourceText}</span>
                  <span className="arrow">→</span>
                  <span className="dst">{item.issue.replacement}</span>
                  {item.after}
                  {item.issue.confidence === "medium" && <span className="badge">需确认</span>}
                </div>
                <div className="msg">{item.issue.message}</div>
                <div className="actions">
                  <button
                    disabled={busy}
                    onClick={(event) => {
                      event.stopPropagation();
                      void replace([item]);
                    }}
                  >
                    替换
                  </button>
                  <button
                    disabled={busy}
                    onClick={(event) => {
                      event.stopPropagation();
                      ignore(item);
                    }}
                  >
                    忽略
                  </button>
                  <button
                    disabled={busy}
                    title="加入用户词典的允许词，之后不再报告包含它的位置"
                    onClick={(event) => {
                      event.stopPropagation();
                      allow(item);
                    }}
                  >
                    允许
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <DictionaryPanel variant={settings.variant} dictionary={dictionary} onChange={setDictionary} />

      <details className="dict">
        <summary>关于 · 隐私</summary>
        <div className="msg">CVL 中文用字检查 v0.1 · MIT License</div>
        <div className="msg">检查全部在本机完成，文档内容不会上传；没有网络请求、遥测或账号。</div>
        <div className="msg">设置与用户词典保存在本机 localStorage，可用词典页的「导出」迁移到其他设备。</div>
        <div className="msg">字形转换基于 OpenCC，术语规则与浏览器扩展版、macOS 版共用同一套。</div>
      </details>

      <div className="foot">
        点击条目可在文档中定位。检查在本机完成，文档内容不会上传。v0.1
        {ignored.size > 0 && (
          <>
            {" · "}
            <button className="link" onClick={clearIgnored}>
              恢复本次忽略（{ignored.size}）
            </button>
          </>
        )}
      </div>
    </div>
  );
}
