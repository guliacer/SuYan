import { Eye, EyeOff, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { useLocale } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import type { PromptCategory, PromptEntry, PromptInput } from "../types";
import { derivePromptAccountTitle } from "../utils/promptAccount";
import { getPromptColor, isPromptPaletteColorId, type PromptPaletteColorId } from "../utils/promptColors";
import { extractPromptVariables } from "../utils/promptVariables";
import { PromptCardColorPicker } from "./PromptCardColorPicker";
import { PromptTagEditor } from "./PromptTagEditor";
import { getPromptCardToneClassNames } from "./PromptCard";
import { promptEditorHtmlFromText, RichTextEditor } from "./RichTextEditor";

type Props = {
  categories: PromptCategory[];
  entry?: PromptEntry | null;
  isBusy: boolean;
  tagSuggestions?: string[];
  onClose: () => void;
  onSave: (input: Partial<PromptInput>) => Promise<boolean>;
};

export function PromptEditor({ categories, entry, isBusy, tagSuggestions, onClose, onSave }: Props) {
  const { t } = useLocale();
  const [title, setTitle] = useState(entry?.title ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [content, setContent] = useState(entry?.content ?? "");
  const [contentHtml, setContentHtml] = useState(entry?.contentHtml ?? promptEditorHtmlFromText(entry?.content ?? ""));
  const [accountSite, setAccountSite] = useState(entry?.account?.site ?? "");
  const [accountName, setAccountName] = useState(entry?.account?.name ?? "");
  const [accountPassword, setAccountPassword] = useState("");
  const [showPassword, setShowPassword] = useState(true);
  const [categoryId, setCategoryId] = useState(entry?.categoryId ?? "");
  const [tags, setTags] = useState(entry?.tagIds ?? []);
  const [colorId, setColorId] = useState<PromptPaletteColorId | "">(
    entry?.colorId && isPromptPaletteColorId(entry.colorId) ? entry.colorId : "",
  );
  const variables = useMemo(() => extractPromptVariables(content), [content]);
  const isValid = title.trim().length > 0 && content.trim().length > 0;
  const isAccount = entry?.type === "account";
  const tagColorClassName = entry ? getPromptCardToneClassNames(getPromptColor(entry.id, entry.colorId)).tag : undefined;

  useEffect(() => {
    setAccountSite(entry?.account?.site ?? "");
    setAccountName(entry?.account?.name ?? "");
    setAccountPassword("");
    setShowPassword(true);
    if (!entry || entry.type !== "account") return;

    void window.suyanApi.readPromptAccount(entry.id).then((result) => {
      if (!result.ok) return;
      setAccountSite(result.data.site ?? entry.account?.site ?? "");
      setAccountName(result.data.name ?? entry.account?.name ?? "");
      setAccountPassword(result.data.password ?? "");
    });
  }, [entry?.id, entry?.type]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    setTags(entry?.tagIds ?? []);
  }, [entry?.id]);

  async function saveTags(nextTags: string[]) {
    if (!entry) return false;
    setTags(nextTags);
    return onSave({ tagIds: nextTags });
  }

  async function submit() {
    if (!isValid) return;
    const nextContent = isAccount ? (accountSite.trim() ? `url: ${accountSite.trim()}` : "账号配置") : content.trim();
    const saved = await onSave({
      title: title.trim(),
      description: description.trim(),
      content: nextContent,
      ...(isAccount ? {} : { contentHtml: contentHtml.trim() }),
      categoryId,
      tagIds: tags,
      variables,
      colorId: colorId || undefined,
      ...(isAccount ? {
        account: {
          name: accountName.trim() || undefined,
          site: accountSite.trim() || undefined,
          password: accountPassword,
        },
      } : {}),
    });
    if (saved) onClose();
  }

  return (
    <AppDialog overlayClassName="z-[160] px-3 py-4" panelClassName="flex max-h-[min(760px,calc(100dvh-2rem))] w-full max-w-3xl flex-col" titleId="prompt-editor-title" onClose={onClose}>
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <p className="text-xs text-muted">{t("灵感创作")}</p>
          <h2 className="mt-1 text-lg font-semibold" id="prompt-editor-title">{entry ? t("编辑灵感") : t("新建灵感")}</h2>
        </div>
        <DialogCloseButton onClick={onClose} />
      </header>
      <div className="grid min-h-0 gap-4 overflow-y-auto p-5">
        <label className="grid gap-1.5 text-sm font-medium">{t("标题")} <TextField autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="grid gap-1.5 text-sm font-medium">{t("说明")} <TextField value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <div className="grid gap-3 min-[680px]:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">{t("分类")}
            <select className="h-10 rounded-xl border border-border bg-panel px-3 text-sm outline-none focus:border-primary" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">{t("未分类")}</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}
            </select>
          </label>
          <PromptTagEditor colorClassName={tagColorClassName} isBusy={isBusy} suggestions={tagSuggestions} tags={tags} onChange={saveTags} />
        </div>
        <PromptCardColorPicker value={colorId} onChange={setColorId} />
        {isAccount ? (
          <section className="grid gap-3 rounded-xl border border-primary/20 bg-primary-soft/30 p-4">
            <div>
              <h3 className="text-sm font-semibold">{t("网站账户")}</h3>
              <p className="mt-1 text-xs text-muted">{t("账号和密码会单独保存，灵感正文不会再混入登录凭据。")}</p>
            </div>
            <label className="grid gap-1.5 text-sm font-medium">{t("网址")}<TextField value={accountSite} onChange={(event) => setAccountSite(event.target.value)} placeholder="https://example.com" /></label>
            <label className="grid gap-1.5 text-sm font-medium">{t("账户名称 / 邮箱账户")}<TextField value={accountName} onChange={(event) => {
              const nextName = event.target.value;
              const automaticTitle = derivePromptAccountTitle(accountName, accountSite);
              setAccountName(nextName);
              if (title === automaticTitle || title === "无效提示词") setTitle(derivePromptAccountTitle(nextName, accountSite));
            }} /></label>
            <label className="grid gap-1.5 text-sm font-medium">{t("密码")}
              <div className="relative">
                <TextField className="pr-11" type={showPassword ? "text" : "password"} value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} />
                <button aria-label={showPassword ? t("隐藏密码") : t("显示密码")} className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-background hover:text-foreground" title={showPassword ? t("隐藏密码") : t("显示密码")} type="button" onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </label>
          </section>
        ) : (
          <label className="grid gap-1.5 text-sm font-medium">{t("灵感正文")}
            <RichTextEditor
              value={contentHtml}
              onChange={(html, text) => {
                setContentHtml(html);
                setContent(text);
              }}
            />
          </label>
        )}
                <p className="text-xs text-muted">{t("已识别 {count} 个变量", { count: variables.length })}{variables.length ? `：${variables.map((variable) => `{{${variable.name}}}`).join("、")}` : ""}</p>
      </div>
      <footer className="flex justify-end gap-2 border-t border-border px-5 py-4">
        <Button onClick={onClose}>{t("取消")}</Button>
        <Button disabled={!isValid || isBusy} icon={<Save size={16} />} variant="primary" onClick={() => void submit()}>{t("保存")}</Button>
      </footer>
    </AppDialog>
  );
}
