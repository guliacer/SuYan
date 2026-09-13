import { useEffect, useMemo, useRef, useState } from "react";
import { Check, LoaderCircle, Save, Sparkles, TriangleAlert } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import type { AiPreparePromptEntryData } from "../../library/types/ai";
import type { PromptCategory, PromptCreateInput, PromptEntry, PromptType } from "../types";
import { derivePromptTitle } from "../utils/promptClipboardParser";
import { detectAccountType, normalizeWebsiteAccountContent } from "../utils/promptAccount";
import { classifyPromptContent } from "../utils/promptClassification";
import { normalizeAiClipboardImport } from "../../library/utils/aiClipboardImport";
import { type PromptPaletteColorId } from "../utils/promptColors";
import { extractPromptVariables } from "../utils/promptVariables";
import { isCommandPrompt } from "../utils/promptRichText";
import { PromptCardColorPicker } from "./PromptCardColorPicker";
import { getPromptCardToneClassNames } from "./PromptCard";
import { PromptTagEditor } from "./PromptTagEditor";
import { promptEditorHtmlFromText, RichTextEditor } from "./RichTextEditor";
import { useLocale } from "@/components/LocaleProvider";

type Props = {
  categories: PromptCategory[];
  tagSuggestions?: string[];
  isBusy: boolean;
  onClose: () => void;
  onCreate: (input: PromptCreateInput) => Promise<PromptEntry | null>;
  onUpdate: (input: { id: string; title?: string; description?: string; type?: PromptType; categoryId?: string; tagIds?: string[]; variables?: PromptEntry["variables"]; analysisStatus?: PromptEntry["analysisStatus"]; metadataSource?: PromptEntry["metadataSource"] }) => Promise<boolean>;
};

const localResult = (content: string): AiPreparePromptEntryData => {
  const lower = content.toLocaleLowerCase();
  const automatic = classifyPromptContent(content);
  // 命令文档保留原始内容和代码块，不交给自动整理生成说明性文本。
  if (isCommandPrompt(content) && !normalizeAiClipboardImport(content)) {
    return { type: "text", title: derivePromptTitle(content), description: "", tagIds: [], variables: extractPromptVariables(content), confidence: 0.9, source: "local", warnings: [] };
  }
  const type: PromptType = /视频|video|镜头运动|时长|秒/.test(lower) ? "video"
    : /工作流|workflow|comfyui|节点/.test(lower) ? "workflow"
    : normalizeAiClipboardImport(content) || /_type.*newapi_channel_conn|api.key|api_key|apikey|endpoint|base.url|base_url|大模型|大语言模型|llm|openai|claude|deepseek|gemini|groq|通义千问|文心一言|glm|模型配置|密钥|秘钥|令牌|api接口|接口|请求地址|端点配置|sk-[a-zA-Z\d]|bearer|token\s*[:=]/.test(lower) ? "api-config"
    : detectAccountType(lower) ? "account"
    : /邮箱|email|smtp|imap|pop3|邮件|mail|@.*\.com/.test(lower) ? "email-config"
    : /写一篇|文章|代码|函数|翻译|总结|write|code|translate/.test(lower) ? "text" : "image";
  return {
    type,
    title: automatic.categoryName ? automatic.title : derivePromptTitle(content),
    description: "",
    tagIds: [],
    variables: extractPromptVariables(content),
    confidence: 0.25,
    source: "local",
    warnings: [],
  };
};

