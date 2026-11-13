/* global Word, Office */
import type {
  HostAdapter,
  IssueTarget,
  ReplaceOptions,
  Replacement,
  ReplaceResult,
  ScanOptions,
  ScanScope,
  SegmentArea,
  TextSegment,
} from "@cvl/core";

/**
 * 段落引用：`${容器}#${段落序号}`。容器：
 *  body            正文（含表格内段落）
 *  hdr:s:type      第 s 节的页眉（type：Primary / FirstPage / EvenPages），ftr 同理为页脚
 *  fn:i / en:i     第 i 个脚注 / 尾注
 */
function toRef(container: string, index: number): string {
  return `${container}#${index}`;
}

function parseRef(ref: string): { container: string; index: number } {
  const cut = ref.lastIndexOf("#");
  return { container: ref.slice(0, cut), index: Number(ref.slice(cut + 1)) };
}

const OUTSIDE_SELECTION = new Set(["Before", "AdjacentBefore", "After", "AdjacentAfter"]);
const HEADER_FOOTER_TYPES = ["Primary", "FirstPage", "EvenPages"] as const;

/** 标记用的高亮色（青绿）。清除时只会移除这种颜色。 */
const MARK_COLOR = "#00FFFF";
const isMarkColor = (value: string | null): boolean =>
  typeof value === "string" && ["#00ffff", "turquoise"].includes(value.toLowerCase());
const NO_HIGHLIGHT = null as unknown as string;

function supports(version: string): boolean {
  try {
    return Office.context.requirements.isSetSupported("WordApi", version);
  } catch {
    return false;
  }
}

function areaOf(container: string): SegmentArea {
  if (container.startsWith("hdr:")) return "header";
  if (container.startsWith("ftr:")) return "footer";
  if (container.startsWith("fn:")) return "footnote";
  if (container.startsWith("en:")) return "endnote";
  return "body";
}

/** 在一次 Word.run 内按需加载并缓存各容器的段落。 */
class Paragraphs {
  private cache = new Map<string, Promise<Word.Paragraph[]>>();
  private sections?: Promise<Word.Section[]>;
  private notes = new Map<string, Promise<Word.NoteItem[]>>();

  constructor(private context: Word.RequestContext) {}

  private async loadCollection(collection: Word.ParagraphCollection): Promise<Word.Paragraph[]> {
    collection.load("items/text");
    await this.context.sync();
    return collection.items;
  }

  private getSections(): Promise<Word.Section[]> {
    this.sections ??= (async () => {
      const sections = this.context.document.sections;
      sections.load("items");
      await this.context.sync();
      return sections.items;
    })();
    return this.sections;
  }

  private getNotes(kind: "fn" | "en"): Promise<Word.NoteItem[]> {
    let cached = this.notes.get(kind);
    if (!cached) {
      cached = (async () => {
        const body = this.context.document.body;
        const collection = kind === "fn" ? body.footnotes : body.endnotes;
        collection.load("items");
        await this.context.sync();
        return collection.items;
      })();
      this.notes.set(kind, cached);
    }
    return cached;
  }

  get(container: string): Promise<Word.Paragraph[]> {
    let cached = this.cache.get(container);
    if (!cached) {
      cached = this.resolve(container);
      this.cache.set(container, cached);
    }
    return cached;
  }

  private async resolve(container: string): Promise<Word.Paragraph[]> {
    const [kind, first, second] = container.split(":");
    if (kind === "body") {
      return this.loadCollection(this.context.document.body.paragraphs);
    }
    if (kind === "hdr" || kind === "ftr") {
      const section = (await this.getSections())[Number(first)];
      if (!section) return [];
      const type = second as Word.HeaderFooterType;
      const body = kind === "hdr" ? section.getHeader(type) : section.getFooter(type);
      return this.loadCollection(body.paragraphs);
    }
    if (kind === "fn" || kind === "en") {
      const note = (await this.getNotes(kind))[Number(first)];
      return note ? this.loadCollection(note.body.paragraphs) : [];
    }
    return [];
  }

  /** 页眉页脚 / 脚注尾注的容器列表。 */
  async extraContainers(options: ScanOptions): Promise<string[]> {
    const containers: string[] = [];
    if (options.headerFooter) {
      const sections = await this.getSections();
      sections.forEach((_, s) => {
        for (const kind of ["hdr", "ftr"]) {
          for (const type of HEADER_FOOTER_TYPES) {
            containers.push(`${kind}:${s}:${type}`);
          }
        }
      });
    }
    if (options.notes && supports("1.5")) {
      for (const kind of ["fn", "en"] as const) {
        (await this.getNotes(kind)).forEach((_, i) => containers.push(`${kind}:${i}`));
      }
    }
    return containers;
  }
}

/** 批量查出各目标的 Range（null 表示段落已变化或找不到）。 */
async function findRanges(
  context: Word.RequestContext,
  store: Paragraphs,
  targets: IssueTarget[],
): Promise<Array<Word.Range | null>> {
  const jobs: Array<Word.RangeCollection | null> = [];
  for (const target of targets) {
    const { container, index } = parseRef(target.ref);
    const paragraph = (await store.get(container))[index];
    if (!paragraph || paragraph.text !== target.segmentText) {
      jobs.push(null);
      continue;
    }
    const results = paragraph.search(target.sourceText, { matchCase: true });
    results.load("items");
    jobs.push(results);
  }
  await context.sync();
  return jobs.map((results, i) => results?.items[targets[i].occurrence] ?? null);
}

