import { useRef, useState } from "react";
import {
  VARIANT_LABELS,
  dictionaryFromCsv,
  dictionaryToCsv,
  mergeDictionaries,
  normalizeDictionary,
  type UserDictionary,
  type VariantCode,
} from "@cvl/core";

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

  const exportCsv = () => {
    const blob = new Blob(["﻿" + dictionaryToCsv(dictionary)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cvl-user-dictionary.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (file: File) => {
    const { dictionary: imported, skipped } = dictionaryFromCsv(await file.text());
    onChange(mergeDictionaries(dictionary, imported));
    setNote(
      `已导入 ${imported.phrases.length} 条词组、${imported.allowed.length} 个允许词` +
        (skipped > 0 ? `，${skipped} 行无法识别已跳过` : "") +
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
        <button onClick={() => fileInput.current?.click()}>导入 CSV</button>
        <button disabled={dictionary.phrases.length + dictionary.allowed.length === 0} onClick={exportCsv}>
          导出 CSV
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importCsv(file);
        }}
      />
      <div className="msg">CSV 列：type（phrase / allow）, variant（zh-CN / zh-TW / zh-HK / zh-Hant）, source, target</div>
      {note && <div className="msg" role="status">{note}</div>}
    </details>
  );
}
