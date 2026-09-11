import {
  REMOTE_ANALYSIS_SAFETY_RATINGS,
  REMOTE_ANALYSIS_TAG_DIMENSIONS,
} from "../types/ai";
import type {
  RemoteAnalysisCategoryCandidate,
  RemoteAnalysisSafety,
  RemoteAnalysisSafetyRating,
  RemoteAnalysisTagCandidate,
  RemoteAnalysisTagDimension,
  RemotePromptAnalysis,
  RemotePromptAnalysisV2,
} from "../types/ai";

/** Neutral confidence used when the model omits a usable numeric score. */
const DEFAULT_CONFIDENCE = 0.5;
/** V1 results lifted to V2 stay below this cap so they read as unverified. */
const LEGACY_TO_V2_CONFIDENCE_CAP = 0.5;
/** Guard against unbounded evidence arrays from a chatty model. */
const MAX_EVIDENCE = 8;

const DEFAULT_TAG_DIMENSION: RemoteAnalysisTagDimension = "other";
const TAG_DIMENSION_SET = new Set<string>(REMOTE_ANALYSIS_TAG_DIMENSIONS);
const SAFETY_RATING_SET = new Set<string>(REMOTE_ANALYSIS_SAFETY_RATINGS);
const SAFETY_RATING_ALIASES: Record<string, RemoteAnalysisSafetyRating> = {
  sfw: "safe",
  clean: "safe",
  questionable: "suggestive",
  sensitive: "suggestive",
  borderline: "suggestive",
  explicit: "nsfw",
  adult: "nsfw",
};

function isPlainRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function normalizeText(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function uniqueTexts(values: readonly unknown[]): string[] {
  return [...new Set(values.map(normalizeText).filter(Boolean))];
}

function labelKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * Coerce a model-supplied confidence into [0, 1]. Accepts 0-1 floats, 0-100
 * percentages (with or without a trailing "%"), and numeric strings. Anything
 * unparseable falls back to {@link DEFAULT_CONFIDENCE}.
 */
function clampConfidence(input: unknown, fallback = DEFAULT_CONFIDENCE): number {
  let value: number;
  if (typeof input === "number" && Number.isFinite(input)) {
    value = input;
  } else if (typeof input === "string" && input.trim()) {
    const parsed = Number(input.trim().replace(/%$/, ""));
    if (!Number.isFinite(parsed)) return fallback;
    value = parsed;
  } else {
    return fallback;
  }
  // Values above 1 are treated as percentages (85 -> 0.85, 100 -> 1).
  if (value > 1) value /= 100;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function coerceDimension(input: unknown): RemoteAnalysisTagDimension {
  const key = normalizeText(input).toLowerCase();
  return TAG_DIMENSION_SET.has(key) ? (key as RemoteAnalysisTagDimension) : DEFAULT_TAG_DIMENSION;
}

function coerceSafetyRating(input: unknown): RemoteAnalysisSafetyRating {
  const key = normalizeText(input).toLowerCase();
  if (!key) return "unknown";
  if (SAFETY_RATING_SET.has(key)) return key as RemoteAnalysisSafetyRating;
  return SAFETY_RATING_ALIASES[key] ?? "unknown";
}

function coerceEvidence(input: unknown): string[] {
  if (Array.isArray(input)) return uniqueTexts(input).slice(0, MAX_EVIDENCE);
  const single = normalizeText(input);
  return single ? [single] : [];
}

function coerceCategoryCandidate(input: unknown): RemoteAnalysisCategoryCandidate | null {
  if (typeof input === "string") {
    const label = input.trim();
    return label ? { label, confidence: DEFAULT_CONFIDENCE, evidence: [], primary: false } : null;
  }
  if (!isPlainRecord(input)) return null;
  const label = normalizeText(input.label ?? input.name ?? input.category);
  if (!label) return null;
  const categoryId = normalizeText(input.categoryId ?? input.id);
  return {
    ...(categoryId ? { categoryId } : {}),
    label,
    confidence: clampConfidence(input.confidence ?? input.score),
    evidence: coerceEvidence(input.evidence ?? input.reason ?? input.reasons),
    primary: input.primary === true,
  };
}

function coerceTagCandidate(input: unknown): RemoteAnalysisTagCandidate | null {
  if (typeof input === "string") {
    const label = input.trim();
    return label
      ? { label, dimension: DEFAULT_TAG_DIMENSION, confidence: DEFAULT_CONFIDENCE, evidence: [] }
      : null;
  }
  if (!isPlainRecord(input)) return null;
  const label = normalizeText(input.label ?? input.name ?? input.tag);
  if (!label) return null;
  const normalizedLabel = normalizeText(input.normalizedLabel ?? input.normalized);
  return {
    label,
    ...(typeof input.group === "string" ? { group: input.group.trim().slice(0, 100) } : {}),
    ...(normalizedLabel && normalizedLabel !== label ? { normalizedLabel } : {}),
    dimension: coerceDimension(input.dimension ?? input.family ?? input.type),
    confidence: clampConfidence(input.confidence ?? input.score),
    evidence: coerceEvidence(input.evidence ?? input.reason ?? input.reasons),
  };
}

/** Dedup by normalized label, keeping the highest-confidence occurrence. */
function dedupByLabel<T extends { label: string; confidence: number }>(candidates: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const candidate of candidates) {
    const key = labelKey(candidate.label);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing || candidate.confidence > existing.confidence) {
      byKey.set(key, candidate);
    }
  }
  return [...byKey.values()];
}

