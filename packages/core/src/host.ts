/** Opaque reference to a location in the host document. Adapter-defined. */
export type LocationRef = string;

export interface TextSegment {
  ref: LocationRef;
  text: string;
}

export interface HostCapabilities {
  trackedReplace: boolean;
  highlight: boolean;
  comments: boolean;
  selectionEvents: boolean;
}

export type ScanScope = "selection" | "document";

/** Narrow interface the UI uses to talk to any host (Office.js, WPS, ...). */
export interface HostAdapter {
  readonly capabilities: HostCapabilities;
  readText(scope: ScanScope): Promise<TextSegment[]>;
  select(ref: LocationRef, start: number, end: number): Promise<void>;
  replace(ref: LocationRef, start: number, end: number, text: string): Promise<void>;
  mark(ref: LocationRef, start: number, end: number): Promise<void>;
  clearMarks(): Promise<void>;
  onSelectionChanged(cb: () => void): () => void;
}
