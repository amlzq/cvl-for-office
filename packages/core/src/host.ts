/** 宿主文档中一段文本（Word 里是一个段落）。ref 由适配器定义，对 core/UI 不透明。 */
export interface TextSegment {
  ref: string;
  text: string;
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
}

/** UI 与具体宿主（Word / Excel / WPS ...）之间的窄接口。 */
export interface HostAdapter {
  readonly name: string;
  readSegments(scope: ScanScope): Promise<TextSegment[]>;
  /** 在文档中选中并滚动到该处。 */
  reveal(target: IssueTarget): Promise<void>;
  replace(replacements: Replacement[]): Promise<ReplaceResult>;
}
