import { useEffect, useRef, useState } from "react";
import {
  MAX_IMPORT_FILE_BYTES,
  MAX_PHRASES_PER_VARIANT,
  PHRASE_PAGE_SIZE,
  buildPhraseTemplateCsv,
  decodePhraseFile,
  exportPhrases,
  filterPhrases,
  importPhrases,
  normalizeDictionary,
  parsePhraseFile,
  type UserDictionary,
  type VariantCode,
} from "@cvl/core";
import { t, variantLabel, type Lang } from "./i18n";

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
  lang: Lang;
  onChange: (dictionary: UserDictionary) => void;
}

/** 用户词典：按「文档应使用」的写法分别存放，只显示并生效于当前选择的写法。 */
export function DictionaryPanel({ variant, dictionary, lang, onChange }: Props) {
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [allowText, setAllowText] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PHRASE_PAGE_SIZE);
  const fileInput = useRef<HTMLInputElement>(null);

  // 切换写法后清空搜索并回到第一批，避免看到上一写法的过滤结果。
  useEffect(() => {
    setQuery("");
    setVisible(PHRASE_PAGE_SIZE);
  }, [variant]);

  const phrases = dictionary.phrases.filter((entry) => entry.variant === variant);
  const matched = filterPhrases(phrases, query, (entry) => [entry.source, entry.target]);
  const shown = matched.slice(0, visible);
  const allowed = dictionary.allowed.filter((entry) => entry.variant === variant);

  const clearPhrases = () => {
    if (phrases.length === 0) return;
    if (!window.confirm(t(lang, "dict.clearConfirm", { variant: variantLabel(lang, variant) }))) {
      return;
    }
    onChange({ ...dictionary, phrases: dictionary.phrases.filter((e) => e.variant !== variant) });
    setQuery("");
    setVisible(PHRASE_PAGE_SIZE);
    setNote(t(lang, "dict.cleared"));
  };

  const addPhrase = () => {
    if (source.trim() === target.trim()) {
      setNote(t(lang, "dict.sameWords"));
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
      setNote(t(lang, "dict.fileTooBig", { kb: Math.round(MAX_IMPORT_FILE_BYTES / 1024) }));
      return;
    }
    let text: string;
    try {
      text = decodePhraseFile(await file.arrayBuffer());
    } catch {
      setNote(t(lang, "dict.readFailed"));
      return;
    }
    const { dictionary: next, added, updated, skipped } = importPhrases(dictionary, variant, parsePhraseFile(text));
    if (added + updated > 0) onChange(next);
    setNote(
      added + updated + skipped === 0
        ? t(lang, "dict.importEmpty")
        : t(lang, "dict.importDone", {
            variant: variantLabel(lang, variant),
            added,
            updated,
          }) +
            (skipped > 0
              ? t(lang, "dict.importSkipped", { max: MAX_PHRASES_PER_VARIANT, skipped })
              : "") +
            t(lang, "note.end"),
    );
  };

  return (
    <details className="dict">
      <summary>{t(lang, "dict.summary", { count: phrases.length + allowed.length })}</summary>
      <div className="msg">
        {t(lang, "dict.current", { variant: variantLabel(lang, variant) })}
      </div>

      <label>{t(lang, "dict.phraseLabel")}</label>
      <div className="pair">
        <input
          aria-label={t(lang, "dict.from")}
          placeholder={t(lang, "dict.from")}
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
        <span className="arrow">→</span>
        <input
          aria-label={t(lang, "dict.to")}
          placeholder={t(lang, "dict.to")}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <button disabled={!source.trim() || !target.trim()} onClick={addPhrase}>
          {t(lang, "dict.add")}
        </button>
      </div>
      {phrases.length > PHRASE_PAGE_SIZE && (
        <div className="pair">
          <input
            aria-label={t(lang, "dict.searchLabel")}
            placeholder={t(lang, "dict.searchPlaceholder")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisible(PHRASE_PAGE_SIZE);
            }}
          />
          <span className="msg">
            {query
              ? `${matched.length} / ${phrases.length}`
              : t(lang, "dict.count", { count: phrases.length })}
          </span>
        </div>
      )}
      <ul className="plain">
        {shown.map((entry) => (
          <li key={entry.source} className={entry.enabled === false ? "off" : undefined}>
            <input
              type="checkbox"
              aria-label={t(lang, "dict.enable")}
              checked={entry.enabled !== false}
              onChange={(event) =>
                onChange({
                  ...dictionary,
                  phrases: dictionary.phrases.map((e) =>
                    e === entry ? { ...e, enabled: event.target.checked } : e,
                  ),
                })
              }
            />
            <span className="src">{entry.source}</span>
            <span className="arrow">→</span>
            <span className="dst">{entry.target}</span>
            <button
              className="link"
              onClick={() => onChange({ ...dictionary, phrases: dictionary.phrases.filter((e) => e !== entry) })}
            >
              {t(lang, "dict.delete")}
            </button>
          </li>
        ))}
      </ul>
      {matched.length > shown.length && (
        <button className="link" onClick={() => setVisible((n) => n + PHRASE_PAGE_SIZE)}>
          {t(lang, "dict.showMore", { count: matched.length - shown.length })}
        </button>
      )}
      {query && matched.length === 0 && <div className="msg">{t(lang, "dict.noMatch")}</div>}

      <label>{t(lang, "dict.allowedLabel")}</label>
      <div className="pair">
        <input
          aria-label={t(lang, "dict.allowWord")}
          placeholder={t(lang, "dict.allowWord")}
          value={allowText}
          onChange={(e) => setAllowText(e.target.value)}
        />
        <button disabled={!allowText.trim()} onClick={addAllowed}>
          {t(lang, "dict.add")}
        </button>
      </div>
      <ul className="plain">
        {allowed.map((entry) => (
          <li key={entry.text}>
            <span>{entry.text}</span>
            <button
              className="link"
              onClick={() => onChange({ ...dictionary, allowed: dictionary.allowed.filter((e) => e !== entry) })}
            >
              {t(lang, "dict.delete")}
            </button>
          </li>
        ))}
      </ul>

      <div className="row">
        <button onClick={() => fileInput.current?.click()}>{t(lang, "dict.import")}</button>
        <button
          disabled={phrases.length === 0}
          onClick={() => downloadTextFile(`custom-phrases-${variant}.csv`, exportPhrases(dictionary, variant))}
        >
          {t(lang, "dict.export")}
        </button>
        <button onClick={() => downloadTextFile("custom-phrases-template.csv", buildPhraseTemplateCsv())}>
          {t(lang, "dict.template")}
        </button>
        <button disabled={phrases.length === 0} onClick={clearPhrases}>
          {t(lang, "dict.clear", { count: phrases.length })}
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
      <div className="msg">{t(lang, "dict.importHint")}</div>
      {note && <div className="msg" role="status">{note}</div>}
    </details>
  );
}
