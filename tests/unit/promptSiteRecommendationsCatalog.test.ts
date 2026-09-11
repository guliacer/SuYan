import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PINNED_PROMPT_SITE_URL,
  SECOND_PINNED_PROMPT_SITE_URL,
  promptSiteRecommendations,
} from "../../src/features/library/components/recommendations/PromptSiteRecommendations";
import { recommendationImageCatalog } from "../../src/features/library/components/recommendations/recommendationImageCatalog";
import { RECOMMENDATION_IMAGE_ASSET_COUNT } from "../../src/features/library/components/recommendations/recommendationImages";
import { IMAGE_GEN_SITE_RECOMMENDATIONS } from "../../src/features/library/types/recommendationSites";

const source = readFileSync(
  "src/features/library/components/recommendations/PromptSiteRecommendations.tsx",
  "utf8",
);
const sharedSitesSource = readFileSync("src/features/library/types/recommendationSites.ts", "utf8");
const imagesRoot = path.join(
  "src",
  "features",
  "library",
  "components",
  "recommendations",
  "images",
);

describe("resource recommendations catalog mirrors guliacer/resource-recommendations", () => {
  it("keeps the two pinned prompt sites first", () => {
    expect(PINNED_PROMPT_SITE_URL).toBe("https://ai.wuyeshen.de5.net/");
    expect(SECOND_PINNED_PROMPT_SITE_URL).toBe("https://pan.quark.cn/s/3b60f26d43a8");
    expect(promptSiteRecommendations[0]?.url).toBe(PINNED_PROMPT_SITE_URL);
    expect(promptSiteRecommendations[1]?.url).toBe(SECOND_PINNED_PROMPT_SITE_URL);
  });

  it("keeps the remaining requested image-generation cards in order", () => {
    expect(IMAGE_GEN_SITE_RECOMMENDATIONS.slice(0, 4).map((site) => site.url)).toEqual([
      "https://ai.xmiaom.com/sign-up?aff=bibi",
      "https://wisart.kuaileshifu.com/",
      "https://platform.agnes-ai.com",
      "https://chatgpt.com",
    ]);
  });

  it("uses the online section order and free/paid API split", () => {
    expect(source).toContain('id: "personal-projects"');
    expect(source).toContain('id: "friend-projects"');
    expect(source).toContain('id: "proxy-sites"');
    expect(source).toContain('id: "api-free"');
    expect(source).toContain('id: "api-paid"');
    expect(source).toContain('id: "prompt-sites"');
    expect(source).toContain('id: "image-gen-sites"');

    const personalIndex = source.indexOf('id: "personal-projects"');
    const friendIndex = source.indexOf('id: "friend-projects"');
    const proxyIndex = source.indexOf('id: "proxy-sites"');
    const freeApiIndex = source.indexOf('id: "api-free"');
    const paidApiIndex = source.indexOf('id: "api-paid"');
    const promptIndex = source.indexOf('id: "prompt-sites"');
    const imageGenIndex = source.indexOf('id: "image-gen-sites"');

    expect(personalIndex).toBeGreaterThan(-1);
    expect(friendIndex).toBeGreaterThan(personalIndex);
    expect(proxyIndex).toBeGreaterThan(friendIndex);
    expect(freeApiIndex).toBeGreaterThan(proxyIndex);
    expect(paidApiIndex).toBeGreaterThan(freeApiIndex);
    expect(promptIndex).toBeGreaterThan(paidApiIndex);
    expect(imageGenIndex).toBeGreaterThan(promptIndex);
  });

  it("ships the online free and paid API sites", () => {
    for (const url of [
      "https://platform.sensenova.cn/console",
      "https://ai.xmiaom.com/sign-up?aff=bibi",
      "https://gorouter.app/sign-up?aff=biyq",
      "https://windhub.cc/register?aff=o57s",
      "https://anyrouter.top/register?aff=qnYH",
      "https://fufu.iqach.top/?mode=user",
      "https://keungliang.dpdns.org/sign-up?aff=qWHi",
      "https://new.sharedchat.cc/list/#/register?i=9h0Gz",
      "https://new-api.abrdns.com/register?aff=dtPa",
      "https://aihub.top/register?aff=7KDU2ZEAA5G9",
      "https://ai.furry.edu.gr/register?aff=JQPNWTLR7R9T",
      "https://www.fastaitoken.com/register?aff=S8F8YJY426VA",
    ]) {
      expect(source).toContain(url);
    }

    // 旧的过期 free API 条目不得再出现
    expect(source).not.toContain("bmapi.020212.xyz");
    expect(source).not.toContain("api.gemai.cc");
    expect(source).not.toContain("www.guyscode.com");
    expect(source).not.toContain("ai.router.team");
    expect(source).not.toContain("api.rua.chat");
    expect(source).not.toContain("console.xiaoxuanfeng.cc");
  });

  it("includes LINUX.DO, KittyProxy, SuYan and the new image-gen L-station entries", () => {
    expect(source).toContain("https://invite.linuxdo.org");
    expect(source).toContain("https://kitty.fo/register?invite=hJmKTTDD");
    expect(source).toContain("https://github.com/guliacer/SuYan");
    expect(source).toContain("https://github.com/guliacer/TapRelay-remote-adapter-test");
    // 生图网站数组已抽到共享文件 recommendationSites.ts，最后一条在此断言。
    expect(sharedSitesSource).toContain("https://wisart.kuaileshifu.com/");
  });

  it("includes Agnes as a free image-generation recommendation with registration methods", () => {
    expect(sharedSitesSource).toContain('title: "Agnes"');
    expect(sharedSitesSource).toContain("https://platform.agnes-ai.com");
    expect(sharedSitesSource).toContain("GitHub 和 Google 注册");
    expect(recommendationImageCatalog["https://platform.agnes-ai.com"]).toEqual([
      "/images/agnes/pricing.webp",
      "/images/agnes/usage-overview.webp",
    ]);
  });

  it("ships the online recommendation screenshots and can resolve every catalog path", () => {
    expect(RECOMMENDATION_IMAGE_ASSET_COUNT).toBeGreaterThanOrEqual(80);
    expect(Object.keys(recommendationImageCatalog).length).toBeGreaterThanOrEqual(20);

    const catalogPaths = Object.values(recommendationImageCatalog).flat();
    for (const imagePath of catalogPaths) {
      const relative = imagePath.replace(/^\/images\//, "");
      expect(existsSync(path.join(imagesRoot, relative))).toBe(true);
    }

    expect(source).toContain("resolveRecommendationImageUrls");
    expect(source).toContain("RecommendationImageViewer");
    expect(source).toContain("createPortal");
    expect(source).toContain("查看");
    // 卡片默认不直接展示封面图，只在点击「查看」后打开预览；无图时不渲染查看按钮。
    expect(source).not.toContain("aspect-[16/9]");
    expect(source).not.toContain("object-cover object-top transition-transform");
    expect(source).toContain("{hasImages ? (");
    expect(source).not.toContain("disabled={!hasImages}");
  });

  it("keeps recommendation screenshots under the recommendations images directory as compressed webp", () => {
    expect(existsSync(imagesRoot)).toBe(true);
    const files = listFilesRecursive(imagesRoot);
    const webpFiles = files.filter((filePath) => filePath.endsWith(".webp"));
    const pngFiles = files.filter((filePath) => filePath.endsWith(".png"));
    expect(webpFiles.length).toBe(RECOMMENDATION_IMAGE_ASSET_COUNT);
    expect(pngFiles).toEqual([]);
  });
});

function listFilesRecursive(rootDir: string): string[] {
  const entries = readdirSync(rootDir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...listFilesRecursive(fullPath));
      continue;
    }
    files.push(fullPath);
  }

  return files;
}
