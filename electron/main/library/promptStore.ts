import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { app, clipboard } from "electron";
import { dialog } from "../app/fileDialogs";
import { getLibraryDataDir, getPromptsPath } from "./libraryPaths";
import { writeLibraryJsonAtomically, writeTextFileAtomically } from "./libraryJsonPersistence";
import { getAuthorInfo } from "../account/accountService";
import type { AuthorInfo } from "../../../src/features/account/types/account";
import type {
  PromptAccountView,
  PromptCategory, PromptCategoryDeleteInput, PromptCategoryInput, PromptCategoryUpdate,
  PromptClipboardCreateInput, PromptClipboardPayload, PromptCopyInput, PromptEntry,
  PromptGithubProject, PromptInput, PromptLibraryExportResult, PromptLibraryFile, PromptLibraryImportResult, PromptReorderInput, PromptUpdate,
} from "../../../src/features/prompts/types";
import { extractPromptVariables, renderPromptVariables } from "../../../src/features/prompts/utils/promptVariables";
import { derivePromptTitle } from "../../../src/features/prompts/utils/promptClipboardParser";
import { classifyPromptContent } from "../../../src/features/prompts/utils/promptClassification";
import { normalizeAiClipboardImport } from "../../../src/features/library/utils/aiClipboardImport";
import {
  buildPromptAccountContent,
  derivePromptAccountTitle,
  normalizeAccountSite,
  normalizeWebsiteAccountContent,
} from "../../../src/features/prompts/utils/promptAccount";
import { createOrderKey } from "../../../src/features/prompts/utils/promptOrder";
import {
  parseAccountContent,
} from "../../../src/features/prompts/utils/promptAccount";
import {
  decryptPromptPassword,
  encryptPromptPassword,
} from "./promptAccountCrypto";
import { AppError } from "../ipc/errors";
import { formatExportFileName } from "../app/exportFileName";
import { reportExportProgress } from "../app/exportTask";
import { logger } from "../appLogger";
import { extractPromptImageNames, extractPromptText, plainTextToPromptHtml, sanitizePromptHtml } from "../../../src/features/prompts/utils/promptRichText";
import { removePromptContentImages } from "./promptContentImageStore";
import { unlinkTodoPromptIds } from "./todoStore";
import { normalizeGithubProject } from "../../../src/features/prompts/utils/githubProject";

export const PROMPT_SCHEMA_VERSION = 2 as const;
export const PROMPT_UNCATEGORIZED_ID = "prompt-category-uncategorized";
const defaultCategorySeed: Array<[string, string]> = [["设计师", "🎨"], ["摄影师", "📷"], ["开发", "💻"], ["Vibe Coding", "⚡"], ["写作", "✍️"], ["营销", "📣"], ["视频", "🎬"], ["AI / LLM", "🤖"], ["产品 / PM", "📊"], ["学习", "🧠"], ["账号", "🔐"], ["邮箱", "✉️"], ["API Key", "🔑"], ["Github", "🔗"]];
let mutationQueue: Promise<void> = Promise.resolve();
let cache: PromptLibraryFile | null = null;
let cacheFileSignature: string | null = null;

export function enqueuePromptMutation<T>(mutation: () => Promise<T>): Promise<T> { const result = mutationQueue.then(mutation, mutation); mutationQueue = result.then(() => undefined, () => undefined); return result; }
export function resetPromptStoreForTests(): void { cache = null; cacheFileSignature = null; mutationQueue = Promise.resolve(); }

function emptyFile(): PromptLibraryFile { return { schemaVersion: PROMPT_SCHEMA_VERSION, updatedAt: new Date().toISOString(), entries: [], categories: createDefaultCategories() }; }
function createDefaultCategories(): PromptCategory[] {
  const now = new Date().toISOString();
  const system: PromptCategory = { id: PROMPT_UNCATEGORIZED_ID, name: "未分类", icon: "📥", orderKey: "000000", isDefault: true, createdAt: now, updatedAt: now };
  const defaults = defaultCategorySeed.map(([name, icon], index) => ({ id: `prompt-category-${index + 1}`, name, icon, orderKey: String(index + 1).padStart(6, "0"), isDefault: true, createdAt: now, updatedAt: now }));
  return [system, ...defaults];
}

