import type { AiAnalyzeTarget, RemotePromptAnalysis } from "../types/ai";
import { uniqueTags } from "./buildLibraryFile";
import {
  analyzePromptText,
  buildAiPromptOptionAnalysis,
  filterPromptOptionValues,
  getPromptOptionSectionKey,
  isGenericPromptLabel,
  normalizeConcretePromptTags,
  removeCategoryFromTags,
  suggestPromptCategories,
  type PromptAnalysisResult,
  type PromptAnalysisSection,
  type PromptReplacementChip,
} from "./promptAnalysis";
import {
  getPromptSectionKeyByVariable,
  normalizePromptSectionValue,
  promptSectionMeta,
  promptSplitSectionOrder,
  resolvePromptSectionKeyForValue,
  resolvePromptTemplateText,
  splitPromptToTemplate,
  type PromptSplitSectionKey,
} from "./promptSplit";
import { normalizePhotographyCategorySuggestions } from "./photographyCategories";

export type PromptAnalysisSource = "local" | "remote";

export type PromptAnalysisRunResult = {
  analysis: PromptAnalysisResult;
  source: PromptAnalysisSource;
};

type PromptAnalysisBuildTarget = AiAnalyzeTarget | "mixed";
type PromptAnalysisBuildOptions = {
  optionValue?: string;
  optionVariable?: string;
};

const maxPromptAnalysisChips = 10;
const maxPromptAnalysisValuesPerSection = 2;

const promptAnalysisSectionPriority: Partial<Record<PromptSplitSectionKey, number>> = {
  food_category: 1,
  food_specific_identity: 1,
  food_main_ingredient: 1,
  food_physical_form: 2,
  food_freshness: 2,
  product_identity: 1,
  product_form: 2,
  product_material: 3,
  product_color: 4,
  commercial_food_identity: 4,
  commercial_visual_style: 4,
  image_style: 4,
  typography: 5,
  text_content: 5,
  aspect_ratio: 6,
  composition: 6,
  shot_size: 6,
  camera_angle: 7,
  color_detail: 8,
  scene_color_palette: 8,
  light_shadow: 9,
  product_lighting: 9,
  scene_lighting: 9,
  atmosphere: 10,
};

