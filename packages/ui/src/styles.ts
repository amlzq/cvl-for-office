export const CSS = `
.cvl { font: 13px/1.5 "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; color: #242424; padding: 12px; }
.cvl h1 { font-size: 15px; margin: 0 0 10px; }
.cvl label { display: block; font-size: 12px; color: #616161; margin: 8px 0 2px; }
.cvl select { width: 100%; padding: 4px 6px; font: inherit; }
.cvl .row { display: flex; gap: 8px; margin-top: 12px; }
.cvl button { font: inherit; padding: 5px 10px; border: 1px solid #c8c8c8; background: #fff; border-radius: 4px; cursor: pointer; }
.cvl button:hover:not(:disabled) { background: #f5f5f5; }
.cvl button:disabled { opacity: .5; cursor: default; }
.cvl button.primary { background: #0f6cbd; border-color: #0f6cbd; color: #fff; }
.cvl button.primary:hover:not(:disabled) { background: #115ea3; }
.cvl .row button { flex: 1; }
.cvl .status { margin: 12px 0 6px; color: #616161; }
.cvl .status.error { color: #b10e1c; }
.cvl .bar { display: flex; justify-content: space-between; align-items: center; margin: 12px 0 6px; }
.cvl ul { list-style: none; margin: 0; padding: 0; }
.cvl li { border: 1px solid #e0e0e0; border-radius: 4px; padding: 8px; margin-bottom: 6px; cursor: pointer; }
.cvl li:hover { border-color: #0f6cbd; }
.cvl .ctx { color: #616161; word-break: break-all; }
.cvl .src { color: #b10e1c; background: #fdf3f4; text-decoration: line-through; padding: 0 2px; }
.cvl .arrow { color: #616161; margin: 0 4px; }
.cvl .dst { color: #107c10; background: #f1faf1; font-weight: 600; padding: 0 2px; }
.cvl .msg { font-size: 12px; color: #616161; margin: 4px 0; }
.cvl .badge { font-size: 11px; color: #8a6100; background: #fff4ce; border-radius: 3px; padding: 0 4px; margin-left: 6px; }
.cvl .actions { display: flex; gap: 6px; margin-top: 4px; }
.cvl .actions button { padding: 2px 8px; font-size: 12px; }
.cvl button.link { border: 0; background: none; padding: 0; color: #0f6cbd; text-decoration: underline; }
.cvl .foot { margin-top: 16px; font-size: 11px; color: #8a8a8a; }
.cvl .check { display: flex; align-items: center; gap: 6px; margin: 8px 0 0; color: #242424; font-size: 13px; }
.cvl .check input { margin: 0; }
.cvl .area { font-size: 11px; color: #0f6cbd; background: #eaf3fb; border-radius: 3px; padding: 0 4px; margin-right: 6px; }
.cvl details.dict { margin-top: 14px; border-top: 1px solid #e0e0e0; padding-top: 8px; }
.cvl details.dict summary { cursor: pointer; font-weight: 600; }
.cvl .pair { display: flex; align-items: center; gap: 4px; }
.cvl .pair input { flex: 1; min-width: 0; padding: 4px 6px; font: inherit; }
.cvl ul.plain { margin: 4px 0; }
.cvl ul.plain li { cursor: default; border: 0; padding: 2px 0; margin: 0; display: flex; align-items: center; gap: 4px; }
.cvl ul.plain li .link { margin-left: auto; }
`;