function normalizePrompt(input: unknown, existing?: PromptEntry, index = 0, categories: PromptCategory[] = []): PromptEntry {
  if (!isRecord(input)) throw new AppError("PROMPT_INVALID", "提示词数据无效。");
  const hasContentHtml = Object.prototype.hasOwnProperty.call(input, "contentHtml");
  const inputContentHtml = typeof input.contentHtml === "string" ? sanitizePromptHtml(input.contentHtml) : "";
  const existingContentHtml = typeof existing?.contentHtml === "string" ? sanitizePromptHtml(existing.contentHtml) : "";
  const richContentHtml = inputContentHtml || (!hasContentHtml ? existingContentHtml : "");
  const rawContent = richContentHtml
    ? extractPromptText(richContentHtml)
    : typeof input.content === "string" ? input.content.trim() : existing?.content ?? "";
  // 剪贴板/旧条目可能只有纯文本。保存时统一识别 Markdown 代码围栏，
  // 让命令块在详情页保持代码形态，而不是把 ```bash 原样当作正文。
  const classifiedType = classifyPromptContent(rawContent).type;
  const canStoreRichText = input.type !== "account" && input.type !== "github-project"
    && classifiedType !== "account"
    && existing?.type !== "account" && existing?.type !== "github-project";
  const generatedContentHtml = !richContentHtml && canStoreRichText && rawContent
    ? plainTextToPromptHtml(rawContent)
    : "";
  const contentHtml = richContentHtml || generatedContentHtml;
  const normalizedAiImport = richContentHtml || input.type === "github-project" ? null : normalizeAiClipboardImport(rawContent);
  const normalizedAccountImport = richContentHtml || input.type === "github-project" ? null : normalizeWebsiteAccountContent(rawContent);
  const content = normalizedAiImport?.content ?? normalizedAccountImport?.content ?? rawContent;
  const explicitType = input.type === "text" || input.type === "image" || input.type === "video" || input.type === "workflow" || input.type === "api-config" || input.type === "email-config" || input.type === "account" || input.type === "github-project"
    ? input.type
    : undefined;
  // 未显式指定类型（粘贴导入等）时，按账号格式自动识别，避免账号密码明文落盘。
  const autoClassification = classifyPromptContent(content);
  const requestedType = explicitType ?? existing?.type ?? autoClassification.type;
  // 账号条目：正文只作为兼容输入，最终把账号名称、站点和密码移入结构化字段。
  // 密码只会在这里短暂出现，落盘时由 normalizePromptAccount 加密。
  const parsedAccount = requestedType === "account" ? parseAccountContent(content) : null;
  const account = requestedType === "account"
    ? normalizePromptAccount({ parsed: parsedAccount, stored: input.account, existing: existing?.account })
    : undefined;
  const github = requestedType === "github-project"
    ? normalizePromptGithubProject(input.github, existing?.github)
    : undefined;
  const safeAccountContent = requestedType === "account"
    ? buildPromptAccountContent(account?.site) || "账号配置"
    : content;
  const safeContent = safeAccountContent.trim();
  const syncedGithub = github && (Object.prototype.hasOwnProperty.call(input, "content") || Object.prototype.hasOwnProperty.call(input, "contentHtml"))
    ? normalizePromptGithubProject({ ...github, readmeContent: safeContent }, github)
    : github;
  const automaticTitle = requestedType === "account"
    ? derivePromptAccountTitle(account?.name, account?.site)
    : requestedType === "github-project" && github
      ? `Github-${github.name || github.repository}`
      : autoClassification.title || derivePromptTitle(content);
  const shouldPreferAutomaticTitle = autoClassification.categoryName && input.source === "clipboard" && !existing;
  const inputTitle = typeof input.title === "string" ? input.title.trim() : "";
  const isLegacyGeneratedTitle = !inputTitle
    || inputTitle === "无效提示词"
    || inputTitle === derivePromptTitle(content);
  const shouldRepairAccountTitle = requestedType === "account" && Boolean(automaticTitle)
    && existing?.metadataSource?.title !== "user"
    && input.metadataSource?.title !== "user"
    && (Boolean(existing) || isLegacyGeneratedTitle);
  const shouldUseGithubTitle = requestedType === "github-project"
    && Boolean(github)
    && input.source !== "duplicate"
    && (!existing || inputTitle === github?.name);
  const title = shouldRepairAccountTitle
    ? automaticTitle
    : shouldUseGithubTitle
      ? automaticTitle
    : shouldPreferAutomaticTitle
      ? autoClassification.title
      : typeof input.title === "string" && input.title.trim()
        ? input.title.trim()
        : existing?.title ?? automaticTitle;
  if (!title || !safeContent) throw new AppError("PROMPT_REQUIRED", "灵感标题和内容不能为空。");
  const now = new Date().toISOString();
  const variables = Array.isArray(input.variables) ? input.variables.filter(isRecord).map((variable) => ({ name: typeof variable.name === "string" ? variable.name.trim() : "", ...(typeof variable.defaultValue === "string" ? { defaultValue: variable.defaultValue } : {}), ...(typeof variable.description === "string" ? { description: variable.description } : {}) })).filter((variable) => variable.name) : extractPromptVariables(safeContent);
  const hasDescription = Object.prototype.hasOwnProperty.call(input, "description");
  const hasCategoryId = typeof input.categoryId === "string" && input.categoryId.trim().length > 0;
  const categoryName = requestedType === "account"
    ? "账号"
    : requestedType === "github-project"
      ? "Github"
      : autoClassification.categoryName;
  const autoCategoryId = categoryName
    ? categories.find((category) => category.name.toLocaleLowerCase() === categoryName.toLocaleLowerCase())?.id
    : undefined;
  const categoryId = requestedType === "github-project" && autoCategoryId
    ? autoCategoryId
    : typeof input.categoryId === "string" && input.categoryId
      ? input.categoryId
      : !hasCategoryId ? existing?.categoryId ?? autoCategoryId : undefined;
  const colorId = normalizePromptColorId(input.colorId) ?? normalizePromptColorId(existing?.colorId);
  const masked = typeof input.masked === "boolean" ? input.masked : existing?.masked ?? false;
  const cardWidth = normalizeCardDimension(input.cardWidth, existing?.cardWidth, 220, 640);
  const cardHeight = normalizeCardDimension(input.cardHeight, existing?.cardHeight, 260, 720);
  const analysisStatus = input.analysisStatus === "analyzing" || input.analysisStatus === "ready" || input.analysisStatus === "failed"
    ? input.analysisStatus
    : existing?.analysisStatus ?? "ready";
  return {
    id: existing?.id ?? (typeof input.id === "string" && input.id.trim() ? input.id.trim() : randomUUID()),
    type: requestedType,
    title,
    ...(typeof input.description === "string" && input.description.trim() ? { description: input.description.trim() } : !hasDescription && existing?.description ? { description: existing.description } : {}),
    content: safeContent,
    ...(contentHtml ? { contentHtml } : {}),
    ...(categoryId ? { categoryId } : {}),
    tagIds: normalizeStringArray(input.tagIds ?? existing?.tagIds), favorite: typeof input.favorite === "boolean" ? input.favorite : existing?.favorite ?? false,
    variables, usageCount: typeof input.usageCount === "number" && Number.isFinite(input.usageCount) ? Math.max(0, Math.floor(input.usageCount)) : existing?.usageCount ?? 0,
    ...(typeof input.lastUsedAt === "string" ? { lastUsedAt: input.lastUsedAt } : existing?.lastUsedAt ? { lastUsedAt: existing.lastUsedAt } : {}),
    orderKey: typeof input.orderKey === "string" && input.orderKey.trim() ? input.orderKey : existing?.orderKey ?? String(index).padStart(10, "0"),
    ...(colorId ? { colorId } : {}), ...(isPromptSource(input.source) ? { source: input.source } : existing?.source ? { source: existing.source } : {}),
    ...(typeof input.sourceUrl === "string" && input.sourceUrl.trim() ? { sourceUrl: input.sourceUrl.trim() } : existing?.sourceUrl ? { sourceUrl: existing.sourceUrl } : {}),
    ...(input.analysisStatus === "analyzing" || input.analysisStatus === "ready" || input.analysisStatus === "failed"
      ? { analysisStatus: input.analysisStatus }
      : existing?.analysisStatus ? { analysisStatus: existing.analysisStatus } : {}),
    ...(isMetadataSource(input.metadataSource) ? { metadataSource: input.metadataSource } : existing?.metadataSource ? { metadataSource: existing.metadataSource } : {}),
    masked,
    ...(cardWidth !== undefined ? { cardWidth } : {}),
    ...(cardHeight !== undefined ? { cardHeight } : {}),
    analysisStatus,
    ...(account ? { account } : {}),
    ...(syncedGithub ? { github: syncedGithub } : {}),
    createdAt: existing?.createdAt ?? (typeof input.createdAt === "string" ? input.createdAt : now), updatedAt: existing ? now : typeof input.updatedAt === "string" ? input.updatedAt : now,
  };
}

