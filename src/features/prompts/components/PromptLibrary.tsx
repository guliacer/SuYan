import { useEffect, useMemo, useRef, useState } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { sortableKeyboardCoordinates, SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import {
  BookOpenText, CheckCheck, Clock3, Copy, Grid2X2, List, Plus, Search, Star,
  Settings2, Tag, Tags, Trash2, XSquare, Zap, ClipboardPaste, ChevronDown, Download, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/LocaleProvider";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TextField } from "@/components/ui/TextField";
import type { PromptCategory, PromptCreateInput, PromptEntry, PromptInput, PromptUpdate } from "../types";
import { usePromptStore } from "../store/promptStore";
import { collectPromptTagCounts, filterPromptsByTag, searchPrompts, sortPrompts } from "../utils/promptSearch";
import { invertVisibleSelection } from "../utils/promptSelection";
import { DraggablePromptCard } from "./DraggablePromptCard";
import { PromptDetailDialog } from "./PromptDetailDialog";
import { PromptEditor } from "./PromptEditor";
import { PromptCreateDialog } from "./PromptCreateDialog";
import { PasteImportDialog } from "./PasteImportDialog";
import { CategoryManagerDialog } from "./CategoryManagerDialog";
import { TagManagerDialog } from "./TagManagerDialog";
import { compareOrderKey } from "../utils/promptOrder";
import { distributePromptMasonryItems } from "../utils/promptMasonry";
import { clampPromptCardHeight, clampPromptCardWidth, PROMPT_CARD_DEFAULT_HEIGHT, PROMPT_CARD_DEFAULT_WIDTH } from "../utils/promptCardSizing";
import { useTodoStore } from "../todos/todoStore";
import { TodoManagerDialog } from "../todos/components/TodoManagerDialog";

type WorkspaceFilter = "all" | "favorite" | "recent" | "frequent";
type SortMode = "manual" | "recent" | "created" | "updated" | "usage" | "name";

export function PromptLibrary() {
  const { t } = useLocale();
  const store = usePromptStore();
  const todo = useTodoStore();
  const [query, setQuery] = useState("");
  const [workspaceFilter, setWorkspaceFilter] = useState<WorkspaceFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sortMode, setSortMode] = useState<SortMode>("updated");
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editorEntry, setEditorEntry] = useState<PromptEntry | null | undefined>(undefined);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [pasteText, setPasteText] = useState<string | null>(null);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [todoManagerOpen, setTodoManagerOpen] = useState(false);
  const [todoPrompt, setTodoPrompt] = useState<PromptEntry | null>(null);
  const [exchangeMessage, setExchangeMessage] = useState<string | null>(null);
  const categoryMenuRef = useRef<HTMLDivElement | null>(null);
  const tagMenuRef = useRef<HTMLDivElement | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => { void store.load(); void store.loadViewSettings(); void todo.load(); }, [store.load, store.loadViewSettings, todo.load]);
  useEffect(() => { setView(store.viewSettings.viewMode); setSortMode(mapPersistedSort(store.viewSettings.sortMode)); }, [store.viewSettings]);
  useEffect(() => {
    if (!categoryMenuOpen && !tagMenuOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!categoryMenuRef.current?.contains(target)) setCategoryMenuOpen(false);
      if (!tagMenuRef.current?.contains(target)) setTagMenuOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCategoryMenuOpen(false);
        setTagMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [categoryMenuOpen, tagMenuOpen]);

  const categoryMap = useMemo(() => new Map(store.categories.map((category) => [category.id, category])), [store.categories]);
  const counts = useMemo(() => new Map(store.categories.map((category) => [category.id, store.entries.filter((prompt) => prompt.categoryId === category.id).length])), [store.categories, store.entries]);
  const tagCounts = useMemo(() => collectPromptTagCounts(store.entries), [store.entries]);
  const tags = useMemo(() => [...tagCounts.keys()].sort((a, b) => a.localeCompare(b, "zh-CN")), [tagCounts]);
  const visiblePrompts = useMemo(() => {
    let prompts = searchPrompts(store.entries, query, store.categories);
    if (workspaceFilter === "favorite") prompts = prompts.filter((prompt) => prompt.favorite);
    else if (workspaceFilter === "recent") prompts = prompts.filter((prompt) => prompt.lastUsedAt);
    else if (workspaceFilter === "frequent") prompts = prompts.filter((prompt) => prompt.usageCount > 0);
    if (categoryFilter !== "all") prompts = prompts.filter((prompt) => prompt.categoryId === categoryFilter);
    prompts = filterPromptsByTag(prompts, tagFilter);
    if (sortMode === "manual") return [...prompts].sort((a, b) => compareOrderKey(a.orderKey, b.orderKey));
    return sortPrompts(prompts, workspaceFilter === "recent" ? "recent" : workspaceFilter === "frequent" ? "usage" : sortMode);
  }, [categoryFilter, query, sortMode, store.categories, store.entries, tagFilter, workspaceFilter]);
  const visibleIds = useMemo(() => visiblePrompts.map((prompt) => prompt.id), [visiblePrompts]);
  const detail = detailId ? store.entries.find((prompt) => prompt.id === detailId) ?? null : null;

  useEffect(() => {
    setSelectedIds((current) => new Set([...current].filter((id) => store.entries.some((prompt) => prompt.id === id))));
    if (detailId && !store.entries.some((prompt) => prompt.id === detailId)) setDetailId(null);
  }, [detailId, store.entries]);

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      if (isEditable(event.target)) return;
      const text = event.clipboardData?.getData("text/plain")?.trim() ?? "";
      if (!text) return;
      event.preventDefault();
      setPasteText(text);
    }
    document.addEventListener("paste", handlePaste);
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditable(event.target)) return;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "k") { event.preventDefault(); document.getElementById("prompt-ideas-search")?.focus(); }
      if (command && event.key.toLowerCase() === "n") { event.preventDefault(); setEditorEntry(null); }
      if (command && event.key.toLowerCase() === "a") { event.preventDefault(); setSelectedIds(new Set(visibleIds)); }
      if (command && event.shiftKey && event.key.toLowerCase() === "v") { event.preventDefault(); void openClipboard(); }
      if (event.key === "Escape") { setDetailId(null); setSelectedIds(new Set()); }
      if (event.key === "Delete" && selectedIds.size) setDeleteIds([...selectedIds]);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("paste", handlePaste); document.removeEventListener("keydown", handleKeyDown); };
  }, [detail, selectedIds, visibleIds]);

  async function openClipboard() {
    const payload = await store.readClipboard();
    if (!payload) return;
    if (payload.source === "text") setPasteText(payload.text);
    else if (payload.source === "image") usePromptStore.setState({ error: t("剪贴板中是图片，请在素材库使用粘贴导入或图像反推。") });
    else usePromptStore.setState({ error: t("剪贴板中没有可用内容。") });
  }

  function changeView(next: "grid" | "list") { setView(next); void store.saveViewSettings({ viewMode: next }); }
  function openTodoManager(prompt?: PromptEntry) { setTodoPrompt(prompt ?? null); setTodoManagerOpen(true); }
  function toggleGithubReadme(entry: PromptEntry, collapsed: boolean) {
    if (!entry.github) return Promise.resolve(false);
    return store.updatePrompt({ id: entry.id, github: { ...entry.github, readmeCollapsed: collapsed } });
  }
  function changeSort(next: SortMode) { setSortMode(next); void store.saveViewSettings({ sortMode: mapUiSort(next) }); }

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id); const overId = event.over ? String(event.over.id) : "";
    setCategoryMenuOpen(false);
    if (!overId || overId === activeId) return;
    const movingIds = selectedIds.has(activeId) ? [...selectedIds] : [activeId];
    if (overId.startsWith("prompt-category-drop:")) {
      const targetCategoryId = overId.slice("prompt-category-drop:".length);
      if (targetCategoryId !== "all") void store.moveToCategory(movingIds, targetCategoryId);
      return;
    }
    if (sortMode === "manual") void store.reorderPrompts({ promptIds: movingIds, beforePromptId: overId });
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  async function saveEditor(input: Partial<PromptInput>) {
    if (!editorEntry) return false;
    return store.updatePrompt({ id: editorEntry.id, ...input });
  }

  async function renameTag(source: string, target: string) {
    const normalizedTarget = target.trim();
    if (!normalizedTarget || source === normalizedTarget) return false;
    for (const entry of store.entries) {
      if (!entry.tagIds.includes(source)) continue;
      const tagIds = [...new Set(entry.tagIds.map((tag) => tag === source ? normalizedTarget : tag))];
      if (!await store.updatePrompt({ id: entry.id, tagIds })) return false;
    }
    if (tagFilter === source) setTagFilter(normalizedTarget);
    return true;
  }

  async function deleteTag(tag: string) {
    for (const entry of store.entries) {
      if (!entry.tagIds.includes(tag)) continue;
      if (!await store.updatePrompt({ id: entry.id, tagIds: entry.tagIds.filter((current) => current !== tag) })) return false;
    }
    if (tagFilter === tag) setTagFilter("");
    return true;
  }

  async function confirmDelete() {
    const ids = deleteIds;
    if (!ids.length) return;
    const deleted = await store.deletePrompts(ids);
    if (deleted) { setDeleteIds([]); setSelectedIds(new Set()); }
  }

  return (
    <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={handleDragEnd}>
    <section className="relative flex h-[calc(100dvh-5.5rem)] min-h-[520px] overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-border bg-panel px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-xs text-muted">{t("灵感创作")}</p><h1 className="text-lg font-semibold">{getFilterTitle(workspaceFilter, categoryFilter, tagFilter, categoryMap, t)}</h1></div>
            <div data-feature-guide="prompt-ideas-actions" className="flex flex-wrap gap-2"><Button icon={<Download size={16} />} onClick={() => void store.exportLibrary().then((result) => { if (result && !result.canceled) setExchangeMessage(t("已导出 {count} 条灵感。", { count: result.exportedCount })); })}>{t("导出灵感")}</Button><Button icon={<Upload size={16} />} onClick={() => void store.importLibrary().then((result) => { if (result && !result.canceled) setExchangeMessage(t("已导入 {importedCount} 条灵感，跳过 {skippedCount} 条重复内容。", { importedCount: result.importedCount, skippedCount: result.skippedCount })); })}>{t("导入灵感")}</Button><Button icon={<ClipboardPaste size={16} />} onClick={() => void openClipboard()}>{t("粘贴灵感")}</Button><Button icon={<Plus size={16} />} variant="primary" onClick={() => setEditorEntry(null)}>{t("新建灵感")}</Button></div>
          </div>
          <div data-feature-guide="prompt-ideas-search" className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
              <TextField id="prompt-ideas-search" className="pl-9" placeholder={t("搜索标题、内容、分类或标签")} value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <div className="flex h-10 items-center rounded-lg border border-border bg-background p-1">
              <IconButton active={view === "grid"} label={t("网格视图")} onClick={() => changeView("grid")}><Grid2X2 size={16} /></IconButton>
              <IconButton active={view === "list"} label={t("列表视图")} onClick={() => changeView("list")}><List size={17} /></IconButton>
            </div>
            <select aria-label={t("排序方式")} className="h-10 rounded-lg border border-border bg-panel px-3 text-sm outline-none" value={sortMode} onChange={(event) => changeSort(event.target.value as SortMode)}>
              <option value="manual">{t("手动排序")}</option><option value="updated">{t("最近修改")}</option><option value="created">{t("最近创建")}</option><option value="recent">{t("最近使用")}</option><option value="usage">{t("最常使用")}</option><option value="name">{t("名称 A-Z")}</option>
            </select>
          </div>
          <div data-feature-guide="prompt-ideas-filters" className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-1.5">
            <div data-feature-guide="prompt-ideas-workspace" className="flex min-w-0 flex-wrap items-center gap-1" role="tablist" aria-label={t("灵感工作区")}>
              <WorkspaceFilterButton active={workspaceFilter === "all"} count={store.entries.length} icon={<BookOpenText size={15} />} label={t("全部")} onClick={() => setWorkspaceFilter("all")} />
              <WorkspaceFilterButton active={workspaceFilter === "favorite"} count={store.entries.filter((prompt) => prompt.favorite).length} icon={<Star size={15} />} label={t("收藏")} onClick={() => setWorkspaceFilter("favorite")} />
              <WorkspaceFilterButton active={workspaceFilter === "recent"} icon={<Clock3 size={15} />} label={t("最近使用")} onClick={() => setWorkspaceFilter("recent")} />
              <WorkspaceFilterButton active={workspaceFilter === "frequent"} icon={<Zap size={15} />} label={t("最常使用")} onClick={() => setWorkspaceFilter("frequent")} />
            </div>
            <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-border min-[680px]:block" />
             <div ref={categoryMenuRef} className="relative min-w-[180px] flex-1 min-[680px]:flex-none">
                <button aria-expanded={categoryMenuOpen} aria-haspopup="menu" aria-label={t("选择灵感分类")} className="flex h-9 w-full items-center justify-between gap-2 rounded-md px-3 text-sm text-foreground hover:bg-panel" type="button" onClick={() => { setCategoryMenuOpen((open) => !open); setTagMenuOpen(false); }}><span className="min-w-0 truncate">{t("分类：")}{categoryFilter === "all" ? t("全部") : categoryMap.get(categoryFilter)?.name ?? t("全部")}</span><ChevronDown className={categoryMenuOpen ? "rotate-180 transition-transform" : "transition-transform"} size={15} /></button>
                  {categoryMenuOpen ? <div className="absolute left-0 top-[calc(100%+0.25rem)] z-50 grid max-h-64 w-64 max-w-[calc(100vw-2rem)] min-w-full gap-1 overflow-y-auto rounded-lg border border-border bg-panel p-1.5 shadow-xl" role="menu">
                  <button className="flex min-h-9 items-center gap-2 rounded-md px-2 text-left text-sm text-muted hover:bg-background hover:text-foreground" type="button" onClick={() => { setCategoryManagerOpen(true); setCategoryMenuOpen(false); }}><Settings2 size={15} />{t("分类管理")}</button>
                  <div className="my-1 h-px bg-border" />
                  <CategoryDropFilter active={categoryFilter === "all"} count={store.entries.length} icon={<span>◎</span>} label={t("全部分类")} categoryId="all" onClick={() => { setCategoryFilter("all"); setCategoryMenuOpen(false); }} />
                  {store.categories.map((category) => <CategoryDropFilter active={categoryFilter === category.id} count={counts.get(category.id)} icon={<span>{category.icon ?? "#"}</span>} key={category.id} label={category.name} categoryId={category.id} onClick={() => { setCategoryFilter(category.id); setCategoryMenuOpen(false); }} />)}
                 </div> : null}
              </div>
              <div ref={tagMenuRef} className="relative min-w-[180px] flex-1 min-[680px]:flex-none">
                <button aria-expanded={tagMenuOpen} aria-haspopup="menu" aria-label={t("选择灵感标签")} className="flex h-9 w-full items-center justify-between gap-2 rounded-md px-3 text-sm text-foreground hover:bg-panel" type="button" onClick={() => { setTagMenuOpen((open) => !open); setCategoryMenuOpen(false); }}><span className="flex min-w-0 items-center gap-1.5 truncate"><Tags size={15} />{t("标签：")}{tagFilter || t("全部")}</span><ChevronDown className={tagMenuOpen ? "rotate-180 transition-transform" : "transition-transform"} size={15} /></button>
                {tagMenuOpen ? <div className="absolute left-0 top-[calc(100%+0.25rem)] z-50 grid max-h-64 min-w-full gap-1 overflow-y-auto rounded-lg border border-border bg-panel p-1.5 shadow-xl" role="menu">
                  <button className="flex min-h-9 items-center gap-2 rounded-md px-2 text-left text-sm text-muted hover:bg-background hover:text-foreground" type="button" onClick={() => { setTagManagerOpen(true); setTagMenuOpen(false); }}><Settings2 size={15} />{t("标签管理")}</button>
                  <div className="my-1 h-px bg-border" />
                  <TagFilterItem active={!tagFilter} count={store.entries.length} label={t("全部标签")} onClick={() => { setTagFilter(""); setTagMenuOpen(false); }} />
                  {tags.map((tag) => <TagFilterItem active={tagFilter === tag} count={tagCounts.get(tag)} key={tag} label={tag} onClick={() => { setTagFilter(tag); setTagMenuOpen(false); }} />)}
                  {!tags.length ? <span className="px-2 py-2 text-xs text-muted">{t("还没有标签")}</span> : null}
                </div> : null}
              </div>
           </div>
        </header>

        {selectedIds.size ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary-soft px-4 py-2.5 text-sm">
            <strong>{t("已选择 {count} 项", { count: selectedIds.size })}</strong>
            <Button className="min-h-8 px-2 py-1 text-xs" icon={<CheckCheck size={14} />} onClick={() => setSelectedIds(new Set(visibleIds))}>{t("全选结果")}</Button>
            <Button className="min-h-8 px-2 py-1 text-xs" icon={<XSquare size={14} />} onClick={() => setSelectedIds((current) => invertVisibleSelection(current, visibleIds))}>{t("反选结果")}</Button>
            <Button className="min-h-8 px-2 py-1 text-xs" onClick={() => setSelectedIds(new Set())}>{t("清除")}</Button>
            <Button className="ml-auto min-h-8 px-2 py-1 text-xs" icon={<Trash2 size={14} />} variant="danger" onClick={() => setDeleteIds([...selectedIds])}>{t("删除")}</Button>
          </div>
        ) : null}

        {store.error ? <div className="flex items-center justify-between border-b border-danger/40 bg-danger-soft px-4 py-2 text-sm text-danger"><span>{t(store.error)}</span><button type="button" onClick={store.clearError}>{t("关闭")}</button></div> : null}
        {exchangeMessage ? <div className="flex items-center justify-between border-b border-primary/30 bg-primary-soft px-4 py-2 text-sm text-foreground"><span>{exchangeMessage}</span><button aria-label={t("关闭提示")} type="button" onClick={() => setExchangeMessage(null)}>{t("关闭")}</button></div> : null}
        <div data-feature-guide="prompt-ideas-results" className="min-h-0 flex-1 overflow-y-auto p-4">
          {store.isLoading ? <Empty text={t("正在读取灵感创作…")} /> : visiblePrompts.length === 0 ? <Empty text={store.entries.length ? t("没有符合条件的灵感。") : t("还没有灵感。")} /> : view === "grid" ? (
            <SortableContext items={visibleIds} strategy={rectSortingStrategy}>
              <PromptMasonryGrid
                categoryMap={categoryMap}
                entries={visiblePrompts}
                selectedIds={selectedIds}
                selectionMode={selectedIds.size > 0}
                onCopy={(entry) => void store.copyPrompt({ id: entry.id })}
                onAddToTodo={(entry) => openTodoManager(entry)}
                onDelete={(entry) => setDeleteIds([entry.id])}
                onEdit={(entry) => { setDetailId(null); setEditorEntry(entry); }}
                onOpen={(entry) => setDetailId(entry.id)}
                onResize={(entry, size) => store.updatePrompt({ id: entry.id, cardWidth: size.width, cardHeight: size.height })}
                onSelect={toggleSelection}
                onToggleFavorite={(entry) => void store.setFavorite(entry.id, !entry.favorite)}
                onGithubReadmeCollapsed={(entry, collapsed) => toggleGithubReadme(entry, collapsed)}
              />
            </SortableContext>
          ) : (
            <div className="grid gap-1">
              {visiblePrompts.map((entry) => (
                <div className={`grid min-h-16 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-3 py-2 ${selectedIds.has(entry.id) ? "border-primary bg-primary-soft" : "border-border bg-panel"}`} key={entry.id}>
                  <button aria-label={t("选择灵感")} className="flex size-7 items-center justify-center" type="button" onClick={() => toggleSelection(entry.id)}>{selectedIds.has(entry.id) ? <CheckCheck size={17} /> : <span className="size-3 rounded-sm border border-muted" />}</button>
                  <button className="min-w-0 text-left" type="button" onClick={() => setDetailId(entry.id)}><strong className="block truncate text-sm">{entry.title}</strong><span className="mt-1 block truncate text-xs text-muted">{[entry.categoryId ? categoryMap.get(entry.categoryId)?.name : "", ...entry.tagIds].filter(Boolean).join(" · ") || t("未分类")}</span></button>
                  <div className="flex items-center gap-2"><span className="hidden text-xs text-muted min-[720px]:inline">{t("{count} 次", { count: entry.usageCount })}</span><button aria-label={entry.type === "github-project" ? t("复制") : t("复制灵感")} className="flex size-8 items-center justify-center rounded-lg hover:bg-primary-soft" title={entry.type === "github-project" ? t("复制") : t("复制灵感")} type="button" onClick={() => void store.copyPrompt({ id: entry.id })}><Copy size={15} /></button></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {detail ? <PromptDetailDialog categories={store.categories} entry={detail} isBusy={store.isSaving} tagSuggestions={tags} hasPrevious={visibleIds.indexOf(detail.id) > 0} hasNext={visibleIds.indexOf(detail.id) >= 0 && visibleIds.indexOf(detail.id) < visibleIds.length - 1} onClose={() => setDetailId(null)} onCopy={(values) => void store.copyPrompt({ id: detail.id, values })} onDelete={() => setDeleteIds([detail.id])} onDuplicate={() => void store.duplicatePrompt(detail.id)} onEdit={() => { setDetailId(null); setEditorEntry(detail); }} onMove={(categoryId) => void store.moveToCategory([detail.id], categoryId || undefined)} onPrevious={() => setDetailId(visibleIds[visibleIds.indexOf(detail.id) - 1] ?? detail.id)} onNext={() => setDetailId(visibleIds[visibleIds.indexOf(detail.id) + 1] ?? detail.id)} onToggleFavorite={() => void store.setFavorite(detail.id, !detail.favorite)} onToggleMasked={() => void store.updatePrompt({ id: detail.id, masked: !detail.masked })} onUpdateTags={(tagIds) => store.updatePrompt({ id: detail.id, tagIds })} onGithubReadmeCollapsed={(collapsed) => toggleGithubReadme(detail, collapsed)} onGithubProjectRefresh={(project) => store.updatePrompt({ id: detail.id, github: project })} /> : null}

      {editorEntry !== undefined ? editorEntry ? <PromptEditor categories={store.categories} entry={editorEntry} isBusy={store.isSaving} tagSuggestions={tags} onClose={() => setEditorEntry(undefined)} onSave={saveEditor} /> : <PromptCreateDialog categories={store.categories} isBusy={store.isSaving} tagSuggestions={tags} onClose={() => setEditorEntry(undefined)} onCreate={(input: PromptCreateInput) => store.createPromptEntry(input)} onUpdate={(input) => store.updatePrompt(input as PromptUpdate)} /> : null}
      {pasteText !== null ? <PasteImportDialog initialText={pasteText} isBusy={store.isSaving} onClose={() => setPasteText(null)} onCreate={store.createPrompts} /> : null}
      {categoryManagerOpen ? <CategoryManagerDialog categories={store.categories} counts={counts} isBusy={store.isSaving} onClose={() => setCategoryManagerOpen(false)} onCreate={(name, icon) => store.createCategory({ name, icon })} onDelete={store.deleteCategory} onReorder={store.reorderCategories} onUpdate={(id, name, icon) => store.updateCategory({ id, name, icon })} /> : null}
      {tagManagerOpen ? <TagManagerDialog counts={tagCounts} isBusy={store.isSaving} tags={tags} onClose={() => setTagManagerOpen(false)} onDelete={deleteTag} onRename={renameTag} /> : null}
      {todoManagerOpen ? <TodoManagerDialog tasks={todo.tasks} projects={todo.projects} promptEntries={store.entries} initialPrompt={todoPrompt} isBusy={todo.isSaving} onClose={() => { setTodoManagerOpen(false); setTodoPrompt(null); }} onCreateTask={todo.createTask} onUpdateTask={todo.updateTask} onDeleteTask={todo.deleteTask} onArchiveTask={(id) => todo.updateTask(id, { archived: true })} onCompleteTask={todo.completeTask} onBatchUpdateTasks={todo.batchUpdateTasks} onBatchDeleteTasks={todo.batchDeleteTasks} onCreateProject={todo.createProject} onUpdateProject={todo.updateProject} onDeleteProject={todo.deleteProject} /> : null}
      <ConfirmDialog description={t("将永久删除 {count} 条灵感，此操作无法撤销。", { count: deleteIds.length })} icon={<Trash2 size={18} />} isBusy={store.isSaving} open={deleteIds.length > 0} title={t("删除灵感？")} onCancel={() => setDeleteIds([])} onConfirm={() => void confirmDelete()} />
    </section>
    </DndContext>
  );
}

type PromptMasonryGridProps = {
  categoryMap: ReadonlyMap<string, PromptCategory>;
  entries: readonly PromptEntry[];
  selectedIds: ReadonlySet<string>;
  selectionMode: boolean;
  onCopy: (entry: PromptEntry) => void;
  onAddToTodo: (entry: PromptEntry) => void;
  onDelete: (entry: PromptEntry) => void;
  onEdit: (entry: PromptEntry) => void;
  onOpen: (entry: PromptEntry) => void;
  onResize: (entry: PromptEntry, size: { width: number; height: number }) => void | Promise<boolean>;
  onSelect: (id: string) => void;
  onToggleFavorite: (entry: PromptEntry) => void;
  onGithubReadmeCollapsed: (entry: PromptEntry, collapsed: boolean) => void | Promise<boolean>;
};

function PromptMasonryGrid({
  categoryMap,
  entries,
  onCopy,
  onAddToTodo,
  onDelete,
  onEdit,
  onOpen,
  onResize,
  onSelect,
  onToggleFavorite,
  onGithubReadmeCollapsed,
  selectedIds,
  selectionMode,
}: PromptMasonryGridProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [liveSizes, setLiveSizes] = useState<Record<string, { width: number; height: number }>>({});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateWidth = () => {
      setContainerWidth((current) => {
        const next = Math.round(container.clientWidth);
        return current === next ? current : next;
      });
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setLiveSizes((current) => {
      let changed = false;
      const next = { ...current };
      for (const [id, size] of Object.entries(current)) {
        const entry = entries.find((item) => item.id === id);
        if (!entry) {
          delete next[id];
          changed = true;
          continue;
        }
        const persistedWidth = clampPromptCardWidth(entry.cardWidth ?? PROMPT_CARD_DEFAULT_WIDTH);
        const persistedHeight = clampPromptCardHeight(entry.cardHeight ?? PROMPT_CARD_DEFAULT_HEIGHT);
        if (persistedWidth === size.width && persistedHeight === size.height) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [entries]);

  const layoutEntries = useMemo(
    () => entries.map((entry) => {
      const liveSize = liveSizes[entry.id];
      return liveSize ? { ...entry, cardWidth: liveSize.width, cardHeight: liveSize.height } : entry;
    }),
    [entries, liveSizes],
  );

  const columns = useMemo(
    () => distributePromptMasonryItems(layoutEntries, containerWidth),
    [containerWidth, layoutEntries],
  );

  return (
    <div
      ref={containerRef}
      className="grid min-w-0 items-start justify-between gap-3"
      style={{
        gridTemplateColumns: columns.map((column) => `${column.width}px`).join(" "),
      }}
    >
      {columns.map((column, columnIndex) => (
        <div
          className="grid min-w-0 content-start gap-3"
          key={`prompt-masonry-column-${columnIndex}`}
          style={{ width: `${column.width}px` }}
        >
          {column.items.map((entry) => (
            <DraggablePromptCard
              category={entry.categoryId ? categoryMap.get(entry.categoryId) : undefined}
              entry={entry}
              key={entry.id}
              selected={selectedIds.has(entry.id)}
              selectionMode={selectionMode}
              onCopy={() => onCopy(entry)}
              onAddToTodo={() => onAddToTodo(entry)}
              onDelete={() => onDelete(entry)}
              onEdit={() => onEdit(entry)}
              onOpen={() => onOpen(entry)}
              onResize={(size) => onResize(entry, size)}
              onSizeChange={(size) => setLiveSizes((current) => ({ ...current, [entry.id]: size }))}
              onSelect={() => onSelect(entry.id)}
              onToggleFavorite={() => onToggleFavorite(entry)}
              onGithubReadmeCollapsed={(collapsed) => onGithubReadmeCollapsed(entry, collapsed)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function WorkspaceFilterButton({ active, count, icon, label, onClick }: { active: boolean; count?: number; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button aria-selected={active} className={`flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs ${active ? "bg-panel font-medium text-foreground shadow-sm" : "text-muted hover:bg-panel/70 hover:text-foreground"}`} role="tab" type="button" onClick={onClick}><span className="flex size-4 shrink-0 items-center justify-center">{icon}</span><span>{label}</span>{count !== undefined ? <span className="text-[11px] text-muted">{count}</span> : null}</button>;
}

  function CategoryDropFilter(props: { active: boolean; count?: number; icon: React.ReactNode; label: string; categoryId: string; onClick: () => void }) { const drop = useDroppable({ id: `prompt-category-drop:${props.categoryId}`, disabled: props.categoryId === "all" }); return <div ref={drop.setNodeRef} className={drop.isOver ? "rounded-md bg-primary-soft ring-2 ring-primary/40" : ""}><button aria-label={props.label} className={`flex min-h-9 w-full min-w-0 items-start gap-2 rounded-md px-2 py-1 text-left text-sm ${props.active ? "bg-primary-soft font-medium text-foreground" : "text-muted hover:bg-background hover:text-foreground"}`} title={props.label} type="button" onClick={props.onClick}><span className="flex size-5 shrink-0 items-center justify-center">{props.icon}</span><span className="min-w-0 flex-1 whitespace-normal break-words leading-5">{props.label}</span>{props.count !== undefined ? <span className="shrink-0 pt-0.5 text-xs">{props.count}</span> : null}</button></div>; }

function TagFilterItem({ active, count, label, onClick }: { active: boolean; count?: number; label: string; onClick: () => void }) {
  return <button aria-label={label} aria-checked={active} className={`flex min-h-9 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm ${active ? "bg-primary-soft font-medium text-foreground" : "text-muted hover:bg-background hover:text-foreground"}`} role="menuitemradio" title={label} type="button" onClick={onClick}><span className="flex size-5 shrink-0 items-center justify-center"><Tag size={15} /></span><span className="min-w-0 flex-1 truncate">{label}</span>{count !== undefined ? <span className="text-xs">{count}</span> : null}</button>;
}

function IconButton({ active, children, label, onClick }: { active: boolean; children: React.ReactNode; label: string; onClick: () => void }) {
  return <button aria-label={label} className={`flex size-8 items-center justify-center rounded-md ${active ? "bg-panel text-foreground shadow-sm" : "text-muted"}`} title={label} type="button" onClick={onClick}>{children}</button>;
}

function Empty({ text }: { text: string }) { return <div className="flex min-h-64 items-center justify-center text-sm text-muted">{text}</div>; }
function getFilterTitle(workspaceFilter: WorkspaceFilter, categoryFilter: string, tagFilter: string, categories: Map<string, { name: string }>, translate: (text: string) => string): string { const workspace = workspaceFilter === "favorite" ? translate("收藏") : workspaceFilter === "recent" ? translate("最近使用") : workspaceFilter === "frequent" ? translate("最常使用") : translate("全部灵感"); const parts = [workspace]; if (categoryFilter !== "all") parts.push(categories.get(categoryFilter)?.name ?? translate("全部")); if (tagFilter) parts.push(`${translate("标签：")}${tagFilter}`); return parts.join(" · "); }
function isEditable(target: EventTarget | null): boolean { return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)); }
function mapPersistedSort(value: "manual" | "updated" | "created" | "lastUsed" | "usageCount" | "name"): SortMode { return value === "lastUsed" ? "recent" : value === "usageCount" ? "usage" : value; }
function mapUiSort(value: SortMode): "manual" | "updated" | "created" | "lastUsed" | "usageCount" | "name" { return value === "recent" ? "lastUsed" : value === "usage" ? "usageCount" : value; }
