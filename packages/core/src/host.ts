/** 宿主文档中一段文本（Word 里是一个段落）。ref 由适配器定义，对 core/UI 不透明。 */
export interface TextSegment {
  ref: string;
  text: string;
  /** 所在区域；缺省为正文。 */
  area?: SegmentArea;
}

export type SegmentArea = "body" | "header" | "footer" | "footnote" | "endnote";

export const AREA_LABELS: Record<SegmentArea, string> = {
  body: "正文",
  header: "页眉",
  footer: "页脚",
  footnote: "脚注",
  endnote: "尾注",
};

/** 全文扫描时，除正文外是否检查这些区域（「扫描选中段落」只看正文）。 */
export interface ScanOptions {
  headerFooter: boolean;
  notes: boolean;
}

export const DEFAULT_SCAN_OPTIONS: ScanOptions = { headerFooter: true, notes: true };

export interface ReplaceOptions {
  /** true：以修订（Track Changes）方式写入，false：沿用文档当前的修订状态。 */
  trackChanges: boolean;
  /** 替换前先清除这些位置上由本工具添加的高亮，避免高亮残留在新文字上。 */
  clearMarks?: boolean;
}

export type ScanScope = "document" | "selection";

/** 定位一处问题所需的信息：段落引用 + 段落原文 + 原词 + 它是段内第几次出现。 */
export interface IssueTarget {
  ref: string;
  segmentText: string;
  sourceText: string;
  occurrence: number;
}

export interface Replacement extends IssueTarget {
  text: string;
}

export interface ReplaceResult {
  replaced: number;
  /** 段落已被修改或找不到原词而跳过的数量，需要重新扫描。 */
  skipped: number;
  /** 本次替换是否以修订方式写入（用户选择，或文档本身已开启修订）。 */
  tracked?: boolean;
  /** 文档本身已开启修订，而用户选择的是直接替换。 */
  documentTracking?: boolean;
}

/** UI 与具体宿主（Word / Excel / WPS ...）之间的窄接口。 */
export interface HostAdapter {
  readonly name: string;
  readSegments(scope: ScanScope, options?: ScanOptions): Promise<TextSegment[]>;
  /** 在文档中选中并滚动到该处。 */
  reveal(target: IssueTarget): Promise<void>;
  replace(replacements: Replacement[], options?: ReplaceOptions): Promise<ReplaceResult>;
  /** 用高亮标出这些位置，返回实际标出的数量。 */
  mark(targets: IssueTarget[]): Promise<number>;
  /** 清除本工具添加的高亮；targets 用于定位无法整段识别的位置。返回清除的数量。 */
  clearMarks(targets: IssueTarget[]): Promise<number>;
}
