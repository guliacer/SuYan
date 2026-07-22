import type { VideoKeyframe } from "../../../src/features/library/types/library";

export const maxVideoKeyframeCount = 5;

export function computeKeyframeTimings(durationSec: number, maxCount = maxVideoKeyframeCount): VideoKeyframe[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return [];
  }

  const safeMaxCount = Math.max(1, Math.floor(maxCount));
  const count = Math.max(1, Math.min(safeMaxCount, Math.ceil(durationSec)));
  const segment = durationSec / count;

  return Array.from({ length: count }, (_unused, index) => {
    const start = segment * index;
    const end = segment * (index + 1);
    const atSec = Math.min(durationSec, start + segment / 2);

    return {
      imageFileName: "",
      atSec: Number(atSec.toFixed(3)),
      label: formatSegmentLabel(start, end),
    };
  });
}

function formatSegmentLabel(startSec: number, endSec: number): string {
  return `${formatSecondsLabel(startSec)}-${formatSecondsLabel(endSec)}`;
}

function formatSecondsLabel(seconds: number): string {
  return `${Math.round(seconds)}s`;
}
