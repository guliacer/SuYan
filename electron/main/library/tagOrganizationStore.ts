import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { AppError } from "../ipc/errors";
import { logger } from "../appLogger";
import { readLibraryFile, updateLibraryFile } from "./libraryStore";
import { getLibraryDataDir, getTagLexiconPath } from "./libraryPaths";
import { readLibraryViewSettings, normalizeImageLexiconEntry, withViewSettingsWriteLock } from "./viewSettingsStore";
import { buildTagOrganizationRows, applyTagOrganizationChoices } from "../../../src/features/library/utils/tagOrganization";
import type { LibraryFile, PromptImageLexiconEntry } from "../../../src/features/library/types/library";
import type { TagOrganizationPreview, TagOrganizationRequest } from "../../../src/features/library/types/tagKnowledge";

type TagSnapshot = { items: Array<{ id: string; tags: string[] }>; entries: PromptImageLexiconEntry[] };
type History = { version: 1; before: TagSnapshot; after: TagSnapshot; state: "prepared" | "applied" | "undone" };
const historyPath = () => path.join(getLibraryDataDir(), "tag-organization-undo.json");
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(work: () => Promise<T>): Promise<T> { const result = queue.then(() => withViewSettingsWriteLock(work)); queue = result.catch(() => undefined); return result; }
function snapshot(library: LibraryFile, entries: PromptImageLexiconEntry[]): TagSnapshot { return { items: library.items.map(({id,tags})=>({id,tags})), entries }; }
function signature(value: unknown): string {
  const stable = (v: unknown): unknown => Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a],[b]) => a.localeCompare(b)).map(([k,x])=>[k,stable(x)])) : v;
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}
async function atomicWrite(file: string, value: unknown) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, JSON.stringify(value), "utf8");
    await fs.rename(temp, file);
  } finally { await fs.unlink(temp).catch(() => undefined); }
}
async function readHistory(): Promise<History | null> {
  try { const history = JSON.parse(await fs.readFile(historyPath(), "utf8")); return history.version === 1 ? history : null; }
  catch { return null; }
}

export function previewTagOrganization(): Promise<TagOrganizationPreview> {
  return serialized(async () => {
    const [library, settings, history] = await Promise.all([readLibraryFile(), readLibraryViewSettings(), readHistory()]);
    const entries = settings.promptLexicons?.tags ?? [];
    return { revision: signature(snapshot(library, entries)), rows: buildTagOrganizationRows(library.items, entries), undoAvailable: history?.state === "applied" || history?.state === "prepared" };
  });
}

export function applyTagOrganization(request: TagOrganizationRequest) {
  return serialized(async () => {
    if (!request || typeof request.revision !== "string" || !Array.isArray(request.choices) || !request.choices.length || request.choices.length > 20000 || request.choices.some(c => !c || typeof c.id !== "string" || typeof c.label !== "string" || typeof c.group !== "string")) throw new AppError("TAG_ORGANIZATION_INVALID", "请选择有效的标签整理项。");
    let history: History | undefined;
    let wroteEntries = false;
    const previousHistory = await readHistory();
    try {
      const library = await updateLibraryFile(async current => {
        const settings = await readLibraryViewSettings();
        const entries = settings.promptLexicons?.tags ?? [];
        const before = snapshot(current, entries);
        if (signature(before) !== request.revision) throw new AppError("TAG_ORGANIZATION_STALE", "标签库已变化，请刷新预览后再应用。");
        let next;
        try { next = applyTagOrganizationChoices(current.items, entries, buildTagOrganizationRows(current.items, entries), request.choices); }
        catch (error) { throw new AppError("TAG_ORGANIZATION_INVALID", error instanceof Error ? error.message : "标签整理选项无效。"); }
        next.entries = next.entries.map(e => normalizeImageLexiconEntry(e)!);
        history = { version: 1, before, after: snapshot({ ...current, items: next.items }, next.entries), state: "prepared" };
        // Keep a recoverable snapshot before either data file changes.
        await atomicWrite(historyPath(), history);
        await atomicWrite(getTagLexiconPath(), next.entries); wroteEntries = true;
        return { ...current, items: next.items };
      }, { skipNormalize: true });
      history!.state = "applied";
      await atomicWrite(historyPath(), history).catch(() => logger.warn("library", "tags:journal-finalize-failed", { recoverable: true }));
      logger.info("library", "tags:organized", { count: request.choices.length });
      return { library, settings: await readLibraryViewSettings() };
    } catch (error) {
      // A prepared journal also covers an interrupted process; undo compares actual tags before restoring.
      if (history?.state === "prepared") {
        if (wroteEntries) await atomicWrite(getTagLexiconPath(), history.before.entries);
        await atomicWrite(historyPath(), previousHistory ?? { ...history, state: "undone" });
      }
      logger.error("library", "tags:organization-failed", { code: "TAG_ORGANIZATION_FAILED" });
      throw error;
    }
  });
}

export function undoTagOrganization() {
  return serialized(async () => {
    const history = await readHistory();
    if (!history || history.state === "undone") throw new AppError("TAG_ORGANIZATION_NO_UNDO", "没有可以撤销的标签整理。");
    let previousEntries: PromptImageLexiconEntry[] | undefined;
    let wroteEntries = false;
    const library = await updateLibraryFile(async current => {
      const settings = await readLibraryViewSettings();
      const entries = settings.promptLexicons?.tags ?? [];
      previousEntries = entries;
      const matchesAfter = signature(entries) === signature(history.after.entries);
      const matchesBefore = signature(entries) === signature(history.before.entries);
      if (!matchesAfter && !matchesBefore) throw new AppError("TAG_ORGANIZATION_STALE", "整理后标签库已有新修改，为避免覆盖，无法直接撤销。");
      const after = new Map(history.after.items.map(i => [i.id, i.tags]));
      const before = new Map(history.before.items.map(i => [i.id, i.tags]));
      const items = current.items.map(item => {
        const old = before.get(item.id), expected = after.get(item.id);
        if (!old || signature(old) === signature(expected)) return item;
        if (signature(item.tags) !== signature(expected) && signature(item.tags) !== signature(old)) throw new AppError("TAG_ORGANIZATION_STALE", "整理后部分作品标签已修改，无法直接撤销。备份仍保留。");
        return { ...item, tags: old, updatedAt: new Date().toISOString() };
      });
      await atomicWrite(getTagLexiconPath(), history.before.entries);
      wroteEntries = true;
      return { ...current, items };
    }, { skipNormalize: true }).catch(async error => {
      if (wroteEntries && previousEntries) await atomicWrite(getTagLexiconPath(), previousEntries);
      logger.error("library", "tags:undo-failed", { code: error instanceof AppError ? error.code : "TAG_ORGANIZATION_UNDO_FAILED" });
      throw error;
    });
    await atomicWrite(historyPath(), { ...history, state: "undone" }).catch(() => logger.warn("library", "tags:undo-journal-finalize-failed", { recoverable: true }));
    logger.info("library", "tags:organization-undone");
    return { library, settings: await readLibraryViewSettings() };
  });
}
