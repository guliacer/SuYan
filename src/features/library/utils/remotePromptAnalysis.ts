import type {
  AiAnalyzeTarget,
  RemoteAnalysisTagDimension,
  RemotePromptAnalysisV2,
} from "../types/ai";
import { uniqueTags } from "./buildLibraryFile";
import { canonicalTagLabel, findKnownTag, buildAnalyzedTagEntry, tagKey } from "./tagKnowledge";
import { shouldAdmitAnalyzedTag } from "./tagQuality";
import type { PromptImageLexiconEntry } from "../types/library";
import {
  analyzePromptText,
  isolateCategoryAnalysisResult,
  normalizeConcretePromptTags,
  removeCategoryFromTags,
  sanitizePromptTags,
  suggestPromptCategories,
  type PromptAnalysisResult,
} from "./promptAnalysis";
import {
  isPseudoPhotographyGenreLabel,
  normalizeAiCategorySuggestions,
  resolvePhotographyCategory,
} from "./photographyCategories";
import type { CategoryTaxonomy } from "../types/category";
import { buildTaxonomyCategoryAiResult } from "./categoryAiBinding";
import { createEmptyCategoryTaxonomy } from "./categoryTaxonomy";
import { legacyFromRemoteAnalysisV2 } from "./remoteAnalysisV2";

export type PromptAnalysisSource = "local" | "remote";

/**
 * Matches the "5-15 个" contract stated in the category analysis prompts:
 * 1-2 content types + one leaf per each of the 13 analysis dimensions.
 */
const maxRemoteCategoryCount = 15;

/**
 * Genuine V2 candidates scored below this confidence are dropped as low-signal
 * padding — the very "凑数分类" the order-based cap used to let through. The
 * elected primary is always kept so a low-confidence best guess still lands.
 * Legacy-lifted results carry a synthetic confidence gradient (see
 * remoteAnalysisV2FromLegacy) rather than a real model score, so they are exempt
 * and keep their original order-preserving, cap-only behavior.
 */
const genuineV2ConfidenceFloor = 0.35;

function isLegacyLiftedV2(analysis: RemotePromptAnalysisV2): boolean {
  return analysis.warnings.includes("legacy-v1-source");
}

/**
 * A genuine V2 candidate must cite at least one evidence phrase to survive the
 * gate. The prompt requires evidence for every category/tag ("找不到依据的一律
 * 删掉"), so an empty-evidence candidate is one the model scored but could not
 * justify — padding to prune, complementary to the confidence floor. Legacy-
 * lifted candidates always carry empty evidence, so this only applies when the
 * gate is active (i.e. never to legacy); the elected primary is exempt.
 */
function hasEvidence(candidate: { evidence: readonly string[] }): boolean {
  return candidate.evidence.length > 0;
}

/**
 * Order genre candidates primary-first then by descending confidence, replacing
 * the old reliance on model return order. Genuine V2 candidates below the
 * confidence floor OR with no supporting evidence are dropped; the elected
 * primary is always kept. Legacy secondary genres arrive in `tags` and are
 * folded in as non-primary candidates (and, being legacy, skip the gate).
 */
function selectGenreLabelsByConfidence(analysis: RemotePromptAnalysisV2): string[] {
  const gate = !isLegacyLiftedV2(analysis);
  const candidates = [
    ...analysis.categories.map((candidate) => ({
      label: candidate.label,
      confidence: candidate.confidence,
      evidence: candidate.evidence,
      primary: candidate.primary,
    })),
    ...analysis.tags.map((candidate) => ({
      label: candidate.normalizedLabel?.trim() || candidate.label,
      confidence: candidate.confidence,
      evidence: candidate.evidence,
      primary: false,
    })),
  ];

  return candidates
    .filter(
      (candidate) =>
        candidate.primary ||
        !gate ||
        (candidate.confidence >= genuineV2ConfidenceFloor && hasEvidence(candidate)),
    )
    .sort((a, b) => Number(b.primary) - Number(a.primary) || b.confidence - a.confidence)
    .map((candidate) => candidate.label);
}

/**
 * Presentation priority for feature-tag dimensions, concrete-first.
 *
 * Retrieval-oriented dimensions (what/where is in the frame) lead; the aesthetic
 * dimensions that the category channel already owns (风格/光线/色彩/情绪/时代)
 * sort last. This clusters related tags for display and acts as a safety net: if
 * a stylistic word slips past the tag/category boundary in sanitizePromptTags, it
 * still ranks below every concrete feature instead of leading on raw confidence.
 * The boundary itself stays owned by the ontology in sanitizePromptTags — this
 * only orders the survivors, it never adds or drops a tag.
 */
