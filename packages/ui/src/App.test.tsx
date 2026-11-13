import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { scanSegments, DEFAULT_SETTINGS, type HostAdapter } from "@cvl/core";
import { App } from "./App";

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
  });

  it("host segments flow into scan results", async () => {
    const segments = await fakeHost.readSegments("document");
    const found = scanSegments(segments, { ...DEFAULT_SETTINGS, variant: "zh-TW" });
    expect(found.map((f) => f.issue.replacement)).toContain("軟體");
  });
});