/** 统一校验 GitHub 元数据，供 IPC 输入归一化复用。 */
export function normalizePromptGithubProject(input: unknown, existing?: PromptGithubProject): PromptGithubProject | undefined {
  if (input === undefined) return existing;
  return normalizeGithubProject(input) ?? existing;
}

/**
 * 组装账号字段：新密码优先重新加密；否则沿用入参或既有条目的加密密码，保证更新标题等操作不丢密码。
 */
function normalizePromptAccount(input: {
  parsed: { name?: string; password?: string; site?: string } | null;
  stored: unknown;
  existing?: PromptEntry["account"];
}): PromptEntry["account"] | undefined {
  const stored = isRecord(input.stored)
    ? {
        name: typeof input.stored.name === "string" ? input.stored.name.trim() : undefined,
        site: typeof input.stored.site === "string" ? input.stored.site.trim() : undefined,
        password: typeof input.stored.password === "string" ? input.stored.password.trim() : undefined,
        passwordEncrypted: typeof input.stored.passwordEncrypted === "string" ? input.stored.passwordEncrypted.trim() : undefined,
      }
    : undefined;
  const parsed = input.parsed;
  const existing = input.existing;
  const name = stored?.name || parsed?.name || existing?.name;
  const site = normalizeAccountSite(stored?.site || parsed?.site || existing?.site);
  const password = stored?.password || parsed?.password;
  const passwordEncrypted = password
    ? encryptPromptPassword(password)
    : stored?.passwordEncrypted || existing?.passwordEncrypted;
  if (!name && !site && !passwordEncrypted) {
    return undefined;
  }
  return {
    ...(name ? { name } : {}),
    ...(site ? { site } : {}),
    ...(passwordEncrypted ? { passwordEncrypted } : {}),
  };
}

