// 从 macOS 版仓库同步共享产物（测试向量 + 内置词汇规则快照）。
// 用法：node scripts/sync-test-vectors.mjs [cvl-for-mac 仓库路径] [--check]
// 扩展版规则变更后，先在 cvl-for-mac 运行 scripts/export-shared.mjs 重新生成，再运行本脚本。
// --check：只比对不写入，不一致时以非 0 退出（npm run check:shared）。
import { copyFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const check = args.includes("--check");
const mac = path.resolve(args.find((arg) => !arg.startsWith("--")) ?? path.join(here, "../../cvl-for-mac"));

/** [macOS 仓库内的源文件, 本仓库的目标文件] */
const files = [
  ["Shared/test-vectors.json", "../shared/test-vectors.json"],
  ["Packages/CVLCore/Sources/CVLCore/Resources/term-rules.json", "../shared/term-rules.json"],
];

let drift = 0;
for (const [source, target] of files) {
  const from = path.join(mac, source);
  const to = path.join(here, target);
  if (!check) {
    copyFileSync(from, to);
    console.log(`已同步：${from} → ${to}`);
    continue;
  }
  let same = false;
  try {
    same = readFileSync(from, "utf8") === readFileSync(to, "utf8");
  } catch {
    same = false;
  }
  if (!same) {
    console.error(`共享产物不一致：${target}`);
    drift += 1;
  }
}

if (check) {
  if (drift > 0) {
    console.error("请运行 npm run sync:vectors 更新共享产物。");
    process.exit(1);
  }
  console.log("共享产物与 macOS 版一致。");
}
