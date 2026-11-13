# CVL for Office

Chinese Variants Linter for Microsoft Word / Excel / PowerPoint (Office.js add-in).

## Layout

- `packages/core` — host-independent detection / conversion logic
- `packages/ui` — React task pane UI (talks to a `HostAdapter`)
- `packages/host-ms` — Microsoft Office add-in shell (Office.js)

WPS Office (`host-wps`) is planned but not created yet.
