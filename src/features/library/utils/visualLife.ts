export const visualLifeEffectIds = [
  "stardust",
  "meteor",
  "rainbow",
  "fallingPetal",
  "geese",
  "musicNote",
  "cosmicDust",
  "heart",
] as const;

export type VisualLifeEffectId = (typeof visualLifeEffectIds)[number];
export type VisualLifeMode = "smart" | "custom" | "random" | "static";
export type VisualLifeIntensity = "low" | "standard" | "dreamy" | "immersive";

export type VisualLifeSettings = {
  /** Legacy aggregate switch retained for settings-file compatibility. */
  enabled: boolean;
  sheenEnabled: boolean;
  outerEffectsEnabled: boolean;
  mode: VisualLifeMode;
  intensity: VisualLifeIntensity;
  reduced: boolean;
  effectPool: VisualLifeEffectId[];
};

export const defaultVisualLifeSettings: VisualLifeSettings = {
  enabled: true,
  sheenEnabled: true,
  outerEffectsEnabled: true,
  mode: "custom",
  intensity: "standard",
  reduced: false,
  effectPool: ["stardust", "cosmicDust", "meteor"],
};

const effectKeywords: Record<VisualLifeEffectId, readonly string[]> = {
  stardust: ["星空", "宇宙", "科幻", "夜景", "星", "太空", "space", "star", "sci-fi", "neon"],
  meteor: ["流星", "星空", "宇宙", "夜景", "太空", "meteor", "shooting star", "space", "night"],
  rainbow: ["彩虹", "虹", "雨后", "彩色", "棱镜", "rainbow", "prism"],
  fallingPetal: ["花", "樱", "玫瑰", "花瓣", "春", "古风", "汉服", "flower", "petal", "spring"],
  geese: ["大雁", "雁", "湖", "湿地", "鸟群", "候鸟", "鸟", "goose", "geese", "bird"],
  musicNote: ["音乐", "音符", "歌曲", "舞蹈", "音乐节", "music", "note", "melody", "dance"],
  cosmicDust: ["宇宙", "星云", "银河", "太空", "尘埃", "星尘", "cosmic", "nebula", "galaxy", "space", "dust"],
  heart: ["爱心", "心形", "浪漫", "爱情", "heart", "love", "romance"],
};

export function normalizeVisualLifeSettings(input: Partial<VisualLifeSettings> | null | undefined): VisualLifeSettings {
  const source = input ?? {};
  const legacyEnabled = source.enabled !== false;
  const sheenEnabled = typeof source.sheenEnabled === "boolean" ? source.sheenEnabled : legacyEnabled;
  const outerEffectsEnabled = typeof source.outerEffectsEnabled === "boolean" ? source.outerEffectsEnabled : legacyEnabled;
  const pool = Array.isArray(source.effectPool)
    ? uniqueEffects(source.effectPool)
    : [...defaultVisualLifeSettings.effectPool];

  return {
    enabled: sheenEnabled || outerEffectsEnabled,
    sheenEnabled,
    outerEffectsEnabled,
    mode: isVisualLifeMode(source.mode) ? source.mode : defaultVisualLifeSettings.mode,
    intensity: isVisualLifeIntensity(source.intensity) ? source.intensity : defaultVisualLifeSettings.intensity,
    reduced: source.reduced === true,
    effectPool: pool.length > 0 ? pool : [...defaultVisualLifeSettings.effectPool],
  };
}

export function isVisualLifeEffectId(value: unknown): value is VisualLifeEffectId {
  return typeof value === "string" && (visualLifeEffectIds as readonly string[]).includes(value);
}

export function isVisualLifeMode(value: unknown): value is VisualLifeMode {
  return value === "smart" || value === "custom" || value === "random" || value === "static";
}

export function isVisualLifeIntensity(value: unknown): value is VisualLifeIntensity {
  return value === "low" || value === "standard" || value === "dreamy" || value === "immersive";
}

export function resolveVisualLifeEffect(input: {
  id: string;
  category?: string | null;
  tags?: readonly string[];
  settings: VisualLifeSettings;
}): VisualLifeEffectId {
  const { settings } = input;
  if (settings.mode === "static") return "rainbow";

  const pool = settings.effectPool.length > 0 ? settings.effectPool : [...defaultVisualLifeSettings.effectPool];
  if (pool.length === 0) return "stardust";
  if (settings.mode === "random" || settings.mode === "custom") {
    return pool[stableHash(input.id) % pool.length];
  }

  const searchText = [input.category ?? "", ...(input.tags ?? [])].join(" ").toLocaleLowerCase();
  const matches = pool.filter((effect) => effectKeywords[effect].some((keyword) => searchText.includes(keyword.toLocaleLowerCase())));
  return matches[0] ?? pool[stableHash(input.id) % pool.length];
}

export function getVisualLifeParticleScale(intensity: VisualLifeIntensity): number {
  return { low: 0.5, standard: 1, dreamy: 1.7, immersive: 2.35 }[intensity];
}

export function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function uniqueEffects(values: readonly unknown[]): VisualLifeEffectId[] {
  return Array.from(new Set(values.filter(isVisualLifeEffectId)));
}