export function buildPromptAnalysisFromRemote(
  prompt: string,
  remoteAnalysis: RemotePromptAnalysis,
  target: PromptAnalysisBuildTarget = "mixed",
  options: PromptAnalysisBuildOptions = {},
): PromptAnalysisResult {
  const localAnalysis = target === "prompt-options"
    ? buildAiPromptOptionAnalysis({
        prompt,
        optionValue: options.optionValue,
        optionVariable: options.optionVariable,
      })
    : analyzePromptText(prompt);
  const expectedOptionVariable = normalizeVariable(options.optionVariable ?? "");
  const expectedOptionSectionKey =
    target === "prompt-options" && expectedOptionVariable ? getPromptOptionSectionKey(expectedOptionVariable) : null;
  const remoteSections = remoteAnalysis.sections.reduce<PromptAnalysisSection[]>((sections, section) => {
      const parsedKey = isPromptSectionKey(section.key) ? section.key : null;
      const key = expectedOptionSectionKey ?? parsedKey;

      if (!key || key === "other") {
        return sections;
      }

      const meta = promptSectionMeta[key];
      const parsedVariable = normalizeVariable(section.variable);
      const variable = expectedOptionVariable || getRemoteSectionVariable(key, parsedVariable);

      if (expectedOptionVariable && !isSameVariable(parsedVariable, expectedOptionVariable)) {
        return sections;
      }

      const values = (
        target === "prompt-options"
          ? filterPromptOptionValues({
              variable,
              sectionKey: key,
              values: normalizeRemoteValues(key, section.values),
              currentValue: options.optionValue,
            })
          : uniqueValues(section.values)
      ).slice(0, 8);

      if (values.length === 0) {
        return sections;
      }

      if (!expectedOptionSectionKey) {
        appendPromptSectionsByResolvedValue(sections, key, variable, values);

        return sections;
      }

      const label = section.label.trim() || meta.label;

      upsertPromptAnalysisSection(sections, key, label, variable, values);

      return sections;
    }, []);
  const sourceSections = remoteSections.length > 0 ? remoteSections : localAnalysis.sections;
  const sections = target === "prompt" ? compactPromptAnalysisSections(prompt, sourceSections) : sourceSections;
  const chips = sections.flatMap((section) => section.chips);
  const template = buildTemplateFromSections(sections) || localAnalysis.template;

  if (target === "image-category" || target === "prompt-category") {
    const categories = normalizePhotographyCategorySuggestions([remoteAnalysis.category, ...remoteAnalysis.tags]).slice(0, 10);
    const category = categories[0] ?? "";

    return {
      chips: [],
      sections: [],
      suggestedTags: [],
      suggestedCategories: categories,
      primaryCategory: category || "未分类",
      template: "",
    };
  }

  if (target === "image-tags" || target === "prompt-tags") {
    return {
      chips: [],
      sections: [],
      suggestedTags: normalizeConcretePromptTags(remoteAnalysis.tags, {
        category: remoteAnalysis.category,
        maxCount: 15,
      }),
      suggestedCategories: [],
      primaryCategory: "未分类",
      template: "",
    };
  }

  if (target === "image-safety") {
    const category = remoteAnalysis.category.trim();

    return {
      chips: [],
      sections: [],
      suggestedTags: uniqueTags(remoteAnalysis.tags).slice(0, 1),
      suggestedCategories: category ? [category] : [],
      primaryCategory: category || "UNKNOWN",
      template: "",
    };
  }

  if (target === "prompt") {
    const suggestedTags = buildConcreteSuggestedTags(sections, localAnalysis.suggestedTags);

    return {
      chips,
      sections,
      suggestedTags,
      suggestedCategories: localAnalysis.suggestedCategories,
      primaryCategory: localAnalysis.primaryCategory,
      template,
    };
  }

  if (target === "prompt-options") {
    const optionSections = sections.length > 0 ? sections : localAnalysis.sections;

    return {
      chips: optionSections.flatMap((section) => section.chips).slice(0, 8),
      sections: optionSections,
      suggestedTags: [],
      suggestedCategories: [],
      primaryCategory: "图像生成",
      template,
    };
  }

  const suggestedTags = removeCategoryFromTags(
    normalizeConcretePromptTags([...remoteAnalysis.tags, ...buildConcreteSuggestedTags(sections, localAnalysis.suggestedTags)]),
    remoteAnalysis.category,
  ).slice(0, 10);
  const suggestedCategories = uniqueTags([
    remoteAnalysis.category,
    ...suggestPromptCategories({
      title: remoteAnalysis.title,
      prompt,
      tags: suggestedTags,
    }),
  ]).slice(0, 10);
  return {
    chips,
    sections,
    suggestedTags,
    suggestedCategories,
    primaryCategory: suggestedCategories[0] ?? localAnalysis.primaryCategory,
    template,
  };
}

function isSameVariable(first: string, second: string | undefined): boolean {
  return first.trim().toLowerCase() === (second ?? "").trim().toLowerCase();
}

function buildReplacementChip(
  sectionKey: PromptSplitSectionKey,
  label: string,
  variable: string,
  value: string,
  index: number,
): PromptReplacementChip {
  return {
    id: `remote-${sectionKey}-${index}-${value}`,
    sectionKey,
    label,
    variable,
    value,
    templateText: `{{${variable}: ${value}}}`,
  };
}

