import { memo, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ChevronDown, Copy, Download, Eye, FolderOpen, Heart, Info, Layers, PanelRightOpen, Pencil, Star, X } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import type { LibraryItem, LibraryRoot } from "../types/library";
import { getDirectoryItemFileName } from "../utils/libraryDirectory";
import { getLibraryItemSourcePath } from "../utils/libraryImportSource";
import { getMediaFileExtension, isVideoMediaFile } from "../utils/mediaFileTypes";
import { toPromptCardData, type PromptCardData } from "../utils/promptFilters";
import { NsfwImage } from "./NsfwImage";
import { LibraryColorPalette } from "./LibraryColorPalette";
import { loadImagePalette } from "./LibraryAssetPaletteStrip";
export type LibraryAssetInfoProps = { item: LibraryItem; root?: LibraryRoot; directoryName?: string; directoryColor?: string; compact?: boolean; showCopyPath?: boolean; materialCount?: number; workspaceTools?: ReactNode; blur: boolean; favorite: boolean; onClose?: () => void; onExpandPrompt?: () => void; onSave: (itemId: string, patch: Partial<LibraryItem>) => Promise<boolean>; onPreview: (card: PromptCardData) => void; onCopyImage: (file: string) => void; onCopyText: (text: string, label: string) => void; onFavorite: (id: string) => void; onLocate: (item: LibraryItem) => void; onExport: (file: string) => void; onFilterTag?: (tag: string) => void };
const mediaSizeCache = new Map<string, number>();
const mediaInfoCache = new Map<string, { dimensions: string; palette: string[] }>();
const cacheKeyFor = (item: LibraryItem) => item.imageFileName + ":" + (item.mediaStorage && item.mediaStorage !== "managed" ? item.mediaStorage.mtimeMs ?? item.updatedAt : item.importSource?.mtimeMs ?? item.updatedAt);
export const LibraryAssetInfo = memo(function LibraryAssetInfo(p: LibraryAssetInfoProps) {
  const { t } = useLocale(); const item = p.item; const storage = item.mediaStorage; const source = item.importSource;
  const [title, setTitle] = useState(item.title); const [notes, setNotes] = useState(item.notes || ""); const [link, setLink] = useState(item.sourceUrl || ""); const [tagInput, setTagInput] = useState(""); const [isMetadataEditorOpen, setIsMetadataEditorOpen] = useState(false); const [error, setError] = useState(""); const [dimensions, setDimensions] = useState(""); const [palette, setPalette] = useState<string[]>([]); const [paletteStatus, setPaletteStatus] = useState<"loading" | "ready" | "empty">("loading");
  const knownSize = storage && storage !== "managed" ? storage.size : source?.size;
  const [size, setSize] = useState<number | null>(knownSize ?? mediaSizeCache.get(item.imageFileName) ?? null); const idRef = useRef(item.id); idRef.current = item.id; const paletteRequestRef = useRef(0);
  useEffect(() => { setTitle(item.title); }, [item.id, item.title]);
  useEffect(() => { setNotes(item.notes || ""); }, [item.id, item.notes]);
  useEffect(() => { setLink(item.sourceUrl || ""); }, [item.id, item.sourceUrl]);
  useEffect(() => { setIsMetadataEditorOpen(false); }, [item.id]);
  useEffect(() => { const requestId = ++paletteRequestRef.current; return () => { if (paletteRequestRef.current === requestId) paletteRequestRef.current += 1; }; }, [item.id, item.imageFileName]);
  useEffect(() => { setTagInput(""); setError(""); setDimensions(mediaInfoCache.get(cacheKeyFor(item))?.dimensions ?? ""); const cachedPalette = mediaInfoCache.get(cacheKeyFor(item))?.palette ?? []; setPalette(cachedPalette); setPaletteStatus(cachedPalette.length ? "ready" : "loading"); setSize(knownSize ?? mediaSizeCache.get(item.imageFileName) ?? null); if (knownSize != null || mediaSizeCache.has(item.imageFileName)) return;
    let canceled = false; void window.suyanApi.getImageFileSize(item.imageFileName).then(result => { if (result.ok) { mediaSizeCache.set(item.imageFileName, result.data.size); if (!canceled) setSize(result.data.size); } }).catch(() => {}); return () => { canceled = true; }; }, [item.id, item.imageFileName, knownSize]);
  const save = async (patch: Partial<LibraryItem>) => { const id = item.id; setError(""); try { const ok = await p.onSave(id, patch); if (!ok && idRef.current === id) setError(t("素材信息保存失败，请重试。")); return ok; } catch { if (idRef.current === id) setError(t("素材信息保存失败，请重试。")); return false; } };
  const addTags = async (event?: FormEvent) => { event?.preventDefault(); const tags = tagInput.split(/[,，;；\n]/).map(tag => tag.trim()).filter(Boolean); if (!tags.length) return; if (await save({ tags: [...new Set([...item.tags, ...tags])] })) setTagInput(""); };
  const sourcePath = getLibraryItemSourcePath(item, p.root, t("软件素材库"));
  const date = (value: string | number | null | undefined) => value == null ? "—" : new Date(value).toLocaleString();
  const video = isVideoMediaFile(item.imageFileName); const fileName = getDirectoryItemFileName(item); const format = getMediaFileExtension(fileName).slice(1).toUpperCase(); const folder = p.directoryName || (storage && storage !== "managed" ? storage.relativePath.replace(/[/\\][^/\\]+$/, "") || p.root?.label : source?.relativePath.replace(/[/\\][^/\\]+$/, "") || source?.rootName) || t("未归类");
  useEffect(() => {
    if (video) { setPalette([]); setPaletteStatus("empty"); return; }
    const key = cacheKeyFor(item);
    const cached = mediaInfoCache.get(key);
    if (cached?.palette.length) { setPalette(cached.palette); setPaletteStatus("ready"); return; }
    let active = true; setPaletteStatus("loading");
    void loadImagePalette(item.imageFileName, () => window.suyanApi.getImagePaletteSample(item.imageFileName)).then(colors => {
      if (!active || idRef.current !== item.id) return;
      if (!colors.length) { setPaletteStatus("empty"); return; }
      const dimensions = mediaInfoCache.get(key)?.dimensions ?? "";
      if (mediaInfoCache.size >= 256) mediaInfoCache.delete(mediaInfoCache.keys().next().value!);
      mediaInfoCache.set(key, { dimensions, palette: [...colors] }); setPalette([...colors]); setPaletteStatus("ready");
    }).catch(() => { if (active) setPaletteStatus("empty"); });
    return () => { active = false; };
  }, [item.id, item.imageFileName, video]);
  const captureImageInfo = (image: HTMLImageElement) => {
    const key = cacheKeyFor(item);
    const cached = mediaInfoCache.get(key);
    const dimensions = image.naturalWidth + " × " + image.naturalHeight;
    setDimensions(dimensions);
    if (video) { setPalette([]); setPaletteStatus("empty"); return; }
    if (cached?.palette.length) { mediaInfoCache.set(key, { dimensions, palette: cached.palette }); setPalette(cached.palette); setPaletteStatus("ready"); return; }
    const requestId = ++paletteRequestRef.current;
    void loadImagePalette(item.imageFileName, () => window.suyanApi.getImagePaletteSample(item.imageFileName)).then(colors => {
      if (requestId !== paletteRequestRef.current || idRef.current !== item.id) return;
      if (!colors.length) { setPaletteStatus("empty"); return; }
      if (mediaInfoCache.size >= 256) mediaInfoCache.delete(mediaInfoCache.keys().next().value!);
      mediaInfoCache.set(key, { dimensions, palette: [...colors] }); setPalette([...colors]); setPaletteStatus("ready");
    }).catch(() => { /* Palette extraction is optional and must never block viewing. */ });
  };
  const field = "w-full min-w-0 resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-xs leading-5 text-foreground outline-none transition-colors focus:border-primary";
  return <section aria-label={t("选中素材信息")} className={"flex h-full min-h-0 min-w-0 flex-col bg-panel " + (p.compact ? "p-2.5 text-[11px]" : "p-3 text-xs")}>
    <header className="mb-2 flex shrink-0 items-center justify-between gap-2">
      <h2 className="flex min-w-0 items-center gap-1.5 font-semibold"><Info size={14} />{t("素材信息")}</h2>
      <div className="flex shrink-0 items-center gap-0.5">
        {p.onExpandPrompt ? <button aria-expanded={false} aria-label={t("展开提示词")} className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1.5 text-xs text-primary outline-none hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary/35" onClick={p.onExpandPrompt} type="button"><PanelRightOpen size={15} />{t("展开提示词")}</button> : null}
        {p.onClose ? <button aria-label={t("关闭信息")} className="rounded-md p-1 text-muted hover:bg-primary-soft" onClick={p.onClose} type="button"><X size={13} /></button> : null}
      </div>
    </header>
    <div className="shrink-0 overflow-hidden rounded-lg border border-border bg-background" onLoadCapture={event => { if (event.target instanceof HTMLImageElement && event.target.naturalWidth) captureImageInfo(event.target); }}>
      <NsfwImage alt={item.title || fileName} blurNsfwImages={p.blur} image={toPromptCardData(item)} imageClassName={(p.compact ? "max-h-24" : "max-h-36") + " w-full object-contain"} source={video ? "thumbnail" : "original"} loading="eager" placeholderClassName="min-h-20" showRevealControl={false} />
    </div>
    {palette.length ? <LibraryColorPalette colors={palette} /> : <div data-library-color-palette-placeholder className="mt-2 flex h-8 shrink-0 items-center rounded-md border border-dashed border-border bg-background px-2 text-[10px] text-muted" role="status">{paletteStatus === "empty" ? t("暂无颜色") : t("正在提取颜色…")}</div>}
    <div className="mt-3 grid min-w-0 gap-2">
      <textarea aria-label={t("素材名称")} rows={p.compact ? 3 : 2} className={field + " font-medium"} value={title} onChange={event=>setTitle(event.target.value)} onBlur={()=>{const value=title.trim();if(value&&value!==item.title)void save({title:value});else if(!value)setTitle(item.title);}} />
      <div className="flex flex-wrap gap-1">{item.tags.map(tag=><span className="inline-flex max-w-full items-center gap-1 rounded border border-border bg-background px-1.5 py-1 text-[10px]" key={tag}><button type="button" className="min-w-0 truncate text-muted hover:text-primary" onClick={()=>p.onFilterTag?.(tag)}>{tag}</button><button aria-label={t("移除标签") + " " + tag} type="button" className="text-muted hover:text-danger" onClick={()=>void save({tags:item.tags.filter(value=>value!==tag)})}><X size={10}/></button></span>)}</div>
      <button aria-controls={`asset-metadata-editor-${item.id}`} aria-expanded={isMetadataEditorOpen} aria-label={isMetadataEditorOpen ? t("收起补充信息") : t("编辑标签、备注和网址")} data-asset-metadata-toggle className="flex min-h-8 items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-left text-xs text-muted hover:bg-primary-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" type="button" onClick={() => setIsMetadataEditorOpen(isOpen => !isOpen)}>
        <Pencil size={13} /><span className="min-w-0 flex-1">{isMetadataEditorOpen ? t("收起补充信息") : t("编辑标签、备注和网址")}</span><ChevronDown className={"shrink-0 transition-transform " + (isMetadataEditorOpen ? "rotate-180" : "")} size={13} />
      </button>
      {isMetadataEditorOpen ? <div className="grid gap-2" data-asset-metadata-editor id={`asset-metadata-editor-${item.id}`}>
        <form onSubmit={event=>void addTags(event)}><input aria-label={t("添加标签")} placeholder={t("添加标签")} className={field} value={tagInput} onChange={event=>setTagInput(event.target.value)} onBlur={()=>void addTags()} /></form>
        <textarea aria-label={t("素材备注")} placeholder={t("添加备注")} rows={p.compact ? 2 : 3} className={field} value={notes} onChange={event=>setNotes(event.target.value)} onBlur={()=>{if(notes!==(item.notes||""))void save({notes});}} />
        <input aria-label={t("来源链接")} placeholder="https://" className={field} value={link} onChange={event=>setLink(event.target.value)} onBlur={()=>{const value=link.trim();if(value!==(item.sourceUrl||""))void save({sourceUrl:value||null});}} />
      </div> : null}
    </div>
    <button type="button" aria-label={t("定位目录")} className="mt-3 flex min-h-8 min-w-0 items-center gap-1.5 border-b border-border pb-2 text-left font-medium hover:text-primary" onClick={()=>p.onLocate(item)}><FolderOpen size={13} style={{ color: p.directoryColor }} /><span className="shrink-0">{t("文件夹")}</span><span className="min-w-0 truncate font-normal text-muted">{folder}</span></button>
    <h3 className="mb-2 mt-3 font-semibold">{t("素材信息")}</h3>
    <div className="mb-3 grid gap-2 text-[11px]"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-muted">{t("评分")}</span><div className="flex gap-0.5">{[1,2,3,4,5].map(star=><button type="button" key={star} aria-label={t("评分")+" "+star} aria-pressed={(item.rating||0)>=star} className="text-muted hover:text-primary" onClick={()=>void save({rating:item.rating===star?0:star})}><Star size={13} fill={(item.rating||0)>=star?"currentColor":"none"} className={(item.rating||0)>=star?"text-primary":""}/></button>)}</div></div>
      <AssetInfoRow label={t("类型")} value={format || (video?t("视频"):t("图片"))}/><AssetInfoRow label={t("尺寸")} value={dimensions || "—"}/><AssetInfoRow label={t("文件大小")} value={formatAssetBytes(size)}/><AssetInfoRow label={t("导入时间")} value={date(item.createdAt)}/><AssetInfoRow label={t("创建时间")} value={date(item.createdAt)}/><AssetInfoRow label={t("修改时间")} value={date(storage&&storage!=="managed"?storage.mtimeMs:source?.mtimeMs||item.updatedAt)}/><AssetInfoRow label={t("素材状态")} value={storage&&storage!=="managed"&&storage.status==="missing"?t("原文件缺失"):t("可用")}/>
    </div>
    {error?<p role="alert" className="mb-2 text-xs text-danger">{error}</p>:null}
    <div className="mt-auto shrink-0">
      {typeof p.materialCount === "number" ? <div data-directory-material-count className="flex min-h-6 shrink-0 items-center justify-end gap-1 pb-1 text-[11px] text-muted tabular-nums"><Layers size={13} />{t("{count} 个素材", { count: p.materialCount })}</div> : null}
      <div className="grid grid-cols-4 gap-1 border-t border-border pt-2">{[{label:p.favorite?t("取消收藏"):t("收藏"),icon:<Heart size={13}/>,action:()=>p.onFavorite(item.id)},{label:t("预览"),icon:<Eye size={13}/>,action:()=>p.onPreview(toPromptCardData(item))},{label:t("复制图片"),icon:<Copy size={13}/>,action:()=>p.onCopyImage(item.imageFileName)},{label:t("导出"),icon:<Download size={13}/>,action:()=>p.onExport(item.imageFileName)}].map(action=><button aria-label={action.label} key={action.label} type="button" className="flex min-h-8 items-center justify-center rounded-md border border-border text-muted hover:bg-primary-soft hover:text-primary" onClick={action.action}>{action.icon}</button>)}</div>
      {p.workspaceTools ? <div className="mt-2 flex min-h-7 shrink-0 items-center justify-center rounded-lg border border-border bg-background px-2 py-1">{p.workspaceTools}</div> : null}
    </div>
    {p.showCopyPath !== false ? <button type="button" className="mt-2 min-h-6 truncate text-left text-[10px] text-muted hover:text-primary" onClick={()=>p.onCopyText(sourcePath,t("原文件路径已复制"))}>{t("复制文件路径")}</button> : null}
  </section>;
});
function AssetInfoRow({label,value}:{label:string;value:string}){return <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2"><span className="text-muted">{label}</span><span className="min-w-0 break-words text-right tabular-nums">{value}</span></div>;}
export function formatAssetBytes(value:number|null|undefined):string { if(value==null)return "—";if(value<1024)return value+" B";if(value<1024*1024)return (value/1024).toFixed(1)+" KB";return(value/(1024*1024)).toFixed(1)+" MB"; }
