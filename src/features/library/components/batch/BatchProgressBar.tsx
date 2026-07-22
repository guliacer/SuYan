type BatchProgressBarProps = {
  current: number;
  total: number;
  label: string;
  savedBytes: number;
};

export function BatchProgressBar({ current, total, label, savedBytes }: BatchProgressBarProps) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/70 bg-background px-4 py-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted">
          {current} / {total}（{percent}%）
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-border/50">
        <div
          className="h-full rounded-full bg-primary transition-all duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>
      {savedBytes > 0 ? <span className="text-xs text-muted">已节省 {formatBytes(savedBytes)}</span> : null}
    </div>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