export async function listPrompts(): Promise<PromptLibraryFile> { return enqueuePromptMutation(async () => listPromptsUnlocked()); }
export async function createPrompt(input: PromptInput): Promise<PromptLibraryFile> {
  return enqueuePromptMutation(async () => { const current = await listPromptsUnlocked(); const prompt = normalizePrompt({ ...input, source: input.source ?? "manual" }, undefined, current.entries.length, current.categories); const last = current.entries.reduce((result, entry) => result > entry.orderKey ? result : entry.orderKey, ""); const next = withEntries(current, [{ ...prompt, orderKey: createOrderKey(last, null) }, ...current.entries]); await persist(next); cache = next; return next; });
}
export async function createPrompts(inputs: PromptClipboardCreateInput[]): Promise<PromptLibraryFile> {
  return enqueuePromptMutation(async () => { const current = await listPromptsUnlocked(); const existingContent = new Set(current.entries.map((entry) => entry.content.trim())); const created: PromptEntry[] = []; for (const input of inputs) { const content = input.content.trim(); if (!content || existingContent.has(content)) continue; existingContent.add(content); created.push(normalizePrompt({ ...input, source: "clipboard" }, undefined, current.entries.length + created.length, current.categories)); } if (!created.length) return current; const next = withEntries(current, [...created, ...current.entries]); await persist(next); cache = next; return next; });
}
export async function updatePrompt(input: PromptUpdate): Promise<PromptLibraryFile> {
  return enqueuePromptMutation(async () => {
    const current = await listPromptsUnlocked();
    const existing = current.entries.find((prompt) => prompt.id === input.id);
    if (!existing) throw new AppError("PROMPT_NOT_FOUND", "灵感不存在。");
    const metadataSource = input.metadataSource ?? deriveUserMetadataSource(existing, input);
    const next = withEntries(current, current.entries.map((prompt) => prompt.id === input.id
      ? normalizePrompt({ ...input, metadataSource }, existing, 0, current.categories)
      : prompt));
    await persist(next);
    cache = next;
    scheduleUnusedPromptImageCleanup([existing], next.entries);
    return next;
  });
}
export async function deletePrompts(ids: string[]): Promise<PromptLibraryFile> {
  return enqueuePromptMutation(async () => {
    const current = await listPromptsUnlocked();
    const idSet = new Set(ids);
    const removed = current.entries.filter((prompt) => idSet.has(prompt.id));
    const next = withEntries(current, current.entries.filter((prompt) => !idSet.has(prompt.id)));
    await persist(next);
    cache = next;
    scheduleUnusedPromptImageCleanup(removed, next.entries);
    await unlinkTodoPromptIds(removed.map((prompt) => prompt.id));
    return next;
  });
}
export async function copyPrompt(input: PromptCopyInput): Promise<PromptLibraryFile> {
  return enqueuePromptMutation(async () => {
    const current = await listPromptsUnlocked();
    const existing = current.entries.find((prompt) => prompt.id === input.id);
    if (!existing) throw new AppError("PROMPT_NOT_FOUND", "灵感不存在。");
    const accountCopy = existing.type === "account"
      ? [
          buildPromptAccountContent(existing.account?.site),
          existing.account?.name ? `account: ${existing.account.name}` : "",
        ].filter(Boolean).join("\n")
      : "";
    const copyValue = existing.type === "github-project" && existing.github
      ? existing.github.url
      : renderPromptVariables(accountCopy || existing.content, input.values ?? {}, existing.variables);
    clipboard.writeText(copyValue);
    const now = new Date().toISOString();
    const next = withEntries(current, current.entries.map((prompt) => prompt.id === input.id ? { ...prompt, usageCount: prompt.usageCount + 1, lastUsedAt: now, updatedAt: now } : prompt));
    await persist(next);
    cache = next;
    return next;
  });
}
export async function setPromptFavorite(id: string, favorite: boolean): Promise<PromptLibraryFile> { return updatePrompt({ id, favorite }); }
/** 读取账号条目的明文视图（密码在主进程解密，仅存在于内存，不落盘）。 */
export async function readPromptAccount(id: string): Promise<PromptAccountView> {
  return enqueuePromptMutation(async () => {
    const current = await listPromptsUnlocked();
    const entry = current.entries.find((candidate) => candidate.id === id);
    if (!entry) throw new AppError("PROMPT_NOT_FOUND", "灵感不存在。");
    if (entry.type !== "account" || !entry.account) return {};
    return {
      ...(entry.account.name ? { name: entry.account.name } : {}),
      ...(entry.account.passwordEncrypted ? { password: decryptPromptPassword(entry.account.passwordEncrypted) } : {}),
      ...(entry.account.site ? { site: entry.account.site } : {}),
    };
  });
}
export async function duplicatePrompt(id: string): Promise<PromptLibraryFile> {
  return enqueuePromptMutation(async () => { const current = await listPromptsUnlocked(); const existing = current.entries.find((prompt) => prompt.id === id); if (!existing) throw new AppError("PROMPT_NOT_FOUND", "灵感不存在。"); const copy = normalizePrompt({ ...existing, id: randomUUID(), title: `${existing.title}（副本）`, favorite: false, usageCount: 0, lastUsedAt: undefined, source: "duplicate", createdAt: undefined, updatedAt: undefined }, undefined, 0, current.categories); const next = withEntries(current, [copy, ...current.entries]); await persist(next); cache = next; return next; });
}
export async function reorderPrompts(input: PromptReorderInput): Promise<PromptLibraryFile> {
  return enqueuePromptMutation(async () => { const current = await listPromptsUnlocked(); const selected = new Set(input.promptIds); const moving = current.entries.filter((entry) => selected.has(entry.id)); if (!moving.length) return current; if (input.targetCategoryId && !current.categories.some((category) => category.id === input.targetCategoryId)) throw new AppError("PROMPT_CATEGORY_NOT_FOUND", "目标灵感分类不存在。"); const remaining = current.entries.filter((entry) => !selected.has(entry.id)); const beforeIndex = input.beforePromptId ? remaining.findIndex((entry) => entry.id === input.beforePromptId) : -1; const afterIndex = input.afterPromptId ? remaining.findIndex((entry) => entry.id === input.afterPromptId) : -1; const insertAt = beforeIndex >= 0 ? beforeIndex : afterIndex >= 0 ? afterIndex + 1 : remaining.length; remaining.splice(insertAt, 0, ...moving.map((entry) => ({ ...entry, ...(input.targetCategoryId ? { categoryId: input.targetCategoryId } : {}), updatedAt: new Date().toISOString() }))); const next = withEntries(current, remaining.map((entry, index) => ({ ...entry, orderKey: String(index).padStart(10, "0") }))); await persist(next); cache = next; return next; });
}
export async function movePromptsToCategory(ids: string[], categoryId?: string): Promise<PromptLibraryFile> { return reorderPrompts({ promptIds: ids, targetCategoryId: categoryId ?? PROMPT_UNCATEGORIZED_ID }); }
export async function listPromptCategories(): Promise<PromptLibraryFile> { return listPrompts(); }
export async function createPromptCategory(input: PromptCategoryInput): Promise<PromptLibraryFile> { return enqueuePromptMutation(async () => { const current = await listPromptsUnlocked(); const name = input.name.trim(); assertCategoryNameAvailable(current.categories, name); const now = new Date().toISOString(); const category: PromptCategory = { id: randomUUID(), name, icon: input.icon?.trim() || "📁", color: input.color, description: input.description?.trim(), orderKey: String(current.categories.length).padStart(6, "0"), isDefault: false, createdAt: now, updatedAt: now }; const next = withCategories(current, [...current.categories, category]); await persist(next); cache = next; return next; }); }
export async function updatePromptCategory(input: PromptCategoryUpdate): Promise<PromptLibraryFile> { return enqueuePromptMutation(async () => { const current = await listPromptsUnlocked(); const existing = current.categories.find((category) => category.id === input.id); if (!existing) throw new AppError("PROMPT_CATEGORY_NOT_FOUND", "提示词分类不存在。"); const name = input.name.trim(); assertCategoryNameAvailable(current.categories, name, input.id); if (existing.id === PROMPT_UNCATEGORIZED_ID && name !== existing.name) throw new AppError("PROMPT_CATEGORY_PROTECTED", "未分类集合不可重命名。"); const next = withCategories(current, current.categories.map((category) => category.id === input.id ? { ...category, name, icon: input.icon?.trim() || category.icon, color: input.color ?? category.color, description: input.description?.trim() ?? category.description, updatedAt: new Date().toISOString() } : category)); await persist(next); cache = next; return next; }); }
export async function deletePromptCategory(input: PromptCategoryDeleteInput): Promise<PromptLibraryFile> { return enqueuePromptMutation(async () => { const current = await listPromptsUnlocked(); const existing = current.categories.find((category) => category.id === input.id); if (!existing) throw new AppError("PROMPT_CATEGORY_NOT_FOUND", "提示词分类不存在。"); if (existing.id === PROMPT_UNCATEGORIZED_ID) throw new AppError("PROMPT_CATEGORY_PROTECTED", "未分类集合不可删除。"); if (input.deleteEntries) { const entries = current.entries.filter((entry) => entry.categoryId !== input.id); const next = withCategories(withEntries(current, entries), current.categories.filter((category) => category.id !== input.id)); await persist(next); cache = next; return next; } const targetId = input.targetCategoryId ?? PROMPT_UNCATEGORIZED_ID; if (targetId === input.id || !current.categories.some((category) => category.id === targetId)) throw new AppError("PROMPT_CATEGORY_NOT_FOUND", "迁移目标提示词分类不存在。"); const entries = current.entries.map((entry) => entry.categoryId === input.id ? { ...entry, categoryId: targetId } : entry); const next = withCategories(withEntries(current, entries), current.categories.filter((category) => category.id !== input.id)); await persist(next); cache = next; return next; }); }
export async function reorderPromptCategories(categoryIds: string[]): Promise<PromptLibraryFile> { return enqueuePromptMutation(async () => { const current = await listPromptsUnlocked(); const byId = new Map(current.categories.map((category) => [category.id, category])); const ordered = categoryIds.map((id) => byId.get(id)).filter((category): category is PromptCategory => Boolean(category)); const missing = current.categories.filter((category) => !categoryIds.includes(category.id)); const next = withCategories(current, [...ordered, ...missing].map((category, index) => ({ ...category, orderKey: String(index).padStart(6, "0"), updatedAt: new Date().toISOString() }))); await persist(next); cache = next; return next; }); }
export async function mergePromptCategories(sourceId: string, targetId: string): Promise<PromptLibraryFile> {
  if (sourceId === targetId) throw new AppError("PROMPT_CATEGORY_MERGE_INVALID", "不能合并到同一个分类。");
  return enqueuePromptMutation(async () => {
    const current = await listPromptsUnlocked();
    const source = current.categories.find((category) => category.id === sourceId);
    const target = current.categories.find((category) => category.id === targetId);
    if (!source) throw new AppError("PROMPT_CATEGORY_NOT_FOUND", "提示词分类不存在。");
    if (!target) throw new AppError("PROMPT_CATEGORY_NOT_FOUND", "目标提示词分类不存在。");
    if (source.id === PROMPT_UNCATEGORIZED_ID) throw new AppError("PROMPT_CATEGORY_PROTECTED", "未分类集合不可删除。");
    const now = new Date().toISOString();
    const entries = current.entries.map((entry) => entry.categoryId === sourceId ? { ...entry, categoryId: targetId, updatedAt: now } : entry);
    const categories = current.categories.filter((category) => category.id !== sourceId);
    const next = withCategories(withEntries(current, entries), categories);
    await persist(next);
    cache = next;
    return next;
  });
}
export async function readPromptClipboard(): Promise<PromptClipboardPayload> {
  const text = clipboard.readText();
  const html = typeof clipboard.readHTML === "function" ? clipboard.readHTML() : "";
  const image = clipboard.readImage();
  const imageDataUrl = image.isEmpty() ? undefined : image.toDataURL();
  return {
    text,
    ...(html.trim() ? { html } : {}),
    ...(imageDataUrl ? { imageDataUrl } : {}),
    source: text.trim() || html.trim() ? "text" : imageDataUrl ? "image" : "empty",
  };
}

