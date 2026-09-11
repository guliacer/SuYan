import type { LibraryFile, LibraryItem, LibraryViewSettings } from "../../../src/features/library/types/library";
import { createEmptyCategoryTaxonomy, mergeCategoryTaxonomy, mergeLexiconCategoriesIntoTaxonomy } from "../../../src/features/library/utils/categoryTaxonomy";
import { AppError } from "../ipc/errors";
import { logger } from "../appLogger";
import { updateLibraryFile } from "./libraryStore";
import { readLibraryViewSettings, withViewSettingsWriteLock, writeLibraryViewSettingsUnlocked } from "./viewSettingsStore";
import { mergeArchiveAnalyzedLibraries, type ArchiveAnalyzedLibraries } from "./archiveKnowledge";

export function archiveTaxonomy(library: LibraryFile, settings: LibraryViewSettings) {
  const workspace = settings.categoryWorkspace?.taxonomy;
  const base = library.categoryTaxonomy ?? createEmptyCategoryTaxonomy();
  const taxonomy = mergeCategoryTaxonomy({ ...base,
    disabledSystemCategoryIds: workspace?.disabledSystemCategoryIds ?? base.disabledSystemCategoryIds }, workspace?.nodes ?? []);
  return mergeLexiconCategoriesIntoTaxonomy(taxonomy, settings.promptLexicons?.categories ?? []);
}

/** Same lock order as tag organization: settings, then library. No stale snapshots. */
export function appendArchiveWithKnowledge(items: LibraryItem[], knowledge: ArchiveAnalyzedLibraries) {
  return withViewSettingsWriteLock(async () => {
    let previous: LibraryViewSettings | undefined;
    let settings: LibraryViewSettings | undefined;
    let attemptedWrite = false;
    try {
      const library = await updateLibraryFile(async current => {
        previous = await readLibraryViewSettings();
        const merged = mergeArchiveAnalyzedLibraries(archiveTaxonomy(current, previous), previous.promptLexicons, knowledge, items);
        attemptedWrite = true;
        settings = await writeLibraryViewSettingsUnlocked({ ...previous, promptLexicons: merged.lexicons,
          categoryWorkspace: { ...previous.categoryWorkspace, taxonomy: merged.taxonomy,
            inbox: previous.categoryWorkspace?.inbox ?? [], candidates: previous.categoryWorkspace?.candidates ?? [],
            learningEvents: previous.categoryWorkspace?.learningEvents ?? [] } });
        return { ...current, items: [...merged.items, ...current.items], categoryTaxonomy: merged.taxonomy };
      });
      logger.info("library", "archive:knowledge-imported", { items: items.length, categories: knowledge.categories.length, tags: knowledge.tags.length });
      return { library, settings: settings! };
    } catch (error) {
      if (attemptedWrite && previous) {
        try { await writeLibraryViewSettingsUnlocked(previous); }
        catch {
          // Keep imported covers if a disk error also prevents rollback. JSON backups remain recoverable.
          logger.error("library", "archive:knowledge-rollback-failed", { code: "ZIP_IMPORT_ROLLBACK_FAILED" });
          throw new AppError("ZIP_IMPORT_ROLLBACK_FAILED", "导入未完成，分类标签库恢复失败。请检查磁盘空间或写入权限，备份及已写入图片已保留。");
        }
      }
      throw error;
    }
  });
}
