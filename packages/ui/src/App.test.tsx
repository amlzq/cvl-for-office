import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { scanSegments, DEFAULT_SETTINGS, type HostAdapter } from "@cvl/core";
import { App } from "./App";
import { loadPrefs } from "./storage";

const fakeHost: HostAdapter = {
  name: "fake",
  readSegments: async () => [{ ref: "p:0", text: "请使用软件" }],
  reveal: async () => {},
  replace: async () => ({ replaced: 0, skipped: 0 }),
  mark: async () => 0,
  clearMarks: async () => 0,
};

describe("App", () => {
  it("renders controls on first paint", () => {
    const html = renderToString(<App host={fakeHost} />);
    expect(html).toContain("扫描全文");
    expect(html).toContain("扫描选中段落");
    expect(html).toContain("简体中文（中国大陆）");
    expect(html).toContain("以修订方式替换");
    expect(html).toContain("用户词典");
    expect(html).toContain("隐私");
  });

  it("host segments flow into scan results", async () => {
    const segments = await fakeHost.readSegments("document");
    const found = scanSegments(segments, { ...DEFAULT_SETTINGS, variant: "zh-TW" });
    expect(found.map((f) => f.issue.replacement)).toContain("軟體");
  });

  it("启用检查默认开启，并能从存储读回关闭状态", () => {
    const store = new Map<string, string>();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    };
    try {
      expect(loadPrefs().enabled).toBe(true);
      store.set("cvl.prefs.v1", JSON.stringify({ enabled: false }));
      expect(loadPrefs().enabled).toBe(false);
      const html = renderToString(<App host={fakeHost} />);
      expect(html).toContain("启用检查");
    } finally {
      Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("不读取历史忽略记录：忽略只对本次会话有效", () => {
    const store = new Map<string, string>([["cvl.ignored.v1", JSON.stringify(["p:0:2:0:software"])]]);
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    };
    try {
      const html = renderToString(<App host={fakeHost} />);
      // 旧数据不再被读取，页脚不会出现“恢复本次忽略”。
      expect(html).not.toContain("恢复本次忽略");
      expect(store.get("cvl.ignored.v1")).toBe(JSON.stringify(["p:0:2:0:software"]));
    } finally {
      Reflect.deleteProperty(globalThis, "window");
    }
  });
});
