import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wordAdapter } from "./adapter";

interface FakeRange {
  text: string;
  select: ReturnType<typeof vi.fn>;
  insertText: ReturnType<typeof vi.fn>;
}

/** 最小化的 Word 对象模型：只模拟适配器用到的部分。 */
function installFakeWord(texts: string[], selection: number[] = []) {
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

  const context = {
    document: {
      body: { paragraphs: { items: paragraphs, load: vi.fn() } },
      getSelection: () => ({}),
    },
    sync: vi.fn(async () => {}),
  };
  (globalThis as unknown as { Word: unknown }).Word = {
    run: async (callback: (c: typeof context) => unknown) => callback(context),
  };
  return { ranges, paragraphs };
}

describe("wordAdapter", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    delete (globalThis as { Word?: unknown }).Word;
  });

  it("reads non-empty paragraphs with stable refs", async () => {
    installFakeWord(["软件", "   ", "第三段"]);
    expect(await wordAdapter.readSegments("document")).toEqual([
      { ref: "p:0", text: "软件" },
      { ref: "p:2", text: "第三段" },
    ]);
  });

  it("limits the selection scope to paragraphs overlapping the selection", async () => {
    installFakeWord(["甲", "乙", "丙"], [1]);
    expect(await wordAdapter.readSegments("selection")).toEqual([{ ref: "p:1", text: "乙" }]);
  });

  it("replaces the requested occurrence only", async () => {
    const { ranges } = installFakeWord(["软件和软件"]);
    const result = await wordAdapter.replace([
      { ref: "p:0", segmentText: "软件和软件", sourceText: "软件", occurrence: 1, text: "軟體" },
    ]);
    expect(result).toEqual({ replaced: 1, skipped: 0 });
    expect(ranges[0]![0]!.insertText).not.toHaveBeenCalled();
    expect(ranges[0]![1]!.insertText).toHaveBeenCalledWith("軟體", "Replace");
  });

  it("skips paragraphs that changed since the scan", async () => {
    const { ranges } = installFakeWord(["软件（已被用户修改）"]);
    const result = await wordAdapter.replace([
      { ref: "p:0", segmentText: "软件", sourceText: "软件", occurrence: 0, text: "軟體" },
    ]);
    expect(result).toEqual({ replaced: 0, skipped: 1 });
    expect(ranges[0]![0]!.insertText).not.toHaveBeenCalled();
  });

  it("counts a missing occurrence as skipped", async () => {
    installFakeWord(["软件"]);
    const result = await wordAdapter.replace([
      { ref: "p:0", segmentText: "软件", sourceText: "软件", occurrence: 3, text: "軟體" },
    ]);
    expect(result).toEqual({ replaced: 0, skipped: 1 });
  });

  it("reveal selects the range and reports STALE when the paragraph changed", async () => {
    const { ranges } = installFakeWord(["软件"]);
    await wordAdapter.reveal({ ref: "p:0", segmentText: "软件", sourceText: "软件", occurrence: 0 });
    expect(ranges[0]![0]!.select).toHaveBeenCalled();
    await expect(
      wordAdapter.reveal({ ref: "p:0", segmentText: "别的", sourceText: "软件", occurrence: 0 }),
    ).rejects.toThrow("STALE");
  });
});
