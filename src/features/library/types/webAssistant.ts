/**
 * 网页助手视图（与创作画布平级的主视图）共享类型。
 *
 * 主进程 `electron/main/webAssistant/webAssistantView.ts` 与渲染层
 * `src/features/library/components/WebAssistantView.tsx` 通过 IPC 交换
 * 这几种结构；与 `canvas.ts` 里的 DoubaoWebCanvas 系列独立、互不耦合。
 */

import { IMAGE_GEN_SITE_RECOMMENDATIONS } from "./recommendationSites";

/** 兼容旧类型：自定义入口仍用该字面量作为 target id。 */
export const WEB_ASSISTANT_CUSTOM_ID = "自定义" as const;

/**
 * 用户要求从网页助手目录移除的站点（按注册域匹配）。
 * 资源推荐列表本身不改，只过滤网页助手目录。
 */
const REMOVED_SITE_DOMAINS = new Set([
  "qianwen.com",
  "xinghuo.xfyun.cn",
  "ai.360.com",
  "tongyi.aliyun.com",
  "klingai.com",
  "leonardo.ai",
  "ideogram.ai",
  "m365.cloud.microsoft",
  "gemini.google.com",
  "grok.com",
  "yige.baidu.com",
  "canva.com",
  "designer.microsoft.com",
  "firefly.adobe.com",
  "whee.com",
]);

/** 目录展示用的官方短名，去掉「Doubao / ERNIE / Image」等后缀。 */
const OFFICIAL_SITE_TITLES: Record<string, string> = {
  "chatgpt.com": "ChatGPT",
  "doubao.com": "豆包",
  "chat.qwen.ai": "通义千问",
  "yuanbao.tencent.com": "腾讯元宝",
  "yiyan.baidu.com": "文心一言",
  "chatglm.cn": "智谱清言",
  "kimi.moonshot.cn": "Kimi",
  "tiangong.cn": "天工",
  "jimeng.jianying.com": "即梦",
  "yige.baidu.com": "文心一格",
  "firefly.adobe.com": "Adobe Firefly",
  "designer.microsoft.com": "Microsoft Designer",
  "canva.com": "Canva",
  "whee.com": "美图 WHEE",
  "d.design": "堆友",
  "seaart.ai": "SeaArt",
  "liblib.art": "LiblibAI",
  "civitai.com": "Civitai",
  "tensor.art": "Tensor.Art",
  "playground.com": "Playground",
  "ai.xmiaom.com": "咕嘎咕嘎",
  "wisart.kuaileshifu.com": "智画创",
};

/** 分区 / registry 用的稳定 ascii slug，避免中文分区名导致登录态不落盘。 */
const SITE_PARTITION_SLUGS: Record<string, string> = {
  "chatgpt.com": "chatgpt",
  "doubao.com": "doubao",
  "chat.qwen.ai": "qwen",
  "yuanbao.tencent.com": "yuanbao",
  "yiyan.baidu.com": "yiyan",
  "chatglm.cn": "chatglm",
  "kimi.moonshot.cn": "kimi",
  "kimi.com": "kimi",
  "tiangong.cn": "tiangong",
  "jimeng.jianying.com": "jimeng",
  "yige.baidu.com": "yige",
  "firefly.adobe.com": "firefly",
  "designer.microsoft.com": "designer",
  "canva.com": "canva",
  "whee.com": "whee",
  "d.design": "duiyou",
  "seaart.ai": "seaart",
  "liblib.art": "liblib",
  "civitai.com": "civitai",
  "tensor.art": "tensorart",
  "playground.com": "playground",
  "ai.xmiaom.com": "xmiaom",
  "wisart.kuaileshifu.com": "wisart",
};

export type WebAssistantSiteEntry = {
  id: string;
  title: string;
  url: string;
  domain: string;
};

export type WebAssistantBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** 网页助手可打开的目标 id：站点 slug、或「自定义」。 */
export type WebAssistantTargetId = string;

