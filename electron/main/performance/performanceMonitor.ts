import { logger } from "../appLogger";

const performanceMonitorIntervalMs = 60_000;
const memoryWarningThresholdMb = 512;

let monitorTimer: ReturnType<typeof setInterval> | null = null;
let lastItemCount = 0;

export function startPerformanceMonitor(): void {
  if (monitorTimer !== null) {
    return;
  }

  monitorTimer = setInterval(collectPerformanceSnapshot, performanceMonitorIntervalMs);
}

export function stopPerformanceMonitor(): void {
  if (monitorTimer !== null) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}

export function reportLibrarySize(itemCount: number): void {
  lastItemCount = itemCount;

  if (itemCount > 1000) {
    logger.warn("performance", "large-library", {
      itemCount,
      recommendation: "建议定期清理不需要的素材以保持流畅。",
    });
  }
}

function collectPerformanceSnapshot(): void {
  const memUsage = process.memoryUsage();
  const heapUsedMb = Math.round(memUsage.heapUsed / 1024 / 1024);
  const rssMb = Math.round(memUsage.rss / 1024 / 1024);
  const externalMb = Math.round(memUsage.external / 1024 / 1024);

  const snapshot = {
    heapUsedMb,
    rssMb,
    externalMb,
    itemCount: lastItemCount,
  };

  if (rssMb > memoryWarningThresholdMb) {
    logger.warn("performance", "memory-high", {
      ...snapshot,
      thresholdMb: memoryWarningThresholdMb,
    });
  } else {
    logger.debug("performance", "snapshot", snapshot);
  }
}
