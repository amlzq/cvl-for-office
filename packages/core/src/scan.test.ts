import { describe, expect, it } from "vitest";
import { occurrenceIndex, scanSegments } from "./scan";
import { DEFAULT_SETTINGS } from "./types";

describe("occurrenceIndex", () => {
  it("counts non-overlapping occurrences from the left", () => {
    expect(occurrenceIndex("软件和软件", "软件", 0)).toBe(0);
    expect(occurrenceIndex("软件和软件", "软件", 3)).toBe(1);
  });

  it("matches Word's non-overlapping scan for self-overlapping terms", () => {
    expect(occurrenceIndex("AAA", "AA", 0)).toBe(0);
    expect(occurrenceIndex("AAA", "AA", 1)).toBe(-1);
  });

  it("returns -1 when not found or empty", () => {
    expect(occurrenceIndex("abc", "x", 0)).toBe(-1);
    expect(occurrenceIndex("abc", "", 0)).toBe(-1);
    expect(occurrenceIndex("abc", "b", 0)).toBe(-1);
  });
});

describe("scanSegments", () => {
  const settings = { ...DEFAULT_SETTINGS, variant: "zh-TW" as const };

  it("locates issues per segment with occurrence and context", () => {
    const found = scanSegments(
      [
        { ref: "p:0", text: "這是繁體" },
        { ref: "p:1", text: "软件、软件" },
      ],
      settings,
    );
    const software = found.filter((f) => f.sourceText === "软件");
    expect(software.map((f) => [f.ref, f.occurrence])).toEqual([
      ["p:1", 0],
      ["p:1", 1],
    ]);
    expect(software[1]!.before).toBe("软件、");
    expect(new Set(found.map((f) => f.key)).size).toBe(found.length);
  });

  it("skips ignored issues by their stable key", () => {
    const segments = [{ ref: "p:0", text: "软件" }];
    const first = scanSegments(segments, settings);
    expect(first).toHaveLength(1);
    const again = scanSegments(segments, settings, new Set([first[0]!.ignoreKey]));
    expect(again).toEqual([]);
  });

  it("keeps an ignore valid after the paragraph index changes", () => {
    const a = scanSegments([{ ref: "p:0", text: "软件" }], settings);
    const b = scanSegments([{ ref: "p:7", text: "软件" }], settings, new Set([a[0]!.ignoreKey]));
    expect(b).toEqual([]);
  });

  it("ignores empty segments", () => {
    expect(scanSegments([{ ref: "p:0", text: "" }], settings)).toEqual([]);
  });
});