function compactPromptAnalysisSections(
  prompt: string,
  sections: readonly PromptAnalysisSection[],
): PromptAnalysisSection[] {
  const sourcePrompt = resolvePromptTemplateText(prompt);
  let remainingChipCount = maxPromptAnalysisChips;

  return sections
    .map((section, index) => ({ section, index }))
    .sort((first, second) => {
      const firstPriority = promptAnalysisSectionPriority[first.section.key] ?? 50;
      const secondPriority = promptAnalysisSectionPriority[second.section.key] ?? 50;

      return (
        firstPriority - secondPriority ||
        promptSplitSectionOrder.indexOf(first.section.key) - promptSplitSectionOrder.indexOf(second.section.key) ||
        first.index - second.index
      );
    })
    .reduce<PromptAnalysisSection[]>((nextSections, { section }) => {
      if (remainingChipCount <= 0 || !isPromptAnalysisReplaceableSection(section.key)) {
        return nextSections;
      }

      const values = uniqueValues(section.values)
        .filter((value) => isPromptAnalysisReplaceableValue(sourcePrompt, section.key, value))
        .slice(0, Math.min(maxPromptAnalysisValuesPerSection, remainingChipCount));

      if (values.length === 0) {
        return nextSections;
      }

      remainingChipCount -= values.length;

      nextSections.push({
        ...section,
        values,
        chips: values.map((value, index) => buildReplacementChip(section.key, section.label, section.variable, value, index)),
      });

      return nextSections;
    }, []);
}

function isPromptAnalysisReplaceableSection(sectionKey: PromptSplitSectionKey): boolean {
  return sectionKey !== "negative" && sectionKey !== "other";
}

function isPromptAnalysisReplaceableValue(
  prompt: string,
  sectionKey: PromptSplitSectionKey,
  value: string,
): boolean {
  const trimmedValue = value.trim();

  if (!trimmedValue || isGenericPromptLabel(trimmedValue) || isInstructionLikePromptValue(trimmedValue)) {
    return false;
  }

  if (!isPromptAnalysisValueLengthAcceptable(sectionKey, trimmedValue)) {
    return false;
  }

  if (hasPromptAnalysisSentencePunctuation(sectionKey, trimmedValue)) {
    return false;
  }

  return !prompt.trim() || normalizedPromptIncludesValue(prompt, trimmedValue);
}

function isInstructionLikePromptValue(value: string): boolean {
  return /(?:不要|避免|禁止|严禁|不能|不可|不需要|不展开|不脱离|必须|确保|保留|可以|请|帮我|基于|参考|上传|重新|生成|创建|绘制|分析|说明|目标|要求|^使用|^让|^使|^令)/u.test(value);
}

function isPromptAnalysisValueLengthAcceptable(sectionKey: PromptSplitSectionKey, value: string): boolean {
  if (sectionKey === "text_content") {
    return value.length <= 32;
  }

  if (sectionKey === "color_detail" || sectionKey === "scene_color_palette" || sectionKey === "product_color") {
    return value.length <= 28;
  }

  return value.length <= 22;
}

function hasPromptAnalysisSentencePunctuation(sectionKey: PromptSplitSectionKey, value: string): boolean {
  if (sectionKey === "aspect_ratio") {
    return /[，,。；;！？!?]/u.test(value);
  }

  if (sectionKey === "color_detail" || sectionKey === "scene_color_palette" || sectionKey === "product_color") {
    return /[，,。；;！？!?]/u.test(value);
  }

  return /[，,。；;！？!?：:]/u.test(value);
}

function normalizedPromptIncludesValue(prompt: string, value: string): boolean {
  const normalizedPrompt = normalizeReplaceableSearchText(prompt);
  const normalizedValue = normalizeReplaceableSearchText(value);

  return normalizedValue.length > 0 && normalizedPrompt.includes(normalizedValue);
}

