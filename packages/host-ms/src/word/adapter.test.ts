import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wordAdapter } from "./adapter";

interface FakeRange {
  text: string;
  select: ReturnType<typeof vi.fn>;
  insertText: ReturnType<typeof vi.fn>;
}

/** 最小化的 Word 对象模型：只模拟适配器用到的部分。 */
function installFakeWord(
  texts: string[],
  selection: number[] = [],
  extra: { trackingMode?: string; sections?: Array<Record<string, string[]>>; footnotes?: string[][] } = {},
) {
  const ranges: FakeRange[][] = texts.map((text) => {
    const found: FakeRange[] = [];
    let from = 0;
    for (;;) {
      const index = text.indexOf("软件", from);
      if (index === -1) break;
      found.push({ text: "软件", select: vi.fn(), insertText: vi.fn() });
      from = index + 2;
    }
    return found;
  });

  const paragraphs = texts.map((text, index) => ({
    text,
    search: (needle: string) => ({
      items: needle === "软件" ? ranges[index] : [],
      load: vi.fn(),
    }),
    getRange: () => ({
      compareLocationWith: () => ({ value: selection.includes(index) ? "Inside" : "Before" }),
    }),
  }));

  const plain = (lines: string[]) => ({
    paragraphs: {
      items: lines.map((text) => ({ text, search: () => ({ items: [], load: vi.fn() }) })),
      load: vi.fn(),
    },
  });
  const modes: string[] = [];
  const document = {
    body: {
      paragraphs: { items: paragraphs, load: vi.fn() },
      footnotes: { items: (extra.footnotes ?? []).map((lines) => ({ body: plain(lines) })), load: vi.fn() },
      endnotes: { items: [], load: vi.fn() },
    },
    sections: {
      items: (extra.sections ?? []).map((section) => ({
        getHeader: (type: string) => plain(section[type] ?? []),
        getFooter: () => plain([]),
      })),
      load: vi.fn(),
    },
    getSelection: () => ({}),
    load: vi.fn(),
    _mode: extra.trackingMode ?? "Off",
    get changeTrackingMode() {
      return this._mode;
    },
    set changeTrackingMode(value: string) {
      this._mode = value;
      modes.push(value);
    },
  };
  const context = {
    document,
    sync: vi.fn(async () => {}),
  };
  (globalThis as unknown as { Word: unknown }).Word = {
    run: async (callback: (c: typeof context) => unknown) => callback(context),
  };
  if (extra.trackingMode !== undefined || extra.sections || extra.footnotes) {
    (globalThis as unknown as { Office: unknown }).Office = {
      context: { requirements: { isSetSupported: () => true } },
    };
  }
  return { ranges, paragraphs, document, modes };
}

