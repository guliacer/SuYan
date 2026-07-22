import { useMemo, useState } from "react";
import { CopyCheck, ImageIcon, LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmBubble } from "@/components/ui/ConfirmBubble";
import { formatBytes } from "./BatchProgressBar";
import type { DeduplicateGroup, DeduplicateResult } from "@/types/suyanApi";
import type { PromptCardData } from "../../utils/promptFilters";
import { NsfwImage } from "../NsfwImage";
import { useLibraryStore } from "../../store/useLibraryStore";

type DeduplicatePanelProps = {
  items: PromptCardData[];
  blurNsfwImages: boolean;
  onDelete: (itemIds: string[]) => Promise<void>;
};

type ScanStatus = "idle" | "scanning" | "results" | "error";

export function DeduplicatePanel({ items, blurNsfwImages, onDelete }: DeduplicatePanelProps) {
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
      setErrorMessage("去重扫描失败，请重试。");
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
      setErrorMessage(err instanceof Error ? err.message : "删除重复项失败，请重试。");
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
            开始扫描
          </Button>
          <p className="text-sm text-muted">扫描重复图片，默认保留每组最大文件。</p>
        </div>
        {status === "error" ? <p className="text-sm text-danger">{errorMessage}</p> : null}
      </div>
    );
  }

  if (status === "scanning") {
    return (
      <div className="flex items-center gap-3 text-sm text-muted">
        <LoaderCircle className="size-4 animate-spin" />
        正在扫描重复文件…
      </div>
    );
  }

  if (!result) return null;

  if (result.groups.length === 0) {
    return (
      <div className="flex items-center gap-3 text-sm text-muted">
        <CopyCheck className="size-4 text-primary" />
        未发现重复图片，素材库很干净。
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
          共 <span className="font-semibold text-foreground">{result.groups.length}</span> 组重复，浪费{" "}
          <span className="font-semibold text-foreground">{formatBytes(result.wastedBytes)}</span> 空间
        </p>
        <div className="relative">
          <Button
            disabled={pendingDeleteCount === 0 || isDeleting}
            icon={<Trash2 size={16} />}
            variant="danger"
            onClick={() => setIsDeleteConfirmOpen(true)}
          >
            删除重复项（{pendingDeleteCount}）
          </Button>
          {isDeleteConfirmOpen ? (
            <ConfirmBubble
              className="right-0 top-full mt-3"
              confirmLabel="确认删除"
              description={`将删除 ${pendingDeleteCount} 个重复文件，保留所选项，无法撤销。`}
              icon={<Trash2 size={15} />}
              isBusy={isDeleting}
              placement="below"
              title="删除重复项？"
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
  const keepId = keepSelections[group.hash];
  const shortHash = group.hash.length > 8 ? `${group.hash.slice(0, 8)}…` : group.hash;

  return (
    <div className="rounded-md border border-border/70 bg-panel p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-semibold text-foreground">第 {index + 1} 组</span>
        <span>哈希 {shortHash}</span>
        <span>· {group.items.length} 个文件</span>
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
                    alt={entry.title || "提示词图像"}
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
                <p className="truncate text-sm font-medium text-foreground">{entry.title || "未命名提示词"}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {formatBytes(entry.fileSize)} · {formatDate(entry.createdAt)}
                </p>
              </div>
              {isKept ? (
                <span className="rounded-md border border-primary bg-primary-soft px-2 py-0.5 text-xs font-medium text-foreground">
                  保留
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