/** @deprecated 仅兼容旧调用方；新代码用 WEB_ASSISTANT_SITES。 */
export type WebAssistantPlatform = "豆包" | "腾讯元宝" | "文心一言" | "智谱清言" | "Kimi" | "自定义";

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function slugFromDomain(domain: string): string {
  const mapped = SITE_PARTITION_SLUGS[domain];
  if (mapped) {
    return mapped;
  }
  return domain.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "site";
}

function officialTitleOf(domain: string, fallback: string): string {
  return OFFICIAL_SITE_TITLES[domain] ?? fallback;
}

/**
 * 扁平站点目录：资源推荐生图分类去重后的条目。
 * 同一注册域只保留一条；标题用官方短名。
 */
export const WEB_ASSISTANT_SITES: WebAssistantSiteEntry[] = (() => {
  const seen = new Set<string>();
  const sites: WebAssistantSiteEntry[] = [];
  for (const site of IMAGE_GEN_SITE_RECOMMENDATIONS) {
    const domain = site.domain.replace(/^www\./, "");
    if (REMOVED_SITE_DOMAINS.has(domain) || seen.has(domain)) {
      continue;
    }
    seen.add(domain);
    sites.push({
      id: slugFromDomain(domain),
      title: officialTitleOf(domain, site.title),
      url: site.url,
      domain,
    });
  }
  return sites;
})();

// 推荐卡片允许按运营顺序调整，但网页助手的默认站点保持为 ChatGPT。
export const WEB_ASSISTANT_DEFAULT_SITE_ID = "chatgpt";

/** 兼容旧平台名 → 新站点 id，避免已打开的会话对不上。 */
const LEGACY_PLATFORM_TO_SITE_ID: Record<string, string> = {
  豆包: "doubao",
  腾讯元宝: "yuanbao",
  文心一言: "yiyan",
  智谱清言: "chatglm",
  Kimi: "kimi",
};

export function resolveWebAssistantSiteId(targetId: string): string {
  return LEGACY_PLATFORM_TO_SITE_ID[targetId] ?? targetId;
}

export function findWebAssistantSite(targetId: string): WebAssistantSiteEntry | undefined {
  const id = resolveWebAssistantSiteId(targetId);
  return WEB_ASSISTANT_SITES.find((entry) => entry.id === id);
}

/** 分区名只允许 ascii，按站点域名稳定映射，同域站点共享登录态。 */
export function partitionSlugForTarget(targetId: string, customUrl?: string | null): string {
  if (targetId === WEB_ASSISTANT_CUSTOM_ID) {
    const domain = customUrl ? domainOf(customUrl) : "";
    return domain ? slugFromDomain(domain) : "custom";
  }
  const site = findWebAssistantSite(targetId);
  if (site) {
    return site.id;
  }
  return slugFromDomain(domainOf(targetId) || resolveWebAssistantSiteId(targetId));
}

export type WebAssistantPrepareInput = {
  /** 目标 id：站点 slug 或「自定义」。 */
  platform: WebAssistantTargetId;
  customUrl?: string | null;
  reload?: boolean;
};

/** @deprecated 仅给仍引用旧平台列表的测试/兼容代码保留。 */
export const WEB_ASSISTANT_PLATFORMS = [
  "豆包",
  "腾讯元宝",
  "文心一言",
  "智谱清言",
  "Kimi",
  "自定义",
] as const;

/** @deprecated 旧平台 URL 映射，新代码走 WEB_ASSISTANT_SITES。 */
export const WEB_ASSISTANT_PLATFORM_URLS: Record<Exclude<WebAssistantPlatform, "自定义">, string> = {
  豆包: "https://www.doubao.com/",
  腾讯元宝: "https://yuanbao.tencent.com/",
  文心一言: "https://yiyan.baidu.com/",
  智谱清言: "https://chatglm.cn/",
  Kimi: "https://www.kimi.com/",
};
