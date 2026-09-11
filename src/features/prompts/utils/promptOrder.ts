export function compareOrderKey(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true });
}

export function createOrderKey(before?: string | null, after?: string | null): string {
  if (!before && !after) return "m";
  if (!before) return `${after ?? "m"}0`;
  if (!after) return `${before}z`;
  return `${before}~${after}`;
}