const tagDimensionOrder: readonly RemoteAnalysisTagDimension[] = [
  "subject",
  "scene",
  "composition",
  "technique",
  "style",
  "lighting",
  "color",
  "mood",
  "era",
  "other",
];

function tagDimensionRank(dimension: RemoteAnalysisTagDimension): number {
  const index = tagDimensionOrder.indexOf(dimension);
  return index === -1 ? tagDimensionOrder.length : index;
}

/**
 * Order feature-tag candidates by dimension priority, then descending
 * confidence, gating genuine V2 on both the confidence floor and the presence
 * of evidence. Legacy-lifted tags all carry the "other" dimension and empty
 * evidence, so they skip the gate and keep their prior confidence-only order
 * (which mirrors the model's original ordering).
 */
function selectTagLabelsByConfidence(analysis: RemotePromptAnalysisV2, prompt: string): string[] {
  const gate = !isLegacyLiftedV2(analysis);
  return [...analysis.tags]
    .filter(
      (candidate) => !gate || (candidate.confidence >= genuineV2ConfidenceFloor && hasEvidence(candidate)),
    )
    .filter(candidate => shouldAdmitAnalyzedTag(candidate.label, candidate.evidence, prompt))
    .sort(
      (a, b) =>
        tagDimensionRank(a.dimension) - tagDimensionRank(b.dimension) || b.confidence - a.confidence,
    )
    .map((candidate) => candidate.label);
}

export type PromptAnalysisRunResult = {
  analysis: PromptAnalysisResult;
  source: PromptAnalysisSource;
  failed?: boolean;
};

type PromptAnalysisBuildTarget = AiAnalyzeTarget | "mixed";
type PromptAnalysisBuildOptions = {
  taxonomy?: CategoryTaxonomy | null;
  knownCategories?: readonly string[] | null;
  /** Existing user/system tag labels for auto-matching. */
  knownTags?: readonly string[] | null;
  knownTagEntries?: readonly PromptImageLexiconEntry[] | null;
};

