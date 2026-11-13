/* global Word */
import type {
  HostAdapter,
  IssueTarget,
  Replacement,
  ReplaceResult,
  ScanScope,
  TextSegment,
} from "@cvl/core";

/** 段落引用：正文第 n 个段落（含表格内段落）。 */
const REF_PREFIX = "p:";

function toRef(index: number): string {
  return `${REF_PREFIX}${index}`;
}

function fromRef(ref: string): number {
  return ref.startsWith(REF_PREFIX) ? Number(ref.slice(REF_PREFIX.length)) : NaN;
}

const OUTSIDE_SELECTION = new Set(["Before", "AdjacentBefore", "After", "AdjacentAfter"]);

async function loadBodyParagraphs(context: Word.RequestContext): Promise<Word.Paragraph[]> {
  const paragraphs = context.document.body.paragraphs;
  paragraphs.load("items/text");
  await context.sync();
  return paragraphs.items;
}

/** 找到 target 对应的 Range；段落已被改动或找不到时返回 null。 */
async function findRange(
  context: Word.RequestContext,
  paragraphs: Word.Paragraph[],
  target: IssueTarget,
): Promise<Word.Range | null> {
  const paragraph = paragraphs[fromRef(target.ref)];
  if (!paragraph || paragraph.text !== target.segmentText) {
    return null;
  }
  const results = paragraph.search(target.sourceText, { matchCase: true });
  results.load("items");
  await context.sync();
  return results.items[target.occurrence] ?? null;
}

export const wordAdapter: HostAdapter = {
  name: "Word",

  async readSegments(scope: ScanScope): Promise<TextSegment[]> {
    return Word.run(async (context) => {
      const paragraphs = await loadBodyParagraphs(context);

      let included = paragraphs.map(() => true);
      if (scope === "selection") {
        // 选区涉及的整段都会被检查（Word 无法可靠地把段内字符偏移映射回 Range）。
        const selection = context.document.getSelection();
        const relations = paragraphs.map((paragraph) =>
          paragraph.getRange("Whole").compareLocationWith(selection),
        );
        await context.sync();
        included = relations.map((relation) => !OUTSIDE_SELECTION.has(relation.value));
      }

      const segments: TextSegment[] = [];
      paragraphs.forEach((paragraph, index) => {
        if (included[index] && paragraph.text.trim()) {
          segments.push({ ref: toRef(index), text: paragraph.text });
        }
      });
      return segments;
    });
  },

  async reveal(target: IssueTarget): Promise<void> {
    await Word.run(async (context) => {
      const paragraphs = await loadBodyParagraphs(context);
      const range = await findRange(context, paragraphs, target);
      if (!range) {
        throw new Error("STALE");
      }
      range.select();
      await context.sync();
    });
  },

  async replace(replacements: Replacement[]): Promise<ReplaceResult> {
    return Word.run(async (context) => {
      const paragraphs = await loadBodyParagraphs(context);
      let skipped = 0;

      // 先一次性查出所有 Range，再统一替换：已取得的 Range 不会因其他替换而失效。
      const jobs: Array<{ results: Word.RangeCollection; replacement: Replacement }> = [];
      for (const replacement of replacements) {
        const paragraph = paragraphs[fromRef(replacement.ref)];
        if (!paragraph || paragraph.text !== replacement.segmentText) {
          skipped++;
          continue;
        }
        const results = paragraph.search(replacement.sourceText, { matchCase: true });
        results.load("items");
        jobs.push({ results, replacement });
      }
      await context.sync();

      let replaced = 0;
      for (const { results, replacement } of jobs) {
        const range = results.items[replacement.occurrence];
        if (!range) {
          skipped++;
          continue;
        }
        range.insertText(replacement.text, "Replace");
        replaced++;
      }
      await context.sync();

      return { replaced, skipped };
    });
  },
};