export const wordAdapter: HostAdapter = {
  name: "Word",

  async readSegments(scope: ScanScope, options?: ScanOptions): Promise<TextSegment[]> {
    return Word.run(async (context) => {
      const store = new Paragraphs(context);
      const body = await store.get("body");

      let included = body.map(() => true);
      if (scope === "selection") {
        // 选区涉及的整段都会被检查（Word 无法可靠地把段内字符偏移映射回 Range）。
        const selection = context.document.getSelection();
        const relations = body.map((paragraph) =>
          paragraph.getRange("Whole").compareLocationWith(selection),
        );
        await context.sync();
        included = relations.map((relation) => !OUTSIDE_SELECTION.has(relation.value));
      }

      const segments: TextSegment[] = [];
      body.forEach((paragraph, index) => {
        if (included[index] && paragraph.text.trim()) {
          segments.push({ ref: toRef("body", index), text: paragraph.text, area: "body" });
        }
      });

      if (scope === "document" && options) {
        // 「链接到前一节」的页眉页脚内容相同：同类、同内容的容器只检查第一个，
        // 修正后重新扫描即可看到其余内容各自独立的容器。
        const seen = new Set<string>();
        for (const container of await store.extraContainers(options)) {
          const paragraphs = await store.get(container);
          const signature = `${container.split(":")[0]}\u0000${paragraphs
            .map((paragraph) => paragraph.text)
            .join("\u0001")}`;
          if (seen.has(signature)) continue;
          seen.add(signature);
          paragraphs.forEach((paragraph, index) => {
            if (paragraph.text.trim()) {
              segments.push({
                ref: toRef(container, index),
                text: paragraph.text,
                area: areaOf(container),
              });
            }
          });
        }
      }
      return segments;
    });
  },

  async reveal(target: IssueTarget): Promise<void> {
    await Word.run(async (context) => {
      const [range] = await findRanges(context, new Paragraphs(context), [target]);
      if (!range) {
        throw new Error("STALE");
      }
      range.select();
      await context.sync();
    });
  },

  async replace(
    replacements: Replacement[],
    options: ReplaceOptions = { trackChanges: false },
  ): Promise<ReplaceResult> {
    return Word.run(async (context) => {
      const canTrack = supports("1.4");
      let previousMode: Word.ChangeTrackingMode | undefined;
      if (canTrack) {
        context.document.load("changeTrackingMode");
        await context.sync();
        previousMode = context.document.changeTrackingMode as Word.ChangeTrackingMode;
      } else if (options.trackChanges) {
        throw new Error("当前 Word 版本不支持以修订方式替换（需要 WordApi 1.4）");
      }

      // 文档自己已开启修订时，insertText 会被 Word 记为修订；这里不绕过，只如实告知用户。
      const documentTracking = canTrack && previousMode !== "Off";
      const switchOn = options.trackChanges && canTrack && previousMode === "Off";

      // 先一次性查出所有 Range，再统一替换：已取得的 Range 不会因其他替换而失效。
      const ranges = await findRanges(context, new Paragraphs(context), replacements);

      if (switchOn) {
        context.document.changeTrackingMode = "TrackAll" as Word.ChangeTrackingMode;
        await context.sync();
      }
      try {
        let replaced = 0;
        let skipped = 0;
        ranges.forEach((range, i) => {
          if (!range) {
            skipped++;
            return;
          }
          if (options.clearMarks) {
            range.font.highlightColor = NO_HIGHLIGHT;
          }
          range.insertText(replacements[i].text, "Replace");
          replaced++;
        });
        await context.sync();
        return {
          replaced,
          skipped,
          tracked: options.trackChanges || documentTracking,
          documentTracking: documentTracking && !options.trackChanges,
        };
      } finally {
        // 只恢复我们改过的修订状态；文档原本的修订设置保持不变。
        if (switchOn) {
          context.document.changeTrackingMode = "Off" as Word.ChangeTrackingMode;
          await context.sync();
        }
      }
    });
  },

  async mark(targets: IssueTarget[]): Promise<number> {
    return Word.run(async (context) => {
      const ranges = await findRanges(context, new Paragraphs(context), targets);
      let marked = 0;
      for (const range of ranges) {
        if (range) {
          range.font.highlightColor = MARK_COLOR;
          marked++;
        }
      }
      await context.sync();
      return marked;
    });
  },

  async clearMarks(targets: IssueTarget[]): Promise<number> {
    return Word.run(async (context) => {
      const store = new Paragraphs(context);
      let cleared = 0;

      // 1) 整段都是标记色的段落：整段清除。颜色混合（null）的段落交给第 2 步按位置处理。
      const containers = [
        "body",
        ...(await store.extraContainers({ headerFooter: true, notes: true })),
      ];
      const paragraphs: Word.Paragraph[] = [];
      for (const container of containers) {
        for (const paragraph of await store.get(container)) {
          paragraph.load("font/highlightColor");
          paragraphs.push(paragraph);
        }
      }
      await context.sync();
      for (const paragraph of paragraphs) {
        if (isMarkColor(paragraph.font.highlightColor)) {
          paragraph.font.highlightColor = NO_HIGHLIGHT;
          cleared++;
        }
      }
      await context.sync();

      // 2) 其余位置：按已知问题位置逐个检查，仅清除标记色。
      const ranges = (await findRanges(context, store, targets)).filter(
        (range): range is Word.Range => range !== null,
      );
      ranges.forEach((range) => range.load("font/highlightColor"));
      await context.sync();
      for (const range of ranges) {
        if (isMarkColor(range.font.highlightColor)) {
          range.font.highlightColor = NO_HIGHLIGHT;
          cleared++;
        }
      }
      await context.sync();
      return cleared;
    });
  },
};
