import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";

type Props = {
  tags: string[];
  suggestions?: string[];
  colorClassName?: string;
  helperText?: string;
  isBusy?: boolean;
  onChange: (tags: string[]) => Promise<boolean> | boolean;
};

export function PromptTagEditor({ tags, suggestions = [], colorClassName = "border-primary/25 bg-primary-soft text-foreground", helperText, isBusy = false, onChange }: Props) {
  const { t } = useLocale();
  const [draftTags, setDraftTags] = useState(() => normalizePromptTags(tags));
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const tagsKey = tags.join("\u0000");
  const visibleSuggestions = useMemo(
    () => findPromptTagSuggestions(suggestions, input, draftTags),
    [draftTags, input, suggestions],
  );

  useEffect(() => {
    setDraftTags(normalizePromptTags(tags));
  }, [tagsKey]);

  async function commit(nextTags: string[]) {
    const previousTags = draftTags;
    setDraftTags(nextTags);
    const saved = await onChange(nextTags);
    if (saved === false) setDraftTags(previousTags);
  }

  function addTags(additions: readonly string[]) {
    const normalizedAdditions = normalizePromptTags(additions);
    if (!normalizedAdditions.length) return;
    const nextTags = normalizePromptTags([...draftTags, ...normalizedAdditions]);
    setInput("");
    if (nextTags.length !== draftTags.length) void commit(nextTags);
  }

  function addFromInput() {
    addTags(input.split(/[,，]/));
  }

  function addSuggestion(suggestion: string) {
    addTags([suggestion]);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function removeTag(tag: string) {
    void commit(draftTags.filter((current) => current !== tag));
  }

  return (
    <div className="grid gap-2">
      <span className="text-xs font-medium text-muted">{t("自定义标签")}</span>
      <div className="relative">
        <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-panel p-2">
        {draftTags.map((tag) => (
          <span className={`inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs ${colorClassName}`} key={tag}>
            <span className="max-w-48 truncate">{tag}</span>
            <button aria-label={t("删除标签 {tag}", { tag })} className="flex size-4 shrink-0 items-center justify-center rounded text-muted hover:bg-background hover:text-foreground disabled:opacity-40" disabled={isBusy} title={t("删除标签 {tag}", { tag })} type="button" onClick={() => removeTag(tag)}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          aria-label={t("新增标签")}
          className="min-w-24 flex-1 bg-transparent px-1 py-1 text-xs outline-none placeholder:text-muted"
          disabled={isBusy}
          placeholder={draftTags.length ? t("输入后按回车") : t("输入标签后按回车")}
          value={input}
          onBlur={addFromInput}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "," || event.key === "，") {
              event.preventDefault();
              const exactSuggestion = findExactPromptTagSuggestion(visibleSuggestions, input);
              if (event.key === "Enter" && exactSuggestion) addSuggestion(exactSuggestion);
              else addFromInput();
            } else if (event.key === "Backspace" && !input && draftTags.length) {
              event.preventDefault();
              removeTag(draftTags[draftTags.length - 1]);
            }
          }}
        />
        </div>
        {visibleSuggestions.length ? (
          <div aria-label={t("已有标签建议")} className="absolute left-0 right-0 top-full z-30 mt-1 grid max-h-48 gap-1 overflow-y-auto rounded-lg border border-border bg-panel p-1.5 shadow-xl" role="listbox">
            {visibleSuggestions.map((suggestion) => (
              <button
                aria-label={t("使用标签 {tag}", { tag: suggestion })}
                className="min-h-8 rounded-md px-2 text-left text-xs text-muted hover:bg-primary-soft hover:text-foreground"
                key={suggestion}
                role="option"
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addSuggestion(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <span className="text-[11px] text-muted">{helperText ?? t("按回车新增，点击标签右侧图标删除；修改会即时保存。")}</span>
    </div>
  );
}

export function normalizePromptTags(tags: readonly string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const value of tags) {
    const tag = value.trim();
    if (!tag) continue;
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(tag);
  }
  return normalized;
}

export function findPromptTagSuggestions(
  suggestions: readonly string[],
  input: string,
  currentTags: readonly string[] = [],
): string[] {
  const query = input.trim().toLocaleLowerCase();
  if (!query) return [];
  const current = new Set(normalizePromptTags(currentTags).map((tag) => tag.toLocaleLowerCase()));
  const unique = normalizePromptTags(suggestions).filter((tag) => !current.has(tag.toLocaleLowerCase()));
  return unique
    .filter((tag) => tag.toLocaleLowerCase().includes(query))
    .sort((left, right) => {
      const leftValue = left.toLocaleLowerCase();
      const rightValue = right.toLocaleLowerCase();
      const leftPrefix = leftValue.startsWith(query) ? 0 : 1;
      const rightPrefix = rightValue.startsWith(query) ? 0 : 1;
      return leftPrefix - rightPrefix || left.localeCompare(right, "zh-CN");
    })
    .slice(0, 6);
}

function findExactPromptTagSuggestion(suggestions: readonly string[], input: string): string | undefined {
  const query = input.trim().toLocaleLowerCase();
  return query ? suggestions.find((suggestion) => suggestion.toLocaleLowerCase() === query) : undefined;
}
