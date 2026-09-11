import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, CheckCheck, CheckSquare, Copy, CopyCheck, Download, Eye, FileImage, Film, ImageIcon, Search, Square, Trash2, Upload, XSquare } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { Capsule } from "@/components/ui/Capsule";
import { ConfirmBubble } from "@/components/ui/ConfirmBubble";
import { TextField } from "@/components/ui/TextField";
import { CardScrollTopButton } from "./CardScrollTopButton";
import { NsfwImage } from "./NsfwImage";
import { DeduplicatePanel } from "./batch/DeduplicatePanel";
import { ImageCompressPanel } from "./batch/ImageCompressPanel";
import { VideoCompressPanel } from "./batch/VideoCompressPanel";
import { SyncWorksDialog } from "./SyncWorksDialog";
import { useAccountStore } from "../../account/store/useAccountStore";
import { hasBuiltinModuleCapability } from "../utils/moduleRegistry";
import { useLibraryStore } from "../store/useLibraryStore";
import { prioritizeMissingMediaStatusItems } from "../utils/externalMediaStatus";
import { normalizePromptText } from "../utils/normalizePromptText";
import { groupPromptImages, type PromptImageGroup } from "../utils/promptImageGroups";
import type { PromptCardData } from "../utils/promptFilters";
import { isVideoMediaFile } from "../utils/mediaFileTypes";
import { resolvePromptTemplateText } from "../utils/promptSplit";
import { useLocale } from "@/components/LocaleProvider";

const managerPageSize = 80;
const managerShellMaxWidth = 1400;

type SortKey = "default" | "title" | "createdAt" | "updatedAt";
type SortDirection = "asc" | "desc";

const sortOptions: Array<{ key: SortKey; label: string }> = [
  { key: "default", label: "默认排序" },
  { key: "title", label: "按标题" },
  { key: "createdAt", label: "按创建时间" },
  { key: "updatedAt", label: "按更新时间" },
];

type PromptLibraryManagerActions = {
  items: PromptCardData[];
  isBusy: boolean;
  blurNsfwImages: boolean;
  onCopy: (item: PromptCardData) => void;
  onDelete: (itemIds: string[]) => Promise<void>;
  onExport: (itemIds: string[]) => Promise<void>;
  onImport: () => void;
  onOpenDetail: (itemId: string) => void;
  onRefreshLibrary?: () => Promise<void>;
};

type PromptLibraryManagerDialogProps = PromptLibraryManagerActions & {
  onClose: () => void;
};

type PromptLibraryManagerViewProps = PromptLibraryManagerActions & {
  hideScrollTopButton?: boolean;
  onClose?: () => void;
  variant?: "dialog" | "page";
};

export function PromptLibraryManagerDialog(props: PromptLibraryManagerDialogProps) {
  return (
    <AppDialog
      overlayClassName="z-30 p-4"
      panelClassName="flex max-h-full w-full max-w-[1200px] flex-col"
      titleId="prompt-library-manager-title"
      onClose={props.onClose}
    >
      <PromptLibraryManagerView {...props} variant="dialog" />
    </AppDialog>
  );
}

