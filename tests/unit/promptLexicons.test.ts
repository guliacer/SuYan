import { describe, expect, it } from "vitest";
import type {
  LibraryItem,
  PromptImageLexiconEntry,
} from "@/features/library/types/library";
import {
  createDefaultPromptLexiconSettings,
  getPromptSectionGroup,
  getPromptTagGroup,
  mergeLibraryPromptLexiconForItems,
  prunePromptLexiconsForLibraryItems,
} from "@/features/library/utils/promptLexicons";

function makeLibraryItem(id: string, prompt: string, patch: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id,
    title: patch.title ?? id,
    imageFileName: patch.imageFileName ?? `${id}.png`,
    prompt,
    negativePrompt: patch.negativePrompt ?? "",
    category: patch.category ?? "人像摄影",
    tags: patch.tags ?? [],
    createdAt: patch.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: patch.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

function getGroupLeaf(group: string): string {
  return group.split(/\s*\/\s*/u).filter(Boolean).at(-1) ?? group;
}

describe("promptLexicons", () => {
  it("groups tag labels by the leaf section group without parent hierarchy", () => {
    const lightLeafGroup = getGroupLeaf(getPromptSectionGroup("light_shadow"));
    const productLeafGroup = getGroupLeaf(getPromptSectionGroup("product_lighting"));
    const settings = createDefaultPromptLexiconSettings(["light_shadow", "productLighting", "红色", "3人", "unknown tag"]);

    expect(getPromptTagGroup("light_shadow")).toBe(lightLeafGroup);
    expect(getPromptTagGroup("productLighting")).toBe(productLeafGroup);
    expect(getPromptTagGroup("红色")).toBe("颜色分类");
    expect(getPromptTagGroup("低饱和蓝色")).toBe("颜色分类");
    expect(getPromptTagGroup("color")).toBe("颜色分类");
    expect(getPromptTagGroup("3人")).toBe("数量分类");
    expect(getPromptTagGroup("多件产品")).toBe("数量分类");
    expect(getPromptTagGroup("unknown tag", "Parent / Leaf")).toBe("Leaf");
    expect(settings.tags.find((entry) => entry.label === "light_shadow")?.group).toBe(lightLeafGroup);
    expect(settings.tags.find((entry) => entry.label === "productLighting")?.group).toBe(productLeafGroup);
    expect(settings.tags.find((entry) => entry.label === "红色")?.group).toBe("颜色分类");
    expect(settings.tags.find((entry) => entry.label === "3人")?.group).toBe("数量分类");
  });

  it("classifies scene, composition, pose, props, and material tags separately", () => {
    expect(getPromptTagGroup("斑驳树影")).toBe("光影 Lighting");
    expect(getPromptTagGroup("草地")).toBe("空间环境 Environment");
    expect(getPromptTagGroup("刺绣纹理")).toBe("材质 Material");
    expect(getPromptTagGroup("耳坠")).toBe("道具与配饰 Props");
    expect(getPromptTagGroup("湖水")).toBe("空间环境 Environment");
    expect(getPromptTagGroup("木质栈道")).toBe("空间环境 Environment");
    expect(getPromptTagGroup("平视")).toBe("构图 Composition");
    expect(getPromptTagGroup("七分身")).toBe("构图 Composition");
    expect(getPromptTagGroup("前景叶片")).toBe("构图 Composition");
    expect(getPromptTagGroup("抬手触叶")).toBe("动作姿态 Pose");
    expect(getPromptTagGroup("麻编材质")).toBe("材质 Material");
    expect(getPromptTagGroup("圆形团扇")).toBe("道具与配饰 Props");
    expect(getPromptTagGroup("中景")).toBe("构图 Composition");
    expect(getPromptTagGroup("白花")).toBe("空间环境 Environment");
    expect(getPromptTagGroup("绿叶")).toBe("空间环境 Environment");
    expect(getPromptTagGroup("闭眼")).toBe("动作姿态 Pose");
    expect(getPromptTagGroup("窗景")).toBe("空间环境 Environment");
    expect(getPromptTagGroup("流苏耳饰")).toBe("道具与配饰 Props");
    expect(getPromptTagGroup("前景花枝")).toBe("构图 Composition");
    expect(getPromptTagGroup("白色花朵")).toBe("空间环境 Environment");
    expect(getPromptTagGroup("橙色炮仗花")).toBe("空间环境 Environment");
    expect(getPromptTagGroup("麻花瓣")).toBe("空间环境 Environment");
    expect(getPromptTagGroup("花墙")).toBe("空间环境 Environment");
    expect(getPromptTagGroup("花束")).toBe("道具与配饰 Props");
    expect(getPromptTagGroup("建筑背景")).toBe("空间环境 Environment");
    expect(getPromptTagGroup("芦苇")).toBe("空间环境 Environment");
    expect(getPromptTagGroup("太阳")).toBe("空间环境 Environment");
    expect(getPromptTagGroup("太阳光")).toBe("光影 Lighting");
    expect(getPromptTagGroup("马匹")).toBe("动物 Animal");
    expect(getPromptTagGroup("牵马绳")).toBe("道具与配饰 Props");
    expect(getPromptTagGroup("刺绣纹样")).toBe("材质 Material");
    expect(getPromptTagGroup("蓬丝纹理")).toBe("材质 Material");
    expect(getPromptTagGroup("白色抹胸长裙")).toBe("服饰 Clothing");
    expect(getPromptTagGroup("橙色格纹裙")).toBe("服饰 Clothing");
    expect(getPromptTagGroup("格纹半身裙")).toBe("服饰 Clothing");
    expect(getPromptTagGroup("白色袜子")).toBe("服饰 Clothing");
    expect(getPromptTagGroup("红色帷幔")).toBe("空间环境 Environment");
    expect(getPromptTagGroup("暖色窗光")).toBe("光影 Lighting");
    expect(getPromptTagGroup("红色格纹裙")).toBe("服饰 Clothing");
    expect(getPromptTagGroup("花纹")).toBe("材质 Material");
    expect(getPromptTagGroup("红色")).toBe("颜色分类");
  });

  it("routes hair tags to the makeup/hair group instead of color", () => {
    // 纯发型核心名词经段路径收敛到「妆发与配饰」。
    expect(getPromptTagGroup("短发")).toBe("妆发与配饰");
    expect(getPromptTagGroup("长发")).toBe("妆发与配饰");
    expect(getPromptTagGroup("大波浪卷发")).toBe("妆发与配饰");
    expect(getPromptTagGroup("双马尾")).toBe("妆发与配饰");
    // 「披肩发」列全词，避免退回披肩（道具）。
    expect(getPromptTagGroup("披肩发")).toBe("妆发与配饰");
    // 颜色+发型复合词即便未经 normalizeImageTag 剖开直达此处，也按发型收敛，绝不落颜色分类。
    expect(getPromptTagGroup("粉色短发")).toBe("妆发与配饰");
    expect(getPromptTagGroup("黑色长发")).toBe("妆发与配饰");
    // 无「发」的披肩仍是道具，不误入妆发。
    expect(getPromptTagGroup("披肩")).toBe("道具与配饰 Props");
  });

  it("does not reseed defaults into an explicitly emptied tag lexicon", () => {
    const empty = {
      categories: [] as PromptImageLexiconEntry[],
      tags: [] as PromptImageLexiconEntry[],
    };

    const merged = mergeLibraryPromptLexiconForItems(
      empty,
      [makeLibraryItem("plain", "a soft portrait", { tags: ["should-not-seed-into-lexicon"] })],
      [makeLibraryItem("plain", "a soft portrait", { tags: ["should-not-seed-into-lexicon"] })],
    );

    // Material tags still index into the tag browser (AI recognition path).
    expect(merged.addedCount).toBeGreaterThan(0);
    expect(merged.promptLexicons.tags.map((entry) => entry.label)).toContain("should-not-seed-into-lexicon");
    expect(merged.promptLexicons.categories).toEqual([]);
  });

  it("indexes AI material tags into the tag lexicon without prompt capsules", () => {
    const merged = mergeLibraryPromptLexiconForItems(
      {
        categories: [],
        tags: [],
      },
      [
        makeLibraryItem("cartoon-bus", "武政谅卡通风格插画，丝网印刷风格，颗粒肌理", {
          tags: ["大众房车", "天空", "云朵", "草地", "卡通风格", "丝网印刷风格"],
        }),
      ],
      [
        makeLibraryItem("cartoon-bus", "武政谅卡通风格插画，丝网印刷风格，颗粒肌理", {
          tags: ["大众房车", "天空", "云朵", "草地", "卡通风格", "丝网印刷风格"],
        }),
      ],
    );

    expect(merged.addedCount).toBeGreaterThan(0);
    expect(merged.promptLexicons.tags.map((entry) => entry.label)).toEqual(
      expect.arrayContaining(["大众房车", "天空", "云朵", "草地", "卡通风格", "丝网印刷风格"]),
    );
  });

  it("prunes unused derived categories while preserving structured tag knowledge", () => {
    const remainingItem = makeLibraryItem("prompt-b", "镜头：{{cameraAngle: 俯视拍摄角度}}", {
      tags: ["保留标签"],
    });
    const merged = mergeLibraryPromptLexiconForItems(
      {
        categories: [],
        tags: [],
      },
      [
        makeLibraryItem("prompt-a", "镜头：{{cameraAngle: 平视拍摄角度}}", {
          tags: ["独有标签"],
        }),
        remainingItem,
      ],
      [
        makeLibraryItem("prompt-a", "镜头：{{cameraAngle: 平视拍摄角度}}", {
          tags: ["独有标签"],
        }),
        remainingItem,
      ],
    );
    const withDerivedCategory = {
      ...merged.promptLexicons,
      categories: [
        ...merged.promptLexicons.categories,
        {
          id: "derived-category-ai-custom",
          group: "AI 分类",
          label: "AI 临时分类",
          description: "",
          parentId: null,
          imageFileName: null,
        },
      ],
    };

    const result = prunePromptLexiconsForLibraryItems(withDerivedCategory, [remainingItem]);

    expect(result.removedCategoryCount).toBeGreaterThanOrEqual(1);
    expect(result.removedTagCount).toBe(0);
    expect(result.promptLexicons?.categories.some((entry) => entry.label === "AI 临时分类")).toBe(false);
    expect(result.promptLexicons?.tags.find((entry) => entry.label === "独有标签")).toEqual(merged.promptLexicons.tags.find((entry) => entry.label === "独有标签"));
    expect(result.promptLexicons?.tags.some((entry) => entry.label === "保留标签")).toBe(true);
  });
});
