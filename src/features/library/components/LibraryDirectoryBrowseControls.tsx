import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, Check, FolderPlus, Grid2X2, LayoutDashboard, List, MoreHorizontal, PanelRight, RefreshCw, SlidersHorizontal, ZoomIn, ZoomOut } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import type { LibraryDirectorySettings } from "../types/library";

type Props = {
  settings: LibraryDirectorySettings;
  formats: readonly string[];
  tags: readonly string[];
  categories: readonly { value: string; label: string }[];
  isBusy: boolean;
  canScan: boolean;
  onChange: (patch: Partial<LibraryDirectorySettings>) => void;
  onReset: () => void;
  onAdd: () => void;
  onScan: () => void;
  onManage: () => void;
  onValidate: () => void;
};

export function LibraryDirectoryBrowseControls(p: Props) {
  const { t } = useLocale();
  const [open, setOpen] = useState<"sort" | "filter" | "more" | null>(null);
  const sortRef = useRef<HTMLButtonElement>(null);
  const filterRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(null), []);
  const toggle = (value: NonNullable<typeof open>) => setOpen(current => current === value ? null : value);
  const activeFilters = Boolean(p.settings.mediaFilter !== "all" || p.settings.favoriteOnly || p.settings.formatFilter || p.settings.tagFilter || p.settings.categoryFilter || p.settings.minimumRating || p.settings.availabilityFilter !== "all");
  const sortOptions = [
    ["updatedAt", t("最近更新")], ["importedAt", t("导入时间")], ["modifiedAt", t("文件修改时间")],
    ["name", t("名称")], ["imageSize", t("文件大小")], ["format", t("文件格式")], ["rating", t("评分")], ["random", t("随机")],
  ] as const;

  return <div className="flex shrink-0 items-center gap-1">
    <div data-directory-view-controls aria-label={t("素材布局")} className="flex items-center gap-0.5" role="group">
      {([
        { value: "masonry", label: t("瀑布流"), icon: <LayoutDashboard size={16} /> },
        { value: "grid", label: t("网格"), icon: <Grid2X2 size={16} /> },
        { value: "list", label: t("列表"), icon: <List size={16} /> },
      ] as const).map(mode => <ControlIcon active={p.settings.galleryMode === mode.value} aria-pressed={p.settings.galleryMode === mode.value} icon={mode.icon} key={mode.value} label={mode.label} onClick={() => p.onChange({ galleryMode: mode.value })} />)}
    </div>
    <span aria-hidden="true" className="mx-1 h-4 border-l border-border" />
    <ControlIcon data-directory-sort-control active={open === "sort"} aria-expanded={open === "sort"} aria-haspopup="menu" icon={<span className="flex items-center"><List size={14} />{p.settings.sortDirection === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />}</span>} label={t("排序方式")} ref={sortRef} onClick={() => toggle("sort")} />
    <ControlIcon data-directory-filter-control active={activeFilters || open === "filter"} aria-expanded={open === "filter"} aria-haspopup="dialog" icon={<span className="relative"><SlidersHorizontal size={16} />{activeFilters ? <span className="absolute -right-1 -top-1 size-1.5 rounded-full bg-primary" /> : null}</span>} label={t("筛选素材")} ref={filterRef} onClick={() => toggle("filter")} />
    <ControlIcon active={p.settings.showDetails} aria-pressed={p.settings.showDetails} icon={<PanelRight size={16} />} label={t("信息面板")} onClick={() => p.onChange({ showDetails: !p.settings.showDetails })} />
    <span aria-hidden="true" className="mx-1 h-4 border-l border-border" />
    <button aria-label={t("添加素材目录")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background px-2.5 text-xs font-medium text-foreground outline-none transition-colors hover:border-primary/40 hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40" disabled={p.isBusy} type="button" onClick={p.onAdd}><FolderPlus size={14} /><span>{t("添加目录")}</span></button>
    <ControlIcon active={open === "more"} aria-expanded={open === "more"} aria-haspopup="menu" icon={<MoreHorizontal size={17} />} label={t("更多目录操作")} ref={moreRef} onClick={() => toggle("more")} />
    {open ? <DirectoryControlPopover anchor={open === "sort" ? sortRef.current : open === "filter" ? filterRef.current : moreRef.current} label={t(open === "sort" ? "排序方式" : open === "filter" ? "筛选素材" : "更多目录操作")} menu={open !== "filter"} onClose={close}>
      {open === "sort" ? <>
        <p className="border-b border-border px-3 py-2.5 text-[11px] font-medium text-muted">{t("排序方式")}</p>
        <div className="grid gap-0.5 p-1">
          {sortOptions.map(([value, label]) => <button aria-checked={p.settings.sortMode === value} className="flex min-h-8 items-center gap-2 rounded-md px-2.5 text-left text-xs text-foreground hover:bg-primary-soft focus-visible:bg-primary-soft focus-visible:outline-none" key={value} role="menuitemradio" type="button" onClick={() => { p.onChange({ sortMode: value }); close(); sortRef.current?.focus(); }}><Check className={p.settings.sortMode === value ? "text-primary" : "invisible"} size={13} /><span>{label}</span></button>)}
        </div>
        <div className="flex items-center gap-1 border-t border-border p-1.5">
          {(["asc", "desc"] as const).map(direction => <button aria-checked={p.settings.sortDirection === direction} className={"flex min-h-8 flex-1 items-center justify-center gap-1 rounded-md text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-primary " + (p.settings.sortDirection === direction ? "bg-primary-soft text-primary" : "text-muted hover:bg-background")} key={direction} role="menuitemradio" type="button" onClick={() => p.onChange({ sortDirection: direction })}>{direction === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{t(direction === "asc" ? "升序" : "降序")}</button>)}
          {p.settings.sortMode === "random" ? <ControlIcon icon={<RefreshCw size={13} />} label={t("重新随机")} onClick={() => p.onChange({ randomSeed: ((p.settings.randomSeed ?? 1) % 0x7ffffffe) + 1 })} /> : null}
        </div>
      </> : open === "filter" ? <>
        <header className="flex items-center justify-between border-b border-border px-3 py-2.5"><strong className="text-xs font-medium">{t("筛选素材")}</strong><button className="rounded px-2 py-1 text-[10px] text-muted hover:bg-primary-soft hover:text-primary" type="button" onClick={p.onReset}>{t("重置筛选")}</button></header>
        <div className="grid grid-cols-2 gap-3 p-3">
          <FilterSelect label={t("素材类型")} value={p.settings.mediaFilter} options={[["all", t("全部类型")], ["image", t("图片")], ["video", t("视频")]]} onChange={value => p.onChange({ mediaFilter: value as LibraryDirectorySettings["mediaFilter"] })} />
          <FilterSelect label={t("文件格式")} value={p.settings.formatFilter} options={[["", t("全部格式")], ...p.formats.map(format => [format, format.toUpperCase()] as [string, string])]} onChange={formatFilter => p.onChange({ formatFilter })} />
          <FilterSelect label={t("标签筛选")} value={p.settings.tagFilter} options={[["", t("全部标签")], ...p.tags.map(tag => [tag, tag] as [string, string])]} onChange={tagFilter => p.onChange({ tagFilter })} />
          <FilterSelect label={t("分类筛选")} value={p.settings.categoryFilter ?? ""} options={[["", t("全部分类")], ...p.categories.map(category => [category.value, category.label] as [string, string])]} onChange={categoryFilter => p.onChange({ categoryFilter })} />
          <FilterSelect label={t("评分筛选")} value={String(p.settings.minimumRating ?? 0)} options={[["0", t("全部评分")], ...[1, 2, 3, 4, 5].map(rating => [String(rating), rating + "★ " + t("及以上")] as [string, string])]} onChange={minimumRating => p.onChange({ minimumRating: Number(minimumRating) })} />
          <FilterSelect label={t("素材状态")} value={p.settings.availabilityFilter} options={[["all", t("全部状态")], ["available", t("可用素材")], ["missing", t("缺失素材")]]} onChange={availabilityFilter => p.onChange({ availabilityFilter: availabilityFilter as LibraryDirectorySettings["availabilityFilter"] })} />
        </div>
        <label className="flex min-h-9 items-center gap-2 border-t border-border px-3 text-xs text-muted"><input className="accent-primary" type="checkbox" checked={p.settings.favoriteOnly} onChange={event => p.onChange({ favoriteOnly: event.target.checked })} />{t("只看收藏")}</label>
      </> : <div className="grid gap-0.5 p-1">
        <button aria-checked={p.settings.showInfo} className="flex min-h-9 items-center gap-2 rounded-md px-3 text-left text-xs hover:bg-primary-soft" role="menuitemcheckbox" type="button" onClick={() => p.onChange({ showInfo: !p.settings.showInfo })}><Check className={p.settings.showInfo ? "text-primary" : "invisible"} size={14} />{t("卡片信息")}</button>
        <button aria-checked={p.settings.includeDescendants} className="flex min-h-9 items-center gap-2 rounded-md px-3 text-left text-xs hover:bg-primary-soft" role="menuitemcheckbox" type="button" onClick={() => p.onChange({ includeDescendants: !p.settings.includeDescendants })}><Check className={p.settings.includeDescendants ? "text-primary" : "invisible"} size={14} />{t("包含子目录")}</button>
        <div className="my-1 border-t border-border" />
        {[{ label: t("扫描目录"), icon: <RefreshCw size={14} />, disabled: p.isBusy || !p.canScan, action: p.onScan }, { label: t("目录管理"), icon: <SlidersHorizontal size={14} />, disabled: p.isBusy, action: p.onManage }, { label: t("校验素材"), icon: <Check size={14} />, disabled: p.isBusy, action: p.onValidate }].map(action => <button className="flex min-h-9 items-center gap-2 rounded-md px-3 text-left text-xs hover:bg-primary-soft disabled:opacity-40" disabled={action.disabled} key={action.label} role="menuitem" type="button" onClick={() => { close(); action.action(); }}>{action.icon}{action.label}</button>)}
      </div>}
    </DirectoryControlPopover> : null}
  </div>;
}

export function LibraryDirectorySizeControl({ tileSize, onChange }: { tileSize: number; onChange: (tileSize: number) => void }) {
  const { t } = useLocale();
  return <div data-directory-size-control aria-label={t("素材尺寸")} className="flex shrink-0 items-center gap-1" role="group">
    <ControlIcon disabled={tileSize <= 160} icon={<ZoomOut size={13} />} label={t("缩小素材")} onClick={() => onChange(Math.max(160, tileSize - 20))} />
    <input aria-label={t("缩放素材卡片")} className="h-1 w-16 cursor-pointer accent-primary sm:w-20" max={360} min={160} step={10} type="range" value={tileSize} onChange={event => onChange(Number(event.target.value))} onDoubleClick={() => onChange(220)} title={t("双击恢复默认尺寸")} />
    <ControlIcon disabled={tileSize >= 360} icon={<ZoomIn size={13} />} label={t("放大素材")} onClick={() => onChange(Math.min(360, tileSize + 20))} />
    <span className="w-9 text-right text-[10px] tabular-nums text-muted">{tileSize}px</span>
  </div>;
}

function ControlIcon({ label, icon, active = false, ref, className = "", ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & { label: string; icon: ReactNode; active?: boolean; ref?: Ref<HTMLButtonElement> }) {
  return <button aria-label={label} className={"flex size-8 shrink-0 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/35 disabled:opacity-35 " + (active ? "bg-primary-soft text-primary" : "text-muted hover:bg-primary-soft hover:text-foreground") + " " + className} ref={ref} title={label} type="button" {...props}>{icon}</button>;
}

function FilterSelect(p: { label: string; value: string; options: readonly [string, string][]; onChange: (value: string) => void }) {
  return <label className="grid min-w-0 gap-1.5 text-[10px] text-muted"><span>{p.label}</span><select aria-label={p.label} className="h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary" value={p.value} onChange={event => p.onChange(event.target.value)}>{p.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>;
}

function DirectoryControlPopover({ anchor, label, menu, children, onClose }: { anchor: HTMLElement | null; label: string; menu: boolean; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    const panel = ref.current;
    if (!anchor || !panel) return;
    const positionPanel = () => {
      const rect = anchor.getBoundingClientRect();
      const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-titlebar-height")) || 44;
      setPosition({ left: Math.max(12, Math.min(rect.right - panel.offsetWidth, window.innerWidth - panel.offsetWidth - 12)), top: Math.max(safeTop + 8, Math.min(rect.bottom + 8, window.innerHeight - panel.offsetHeight - 12)) });
    };
    positionPanel();
    const observer = new ResizeObserver(positionPanel);
    observer.observe(panel);
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", positionPanel); window.removeEventListener("scroll", positionPanel, true); };
  }, [anchor, menu]);
  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    panel.querySelector<HTMLElement>("button:not(:disabled), select, input")?.focus();
    const outside = (event: PointerEvent) => { if (!panel.contains(event.target as Node) && !anchor?.contains(event.target as Node)) onClose(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); anchor?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key); };
  }, [anchor, onClose]);
  return createPortal(<div aria-label={label} className={"fixed z-[230] max-h-[calc(100vh-80px)] max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl border border-border bg-panel shadow-image " + (menu ? "w-48" : "w-[300px]")} ref={ref} role={menu ? "menu" : "dialog"} style={position}>{children}</div>, document.body);
}
