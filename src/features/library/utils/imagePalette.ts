export type ImagePaletteColor = { hex: string; count: number; ratio: number };
export type ImagePaletteCodeFormat = "hex" | "rgb" | "css";
type ColorBin = { red: number; green: number; blue: number; count: number };
const hexByte = (value: number) => Math.round(value).toString(16).padStart(2, "0").toUpperCase();

/** A bounded 32x32 sample is sufficient; never scan original megapixel data. */
export function extractImagePalette(pixels: ArrayLike<number>, maxColors = 8): ImagePaletteColor[] {
  const limit = Math.min(12, Math.max(1, Math.round(maxColors) || 8));
  const bins = new Map<number, ColorBin>();
  const pixelCount = Math.floor(pixels.length / 4);
  const stride = Math.max(1, Math.ceil(pixelCount / 4096));
  let total = 0;
  for (let index = 0; index < pixelCount; index += stride) {
    const offset = index * 4;
    if (pixels[offset + 3] < 128) continue;
    const red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2];
    const key = (red >> 4) * 256 + (green >> 4) * 16 + (blue >> 4);
    const bin = bins.get(key) ?? { red: 0, green: 0, blue: 0, count: 0 };
    bin.red += red; bin.green += green; bin.blue += blue; bin.count += 1;
    bins.set(key, bin); total += 1;
  }
  const candidates = [...bins.entries()].sort((a, b) => b[1].count - a[1].count || a[0] - b[0]);
  const merged: ColorBin[] = [];
  for (const [, bin] of candidates) {
    const match = merged.find(color => {
      const red = color.red / color.count - bin.red / bin.count;
      const green = color.green / color.count - bin.green / bin.count;
      const blue = color.blue / color.count - bin.blue / bin.count;
      return red * red + green * green + blue * blue < 24 * 24;
    });
    if (match) { match.red += bin.red; match.green += bin.green; match.blue += bin.blue; match.count += bin.count; }
    else merged.push({ ...bin });
  }
  return merged.sort((a, b) => b.count - a.count || a.red / a.count - b.red / b.count || a.green / a.count - b.green / b.count)
    .slice(0, limit).map(bin => ({ hex: "#" + hexByte(bin.red / bin.count) + hexByte(bin.green / bin.count) + hexByte(bin.blue / bin.count), count: bin.count, ratio: bin.count / total }));
}

export function formatImagePaletteColor(hex: string, format: ImagePaletteCodeFormat): string {
  let normalized = hex.trim().toUpperCase();
  if (/^#[0-9A-F]{3}$/.test(normalized)) normalized = "#" + [...normalized.slice(1)].map(char => char + char).join("");
  if (!/^#[0-9A-F]{6}$/.test(normalized)) return "";
  if (format === "rgb") return "rgb(" + [1, 3, 5].map(index => parseInt(normalized.slice(index, index + 2), 16)).join(", ") + ")";
  return format === "css" ? "color: " + normalized + ";" : normalized;
}