export type PromptExchangePayload = {
  schemaVersion: 2;
  kind: "suyan-inspiration-library";
  /** 独立于条目 schema 的导出元数据版本，用于校验新导出文件。 */
  exportVersion: 2;
  appVersion: string;
  exportedAt: string;
  /** 导出时区偏移，保证不同地区导入时按发送方时间校验文件名。 */
  exportTimeZoneOffsetMinutes: number;
  exportFileName: string;
  /** 导出作者（方案 §十八）：登录用户导出时写入，未登录/旧文件可缺省。 */
  author?: AuthorInfo;
  entries: PromptEntry[];
  categories: PromptCategory[];
};

/** 构建灵感库导出载荷：登录用户导出时注入 author，未登录则省略。 */
export function buildPromptExchangePayload(
  current: PromptLibraryFile,
  author: AuthorInfo | null,
  appVersion = getPromptSoftwareVersion(),
  exportedAt = new Date(),
): PromptExchangePayload {
  const exportedAtIso = exportedAt.toISOString();
  const payload: PromptExchangePayload = {
    schemaVersion: 2,
    kind: "suyan-inspiration-library",
    exportVersion: 2,
    appVersion,
    exportedAt: exportedAtIso,
    exportTimeZoneOffsetMinutes: exportedAt.getTimezoneOffset(),
    exportFileName: formatPromptExchangeFileName(appVersion, exportedAt),
    entries: current.entries,
    categories: current.categories,
  };
  if (author) {
    payload.author = author;
  }
  return payload;
}