export function buildPromptAnalysisFromRemote(
  prompt: string,
  remoteAnalysis: RemotePromptAnalysisV2,
  target: PromptAnalysisBuildTarget = "mixed",
  options: PromptAnalysisBuildOptions = {},
): PromptAnalysisResult {
  // Category / tag / safety targets must not touch parameter sections at all.
  if (target === "image-category" || target === "prompt-category") {
    // Shared Genre pipeline for BOTH image vision and prompt text analysis.
    const taxonomy = options.taxonomy ?? createEmptyCategoryTaxonomy();
    // Confidence-ranked genre candidates (primary first), then capped to the
    // count promised in the prompt so a chatty model can't dump the catalog and
    // so low-confidence "凑数分类" no longer ride along on model return order.
    const labels = normalizeAiCategorySuggestions(
      selectGenreLabelsByConfidence(remoteAnalysis),
    ).slice(0, maxRemoteCategoryCount);
    const bound = buildTaxonomyCategoryAiResult(
      taxonomy,
      {
        primaryCategory: labels[0] ?? "",
        suggestedCategories: labels,
        summary: remoteAnalysis.summary,
      },
      [prompt, remoteAnalysis.title, remoteAnalysis.summary].filter(Boolean).join("\n"),
      { autoCreateMissing: true },
    );
    const categories = bound.suggestions
      .map((suggestion) => bound.taxonomy.nodes.find((node) => node.id === suggestion.categoryId)?.name)
      .filter((name): name is string => Boolean(name));

    return isolateCategoryAnalysisResult({
      chips: [],
      sections: [],
      suggestedTags: [],
      suggestedCategories: categories,
      primaryCategory: categories[0] ?? "未分类",
      template: "",
      taxonomySuggestions: bound.suggestions,
      taxonomyBand: bound.band,
      taxonomyPrimaryCategoryId: bound.primary?.categoryId ?? null,
      taxonomyCreatedCategoryIds: bound.createdCategoryIds,
      taxonomySnapshot: bound.createdCategoryIds.length > 0 ? bound.taxonomy : undefined,
    });
  }

  if (target === "image-tags" || target === "prompt-tags") {
    // Shared Tag pipeline: feature tags only — never Genre names / pseudo-genres.
    // Prefer canonicalizing freeform labels onto existing custom/system tags when possible.
    // The classification channel owns categories; a V2 tag response keeps
    // `categories` empty, and a legacy-lifted one exposes only its primary there
    // (used solely to strip an accidental category echo, never to add tags).
    const sourcePrompt = target === "prompt-tags" ? prompt : "";
    const rawTags = uniqueTags(selectTagLabelsByConfidence(remoteAnalysis, sourcePrompt));

    const knownTags = Array.isArray(options.knownTags) ? options.knownTags : [];
    const knownEntries = options.knownTagEntries ?? [];
    const canonicalized = rawTags.map((tag) => canonicalTagLabel(matchKnownTagLabel(knownTags, tag) ?? tag, knownEntries));

    const suggestedTags = uniqueTags(canonicalized.flatMap(label => findKnownTag(label, knownEntries)?.groupLocked ? [label] : sanitizePromptTags([label], {
      category: remoteAnalysis.categories[0]?.label ?? null,
      maxCount: 15,
    })).map(tag => canonicalTagLabel(tag, knownEntries))).filter((tag) => {
      const candidate = remoteAnalysis.tags.find(candidate => tagKey(canonicalTagLabel(candidate.label, knownEntries)) === tagKey(tag));
      return shouldAdmitAnalyzedTag(tag, candidate?.evidence, sourcePrompt) && (findKnownTag(tag, knownEntries)?.groupLocked || (!resolvePhotographyCategory(tag) && !isPseudoPhotographyGenreLabel(tag)));
    }).slice(0, 15);

    const tagEntries = suggestedTags.map((label): PromptImageLexiconEntry => {
      const known = findKnownTag(label, knownEntries);
      const candidate = [...remoteAnalysis.tags].sort((a, b) => b.confidence - a.confidence).find(
        tag => [canonicalTagLabel(tag.label, knownEntries), ...sanitizePromptTags([canonicalTagLabel(tag.label, knownEntries)]).map(t => canonicalTagLabel(t, knownEntries))].some(t => tagKey(t) === tagKey(label)),
      );
      return buildAnalyzedTagEntry(label, candidate && {
        dimension: candidate.dimension, confidence: candidate.confidence,
        evidence: candidate.evidence, suggestedGroup: candidate.group,
      }, known);
    });

    return {
      chips: [],
      sections: [],
      suggestedTags,
      tagEntries,
      suggestedCategories: [],
      primaryCategory: "未分类",
      template: "",
    };
  }

  if (target === "image-safety") {
    // Safety stays on the flat SFW/NSFW/UNKNOWN contract: the collapse maps the
    // lifted categories[0] back to the label the grader emits.
    const flat = legacyFromRemoteAnalysisV2(remoteAnalysis);
    const category = flat.category.trim();

    return {
      chips: [],
      sections: [],
      suggestedTags: uniqueTags(flat.tags).slice(0, 1),
      suggestedCategories: category ? [category] : [],
      primaryCategory: category || "UNKNOWN",
      template: "",
    };
  }

  // mixed fallback: return tags and categories only
  const flat = legacyFromRemoteAnalysisV2(remoteAnalysis);
  const localAnalysis = analyzePromptText(prompt);
  const suggestedTags = removeCategoryFromTags(
    normalizeConcretePromptTags([...flat.tags, ...localAnalysis.suggestedTags]),
    flat.category,
  ).slice(0, 10);
  const suggestedCategories = uniqueTags([
    flat.category,
    ...suggestPromptCategories({
      title: flat.title,
      prompt,
      tags: suggestedTags,
    }),
  ]).slice(0, 10);
  return {
    chips: [],
    sections: [],
    suggestedTags,
    suggestedCategories,
    primaryCategory: suggestedCategories[0] ?? localAnalysis.primaryCategory,
    template: "",
  };
}

function matchKnownTagLabel(knownTags: readonly string[], label: string): string | null {
  const key = label.trim().toLowerCase().replace(/\s+/g, "");
  if (!key) return null;
  for (const known of knownTags) {
    const knownKey = known.trim().toLowerCase().replace(/\s+/g, "");
    if (!knownKey) continue;
    if (knownKey === key) return known.trim();
  }
  // Do not fuzzy-match freeform labels. A short label such as "花" can be
  // incorrectly canonicalized to "白花" or a style label, which changes the
  // meaning of the model result and makes later grouping unreliable.
  return null;
}
