/** Category taxonomy domain types for SuYan classification system. */

export type CategoryType = "system" | "custom" | "ai";
export type CategoryAssignmentSource = "system" | "user" | "ai" | "local";

export type CategoryNode = {
  id: string;
  name: string;
  type: CategoryType;
  parentId?: string | null;
  group: string;
  aliases: string[];
  keywords: string[];
  description: string;
  examples: string[];
  /** Optional embedding placeholder for later vector matching (phase 3). */
  embedding?: number[] | null;
  usageCount: number;
  imageFileName?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CategoryTaxonomy = {
  schemaVersion: 1;
  updatedAt: string;
  nodes: CategoryNode[];
  /** System category ids intentionally hidden by the user. */
  disabledSystemCategoryIds?: string[];
};

export type CategorySuggestion = {
  categoryId: string;
  confidence: number;
  reason: string;
  source: CategoryAssignmentSource;
};

export type CategoryIntentDraft = {
  subject: string;
  purpose: string;
  visual: string;
  summary: string;
};

export type CategoryCandidateProposal = {
  id: string;
  proposedName: string;
  parentId?: string | null;
  group?: string | null;
  description: string;
  keywords: string[];
  exampleItemIds: string[];
  hitCount: number;
  status: "pending" | "accepted" | "merged" | "ignored";
  createdAt: string;
  updatedAt: string;
};

export type CategoryInboxItem = {
  itemId: string;
  reason: "uncategorized" | "low_confidence" | "conflict";
  suggestions: CategorySuggestion[];
  updatedAt: string;
};

export type CategoryHealthIssue = {
  id: string;
  kind: "duplicate" | "too_broad" | "emerging" | "orphan";
  title: string;
  detail: string;
  categoryIds: string[];
  suggestedAction?: "merge" | "split" | "create" | "review";
};

export type CategoryLearningEvent = {
  id: string;
  itemId: string;
  fromCategoryId: string | null;
  toCategoryId: string;
  source: CategoryAssignmentSource;
  createdAt: string;
};

export const UNCATEGORIZED_CATEGORY_ID = "system:uncategorized";
export const UNCATEGORIZED_CATEGORY_NAME = "未分类";

export const CATEGORY_CONFIDENCE_HIGH = 0.95;
export const CATEGORY_CONFIDENCE_MID = 0.7;

export function confidenceBand(confidence: number): "high" | "mid" | "low" {
  if (confidence >= CATEGORY_CONFIDENCE_HIGH) {
    return "high";
  }
  if (confidence >= CATEGORY_CONFIDENCE_MID) {
    return "mid";
  }
  return "low";
}
