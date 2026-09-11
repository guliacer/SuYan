import { useMemo, useState } from "react";
import { CopyCheck, ImageIcon, LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmBubble } from "@/components/ui/ConfirmBubble";
import { formatBytes } from "./BatchProgressBar";
import type { DeduplicateGroup, DeduplicateResult } from "@/types/suyanApi";
import type { PromptCardData } from "../../utils/promptFilters";
import { NsfwImage } from "../NsfwImage";
import { useLibraryStore } from "../../store/useLibraryStore";
import { useLocale } from "@/components/LocaleProvider";

type DeduplicatePanelProps = {
  items: PromptCardData[];
  blurNsfwImages: boolean;
  onDelete: (itemIds: string[]) => Promise<void>;
};

type ScanStatus = "idle" | "scanning" | "results" | "error";

export function DeduplicatePanel({ items, blurNsfwImages, onDelete }: DeduplicatePanelProps) {
  const { t } = useLocale();
  const deduplicateScan = useLibraryStore((s) => s.deduplicateScan);
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [result, setResult] = useState<DeduplicateResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [keepSelections, setKeepSelections] = useState<Record<string, string>>({});
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const itemById = useMemo(() => {
    const map = new Map<string, PromptCardData>();
    for (const item of items) {
      map.set(item.id, item);
    }
    return map;
  }, [items]);

  const pendingDeleteCount = useMemo(() => {
    if (!result) return 0;
    let count = 0;
    for (const group of result.groups) {
      const keepId = keepSelections[group.hash];
      for (const item of group.items) {
        if (item.itemId !== keepId) count += 1;
      }
    }
    return count;
  }, [result, keepSelections]);

  async function handleScan() {
    setStatus("scanning");
    setErrorMessage("");
    setResult(null);
    setKeepSelections({});
    const data = await deduplicateScan();
    if (data) {
      setResult(data);
      const initial: Record<string, string> = {};
      for (const group of data.groups) {
        const largest = [...group.items].sort((a, b) => b.fileSize - a.fileSize)[0];
        if (largest) initial[group.hash] = largest.itemId;
      }
      setKeepSelections(initial);
      setStatus("results");
    } else {
      setErrorMessage(t("去重扫描失败，请重试。"));
      setStatus("error");
    }
  }

  async function handleDelete() {
    if (!result) return;
    setIsDeleteConfirmOpen(false);
    setIsDeleting(true);
    try {
      const idsToDelete: string[] = [];
      for (const group of result.groups) {
        const keepId = keepSelections[group.hash];
        for (const item of group.items) {
          if (item.itemId !== keepId) idsToDelete.push(item.itemId);
        }
      }
      if (idsToDelete.length > 0) {
        await onDelete(idsToDelete);
      }
      setStatus("idle");
      setResult(null);
      setKeepSelections({});
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("删除重复项失败，请重试。"));
      setStatus("error");
    } finally {
      setIsDeleting(false);
    }
  }

  if (status === "idle" || status === "error") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button icon={<CopyCheck size={16} />} variant="primary" onClick={() => void handleScan()}>
            {t("开始扫描")}
          </Button>
          {null}
        </div>
        {status === "error" ? <p className="text-sm text-danger">{errorMessage}</p> : null}
      </div>
    );
  }

  if (status === "scanning") {
    return (
      <div className="flex items-center gap-3 text-sm text-muted">
        <LoaderCircle className="size-4 animate-spin" />
        {t("正在扫描重复文件…")}
      </div>
    );
  }

  if (!result) return null;

  if (result.groups.length === 0) {
    return (
      <div className="flex items-center gap-3 text-sm text-muted">
        <CopyCheck className="size-4 text-primary" />
        {t("未发现重复图片，素材库很干净。")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid max-h-[40vh] gap-3 overflow-y-auto pr-1">
        {result.groups.map((group, index) => (
          <DeduplicateGroupCard
            blurNsfwImages={blurNsfwImages}
            group={group}
            index={index}
            itemById={itemById}
            keepSelections={keepSelections}
            key={group.hash}
            onSelectKeep={(itemId) =>
              setKeepSelections((current) => ({ ...current, [group.hash]: itemId }))
            }
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/70 bg-panel px-4 py-3">
        <p className="text-sm text-muted">
          {t("共 {groups} 组重复，浪费 {bytes} 空间", { groups: result.groups.length, bytes: formatBytes(result.wastedBytes) })}
        </p>
        <div className="relative">
          <Button
            className="min-h-8 px-2.5 py-1.5 text-xs"
            disabled={pendingDeleteCount === 0 || isDeleting}
            icon={<Trash2 size={14} />}
            variant="danger"
            onClick={() => setIsDeleteConfirmOpen(true)}
          >
            {t("删除重复项（{count}）", { count: pendingDeleteCount })}
          </Button>
          {isDeleteConfirmOpen ? (
            <ConfirmBubble
              className="right-0 top-full mt-3"
              confirmLabel={t("确认删除")}
              description={t("将删除 {count} 个重复文件，保留所选项，无法撤销。", { count: pendingDeleteCount })}
              icon={<Trash2 size={15} />}
              isBusy={isDeleting}
              placement="below"
              title={t("删除重复项？")}
              onCancel={() => setIsDeleteConfirmOpen(false)}
              onConfirm={() => void handleDelete()}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

type DeduplicateGroupCardProps = {
  group: DeduplicateGroup;
  index: number;
  itemById: Map<string, PromptCardData>;
  blurNsfwImages: boolean;
  keepSelections: Record<string, string>;
  onSelectKeep: (itemId: string) => void;
};

function DeduplicateGroupCard({
  group,
  index,
  itemById,
  blurNsfwImages,
  keepSelections,
  onSelectKeep,
}: DeduplicateGroupCardProps) {
  const { t } = useLocale();
  const keepId = keepSelections[group.hash];
  const shortHash = group.hash.length > 8 ? `${group.hash.slice(0, 8)}…` : group.hash;

  return (
    <div className="rounded-md border border-border/70 bg-panel p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-semibold text-foreground">{t("第 {index} 组", { index: index + 1 })}</span>
        <span>{t("哈希")} {shortHash}</span>
        <span>· {t("{count} files", { count: group.items.length })}</span>
      </div>
      <div className="grid gap-2">
        {group.items.map((entry) => {
          const matched = itemById.get(entry.itemId);
          const isKept = entry.itemId === keepId;
          return (
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-md border px-2 py-2 transition-colors ${
                isKept
                  ? "border-primary bg-primary-soft"
                  : "border-border/70 bg-background hover:bg-primary-soft"
              }`}
              key={entry.itemId}
            >
              <input
                checked={isKept}
                className="size-4 cursor-pointer accent-primary"
                name={`deduplicate-group-${group.hash}`}
                type="radio"
                onChange={() => onSelectKeep(entry.itemId)}
              />
              <div className="size-12 shrink-0 overflow-hidden rounded-md border border-border/70 bg-background">
                {matched ? (
                  <NsfwImage
                    alt={entry.title || t("提示词图像")}
                    blurNsfwImages={blurNsfwImages}
                    className="h-full w-full"
                    image={matched}
                    imageClassName="h-full w-full object-cover"
                    showRevealControl={false}
                    source="thumbnail"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted">
                    <ImageIcon size={20} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{entry.title || t("未命名提示词")}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {formatBytes(entry.fileSize)} · {formatDate(entry.createdAt)}
                </p>
              </div>
              {isKept ? (
                <span className="rounded-md border border-primary bg-primary-soft px-2 py-0.5 text-xs font-medium text-foreground">
                  {t("保留")}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
