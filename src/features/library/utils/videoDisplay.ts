
export function formatVideoDuration(durationSec: number | null | undefined): string | null {
  if (typeof durationSec !== "number" || !Number.isFinite(durationSec) || durationSec <= 0) {
    return null;
  }

  const totalSeconds = Math.round(durationSec);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