/** Ensure exactly one primary: a flagged one wins, else highest confidence. */
function enforceSinglePrimary(
  categories: RemoteAnalysisCategoryCandidate[],
): RemoteAnalysisCategoryCandidate[] {
  if (categories.length === 0) return categories;
  const flagged = categories.filter((candidate) => candidate.primary);
  const pool = flagged.length > 0 ? flagged : categories;
  let chosen = pool[0];
  for (const candidate of pool) {
    if (candidate.confidence > chosen.confidence) chosen = candidate;
  }
  return categories.map((candidate) => ({ ...candidate, primary: candidate === chosen }));
}

/**
 * Heuristic gate: only treat a payload as V2 when it carries a structural V2
 * marker. `categories` (plural) and record-shaped `tags`/`safety` never appear
 * in the flat V1 shape, so a false positive cannot swallow a legacy response.
 */
function looksLikeV2(input: Record<string, unknown>): boolean {
  return (
    input.schemaVersion === 2 ||
    input.schemaVersion === "2" ||
    Array.isArray(input.categories) ||
    (Array.isArray(input.tags) && input.tags.some(isPlainRecord)) ||
    isPlainRecord(input.safety)
  );
}

/**
 * Parse an already-decoded model payload into the structured V2 shape.
 *
 * Returns `null` when the payload does not look like V2 (so callers can fall
 * back to the legacy V1 parser) or when it carries no usable category/tag.
 */
export function normalizeRemotePromptAnalysisV2(input: unknown, options: { allowEmptyTags?: boolean } = {}): RemotePromptAnalysisV2 | null {
  if (!isPlainRecord(input) || !looksLikeV2(input)) return null;

  const categories = enforceSinglePrimary(
    dedupByLabel(
      (Array.isArray(input.categories) ? input.categories : [])
        .map(coerceCategoryCandidate)
        .filter((candidate): candidate is RemoteAnalysisCategoryCandidate => candidate !== null),
    ),
  );

  const tags = dedupByLabel(
    (Array.isArray(input.tags) ? input.tags : [])
      .map(coerceTagCandidate)
      .filter((candidate): candidate is RemoteAnalysisTagCandidate => candidate !== null),
  );

  const safetyRecord = isPlainRecord(input.safety) ? input.safety : null;
  const safety: RemoteAnalysisSafety = safetyRecord
    ? {
        rating: coerceSafetyRating(safetyRecord.rating ?? safetyRecord.level),
        confidence: clampConfidence(safetyRecord.confidence ?? safetyRecord.score, 0),
        evidence: coerceEvidence(safetyRecord.evidence ?? safetyRecord.reason),
      }
    : { rating: "unknown", confidence: 0, evidence: [] };

  // An intentional, well-formed empty tag result is valid only for tag tasks.
  // Malformed/dropped candidates must still fail instead of masquerading as an empty success.
  const explicitEmptyTags = options.allowEmptyTags && (input.schemaVersion === 2 || input.schemaVersion === "2") &&
    Array.isArray(input.categories) && input.categories.length === 0 && Array.isArray(input.tags) && input.tags.length === 0 &&
    typeof input.summary === "string";
  if (categories.length === 0 && tags.length === 0 && !explicitEmptyTags) return null;

  return {
    schemaVersion: 2,
    title: normalizeText(input.title),
    summary: normalizeText(input.summary),
    categories,
    tags,
    safety,
    warnings: uniqueTexts(Array.isArray(input.warnings) ? input.warnings : []),
  };
}

/** Lift a flat V1 result into V2 at capped confidence for the adjudicator. */
export function remoteAnalysisV2FromLegacy(legacy: RemotePromptAnalysis): RemotePromptAnalysisV2 {
  const categoryLabel = normalizeText(legacy.category);
  const categories: RemoteAnalysisCategoryCandidate[] = categoryLabel
    ? [{ label: categoryLabel, confidence: LEGACY_TO_V2_CONFIDENCE_CAP, evidence: [], primary: true }]
    : [];

  const tags: RemoteAnalysisTagCandidate[] = uniqueTexts(legacy.tags).map((label, index) => ({
    label,
    dimension: DEFAULT_TAG_DIMENSION,
    // Gentle rank gradient keeps the model's ordering as a weak signal while
    // staying under the cap to mark every entry as unverified legacy output.
    confidence: Math.max(0.1, LEGACY_TO_V2_CONFIDENCE_CAP - index * 0.02),
    evidence: [],
  }));

  return {
    schemaVersion: 2,
    title: normalizeText(legacy.title),
    summary: normalizeText(legacy.summary),
    categories,
    tags,
    safety: { rating: "unknown", confidence: 0, evidence: [] },
    warnings: ["legacy-v1-source"],
  };
}

/**
 * Collapse a V2 result back to the flat V1 shape the current pipeline consumes.
 *
 * Highest-confidence candidates come first so the downstream order-based fit
 * cap still favors them. Secondary category labels are demoted into `tags`
 * exactly as the legacy parser folded array-valued categories.
 */
export function legacyFromRemoteAnalysisV2(v2: RemotePromptAnalysisV2): RemotePromptAnalysis {
  const sortedCategories = [...v2.categories].sort((a, b) => b.confidence - a.confidence);
  const primary = sortedCategories.find((candidate) => candidate.primary) ?? sortedCategories[0] ?? null;
  const secondaryCategoryLabels = sortedCategories
    .filter((candidate) => candidate !== primary)
    .map((candidate) => candidate.label);

  const tagLabels = [...v2.tags]
    .sort((a, b) => b.confidence - a.confidence)
    .map((tag) => (tag.normalizedLabel?.trim() ? tag.normalizedLabel.trim() : tag.label));

  return {
    title: v2.title,
    category: primary ? primary.label : "",
    tags: uniqueTexts([...tagLabels, ...secondaryCategoryLabels]),
    summary: v2.summary,
  };
}