export function PromptCreateDialog({ categories, tagSuggestions, isBusy, onClose, onCreate, onUpdate }: Props) {
  const { t } = useLocale();
  const [content, setContent] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [analysis, setAnalysis] = useState<AiPreparePromptEntryData>(() => localResult(""));
  const [analysisState, setAnalysisState] = useState<"idle" | "analyzing" | "ready" | "failed">("idle");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<PromptType>("image");
  const [categoryId, setCategoryId] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [colorId, setColorId] = useState<PromptPaletteColorId | "">("");
  const [overrides, setOverrides] = useState<Set<string>>(() => new Set());
  const overridesRef = useRef(overrides);
  useEffect(() => { overridesRef.current = overrides; }, [overrides]);

  const variables = useMemo(() => extractPromptVariables(content), [content]);
  const isValid = content.trim().length > 0;
  const tags = useMemo(() => [...new Set(tagsText.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 10), [tagsText]);

  useEffect(() => {
    const trimmed = content.trim();
    if (!trimmed) {
      setAnalysis(localResult(""));
      setAnalysisState("idle");
      return;
    }
    const local = localResult(trimmed);
    setAnalysis(local);
    const normalizedAiImport = local.type === "api-config" ? normalizeAiClipboardImport(trimmed) : null;
    const normalizedAccountImport = local.type === "account" ? normalizeWebsiteAccountContent(trimmed) : null;
    const normalizedImport = normalizedAiImport ?? normalizedAccountImport;
    const importedSiteName = normalizedImport?.title ?? "";
    setTitle(importedSiteName || local.title || derivePromptTitle(trimmed));
    setDescription("");
    setType(local.type);
    setCategoryId("");
    setTagsText("");
    setOverrides(new Set());
    setAnalysisState("analyzing");
    // 自动填充 API 配置模板
    if (local.type === "api-config" && trimmed.length < 80 && !trimmed.includes("端点") && !trimmed.includes("API Key")) {
      const template = `# AI 大模型配置

\`\`\`
端点:
API Key:
模型:
\`\`\``;
      setContent(template);
      setContentHtml(promptEditorHtmlFromText(template));
    }
    // API 配置只保留地址、密钥和模型；识别成功后跳过远程整理，避免
    // 请求头、请求体和示例消息被 AI 再次写入卡片。
    if (normalizedImport) {
      if (normalizedImport.content !== trimmed) {
        setContent(normalizedImport.content);
        setContentHtml(promptEditorHtmlFromText(normalizedImport.content));
        setTitle(normalizedImport.title);
      }
      setAnalysis(localResult(normalizedImport.content));
      setAnalysisState("ready");
      return;
    }
    if (isCommandPrompt(trimmed)) {
      setAnalysis(local);
      setAnalysisState("ready");
      return;
    }
    // 自动填充邮箱配置模板
    if (local.type === "email-config" && trimmed.length < 80 && !trimmed.includes("邮箱") && !trimmed.includes("密码")) {
      const template = `# 邮箱配置

\`\`\`
邮箱地址:
邮箱密码:
\`\`\``;
      setContent(template);
      setContentHtml(promptEditorHtmlFromText(template));
    }
    // 自动填充账号配置模板
    if (local.type === "account" && trimmed.length < 80 && !trimmed.includes("账号") && !trimmed.includes("密码")) {
      const template = `url: \naccount: \npassword: `;
      setContent(template);
      setContentHtml(promptEditorHtmlFromText(template));
    }
    const timer = window.setTimeout(() => {
      void window.suyanApi.preparePromptEntryWithAi({
        prompt: trimmed,
        knownCategories: categories.map((category) => ({ id: category.id, name: category.name })),
      }).then((result) => {
        if (!result.ok) { setAnalysisState("failed"); return; }
        setAnalysis(result.data);
        setTitle((current) => overridesRef.current.has("title") || importedSiteName ? current : result.data.title);
        setDescription((current) => overridesRef.current.has("description") ? current : result.data.description);
        setType((current) => overridesRef.current.has("type") ? current : result.data.type);
        setCategoryId((current) => overridesRef.current.has("category") ? current : result.data.categoryId ?? "");
        setTagsText((current) => overridesRef.current.has("tags") ? current : result.data.tagIds.join(", "));
        setAnalysisState(result.data.source === "local" && result.data.warnings.length ? "failed" : "ready");
      }).catch(() => setAnalysisState("failed"));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [categories, content]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function save() {
    if (!isValid || isBusy) return;
    const input: PromptCreateInput = {
      content: content.trim(),
      contentHtml: contentHtml.trim(),
      title: title.trim() || derivePromptTitle(content),
      description: description.trim() || undefined,
      type,
      categoryId: categoryId || undefined,
      tagIds: tags,
      variables,
      source: "manual",
      colorId: colorId || undefined,
      analysisStatus: "analyzing",
      metadataSource: {
        title: overrides.has("title") ? "user" : analysis.source === "ai" ? "ai" : "system",
        description: overrides.has("description") ? "user" : analysis.source === "ai" ? "ai" : "system",
        type: overrides.has("type") ? "user" : analysis.source === "ai" ? "ai" : "system",
        category: overrides.has("category") ? "user" : analysis.source === "ai" ? "ai" : "system",
        tags: overrides.has("tags") ? "user" : analysis.source === "ai" ? "ai" : "system",
        variables: "system",
      },
    };
    const created = await onCreate(input);
    if (!created) return;
    onClose();
    if (analysisState === "analyzing") {
      void window.suyanApi.preparePromptEntryWithAi({
        prompt: content.trim(),
        knownCategories: categories.map((category) => ({ id: category.id, name: category.name })),
      }).then((result) => {
        if (!result.ok) {
          void onUpdate({ id: created.id, analysisStatus: "failed" });
          return;
        }
        const currentOverrides = overridesRef.current;
        const importedSiteName = normalizeAiClipboardImport(content.trim())?.title
          ?? normalizeWebsiteAccountContent(content.trim())?.title
          ?? "";
        void onUpdate({
          id: created.id,
          title: currentOverrides.has("title") ? title.trim() : importedSiteName || result.data.title,
          description: currentOverrides.has("description") ? description.trim() : result.data.description,
          type: currentOverrides.has("type") ? type : result.data.type,
          categoryId: currentOverrides.has("category") ? categoryId || undefined : result.data.categoryId,
          tagIds: currentOverrides.has("tags") ? tags : result.data.tagIds,
          analysisStatus: result.data.source === "local" && result.data.warnings.length ? "failed" : "ready",
          metadataSource: {
            title: currentOverrides.has("title") ? "user" : result.data.source === "ai" ? "ai" : "system",
            description: currentOverrides.has("description") ? "user" : result.data.source === "ai" ? "ai" : "system",
            type: currentOverrides.has("type") ? "user" : result.data.source === "ai" ? "ai" : "system",
            category: currentOverrides.has("category") ? "user" : result.data.source === "ai" ? "ai" : "system",
            tags: currentOverrides.has("tags") ? "user" : result.data.source === "ai" ? "ai" : "system",
            variables: "system",
          },
        });
      }).catch(() => { void onUpdate({ id: created.id, analysisStatus: "failed" }); });
      return;
    }
    await onUpdate({
      id: created.id,
      title: overrides.has("title") ? title.trim() : analysis.title,
      description: overrides.has("description") ? description.trim() : analysis.description,
      type: overrides.has("type") ? type : analysis.type,
      categoryId: overrides.has("category") ? categoryId || undefined : analysis.categoryId,
      tagIds: overrides.has("tags") ? tags : analysis.tagIds,
      variables,
      analysisStatus: analysisState === "failed" ? "failed" : "ready",
      metadataSource: created.metadataSource,
    });
  }

  function mark(field: string, setter: (value: string) => void, value: string) { setOverrides((current) => new Set(current).add(field)); setter(value); }

  return (
    <AppDialog panelClassName="flex max-h-[min(760px,calc(100dvh-2rem))] w-full max-w-2xl flex-col" titleId="prompt-create-title" onClose={onClose}>
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div><p className="text-xs text-muted">{t("灵感创作")}</p><h2 className="mt-1 text-lg font-semibold" id="prompt-create-title">{t("新建灵感")}</h2></div>
        <DialogCloseButton onClick={onClose} />
      </header>
      <div className="min-h-0 space-y-4 overflow-y-auto p-5">
        <section className="grid gap-1.5" aria-labelledby="prompt-create-content-label">
          <h3 className="text-sm font-medium" id="prompt-create-content-label">{t("灵感正文")}</h3>
          <RichTextEditor
            autoFocus
            value={contentHtml}
            onChange={(html, text) => {
              setContentHtml(html);
              setContent(text);
            }}
          />
        </section>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-panel/60 px-3 py-2 text-sm">
          {analysisState === "analyzing" ? <LoaderCircle className="animate-spin text-primary" size={16} /> : analysisState === "failed" ? <TriangleAlert className="text-amber-500" size={16} /> : analysisState === "ready" ? <Check className="text-emerald-500" size={16} /> : <Sparkles className="text-primary" size={16} />}
          <span>{analysisState === "analyzing" ? t("正在自动整理……") : analysisState === "failed" ? t("自动整理失败，仍可保存灵感") : analysisState === "ready" ? t("已自动整理") : t("输入正文后自动整理")}</span>
          {analysis.warnings.length > 0 ? <span className="text-xs text-muted">{analysis.warnings[0]}</span> : null}
        </div>
        {isValid ? <div className="rounded-xl border border-border p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium">{title || derivePromptTitle(content)}</p><p className="mt-1 text-xs text-muted">{categories.find((category) => category.id === categoryId)?.name ?? t("未分类")} · {t("{count} 个标签", { count: tags.length })} · {t(promptTypeLabel(type))}</p></div><Button onClick={() => setDetailsOpen((open) => !open)}>{detailsOpen ? t("收起详情") : t("查看详情")}</Button></div>
          {detailsOpen ? <div className="mt-4 grid gap-3"><label className="grid gap-1.5 text-sm font-medium">{t("标题")}<TextField value={title} onChange={(event) => mark("title", setTitle, event.target.value)} /></label><label className="grid gap-1.5 text-sm font-medium">{t("描述")}<TextField value={description} onChange={(event) => mark("description", setDescription, event.target.value)} /></label><div className="grid gap-3 min-[620px]:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">{t("类型")}<select className="h-10 rounded-xl border border-border bg-panel px-3 text-sm" value={type} onChange={(event) => { setOverrides((current) => new Set(current).add("type")); setType(event.target.value as PromptType); }}><option value="text">{t("文本")}</option><option value="image">{t("图片")}</option><option value="video">{t("视频")}</option><option value="workflow">{t("工作流")}</option><option value="api-config">{t("API 配置")}</option><option value="email-config">{t("邮箱配置")}</option><option value="account">{t("账号")}</option></select></label><label className="grid gap-1.5 text-sm font-medium">{t("分类")}<select className="h-10 rounded-xl border border-border bg-panel px-3 text-sm" value={categoryId} onChange={(event) => mark("category", setCategoryId, event.target.value)}><option value="">{t("未分类")}</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}</select></label></div><PromptTagEditor colorClassName={getPromptCardToneClassNames(colorId || "primary").tag} helperText={t("按回车新增，点击标签右侧图标删除；最多保存 10 个标签。")} suggestions={tagSuggestions} tags={tags} onChange={(nextTags) => { setOverrides((current) => new Set(current).add("tags")); setTagsText(nextTags.slice(0, 10).join(", ")); return true; }} /><PromptCardColorPicker value={colorId} onChange={setColorId} /><p className="text-xs text-muted">{t("已识别 {count} 个变量", { count: variables.length })}{variables.length ? `: ${variables.map((variable) => `{{${variable.name}}}`).join(", ")}` : ""}</p></div> : null}
        </div> : null}
      </div>
      <footer className="flex justify-end gap-2 border-t border-border px-5 py-4"><Button onClick={onClose}>{t("取消")}</Button><Button disabled={!isValid || isBusy} icon={<Save size={16} />} variant="primary" onClick={() => void save()}>{t("保存灵感")}</Button></footer>
    </AppDialog>
  );
}

function promptTypeLabel(type: PromptType): string {
  return type === "image" ? "图片" : type === "video" ? "视频" : type === "workflow" ? "工作流" : type === "api-config" ? "API 配置" : type === "email-config" ? "邮箱配置" : type === "account" ? "账号" : "文本";
}