function normalizeReplaceableSearchText(value: string): string {
  return value
    .replace(/\{\{\s*([^}:]+)\s*:\s*([^}]+?)\s*\}\}/g, "$2")
    .replace(/\s+/g, "")
    .replace(/[“”"']/g, "")
    .replace(/：/g, ":")
    .trim()
    .toLocaleLowerCase("zh-Hans-CN");
}

function appendPromptSectionsByResolvedValue(
  sections: PromptAnalysisSection[],
  fallbackKey: PromptSplitSectionKey,
  fallbackVariable: string,
  values: readonly string[],
): void {
  const declaredVariable = fallbackVariable || promptSectionMeta[fallbackKey].variable;

  for (const value of values) {
    const resolvedSections = resolvePromptSectionsForValue(fallbackKey, declaredVariable, value);

    for (const resolvedSection of resolvedSections) {
      const meta = promptSectionMeta[resolvedSection.key];

      upsertPromptAnalysisSection(sections, resolvedSection.key, meta.label, resolvedSection.variable, [
        resolvedSection.value,
      ]);
    }
  }
}

function resolvePromptSectionsForValue(
  fallbackKey: PromptSplitSectionKey,
  declaredVariable: string,
  value: string,
): Array<{ key: PromptSplitSectionKey; variable: string; value: string }> {
  if (fallbackKey === "negative") {
    const normalizedValue = normalizePromptSectionValue(fallbackKey, value);

    return normalizedValue ? [{ key: fallbackKey, variable: declaredVariable, value: normalizedValue }] : [];
  }

  const splitSections = splitPromptToTemplate(value).sections.filter(
    (section) => section.key !== "negative" && section.key !== "other",
  );

  if (splitSections.length > 0) {
    return splitSections.flatMap((section) =>
      section.values.map((sectionValue) => ({
        key: section.key,
        variable: promptSectionMeta[section.key].variable,
        value: sectionValue,
      })),
    );
  }

  const resolvedKey = resolvePromptSectionKeyForValue(declaredVariable, value) ?? fallbackKey;
  const meta = promptSectionMeta[resolvedKey];
  const variable = resolvedKey === fallbackKey ? declaredVariable : meta.variable;
  const resolvedValue = normalizePromptSectionValue(resolvedKey, value);

  return resolvedValue ? [{ key: resolvedKey, variable, value: resolvedValue }] : [];
}

function upsertPromptAnalysisSection(
  sections: PromptAnalysisSection[],
  key: PromptSplitSectionKey,
  label: string,
  variable: string,
  values: readonly string[],
): void {
  const existingSection = sections.find((section) => isSameVariable(section.variable, variable));
  const nextValues = uniqueValues(values);

  if (nextValues.length === 0) {
    return;
  }

  if (existingSection) {
    existingSection.values = uniqueValues([...existingSection.values, ...nextValues]).slice(0, 8);
    existingSection.chips = existingSection.values.map((value, index) =>
      buildReplacementChip(existingSection.key, existingSection.label, existingSection.variable, value, index),
    );
    return;
  }

  sections.push({
    key,
    label,
    variable,
    values: nextValues.slice(0, 8),
    chips: nextValues.slice(0, 8).map((value, index) => buildReplacementChip(key, label, variable, value, index)),
  });
}

function buildTemplateFromSections(sections: PromptAnalysisSection[]): string {
  return sections.map((section) => `${section.label}：{{${section.variable}: ${section.values.join("，")}}}`).join("\n");
}

function normalizeVariable(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
}

function getRemoteSectionVariable(sectionKey: PromptSplitSectionKey, parsedVariable: string): string {
  if (getPromptSectionKeyByVariable(parsedVariable) === sectionKey) {
    return parsedVariable;
  }

  return promptSectionMeta[sectionKey].variable;
}

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function buildConcreteSuggestedTags(
  sections: readonly PromptAnalysisSection[],
  fallbackTags: readonly string[],
): string[] {
  return removeGenericPromptTags(
    uniqueTags([
      ...sections
        .filter((section) => section.key !== "negative" && section.key !== "other")
        .flatMap((section) => section.values),
      ...fallbackTags,
    ]),
  ).slice(0, 15);
}

function removeGenericPromptTags(tags: readonly string[]): string[] {
  return tags.filter((tag) => !isGenericPromptLabel(tag));
}

function normalizeRemoteValues(sectionKey: PromptSplitSectionKey, values: readonly string[]): string[] {
  return uniqueValues(values.map((value) => normalizePromptSectionValue(sectionKey, value)).filter(Boolean));
}

function isPromptSectionKey(input: string): input is PromptSplitSectionKey {
  return Object.prototype.hasOwnProperty.call(promptSectionMeta, input);
}