export function PromptLibraryManagerView({
  items,
  isBusy,
  blurNsfwImages,
  hideScrollTopButton = false,
  onClose,
  onCopy,
  onDelete,
  onExport,
  onImport,
  onOpenDetail,
  onRefreshLibrary,
  variant = "page",
}: PromptLibraryManagerViewProps) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const user = useAccountStore(state => state.user);
  const [syncOpen, setSyncOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<
    "none" | "deduplicate" | "compress-images" | "compress-videos"
  >("none");
  const deleteActionRef = useRef<HTMLDivElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(managerPageSize);
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const titleId = variant === "dialog" ? "prompt-library-manager-title" : "prompt-library-manager-page-title";
  const rootClassName =
    variant === "dialog"
      ? "flex min-h-0 flex-1 flex-col"
      : "relative flex min-h-[calc(100vh-5.5rem)] flex-col overflow-hidden rounded-lg border border-border/70 bg-panel shadow-elevated";
  const promptGroups = useMemo(
    () => groupPromptImages(prioritizeMissingMediaStatusItems(items), []),
    [items],
  );
  const moduleState = useLibraryStore((state) => state.moduleState);
  const checkVideoRuntime = useLibraryStore((state) => state.checkVideoRuntime);
  const canUseImageCompression = hasBuiltinModuleCapability("image-compression", moduleState);
  const canUseVideoCompression = hasBuiltinModuleCapability("video-compression", moduleState);
  const canUseDeduplicateScan = hasBuiltinModuleCapability("deduplicate-scan", moduleState);

  // 视频压缩按钮依赖视频依赖。持久化的 moduleState 可能过期（例如打包/重装后
  // 二进制已就位但标志仍为未装），挂载时用真实磁盘状态校正一次，避免按钮凭空消失。
  useEffect(() => {
    // 打开批量管理时强制真探测，视频压缩按钮按真实磁盘状态显示。
    void checkVideoRuntime({ force: true });
  }, [checkVideoRuntime]);

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const base = !normalizedQuery
      ? promptGroups
      : promptGroups.filter((group) =>
          group.items.some((item) => item.searchText.includes(normalizedQuery)),
        );

    if (sortKey === "default") {
      return base;
    }

    const sorted = [...base];
    const dir = sortDirection === "asc" ? 1 : -1;

    sorted.sort((a, b) => {
      const aItem = a.primaryItem;
      const bItem = b.primaryItem;

      if (sortKey === "title") {
        return (aItem.title || "").localeCompare(bItem.title || "", "zh-CN") * dir;
      }

      const aTime = sortKey === "createdAt" ? aItem.createdAt : aItem.updatedAt;
      const bTime = sortKey === "createdAt" ? bItem.createdAt : bItem.updatedAt;
      return (aTime - bTime) * dir;
    });

    return sorted;
  }, [promptGroups, query, sortKey, sortDirection]);

  const imageCompressGroups = useMemo(
    () => filteredGroups.filter((group) => group.items.some((item) => !isVideoMediaFile(item.imageFileName))),
    [filteredGroups],
  );
  const videoCompressGroups = useMemo(
    () =>
      filteredGroups.filter(
        (group) =>
          group.primaryItem.promptType === "video" ||
          group.items.some((item) => isVideoMediaFile(item.imageFileName)),
      ),
    [filteredGroups],
  );

  const selectedGroups = useMemo(
    () => promptGroups.filter((group) => selectedIds.has(group.id)),
    [promptGroups, selectedIds],
  );
  const selectedItemIds = useMemo(() => getPromptGroupItemIds(selectedGroups), [selectedGroups]);

  const selectedImageCompressGroups = useMemo(
    () => imageCompressGroups.filter((group) => selectedIds.has(group.id)),
    [imageCompressGroups, selectedIds],
  );
  const selectedImageCompressItemIds = useMemo(
    () => getPromptGroupItemIds(selectedImageCompressGroups),
    [selectedImageCompressGroups],
  );

  const selectedVideoCompressGroups = useMemo(
    () => videoCompressGroups.filter((group) => selectedIds.has(group.id)),
    [videoCompressGroups, selectedIds],
  );
  const selectedVideoCompressItemIds = useMemo(
    () => getPromptGroupItemIds(selectedVideoCompressGroups),
    [selectedVideoCompressGroups],
  );
  const activeListGroups = activePanel === "compress-images"
    ? imageCompressGroups
    : activePanel === "compress-videos"
      ? videoCompressGroups
      : filteredGroups;
  const visibleGroups = activeListGroups.slice(0, visibleCount);
  const activeListItemCount = useMemo(
    () => activeListGroups.reduce((sum, group) => sum + group.items.length, 0),
    [activeListGroups],
  );
  const activeListTagCount = useMemo(
    () =>
      new Set(
        activeListGroups.flatMap((group) => group.items.flatMap((item) => item.tags)),
      ).size,
    [activeListGroups],
  );

  useEffect(() => {
    setSelectedIds((current) => {
      const validIds = new Set(promptGroups.map((group) => group.id));
      const next = new Set(Array.from(current).filter((id) => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [promptGroups]);

  useEffect(() => {
    setVisibleCount(managerPageSize);
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [activeListGroups]);

  useEffect(() => {
    if (
      (activePanel === "compress-images" && !canUseImageCompression) ||
      (activePanel === "compress-videos" && !canUseVideoCompression) ||
      (activePanel === "deduplicate" && !canUseDeduplicateScan)
    ) {
      setActivePanel("none");
    }
  }, [activePanel, canUseImageCompression, canUseVideoCompression, canUseDeduplicateScan]);

  useEffect(() => {
    const container = listScrollRef.current;

    if (!container || visibleCount >= activeListGroups.length) {
      return;
    }

    const scrollElement = container;
    let animationFrame = 0;

    function handleScroll() {
      if (animationFrame) {
        return;
      }

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        const distanceToBottom = scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight;

        if (distanceToBottom < 520) {
          setVisibleCount((current) => Math.min(current + managerPageSize, activeListGroups.length));
        }
      });
    }

    scrollElement.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      scrollElement.removeEventListener("scroll", handleScroll);

      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [activeListGroups.length, visibleCount]);

  useEffect(() => {
    if (!isDeleteConfirmOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!deleteActionRef.current?.contains(event.target as Node)) {
        setIsDeleteConfirmOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsDeleteConfirmOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDeleteConfirmOpen]);

  function toggleGroup(groupId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }

      return next;
    });
  }

  function selectAllFiltered() {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const group of filteredGroups) {
        next.add(group.id);
      }
      return next;
    });
  }

  function invertFiltered() {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const group of filteredGroups) {
        if (next.has(group.id)) {
          next.delete(group.id);
        } else {
          next.add(group.id);
        }
      }
      return next;
    });
  }

  function selectAllImageCompress() {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const group of imageCompressGroups) {
        next.add(group.id);
      }
      return next;
    });
  }

  function invertImageCompress() {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const group of imageCompressGroups) {
        if (next.has(group.id)) {
          next.delete(group.id);
        } else {
          next.add(group.id);
        }
      }
      return next;
    });
  }

  function selectAllVideoCompress() {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const group of videoCompressGroups) {
        next.add(group.id);
      }
      return next;
    });
  }

  function invertVideoCompress() {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const group of videoCompressGroups) {
        if (next.has(group.id)) {
          next.delete(group.id);
        } else {
          next.add(group.id);
        }
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleDeleteSelected() {
    if (selectedItemIds.length === 0) {
      return;
    }

    setIsDeleteConfirmOpen(false);
    await onDelete(selectedItemIds);
    setSelectedIds(new Set());
  }

  async function handleExportSelected() {
    if (selectedItemIds.length === 0) {
      return;
    }

    await onExport(selectedItemIds);
  }

  function handleScrollToTop() {
    listScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    sectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  return (
    <section aria-labelledby={titleId} className={rootClassName} ref={sectionRef}>
        <header className="flex shrink-0 flex-col gap-3 border-b border-border/70 bg-panel px-5 py-4 min-[820px]:flex-row min-[820px]:items-center min-[820px]:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">{t("批量管理")}</p>
            <h2 className="mt-1 text-xl font-semibold" id={titleId}>
              {t("管理所有提示词")}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2" data-feature-guide="prompt-library-actions">
            <Button className="min-h-8 px-2.5 py-1.5 text-xs" disabled={!user || isBusy || selectedItemIds.length === 0} onClick={() => setSyncOpen(true)} title={user ? t("将所选提示词关联到当前账户") : t("请先登录账户")}>{t("同步作品")}</Button>
            <Button className="min-h-8 px-2.5 py-1.5 text-xs" disabled={!user || isBusy} onClick={() => setSelectedIds(new Set(filteredGroups.filter(group => group.items.every(item => !item.accountOwnerUid && (!item.author || item.author === "本地导入") && !item.sourceUrl && !item.authorUrl && !item.authorAvatarUrl)).map(group => group.id)))}>{t("仅选未关联作品")}</Button>
            {syncOpen ? <SyncWorksDialog itemIds={selectedItemIds} onClose={() => setSyncOpen(false)} /> : null}
            <Button className="min-h-8 px-2.5 py-1.5 text-xs" title={t("导出所选提示词组及对应的分类、标签库（含分组与封面）")} disabled={selectedGroups.length === 0 || isBusy} icon={<Download size={14} />} onClick={handleExportSelected}>
              {t("导出所选")}
            </Button>
            <Button className="min-h-8 px-2.5 py-1.5 text-xs" disabled={isBusy} icon={<Upload size={14} />} onClick={onImport}>
              {t("导入")}
            </Button>
            <div className="relative" ref={deleteActionRef}>
              <Button
                className="min-h-8 px-2.5 py-1.5 text-xs"
                disabled={selectedGroups.length === 0 || isBusy}
                icon={<Trash2 size={14} />}
                variant="danger"
                onClick={() => setIsDeleteConfirmOpen(true)}
              >
                {t("删除所选")}
              </Button>
              {isDeleteConfirmOpen ? (
                <ConfirmBubble
                  className="right-0 top-full mt-3"
                  confirmLabel={t("确认删除")}
                  description={t("将删除 {groups} 组提示词和 {images} 张图，无法撤销。", { groups: selectedGroups.length, images: selectedItemIds.length })}
                  icon={<Trash2 size={15} />}
                  isBusy={isBusy}
                  placement="below"
                  title={t("删除所选提示词？")}
                  onCancel={() => setIsDeleteConfirmOpen(false)}
                  onConfirm={() => void handleDeleteSelected()}
                />
              ) : null}
            </div>
            <div className="mx-1 h-6 w-px bg-border/70" />
            {canUseDeduplicateScan ? (
              <Button
                className="min-h-8 px-2.5 py-1.5 text-xs"
                variant={activePanel === "deduplicate" ? "primary" : "secondary"}
                icon={<CopyCheck size={14} />}
                onClick={() => setActivePanel(activePanel === "deduplicate" ? "none" : "deduplicate")}
              >
                {t("去重检测")}
              </Button>
            ) : null}
            {canUseImageCompression ? (
              <Button
                className="min-h-8 px-2.5 py-1.5 text-xs"
                variant={activePanel === "compress-images" ? "primary" : "secondary"}
                icon={<FileImage size={14} />}
                onClick={() =>
                  setActivePanel(activePanel === "compress-images" ? "none" : "compress-images")
                }
              >
                {t("图像压缩")}
              </Button>
            ) : null}
            {canUseVideoCompression ? (
              <Button
                className="min-h-8 px-2.5 py-1.5 text-xs"
                variant={activePanel === "compress-videos" ? "primary" : "secondary"}
                icon={<Film size={14} />}
                onClick={() =>
                  setActivePanel(activePanel === "compress-videos" ? "none" : "compress-videos")
                }
              >
                {t("视频压缩")}
              </Button>
            ) : null}
            {onClose ? <DialogCloseButton ariaLabel={t("关闭提示词库")} onClick={onClose} /> : null}
          </div>
        </header>

        <div className="grid gap-3 border-b border-border/70 bg-background/70 px-5 py-4 min-[980px]:grid-cols-[minmax(280px,1fr)_auto] min-[980px]:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <TextField
              aria-label={t("搜索提示词库")}
              className="pl-10"
              id="prompt-library-manager-search"
              placeholder={t("搜索标题、内容、分类或标签")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 min-[980px]:justify-end">
            <StatCard label={t("提示词总数")} value={`${promptGroups.length}`} />
            <StatCard label={t("当前结果")} value={`${activeListGroups.length}`} />
            <StatCard label={t("效果图")} value={`${activeListItemCount}`} />
            <StatCard label={t("标签数量")} value={`${activeListTagCount}`} />
          </div>
        </div>

        {activePanel !== "none" ? (
          <div className="border-b border-border/70 bg-background/70 px-5 py-4">
            {activePanel === "deduplicate" ? (
              <DeduplicatePanel
                blurNsfwImages={blurNsfwImages}
                items={items}
                onDelete={onDelete}
              />
            ) : null}
            {activePanel === "compress-images" && canUseImageCompression ? (
              <ImageCompressPanel
                selectedItemIds={selectedImageCompressItemIds}
                selectedCount={selectedImageCompressGroups.length}
                totalCount={imageCompressGroups.length}
                onSelectAll={selectAllImageCompress}
                onInvert={invertImageCompress}
                onClearSelection={clearSelection}
                onCompleted={onRefreshLibrary}
              />
            ) : null}
            {activePanel === "compress-videos" && canUseVideoCompression ? (
              <VideoCompressPanel
                selectedItemIds={selectedVideoCompressItemIds}
                selectedCount={selectedVideoCompressGroups.length}
                totalCount={videoCompressGroups.length}
                onSelectAll={selectAllVideoCompress}
                onInvert={invertVideoCompress}
                onClearSelection={clearSelection}
                onCompleted={onRefreshLibrary}
              />
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-background/70 px-5 py-2.5" data-feature-guide="prompt-library-selection">
          <div className="flex items-center gap-1.5">
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-panel px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-primary-soft hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              disabled={activeListGroups.length === 0}
              type="button"
              onClick={selectAllFiltered}
            >
              <CheckCheck size={14} />
              {t("全选")}
            </button>
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-panel px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-primary-soft hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              disabled={activeListGroups.length === 0}
              type="button"
              onClick={invertFiltered}
            >
              <CheckSquare size={14} />
              {t("反选")}
            </button>
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-panel px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-primary-soft hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              disabled={selectedIds.size === 0}
              type="button"
              onClick={clearSelection}
            >
              <XSquare size={14} />
              {t("取消")}
            </button>
          </div>

          <div className="mx-1 h-5 w-px bg-border/70" />

          <label className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span>{t("排序")}</span>
            <select
              className="rounded-lg border border-border/70 bg-panel px-2 py-1 text-xs text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
            >
              {sortOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {t(option.label)}
                </option>
              ))}
            </select>
            {sortKey !== "default" ? (
              <button
                aria-label={sortDirection === "asc" ? t("升序，点击切换为降序") : t("降序，点击切换为升序")}
                className="inline-flex size-6 items-center justify-center rounded-md border border-border/70 bg-panel text-muted transition-colors hover:bg-primary-soft hover:text-foreground"
                type="button"
                onClick={() => setSortDirection((dir) => (dir === "asc" ? "desc" : "asc"))}
              >
                {sortDirection === "asc" ? <ArrowUpAZ size={13} /> : <ArrowDownAZ size={13} />}
              </button>
            ) : null}
          </label>

          <div className="ml-auto text-xs text-muted">
            {selectedGroups.length > 0
              ? t("已选 {groups} 组 / {images} 张", { groups: selectedGroups.length, images: selectedItemIds.length })
              : t("共 {groups} 组", { groups: activeListGroups.length })}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-5 pb-16" ref={listScrollRef}>
            {activeListGroups.length === 0 ? (
              <div className="flex min-h-72 items-center justify-center rounded-lg border border-border/70 bg-background text-center">
                <div>
                  <Search className="mx-auto text-muted" size={28} />
                  <p className="mt-3 text-sm font-semibold">{t("没有匹配的提示词")}</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                {visibleGroups.map((group) => (
                  <PromptLibraryRow
                    blurNsfwImages={blurNsfwImages}
                    group={group}
                    isSelected={selectedIds.has(group.id)}
                    key={group.id}
                    onCopy={() => onCopy(group.primaryItem)}
                    onOpenDetail={() => onOpenDetail(group.primaryItem.id)}
                    onToggle={() => toggleGroup(group.id)}
                  />
                ))}
                {visibleCount < activeListGroups.length ? (
                  <div className="flex justify-center py-2">
                    <Button
                      className="min-h-8 px-2.5 py-1.5 text-xs"
                      variant="secondary"
                      onClick={() =>
                        setVisibleCount((current) => Math.min(current + managerPageSize, activeListGroups.length))
                      }
                    >
                      {t("加载更多提示词（{visible} / {total}）", { visible: Math.min(visibleCount, activeListGroups.length), total: activeListGroups.length })}
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
        {variant === "page" && !hideScrollTopButton ? (
          <CardScrollTopButton
            className="fixed bottom-[calc(1.5rem+var(--app-window-gutter))] z-50 min-[1024px]:bottom-[calc(2.5rem+var(--app-window-gutter))] min-[1440px]:bottom-[calc(3rem+var(--app-window-gutter))]"
            contentMaxWidth={managerShellMaxWidth}
            onClick={handleScrollToTop}
          />
        ) : null}
    </section>
  );
}

type StatCardProps = {
  label: string;
  value: string;
};

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border/70 bg-panel px-3 text-sm">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

type PromptLibraryRowProps = {
  group: PromptImageGroup;
  isSelected: boolean;
  blurNsfwImages: boolean;
  onCopy: () => void;
  onOpenDetail: () => void;
  onToggle: () => void;
};

function PromptLibraryRow({ blurNsfwImages, group, isSelected, onCopy, onOpenDetail, onToggle }: PromptLibraryRowProps) {
  const { t } = useLocale();
  const item = group.primaryItem;
  const promptPreview = buildPromptText(item, t);
  const visibleTags = item.tags.slice(0, 6);
  const hiddenTagCount = Math.max(0, item.tags.length - visibleTags.length);
  const imageCount = group.items.length;

  return (
    <article className="group grid gap-3 rounded-lg border border-border/70 bg-panel p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-capsule-sage-border hover:bg-background hover:shadow-elevated min-[860px]:grid-cols-[36px_88px_minmax(0,1fr)_auto] min-[860px]:items-center">
      <button
        aria-label={isSelected ? t("取消选择提示词") : t("选择提示词")}
        className="flex size-9 items-center justify-center rounded-md border border-border/70 bg-background text-muted outline-none transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
        type="button"
        onClick={onToggle}
      >
        {isSelected ? <CheckSquare size={17} /> : <Square size={17} />}
      </button>

      <div
        className={`relative size-[88px] overflow-hidden rounded-md border border-border/70 bg-background shadow-sm ${
          group.previewItems.length === 4
            ? "grid grid-cols-2 grid-rows-2"
            : "grid auto-rows-fr grid-cols-2"
        }`}
      >
        {group.previewItems.length > 0 ? (
          group.previewItems.map((previewItem, index) => (
            <NsfwImage
              alt={previewItem.title || t("提示词图像")}
              blurNsfwImages={blurNsfwImages}
              className={
                group.previewItems.length === 1
                  ? "col-span-2 row-span-2 h-full w-full"
                  : group.previewItems.length === 3 && index === 0
                    ? "col-span-2 h-full w-full"
                    : "h-full w-full"
              }
              image={previewItem}
              imageClassName="h-full w-full object-cover"
              key={previewItem.id}
              showRevealControl={false}
              source="thumbnail"
            />
          ))
        ) : (
          <div className="col-span-2 row-span-2 flex h-full w-full items-center justify-center">
            <ImageIcon className="text-muted" size={24} />
          </div>
        )}
        {imageCount > 1 ? (
          <span className="absolute bottom-1 right-1 rounded-md border border-border/70 bg-panel/95 px-1.5 py-0.5 text-[11px] font-semibold text-foreground shadow-sm">
            {t("{count} 张", { count: imageCount })}
          </span>
        ) : null}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-base font-semibold">{item.title || t("未命名提示词")}</h3>
          <Capsule tone="sage" size="md" shape="rounded">
            {item.category}
          </Capsule>
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted">{promptPreview}</p>
        <div className="mt-3 flex max-h-8 flex-wrap gap-2 overflow-hidden">
          {visibleTags.length > 0 ? (
            <>
              {visibleTags.map((tag) => (
                <Capsule tone="mist" size="md" shape="rounded" key={tag}>
                  {tag}
                </Capsule>
              ))}
              {hiddenTagCount > 0 ? (
                <Capsule tone="fog" size="md" shape="rounded">
                  +{hiddenTagCount}
                </Capsule>
              ) : null}
            </>
          ) : (
            <Capsule tone="fog" size="md" shape="rounded">{t("未分类")}</Capsule>
          )}
        </div>
      </div>

      <div className="flex gap-2 min-[860px]:justify-end">
        <Button className="min-h-8 px-2.5 py-1.5 text-xs" icon={<Eye size={14} />} onClick={onOpenDetail}>
          {t("编辑")}
        </Button>
        <Button className="min-h-8 px-2.5 py-1.5 text-xs" icon={<Copy size={14} />} variant="primary" onClick={onCopy}>
          {t("复制")}
        </Button>
      </div>
    </article>
  );
}

function getPromptGroupItemIds(groups: readonly PromptImageGroup[]): string[] {
  return Array.from(new Set(groups.flatMap((group) => group.items.map((item) => item.id))));
}

function buildPromptText(item: PromptCardData, t: (text: string) => string): string {
  const prompt = resolvePromptTemplateText(normalizePromptText(item.prompt));
  const negativePrompt = resolvePromptTemplateText(normalizePromptText(item.negativePrompt));
  const parts = [prompt, negativePrompt ? `${t("负向提示词：")}${negativePrompt}` : ""].filter(Boolean);

  return parts.join("\n") || t("暂无提示词详情。");
}
