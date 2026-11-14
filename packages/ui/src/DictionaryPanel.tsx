import { useRef, useState } from "react";
import {
  MAX_IMPORT_FILE_BYTES,
  MAX_PHRASES_PER_VARIANT,
  VARIANT_LABELS,
  buildPhraseTemplateCsv,
  decodePhraseFile,
  exportPhrases,
  importPhrases,
  normalizeDictionary,
  parsePhraseFile,
  type UserDictionary,
  type VariantCode,
} from "@cvl/core";

function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

interface Props {
  variant: VariantCode;
  dictionary: UserDictionary;
  onChange: (dictionary: UserDictionary) => void;
}

/** 用户词典：按「文档应使用」的写法分别存放，只显示并生效于当前选择的写法。 */
export function DictionaryPanel({ variant, dictionary, onChange }: Props) {
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [allowText, setAllowText] = useState("");
  const [note, setNote] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const phrases = dictionary.phrases.filter((entry) => entry.variant === variant);
  const allowed = dictionary.allowed.filter((entry) => entry.variant === variant);

  const addPhrase = () => {
    if (source.trim() === target.trim()) {
      setNote("请输入不同的两个词。");
      return;
    }
    onChange(
      normalizeDictionary({
        ...dictionary,
        phrases: [
          ...dictionary.phrases.filter((e) => !(e.variant === variant && e.source === source.trim())),
          { variant, source, target },
        ],
      }),
    );
    setSource("");
    setTarget("");
    setNote("");
  };

  const addAllowed = () => {
    if (!allowText.trim()) return;
    onChange(
      normalizeDictionary({
        ...dictionary,
        allowed: [...dictionary.allowed, { variant, text: allowText }],
      }),
    );
    setAllowText("");
  };

  const importFile = async (file: File) => {
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setNote(`文件过大，请选择 ${Math.round(MAX_IMPORT_FILE_BYTES / 1024)} KB 以内的文件。`);
      return;
    }
    let text: string;
    try {
      text = decodePhraseFile(await file.arrayBuffer());
    } catch {
      setNote("文件读取失败。");
      return;
    }
    const { dictionary: next, added, updated, skipped } = importPhrases(dictionary, variant, parsePhraseFile(text));
    if (added + updated > 0) onChange(next);
    setNote(
      added + updated + skipped === 0
        ? "文件中没有可导入的词组。"
        : `已导入到「${VARIANT_LABELS[variant]}」：新增 ${added} 条，更新 ${updated} 条` +
            (skipped > 0 ? `，已达上限 ${MAX_PHRASES_PER_VARIANT} 条，${skipped} 条未导入` : "") +
            "。",
    );
  };

  return (
    <details className="dict">
      <summary>用户词典（{phrases.length + allowed.length}）</summary>
      <div className="msg">当前写法：{VARIANT_LABELS[variant]}。词典按写法分别存放，仅对该写法生效。</div>

      <label>自定义词组：命中左侧时建议替换为右侧</label>
      <div className="pair">
        <input aria-label="原词" placeholder="原词" value={source} onChange={(e) => setSource(e.target.value)} />
        <span className="arrow">→</span>
        <input aria-label="替换为" placeholder="替换为" value={target} onChange={(e) => setTarget(e.target.value)} />
        <button disabled={!source.trim() || !target.trim()} onClick={addPhrase}>添加</button>
      </div>
      <ul className="plain">
        {phrases.map((entry) => (
          <li key={entry.source}>
            <span className="src">{entry.source}</span>
            <span className="arrow">→</span>
            <span className="dst">{entry.target}</span>
            <button
              className="link"
              onClick={() => onChange({ ...dictionary, phrases: dictionary.phrases.filter((e) => e !== entry) })}
            >
              删除
            </button>
          </li>
        ))}
      </ul>

      <label>允许词：包含这些词的位置不再报告</label>
      <div className="pair">
        <input aria-label="允许词" placeholder="允许词" value={allowText} onChange={(e) => setAllowText(e.target.value)} />
        <button disabled={!allowText.trim()} onClick={addAllowed}>添加</button>
      </div>
      <ul className="plain">
        {allowed.map((entry) => (
          <li key={entry.text}>
            <span>{entry.text}</span>
            <button
              className="link"
              onClick={() => onChange({ ...dictionary, allowed: dictionary.allowed.filter((e) => e !== entry) })}
            >
              删除
            </button>
          </li>
        ))}
      </ul>

      <div className="row">
        <button onClick={() => fileInput.current?.click()}>导入</button>
        <button
          disabled={phrases.length === 0}
          onClick={() => downloadTextFile(`custom-phrases-${variant}.csv`, exportPhrases(dictionary, variant))}
        >
          导出
        </button>
        <button onClick={() => downloadTextFile("custom-phrases-template.csv", buildPhraseTemplateCsv())}>
          下载模板
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".csv,.txt,.tsv,text/csv,text/plain"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importFile(file);
        }}
      />
      <div className="msg">
        导入导出只针对当前写法的自定义词组，不含允许词。支持 CSV（两列 from,to）和 OpenCC 词条（原词⇥目标词）格式，
        与浏览器扩展、macOS 版通用。
      </div>
      {note && <div className="msg" role="status">{note}</div>}
    </details>
  );
}
