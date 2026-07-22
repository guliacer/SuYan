import { describe, expect, it } from "vitest";
import {
  getHomePhotographyCategorySet,
  homePhotographyCategoryLabels,
  normalizePhotographyCategorySuggestions,
  photographyCategoryLabels,
  resolvePhotographyCategory,
} from "../../src/features/library/utils/photographyCategories";

describe("photographyCategories", () => {
  it("keeps the home category nav fixed", () => {
    expect(homePhotographyCategoryLabels).toEqual(["人像", "电商", "美食", "婚纱", "风光"]);
  });

  it("resolves legacy and broad labels to the fixed taxonomy", () => {
    expect(resolvePhotographyCategory("产品摄影")).toBe("电商产品摄影");
    expect(resolvePhotographyCategory("风光")).toBe("风景风光摄影");
    expect(resolvePhotographyCategory("婚礼")).toBe("婚纱婚礼摄影");
    expect(resolvePhotographyCategory("甜品")).toBe("甜品烘焙摄影");
    expect(resolvePhotographyCategory("咖啡摄影")).toBe("饮品调酒摄影");
    expect(resolvePhotographyCategory("日料")).toBe("日料摄影");
    expect(resolvePhotographyCategory("墨西哥料理")).toBe("墨西哥料理摄影");
    expect(resolvePhotographyCategory("极简主义")).toBe("极简主义风格");
    expect(resolvePhotographyCategory("北欧风")).toBe("北欧风格");
    expect(resolvePhotographyCategory("Y2K")).toBe("Y2K 千禧视觉");
    expect(resolvePhotographyCategory("自然光源")).toBe("自然光光影");
    expect(resolvePhotographyCategory("高光比")).toBe("高光比电影光影");
    expect(resolvePhotographyCategory("反射折射")).toBe("反射折射光学");
    expect(resolvePhotographyCategory("边缘光")).toBe("微观光学细节");
    expect(resolvePhotographyCategory("陶瓷杯")).toBe("生活道具");
    expect(resolvePhotographyCategory("包装盒")).toBe("商业品牌道具");
    expect(resolvePhotographyCategory("餐具")).toBe("美食餐具道具");
    expect(resolvePhotographyCategory("轻微使用痕迹")).toBe("使用痕迹道具");
    expect(resolvePhotographyCategory("汉服")).toBe("中国汉服体系");
    expect(resolvePhotographyCategory("唐代")).toBe("中国唐代服饰");
    expect(resolvePhotographyCategory("马面裙")).toBe("中国明代服饰");
    expect(resolvePhotographyCategory("和服")).toBe("日本和服体系");
    expect(resolvePhotographyCategory("武士服")).toBe("日本武士服饰");
    expect(resolvePhotographyCategory("莎丽")).toBe("印度莎丽");
    expect(resolvePhotographyCategory("巴洛克")).toBe("巴洛克宫廷服饰");
    expect(resolvePhotographyCategory("维多利亚")).toBe("维多利亚服饰");
  });

  it("filters unknown AI-created categories out of suggestions", () => {
    expect(normalizePhotographyCategorySuggestions(["产品摄影", "梦幻大片", "电商产品摄影"])).toEqual([
      "电商产品摄影",
    ]);
  });

  it("groups home nav labels by fixed child categories", () => {
    expect(getHomePhotographyCategorySet("人像")?.has("肖像摄影")).toBe(true);
    expect(getHomePhotographyCategorySet("美食")?.has("主食面点摄影")).toBe(true);
    expect(getHomePhotographyCategorySet("美食")?.has("法餐摄影")).toBe(true);
    expect(getHomePhotographyCategorySet("风光")?.has("航拍摄影")).toBe(true);
    expect(getHomePhotographyCategorySet("未知")).toBeNull();
  });

  it("contains the full fixed category list", () => {
    expect(photographyCategoryLabels).toContain("电商产品摄影");
    expect(photographyCategoryLabels).toContain("甜品烘焙摄影");
    expect(photographyCategoryLabels).toContain("日料摄影");
    expect(photographyCategoryLabels).toContain("水下人像/水下静物");
    expect(photographyCategoryLabels).toContain("极简主义风格");
    expect(photographyCategoryLabels).toContain("东方美学视觉");
    expect(photographyCategoryLabels).toContain("自然光光影");
    expect(photographyCategoryLabels).toContain("微观光学细节");
    expect(photographyCategoryLabels).toContain("生活道具");
    expect(photographyCategoryLabels).toContain("微观真实道具");
    expect(photographyCategoryLabels).toContain("中国汉服体系");
    expect(photographyCategoryLabels).toContain("日本和服体系");
    expect(photographyCategoryLabels).toContain("欧洲文艺复兴服饰");
    expect(photographyCategoryLabels).toContain("维多利亚服饰");
    expect(photographyCategoryLabels).toHaveLength(126);
  });
});