describe("wordAdapter", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    delete (globalThis as { Word?: unknown }).Word;
    delete (globalThis as { Office?: unknown }).Office;
  });

  it("reads non-empty paragraphs with stable refs", async () => {
    installFakeWord(["软件", "   ", "第三段"]);
    expect(await wordAdapter.readSegments("document")).toEqual([
      { ref: "body#0", text: "软件", area: "body" },
      { ref: "body#2", text: "第三段", area: "body" },
    ]);
  });

  it("limits the selection scope to paragraphs overlapping the selection", async () => {
    installFakeWord(["甲", "乙", "丙"], [1]);
    expect(await wordAdapter.readSegments("selection")).toEqual([{ ref: "body#1", text: "乙", area: "body" }]);
  });

  it("replaces the requested occurrence only", async () => {
    const { ranges } = installFakeWord(["软件和软件"]);
    const result = await wordAdapter.replace([
      { ref: "body#0", segmentText: "软件和软件", sourceText: "软件", occurrence: 1, text: "軟體" },
    ]);
    expect(result).toEqual({ replaced: 1, skipped: 0, tracked: false, documentTracking: false });
    expect(ranges[0]![0]!.insertText).not.toHaveBeenCalled();
    expect(ranges[0]![1]!.insertText).toHaveBeenCalledWith("軟體", "Replace");
  });

  it("skips paragraphs that changed since the scan", async () => {
    const { ranges } = installFakeWord(["软件（已被用户修改）"]);
    const result = await wordAdapter.replace([
      { ref: "body#0", segmentText: "软件", sourceText: "软件", occurrence: 0, text: "軟體" },
    ]);
    expect(result).toEqual({ replaced: 0, skipped: 1, tracked: false, documentTracking: false });
    expect(ranges[0]![0]!.insertText).not.toHaveBeenCalled();
  });

  it("counts a missing occurrence as skipped", async () => {
    installFakeWord(["软件"]);
    const result = await wordAdapter.replace([
      { ref: "body#0", segmentText: "软件", sourceText: "软件", occurrence: 3, text: "軟體" },
    ]);
    expect(result).toEqual({ replaced: 0, skipped: 1, tracked: false, documentTracking: false });
  });

  it("reveal selects the range and reports STALE when the paragraph changed", async () => {
    const { ranges } = installFakeWord(["软件"]);
    await wordAdapter.reveal({ ref: "body#0", segmentText: "软件", sourceText: "软件", occurrence: 0 });
    expect(ranges[0]![0]!.select).toHaveBeenCalled();
    await expect(
      wordAdapter.reveal({ ref: "body#0", segmentText: "别的", sourceText: "软件", occurrence: 0 }),
    ).rejects.toThrow("STALE");
  });

  it("reads headers, footers and footnotes on a full scan, skipping duplicate linked headers", async () => {
    installFakeWord(["正文"], [], {
      trackingMode: "Off",
      sections: [{ Primary: ["页眉软件"] }, { Primary: ["页眉软件"] }],
      footnotes: [["脚注软件"]],
    });
    const segments = await wordAdapter.readSegments("document", { headerFooter: true, notes: true });
    expect(segments).toEqual([
      { ref: "body#0", text: "正文", area: "body" },
      { ref: "hdr:0:Primary#0", text: "页眉软件", area: "header" },
      { ref: "fn:0#0", text: "脚注软件", area: "footnote" },
    ]);
    const bodyOnly = await wordAdapter.readSegments("document", { headerFooter: false, notes: false });
    expect(bodyOnly).toHaveLength(1);
  });

  it("temporarily turns on Track Changes and restores it", async () => {
    const { modes, document } = installFakeWord(["软件"], [], { trackingMode: "Off" });
    const result = await wordAdapter.replace(
      [{ ref: "body#0", segmentText: "软件", sourceText: "软件", occurrence: 0, text: "軟體" }],
      { trackChanges: true },
    );
    expect(modes).toEqual(["TrackAll", "Off"]);
    expect(document._mode).toBe("Off");
    expect(result).toMatchObject({ replaced: 1, tracked: true, documentTracking: false });
  });

  it("does not bypass a document that already tracks changes", async () => {
    const { modes } = installFakeWord(["软件"], [], { trackingMode: "TrackAll" });
    const result = await wordAdapter.replace(
      [{ ref: "body#0", segmentText: "软件", sourceText: "软件", occurrence: 0, text: "軟體" }],
      { trackChanges: false },
    );
    expect(modes).toEqual([]);
    expect(result).toMatchObject({ replaced: 1, tracked: true, documentTracking: true });
  });

  it("marks ranges with a highlight", async () => {
    const { ranges } = installFakeWord(["软件"]);
    (ranges[0]![0] as unknown as { font: { highlightColor?: string } }).font = {};
    const count = await wordAdapter.mark([
      { ref: "body#0", segmentText: "软件", sourceText: "软件", occurrence: 0 },
    ]);
    expect(count).toBe(1);
    expect((ranges[0]![0] as unknown as { font: { highlightColor: string } }).font.highlightColor).toBe("#00FFFF");
  });
});
