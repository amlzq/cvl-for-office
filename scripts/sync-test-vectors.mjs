// 从 macOS 版仓库同步共享测试向量（由浏览器扩展版的 detectText 生成）。
// 用法：node scripts/sync-test-vectors.mjs [cvl-for-mac 仓库路径]
// 扩展版规则变更后，先在 cvl-for-mac 运行 scripts/export-shared.mjs 重新生成，再运行本脚本。
import { copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const mac = path.resolve(process.argv[2] ?? path.join(here, "../../cvl-for-mac"));
const from = path.join(mac, "Shared/test-vectors.json");
const to = path.join(here, "../shared/test-vectors.json");
copyFileSync(from, to);
console.log(`已同步：${from} → ${to}`);
