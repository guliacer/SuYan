import { describe, expect, it } from "vitest";
import type { LibraryItem } from "@/features/library/types/library";
import {
  applyTagConfigurationToItems,
  orderTagsWithPreference,
} from "@/features/library/utils/tagSettings";

function makeItem(patch: Partial<LibraryItem>): LibraryItem {
  return {
    id: "item-1",
    title: "标题",
    imageFileName: "item-1.png",
    prompt: "提示词",
    negativePrompt: "",
    tags: ["品牌营销"],
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
    ...patch,
  };
}

describe("tagSettings", () => {
  it("orders existing tags with saved preferences first", () => {
    expect(orderTagsWithPreference(["品牌营销", "写作指南", "角色"], ["角色", "不存在"])).toEqual([
      "角色",
      "品牌营销",
      "写作指南",
    ]);
  });

  it("renames, removes and merges configured tags without changing unrelated tags", () => {
    const applied = applyTagConfigurationToItems(
      [
        makeItem({ id: "a", tags: ["品牌营销", "写作指南", "删除我", "效率工具"] }),
        makeItem({ id: "b", tags: ["角色", "写作指南"] }),
      ],
      ["品牌营销", "写作指南", "角色", "删除我"],
      [
        { originalTag: "角色", label: "人物设定" },
        { originalTag: "品牌营销", label: "商业" },
        { originalTag: "写作指南", label: "商业" },
      ],
      "2026-07-05T00:00:00.000Z",
    );

    expect(applied.tagOrder).toEqual(["人物设定", "商业"]);
    expect(applied.items[0].tags).toEqual(["商业", "效率工具"]);
    expect(applied.items[1].tags).toEqual(["人物设定", "商业"]);
    expect(applied.items.every((item) => item.updatedAt === "2026-07-05T00:00:00.000Z")).toBe(true);
  });
});
