import { describe, expect, it } from "vitest";
import { groupPromptImages, getPromptImageGroupKey } from "@/features/library/utils/promptImageGroups";
import { filterPromptCards, toPromptCardData, sortPromptCards } from "@/features/library/utils/promptFilters";
import type { LibraryItem } from "@/features/library/types/library";

function generateMockItems(count: number): LibraryItem[] {
  const categories = ["人像", "风景", "美食", "建筑", "动物", "科技", "艺术", "抽象", "未分类"];
  const tagPool = [
    "高清", "4K", "写实", "动漫", "水彩", "油画", "赛博朋克", "蒸汽朋克",
    "自然光", "暖色调", "冷色调", "极简", "复古", "未来", "梦幻", "暗黑",
    "柔和", "鲜艳", "单色", "渐变", "对比", "平衡", "动态", "静态",
  ];
  const models = ["Stable Diffusion XL", "Midjourney v6", "DALL-E 3", "Flux", "本地提示词"];

  const items: LibraryItem[] = [];

  for (let i = 0; i < count; i++) {
    const tagCount = 1 + (i % 5);
    const tags: string[] = [];
    for (let t = 0; t < tagCount; t++) {
      tags.push(tagPool[(i + t * 7) % tagPool.length]);
    }

    items.push({
      id: `item-${String(i).padStart(6, "0")}`,
      title: `测试素材标题 ${i} - ${categories[i % categories.length]}风格作品`,
      imageFileName: `item-${String(i).padStart(6, "0")}.jpg`,
      prompt: `a beautiful ${categories[i % categories.length]} scene, ${tags.join(", ")}, highly detailed, 8k resolution, masterpiece, cinematic lighting, volumetric fog, ray tracing, octane render, ultra realistic photography`,
      negativePrompt: i % 3 === 0 ? "blurry, low quality, bad anatomy, watermark, text, signature" : "",
      category: categories[i % categories.length],
      tags,
      generationMethod: models[i % models.length],
      createdAt: new Date(Date.now() - i * 60_000).toISOString(),
      updatedAt: new Date(Date.now() - i * 30_000).toISOString(),
    });
  }

  return items;
}

describe("压力测试：5600 条素材性能验证", () => {
  const itemCount = 5600;
  const mockItems = generateMockItems(itemCount);
  const promptCards = mockItems.map(toPromptCardData);
  const likedImageIds = mockItems.slice(0, 100).map((item) => item.id);

  it(`toPromptCardData: ${itemCount} 条转换 < 2000ms（冷路径，仅数据变更时执行）`, () => {
    const start = performance.now();
    const cards = mockItems.map(toPromptCardData);
    const elapsed = performance.now() - start;

    expect(cards).toHaveLength(itemCount);
    expect(elapsed).toBeLessThan(2000);
  });

  it(`filterPromptCards: ${itemCount} 条全量过滤 < 100ms`, () => {
    const start = performance.now();
    const result = filterPromptCards(promptCards, {
      query: "",
      category: "all",
      activeTag: null,
      sortMode: "importedAt",
      sortDirection: "desc",
    });
    const elapsed = performance.now() - start;

    expect(result).toHaveLength(itemCount);
    expect(elapsed).toBeLessThan(100);
  });

  it(`filterPromptCards: ${itemCount} 条带关键词搜索 < 100ms`, () => {
    const start = performance.now();
    const result = filterPromptCards(promptCards, {
      query: "风景",
      category: "all",
      activeTag: null,
      sortMode: "importedAt",
      sortDirection: "desc",
    });
    const elapsed = performance.now() - start;

    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThan(itemCount);
    expect(elapsed).toBeLessThan(100);
  });

  it(`filterPromptCards: ${itemCount} 条按分类 + 标签过滤 < 100ms`, () => {
    const start = performance.now();
    const result = filterPromptCards(promptCards, {
      query: "",
      category: "人像",
      activeTag: "高清",
      sortMode: "updatedAt",
      sortDirection: "asc",
    });
    const elapsed = performance.now() - start;

    expect(result.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(100);
  });

  it(`sortPromptCards: ${itemCount} 条排序 < 100ms`, () => {
    const start = performance.now();
    const sorted = sortPromptCards(promptCards, "importedAt", "desc");
    const elapsed = performance.now() - start;

    expect(sorted).toHaveLength(itemCount);
    expect(elapsed).toBeLessThan(100);
  });

  it(`groupPromptImages: ${itemCount} 条分组 < 200ms`, () => {
    const start = performance.now();
    const groups = groupPromptImages(promptCards, likedImageIds);
    const elapsed = performance.now() - start;

    expect(groups.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(200);
  });

  it(`getPromptImageGroupKey: ${itemCount} 条 key 计算 < 100ms`, () => {
    const start = performance.now();
    for (const card of promptCards) {
      getPromptImageGroupKey(card);
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });

  it(`综合流水线: 转换 → 过滤 → 排序 → 分组 总计 < 2500ms`, () => {
    const warmupCards = mockItems.slice(0, 100).map(toPromptCardData);
    filterPromptCards(warmupCards, { query: "", category: "all", activeTag: null, sortMode: "importedAt", sortDirection: "desc" });

    const start = performance.now();

    const cards = mockItems.map(toPromptCardData);
    const filtered = filterPromptCards(cards, {
      query: "美食",
      category: "all",
      activeTag: null,
      sortMode: "importedAt",
      sortDirection: "desc",
    });
    sortPromptCards(filtered, "importedAt", "desc");
    groupPromptImages(filtered, likedImageIds);

    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(2500);
  });
});