export function getPromptSoftwareVersion(): string {
  try {
    return app.getVersion() || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function formatPromptExchangeFileName(version: string, date = new Date(), timeZoneOffsetMinutes = date.getTimezoneOffset()): string {
  return formatExportFileName("灵感库", "json", { version, date, timeZoneOffsetMinutes });
}

/** Kept only for validating files exported before the shared naming convention. */
function formatLegacyPromptExchangeFileName(version: string, date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const timestamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
  const safeVersion = version.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "-") || "未知版本";
  return `素言-${safeVersion}-${timestamp}.json`;
}

export async function exportPromptLibrary(): Promise<PromptLibraryExportResult> {
  const current = await listPrompts();
  const appVersion = getPromptSoftwareVersion();
  const exportedAt = new Date();
  const exportFileName = formatPromptExchangeFileName(appVersion, exportedAt);
  const defaultPath = path.join(getLibraryDataDir(), exportFileName);
  const dialogStartedAt = Date.now();
  const result = await dialog.showSaveDialog({
    title: "导出灵感创作",
    defaultPath,
    filters: [{ name: "灵感创作 JSON", extensions: ["json"] }],
  });

  logger.info("prompt-library", "export:dialog", {
    durationMs: Date.now() - dialogStartedAt,
    canceled: result.canceled,
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true, filePath: null, exportedCount: 0 };
  }

  // 用户可以在保存框中选择目录，但文件名统一由软件生成，确保版本和本机时间始终可校验。
  const filePath = path.join(path.dirname(result.filePath), exportFileName);
  const payload = buildPromptExchangePayload(current, getAuthorInfo(), appVersion, exportedAt);
  reportExportProgress(`正在保存 ${current.entries.length} 条灵感记录…`);
  const serialized = JSON.stringify(payload, null, 2);
  const writeStartedAt = Date.now();
  await writeTextFileAtomically(filePath, serialized);
  logger.info("prompt-library", "export:written", {
    durationMs: Date.now() - writeStartedAt,
    exportedCount: current.entries.length,
    bytes: Buffer.byteLength(serialized, "utf8"),
  });
  return { canceled: false, filePath, exportedCount: current.entries.length };
}

export async function importPromptLibrary(): Promise<PromptLibraryImportResult> {
  const result = await dialog.showOpenDialog({
    title: "导入灵感创作",
    properties: ["openFile"],
    filters: [{ name: "灵感创作 JSON", extensions: ["json"] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return {
      canceled: true,
      filePath: null,
      importedCount: 0,
      skippedCount: 0,
      library: await listPrompts(),
    };
  }

  const filePath = result.filePaths[0] as string;
  const readStartedAt = Date.now();
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  } catch {
    throw new AppError("PROMPT_IMPORT_INVALID", "导入文件无法读取或不是有效的 JSON 文件。");
  }
  const imported = readPromptExchangePayload(parsed, path.basename(filePath));
  logger.info("prompt-library", "import:parsed", {
    durationMs: Date.now() - readStartedAt,
    entryCount: imported.entries.length,
    categoryCount: imported.categories.length,
  });

  return enqueuePromptMutation(async () => {
    const current = await listPromptsUnlocked();
    const merged = mergeImportedPromptLibrary(current, imported);
    if (merged.importedCount > 0 || merged.categoryAdded) {
      await persist(merged.library);
      cache = merged.library;
    }
    logger.info("prompt-library", "import:merged", {
      importedCount: merged.importedCount,
      skippedCount: merged.skippedCount,
      categoryAdded: merged.categoryAdded,
    });
    return {
      canceled: false,
      filePath,
      importedCount: merged.importedCount,
      skippedCount: merged.skippedCount,
      library: merged.library,
    };
  });
}

export function mergeImportedPromptLibrary(
  current: PromptLibraryFile,
  imported: PromptLibraryFile,
): { library: PromptLibraryFile; importedCount: number; skippedCount: number; categoryAdded: boolean } {
  const now = new Date().toISOString();
  const categories = [...current.categories];
  const categoriesByName = new Map(categories.map((category) => [category.name.trim().toLocaleLowerCase(), category]));
  const importedCategoryIds = new Map<string, string>();
  let categoryAdded = false;

  for (const category of imported.categories) {
    const key = category.name.trim().toLocaleLowerCase();
    if (!key) continue;
    const existing = categoriesByName.get(key);
    if (existing) {
      importedCategoryIds.set(category.id, existing.id);
      continue;
    }
    const next: PromptCategory = {
      id: randomUUID(),
      name: category.name.trim(),
      icon: category.icon,
      color: category.color,
      description: category.description,
      orderKey: String(categories.length).padStart(6, "0"),
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    categories.push(next);
    categoriesByName.set(key, next);
    importedCategoryIds.set(category.id, next.id);
    categoryAdded = true;
  }

  const contentKeys = new Set(current.entries.map((entry) => entry.content.trim()));
  const entries = [...current.entries];
  let lastOrderKey = entries.reduce((last, entry) => last > entry.orderKey ? last : entry.orderKey, "");
  let importedCount = 0;
  let skippedCount = 0;

  for (const entry of imported.entries) {
    const contentKey = entry.content.trim();
    if (!contentKey || contentKeys.has(contentKey)) {
      skippedCount += 1;
      continue;
    }
    contentKeys.add(contentKey);
    const categoryId = entry.categoryId ? importedCategoryIds.get(entry.categoryId) : undefined;
    lastOrderKey = createOrderKey(lastOrderKey, null);
    // readPromptExchangePayload 已完成 schema 归一化，这里只更新导入身份和排序，
    // 避免每条记录再次执行账号解析、变量提取和字段正则。
    entries.push({
      ...entry,
      id: randomUUID(),
      categoryId: categoryId ?? PROMPT_UNCATEGORIZED_ID,
      source: "import",
      orderKey: lastOrderKey,
      createdAt: now,
      updatedAt: now,
    });
    importedCount += 1;
  }

  return {
    library: { schemaVersion: PROMPT_SCHEMA_VERSION, updatedAt: now, entries, categories },
    importedCount,
    skippedCount,
    categoryAdded,
  };
}

async function listPromptsUnlocked(): Promise<PromptLibraryFile> {
  await fs.mkdir(getLibraryDataDir(), { recursive: true });
  const currentSignature = await readPromptFileSignature();
  // The renderer can keep a long-lived snapshot while an editor or backup tool
  // changes prompts.json. Re-read before every operation so a stale in-memory
  // cache can never silently overwrite an external update.
  if (cache && cacheFileSignature === currentSignature) return cache;

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(await fs.readFile(getPromptsPath(), "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new AppError("PROMPT_STORE_INVALID", "灵感库文件无法读取。");
  }
  const migration = normalizePromptLibraryFile(parsed);
  await persist(migration.file);
  cache = migration.file;
  return migration.file;
}
export function normalizePromptLibraryFile(input: unknown): { file: PromptLibraryFile; migrated: boolean } {
  if (input === null || input === undefined) return { file: emptyFile(), migrated: true };
  if (!isRecord(input) && !Array.isArray(input)) throw new AppError("PROMPT_STORE_INVALID", "灵感库文件结构不合法。");
  const record: Record<string, any> | null = !Array.isArray(input) && isRecord(input) ? input : null;
  if (record && record.schemaVersion !== undefined && record.schemaVersion !== 1 && record.schemaVersion !== PROMPT_SCHEMA_VERSION) throw new AppError("PROMPT_STORE_VERSION_UNSUPPORTED", "灵感库版本暂不受支持，请升级素言后重试。");
  const isV2 = record?.schemaVersion === PROMPT_SCHEMA_VERSION;
  const rawEntries = Array.isArray(input) ? input : isV2 ? record?.entries : record?.prompts;
  if (!Array.isArray(rawEntries)) throw new AppError("PROMPT_STORE_INVALID", "灵感库条目结构不合法。");
  const legacyCategories = record && Array.isArray(record.categories) ? record.categories : [];
  const categories = normalizeCategories(legacyCategories, !isV2); const categoryIds = new Set(categories.map((category) => category.id));
  const entries = rawEntries.map((entry, index) => { const normalized = normalizePrompt(entry, undefined, index, categories); const categoryId = normalized.categoryId && categoryIds.has(normalized.categoryId) ? normalized.categoryId : undefined; return { ...normalized, ...(categoryId ? { categoryId } : {}) }; });
  const file: PromptLibraryFile = { schemaVersion: PROMPT_SCHEMA_VERSION, updatedAt: record && typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(), entries, categories };
  return { file, migrated: !isV2 || !Array.isArray(record?.entries) };
}
 function normalizeCategories(raw: unknown[], addDefaults: boolean): PromptCategory[] { const now = new Date().toISOString(); const categories: PromptCategory[] = []; for (const [index, input] of raw.entries()) { if (!isRecord(input) || typeof input.id !== "string" || typeof input.name !== "string" || !input.name.trim()) continue; categories.push({ id: input.id, name: input.name.trim(), icon: typeof input.icon === "string" ? input.icon : undefined, color: typeof input.color === "string" ? input.color : undefined, description: typeof input.description === "string" ? input.description : undefined, orderKey: typeof input.orderKey === "string" ? input.orderKey : String(typeof input.sortOrder === "number" ? input.sortOrder : index + 1).padStart(6, "0"), isDefault: input.isDefault === true || input.scope === "prompt", createdAt: typeof input.createdAt === "string" ? input.createdAt : now, updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : now }); } const existingNames = new Set(categories.map((category) => category.name.toLocaleLowerCase())); for (const category of createDefaultCategories()) if ((addDefaults || ["账号", "邮箱", "API Key", "Github"].includes(category.name)) && !existingNames.has(category.name.toLocaleLowerCase())) { categories.push(category); existingNames.add(category.name.toLocaleLowerCase()); } if (!categories.some((category) => category.id === PROMPT_UNCATEGORIZED_ID)) categories.unshift(createDefaultCategories()[0]); return categories; }
function withEntries(file: PromptLibraryFile, entries: PromptEntry[]): PromptLibraryFile { return { ...file, entries, updatedAt: new Date().toISOString() }; }
function withCategories(file: PromptLibraryFile, categories: PromptCategory[]): PromptLibraryFile { return { ...file, categories, updatedAt: new Date().toISOString() }; }
async function persist(file: PromptLibraryFile): Promise<void> {
  await writeLibraryJsonAtomically(getPromptsPath(), JSON.stringify(file));
  cacheFileSignature = await readPromptFileSignature();
}

async function readPromptFileSignature(): Promise<string | null> {
  try {
    const stats = await fs.stat(getPromptsPath());
    return `${stats.size}:${stats.mtimeMs}:${stats.ctimeMs}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
function assertCategoryNameAvailable(categories: PromptCategory[], name: string, ignoreId?: string): void { if (!name) throw new AppError("PROMPT_CATEGORY_REQUIRED", "分类名称不能为空。"); if (categories.some((category) => category.id !== ignoreId && category.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new AppError("PROMPT_CATEGORY_DUPLICATE", "同级分类名称不能重复。"); }
function normalizeStringArray(input: unknown): string[] { return Array.isArray(input) ? [...new Set(input.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))] : []; }
function normalizeCardDimension(input: unknown, existing: number | undefined, min: number, max: number): number | undefined {
  const value = typeof input === "number" && Number.isFinite(input) ? input : existing;
  return value === undefined ? undefined : Math.min(max, Math.max(min, Math.round(value)));
}
export function readPromptExchangePayload(input: unknown, sourceFileName?: string): PromptLibraryFile {
  // 兼容 v1（无 author）与 v2（携带 author）两种导出格式（方案 §十八）。
  if (!isRecord(input) || (input.schemaVersion !== 1 && input.schemaVersion !== 2) || input.kind !== "suyan-inspiration-library") {
    throw new AppError("PROMPT_IMPORT_INVALID", "导入文件不是有效的素言灵感库文件。");
  }
  if (input.exportVersion !== undefined) {
    if (
      (input.exportVersion !== 1 && input.exportVersion !== 2)
      || typeof input.appVersion !== "string"
      || !isSoftwareVersion(input.appVersion)
      || typeof input.exportedAt !== "string"
      || !isValidExportTimestamp(input.exportedAt)
      || typeof input.exportFileName !== "string"
      || (input.exportVersion === 2 && (typeof input.exportTimeZoneOffsetMinutes !== "number"
        || !Number.isInteger(input.exportTimeZoneOffsetMinutes) || Math.abs(input.exportTimeZoneOffsetMinutes) > 840))
      || (input.exportVersion === 1
        ? formatLegacyPromptExchangeFileName(input.appVersion, new Date(input.exportedAt))
        : formatPromptExchangeFileName(input.appVersion, new Date(input.exportedAt), input.exportTimeZoneOffsetMinutes as number)) !== input.exportFileName
      || (sourceFileName !== undefined && sourceFileName !== input.exportFileName)
    ) {
      throw new AppError("PROMPT_IMPORT_METADATA_INVALID", "导入文件的素言版本号或导出时间无效，请重新导出后再导入。");
    }
  }
  if (!Array.isArray(input.entries) || !Array.isArray(input.categories)) {
    throw new AppError("PROMPT_IMPORT_INVALID", "导入文件缺少灵感条目或分类。");
  }
  return normalizePromptLibraryFile({
    schemaVersion: PROMPT_SCHEMA_VERSION,
    updatedAt: typeof input.exportedAt === "string" ? input.exportedAt : new Date().toISOString(),
    entries: input.entries,
    categories: input.categories,
  }).file;
}

function isValidExportTimestamp(value: string): boolean {
  const time = Date.parse(value);
  return Number.isFinite(time) && value === new Date(time).toISOString();
}

function isSoftwareVersion(value: string): boolean {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value.trim());
}
function normalizePromptColorId(input: unknown): PromptEntry["colorId"] | undefined {
  if (input === "blue") return "mist";
  if (input === "violet") return "lavender";
  if (input === "amber") return "sand";
  if (input === "emerald") return "sage";
  if (input === "cyan") return "fog";
  if (input === "indigo") return "stone";
  if (input === "orange") return "clay";
  return isPromptColorId(input) ? input : undefined;
}
function isPromptColorId(input: unknown): input is PromptEntry["colorId"] {
  return input === "sage" || input === "mist" || input === "clay" || input === "lavender" || input === "fog" || input === "rose" || input === "sand" || input === "stone"
    || input === "blue" || input === "violet" || input === "amber" || input === "emerald" || input === "cyan" || input === "indigo" || input === "orange";
}
function isPromptSource(input: unknown): input is PromptEntry["source"] { return input === "manual" || input === "clipboard" || input === "import" || input === "duplicate"; }
function isMetadataSource(input: unknown): input is NonNullable<PromptEntry["metadataSource"]> {
  if (!isRecord(input)) return false;
  return ["title", "description", "type", "category", "tags", "variables"].every((key) => {
    const value = input[key];
    return value === undefined || value === "system" || value === "ai" || value === "user";
  });
}
function deriveUserMetadataSource(existing: PromptEntry, input: PromptUpdate): NonNullable<PromptEntry["metadataSource"]> {
  const source = { ...(existing.metadataSource ?? {}) };
  if (typeof input.title === "string" && input.title.trim() !== existing.title) source.title = "user";
  if (typeof input.description === "string" && input.description.trim() !== (existing.description ?? "")) source.description = "user";
  if (input.type && input.type !== existing.type) source.type = "user";
  if (Object.prototype.hasOwnProperty.call(input, "categoryId") && input.categoryId !== existing.categoryId) source.category = "user";
  if (Array.isArray(input.tagIds) && JSON.stringify(input.tagIds) !== JSON.stringify(existing.tagIds)) source.tags = "user";
  if (Array.isArray(input.variables) && JSON.stringify(input.variables) !== JSON.stringify(existing.variables)) source.variables = "user";
  return source;
}
function isRecord(input: unknown): input is Record<string, any> { return Boolean(input && typeof input === "object" && !Array.isArray(input)); }

function scheduleUnusedPromptImageCleanup(previousEntries: PromptEntry[], nextEntries: PromptEntry[]): void {
  const candidates = new Set(previousEntries.flatMap((entry) => extractPromptImageNames(entry.contentHtml ?? "")));
  if (candidates.size === 0) return;
  const used = new Set(nextEntries.flatMap((entry) => extractPromptImageNames(entry.contentHtml ?? "")));
  const unused = [...candidates].filter((fileName) => !used.has(fileName));
  if (unused.length > 0) void removePromptContentImages(unused);
}
