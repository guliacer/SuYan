import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ExternalLink, Globe2, Images, Star, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/LocaleProvider";
import { CAPSULE_TONES, type CapsuleTone } from "@/components/ui/capsuleTones";
import { getRecommendationImagePaths } from "./recommendationImageCatalog";
import { resolveRecommendationImageUrls } from "./recommendationImages";
import { IMAGE_GEN_SITE_RECOMMENDATIONS, type RecommendationSite } from "../../types/recommendationSites";

type PromptSiteRecommendation = RecommendationSite;

/** 固定置顶的提示词网站：始终排在「提示词网站推荐」分类的第一位。 */
export const PINNED_PROMPT_SITE_URL = "https://ai.wuyeshen.de5.net/";
/** 固定第二位的提示词网站：始终排在置顶站之后、其余站点之前。 */
export const SECOND_PINNED_PROMPT_SITE_URL = "https://pan.quark.cn/s/3b60f26d43a8";

const promptSiteRecommendations: PromptSiteRecommendation[] = [
  {
    title: "视觉提示词学习库",
    domain: "ai.wuyeshen.de5.net",
    url: PINNED_PROMPT_SITE_URL,
    description: "AI 提示词与图像灵感站点，浏览案例并复用 Prompt。",
    tags: ["提示词", "图像灵感", "案例参考"],
  },
  {
    title: "远古大呲花-提示词网盘",
    domain: "pan.quark.cn",
    url: SECOND_PINNED_PROMPT_SITE_URL,
    description: "整理的提示词知识库网盘，学习写法、案例和结构。",
    tags: ["提示词网盘", "资源分享", "案例学习"],
  },
  {
    title: "OpenNana",
    domain: "opennana.com",
    url: "https://opennana.com/?ref=4H8CJGZM",
    description: "Nano Banana / GPT Image 2 提示词图库，浏览效果图并复制 Prompt。",
    tags: ["Nano Banana", "GPT Image 2", "提示词图库"],
  },
  {
    title: "YouMind Seedance 2.0",
    domain: "youmind.com",
    url: "https://youmind.com/zh-CN/seedance-2-0-prompts",
    description: "Seedance 2.0 视频提示词库，在线看生成效果并复用提示词。",
    tags: ["Seedance 2.0", "视频提示词", "案例合集"],
  },
  {
    title: "prompts.chat",
    domain: "prompts.chat",
    url: "https://prompts.chat/prompts",
    description: "AI Prompt 社区，浏览文本/图像提示词与作者案例。",
    tags: ["Prompt 社区", "文本提示词", "案例分享"],
  },
  {
    title: "KookAIGC 图库",
    domain: "kookaigc.top",
    url: "https://kookaigc.top/?view=gallery",
    description: "AIGC 效果图库，查找视觉参考与提示词灵感。",
    tags: ["AIGC 图库", "效果参考", "提示词灵感"],
  },
  {
    title: "即梦AI",
    domain: "jimeng.jianying.com",
    url: "https://jimeng.jianying.com/ai-tool/home",
    description: "剪映 AI 创作工具，参考中文图像、视频玩法和提示词。",
    tags: ["中文工具", "图像视频", "创作灵感"],
  },
  {
    title: "civitai(C站)",
    domain: "civitai.red",
    url: "https://civitai.red/images",
    description: "C站图片灵感页，参考 SD 作品、模型效果和提示词。",
    tags: ["模型社区", "SD 生态", "图片案例"],
  },
  {
    title: "LibLibAI",
    domain: "liblib.art",
    url: "https://www.liblib.art/inspiration",
    description: "中文 AI 灵感库，查找图片案例、模型风格和提示词。",
    tags: ["中文灵感", "图像案例", "模型参考"],
  },
  {
    title: "awesome-gpt-image-2",
    domain: "gpt-image2.canghe.ai",
    url: "https://gpt-image2.canghe.ai",
    description: "GPT Image 2 案例导航，浏览多题材提示词和效果。",
    tags: ["GPT Image 2", "案例导航", "图像生成"],
  },
  {
    title: "aiart.pics",
    domain: "aiart.pics",
    url: "https://aiart.pics",
    description: "AI 艺术案例站，查找摄影、人物、产品和视觉参考。",
    tags: ["AI 艺术", "提示词案例", "视觉参考"],
  },
  {
    title: "提示词填空器",
    domain: "promptfill.tanshilong.com",
    url: "https://promptfill.tanshilong.com/explore",
    description: "提示词填空工具，拆分可替换参数并查看主题案例。",
    tags: ["参数填空", "提示词拆解", "案例探索"],
  },
  {
    title: "AI 图片 Prompt 案例库",
    domain: "webtomind.com",
    url: "https://webtomind.com/zh-CN/prompts",
    description: "中文图片 Prompt 案例库，收集题材和复用结构。",
    tags: ["中文案例库", "图像 Prompt", "题材分类"],
  },
  {
    title: "LeaderAI 立得AI",
    domain: "www.leaderai.top",
    url: "https://www.leaderai.top/#/preset-prompt-page",
    description: "设计师提示词预设页，查找图像创作和设计灵感。",
    tags: ["提示词预设", "设计灵感", "中文页面"],
  },
  {
    title: "哗啦哗啦广场",
    domain: "img.xmiaom.com",
    url: "https://img.xmiaom.com",
    description: "中文 AI 图片广场，浏览热门作品和提示词灵感。",
    tags: ["中文图片广场", "热门作品", "提示词灵感"],
  },
  {
    title: "上码 UPMA 图片提示词",
    domain: "upma.cn",
    url: "https://www.upma.cn/image-prompts",
    description: "GPT Image 2 生图案例库，参考中文案例和提示词结构。",
    tags: ["GPT Image 2", "中文案例", "图片 Prompt"],
  },
  {
    title: "SeaArt AI",
    domain: "seaart.ai",
    url: "https://www.seaart.ai/explore",
    description: "AI 创作社区，查看模型效果、角色和场景案例。",
    tags: ["创作社区", "图片探索", "模型案例"],
  },
];

type PersonalRecommendationSection = {
  id: string;
  title: string;
  description: string;
  items: PromptSiteRecommendation[];
};

/** 与线上 resource-recommendations 的 PINNED_PERSONAL_PROJECTS 对齐（静态快照，不做 GitHub 动态拉取）。 */
const personalProjectRecommendations: PromptSiteRecommendation[] = [
  {
    title: "SuYan",
    domain: "github.com",
    url: "https://github.com/guliacer/SuYan",
    description: "为 AI 创作者整理、复用和打磨提示词而生。",
    tags: ["个人项目", "提示词"],
  },
  {
    title: "TapRelay-remote-adapter-test",
    domain: "github.com",
    url: "https://github.com/guliacer/TapRelay-remote-adapter-test",
    description: "TapRelay 远程适配器测试项目。",
    tags: ["个人项目", "测试工具"],
  },
  {
    title: "ComfyUI-GuliNodes",
    domain: "github.com",
    url: "https://github.com/guliacer/ComfyUI-GuliNodes",
    description: "ComfyUI 工具合集，囊括多种有用节点与工具。",
    tags: ["个人项目", "ComfyUI", "节点扩展"],
  },
  {
    title: "Prompt Polish 提示词优化器",
    domain: "github.com",
    url: "https://github.com/guliacer/prompt-polish",
    description: "轻量级桌面提示词优化器，完整整合提示词润色功能。",
    tags: ["个人项目", "提示词优化", "桌面工具"],
  },
  {
    title: "GetPhoto 图像提取",
    domain: "github.com",
    url: "https://github.com/guliacer/GetPhoto",
    description: "油猴插件，适配多站点，支持小红书 AI 爬图。",
    tags: ["个人项目", "油猴插件", "图像提取"],
  },
  {
    title: "PagePurifier 网页优化",
    domain: "github.com",
    url: "https://github.com/guliacer/PagePurifier",
    description: "油猴插件，拉黑 B 站广告 UP，精简网页广告。",
    tags: ["个人项目", "油猴插件", "网页净化"],
  },
  {
    title: "Preview 网页图像悬浮工具",
    domain: "github.com",
    url: "https://github.com/guliacer/preview",
    description: "油猴插件，鼠标悬停即可查看图像大图。",
    tags: ["个人项目", "油猴插件", "图像预览"],
  },
  {
    title: "VeilReader 网页摸鱼小说工具",
    domain: "github.com",
    url: "https://github.com/guliacer/VeilReader",
    description: "油猴插件，摸鱼的钱才是你赚到的钱。",
    tags: ["个人项目", "油猴插件", "摸鱼阅读"],
  },
  {
    title: "CookClick 网页美化",
    domain: "github.com",
    url: "https://github.com/guliacer/cookclick",
    description: "油猴插件，点击网页随机生成符号。",
    tags: ["个人项目", "油猴插件", "网页美化"],
  },
  {
    title: "PixGo",
    domain: "github.com",
    url: "https://github.com/guliacer/PixGo",
    description: "改善索尼相机无线传图。",
    tags: ["个人项目", "软件", "无线传图"],
  },
  {
    title: "新闻 HTML 日报",
    domain: "github.com",
    url: "https://github.com/guliacer/news-html-digest",
    description: "Skill 脚本，抓取新闻，消除信息差。",
    tags: ["个人项目", "Skill", "新闻抓取"],
  },
];

const friendProjectRecommendations: PromptSiteRecommendation[] = [
  {
    title: "LINUX.DO",
    domain: "linux.do",
    url: "https://invite.linuxdo.org",
    description: "要求 GitHub 账号注册满 5 年；聚集技术大佬交流，也会分享部分公益站。",
    tags: ["友情项目", "L 站", "技术交流", "公益站"],
  },
  {
    title: "ComfyNexus",
    domain: "github.com",
    url: "https://github.com/Allen-xxa/ComfyNexus",
    description: "最好用的 ComfyUI 启动器。",
    tags: ["友情项目", "ComfyUI", "启动器"],
  },
  {
    title: "提示词小助手",
    domain: "github.com",
    url: "https://github.com/yawiii/ComfyUI-Prompt-Assistant",
    description: "最好用的提示词优化工具。",
    tags: ["友情项目", "ComfyUI", "提示词优化"],
  },
];

/** 与线上 resource-recommendations 的 apiSites.free 对齐。 */
const freeApiSiteRecommendations: PromptSiteRecommendation[] = [
  {
    title: "商汤 token-plan",
    domain: "platform.sensenova.cn",
    url: "https://platform.sensenova.cn/console",
    description: "免费模型，手机号登陆，不可签到。",
    tags: ["免费", "商汤", "免费模型"],
  },
  {
    title: "咕嘎咕嘎",
    domain: "ai.xmiaom.com",
    url: "https://ai.xmiaom.com/sign-up?aff=bibi",
    description: "多方式注册，可签到，可生图。",
    tags: ["免费", "多方式注册", "可签到", "可生图"],
  },
  {
    title: "Gorouter",
    domain: "gorouter.app",
    url: "https://gorouter.app/sign-up?aff=biyq",
    description: "可免费使用 Claude；GitHub 账户注册赠送 50 美元，邀请注册额外赠送 20 美元；可签到，需在个人资料页操作。",
    tags: ["免费", "Claude", "GitHub 注册", "注册赠送"],
  },
  {
    title: "Ark API",
    domain: "windhub.cc",
    url: "https://windhub.cc/register?aff=o57s",
    description: "L 站账号注册，可签到；提供 AI slots、宠物培养、模型股市和每日任务等玩法。",
    tags: ["免费", "L 站公益", "可签到", "AI 玩法"],
  },
  {
    title: "AnyRouter",
    domain: "anyrouter.top",
    url: "https://anyrouter.top/register?aff=qnYH",
    description: "L 站账号注册，无需注册码；每天 8 点后登录自动签到，获得 25 额度。",
    tags: ["免费", "L 站", "自动签到"],
  },
  {
    title: "MIMO 公益站",
    domain: "fufu.iqach.top",
    url: "https://fufu.iqach.top/?mode=user",
    description: "L 站注册，不可签到，没有额度限制。",
    tags: ["免费", "L 站公益", "不限额度"],
  },
  {
    title: "New Cross",
    domain: "keungliang.dpdns.org",
    url: "https://keungliang.dpdns.org/sign-up?aff=qWHi",
    description: "L 站注册，可签到，支持多渠道。",
    tags: ["免费", "L 站公益", "可签到", "多渠道"],
  },
  {
    title: "Sharedchat",
    domain: "new.sharedchat.cc",
    url: "https://new.sharedchat.cc/list/#/register?i=9h0Gz",
    description: "QQ 邮箱注册，不可签到，每天提供 50 额度。",
    tags: ["免费", "QQ 邮箱注册", "每日 50 额度", "不可签到"],
  },
  {
    title: "Abrdns",
    domain: "new-api.abrdns.com",
    url: "https://new-api.abrdns.com/register?aff=dtPa",
    description: "L 站注册，可签到。",
    tags: ["免费", "L 站", "可签到"],
  },
];

/** 与线上 resource-recommendations 的 apiSites.paid 对齐。 */
const paidApiSiteRecommendations: PromptSiteRecommendation[] = [
  {
    title: "AIHub",
    domain: "aihub.top",
    url: "https://aihub.top/register?aff=7KDU2ZEAA5G9",
    description: "多种方式注册，可向群管理申请新用户额度；L 站注册直接赠送 10 美元。推荐 GPT-5.6 luna max；不可签到，支持多渠道，低倍率。",
    tags: ["收费", "L 站注册", "低倍率", "多渠道", "GPT-5.6"],
  },
  {
    title: "PawsAI",
    domain: "ai.furry.edu.gr",
    url: "https://ai.furry.edu.gr/register?aff=JQPNWTLR7R9T",
    description: "多种方式注册，可使用生图；注册赠送 5 美元，不可签到，部分时段提供免费分组。",
    tags: ["收费", "生图", "注册赠送", "免费分组"],
  },
  {
    title: "FastAI 模型",
    domain: "www.fastaitoken.com",
    url: "https://www.fastaitoken.com/register?aff=S8F8YJY426VA",
    description: "QQ 邮箱注册，不可签到，但价格较低。",
    tags: ["收费", "低价模型"],
  },
];

/** 与线上 resource-recommendations 的 proxySiteRecommendations 对齐。 */
const proxySiteRecommendations: PromptSiteRecommendation[] = [
  {
    title: "KittyProxy",
    domain: "kitty.fo",
    url: "https://kitty.fo/register?invite=hJmKTTDD",
    description: "多客户端可用，支持多种套餐，最低 1.5 元/128GB/月。",
    tags: ["代理推荐", "多客户端", "低价流量"],
  },
];

const imageGenSiteRecommendations = IMAGE_GEN_SITE_RECOMMENDATIONS;

export type PromptSiteRecommendationsViewProps = {
  sites: PromptSiteRecommendation[];
  starredUrls: string[];
  onToggleStar: (url: string) => void;
  onCopySiteUrl: (site: PromptSiteRecommendation) => void;
  onOpenSite: (site: PromptSiteRecommendation) => void;
};

/**
 * 分类内排序：置顶站永远第一、第二置顶站永远第二，其余「星标优先」并保持各自原始相对顺序（稳定排序）。
 */
function rankPinned(url: string): number {
  if (url === PINNED_PROMPT_SITE_URL) {
    return 0;
  }
  if (url === SECOND_PINNED_PROMPT_SITE_URL) {
    return 1;
  }
  return 2;
}

function orderRecommendations(
  items: PromptSiteRecommendation[],
  starredUrls: Set<string>,
): PromptSiteRecommendation[] {
  return items
    .map((site, index) => ({ site, index }))
    .sort((a, b) => {
      const aPinned = rankPinned(a.site.url);
      const bPinned = rankPinned(b.site.url);
      if (aPinned !== bPinned) {
        return aPinned - bPinned;
      }
      const aStarred = starredUrls.has(a.site.url) ? 0 : 1;
      const bStarred = starredUrls.has(b.site.url) ? 0 : 1;
      if (aStarred !== bStarred) {
        return aStarred - bStarred;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.site);
}

export function PromptSiteRecommendationsView({ sites, starredUrls, onToggleStar, onCopySiteUrl, onOpenSite }: PromptSiteRecommendationsViewProps) {
  const { t } = useLocale();
  const starredUrlSet = new Set(starredUrls);
  // 分类与线上 resource-recommendations 的 index.js 对齐：
  // 个人项目 → 友情项目 → 代理推荐 → 免费 API → 收费 API → 提示词网站 → 生图网站。
  const sections: PersonalRecommendationSection[] = [
    {
      id: "personal-projects",
      title: "个人项目",
      description: "自研节点、脚本和小工具，覆盖图像抓取、网页效率、传图与信息聚合。",
      items: personalProjectRecommendations,
    },
    {
      id: "friend-projects",
      title: "友情项目",
      description: "推荐的 ComfyUI 启动器、提示词优化工具和知识库。",
      items: friendProjectRecommendations,
    },
    {
      id: "proxy-sites",
      title: "代理推荐",
      description: "多客户端可用的代理服务，支持多种套餐。",
      items: proxySiteRecommendations,
    },
    {
      id: "api-free",
      title: "免费 API",
      description: "无需付费即可使用的 API 中转站。",
      items: freeApiSiteRecommendations,
    },
    {
      id: "api-paid",
      title: "收费 API",
      description: "按量计费的 API 中转站。",
      items: paidApiSiteRecommendations,
    },
    {
      id: "prompt-sites",
      title: "提示词网站推荐",
      description: "常用提示词社区、图像灵感库和官方提示词资料。",
      items: sites,
    },
    {
      id: "image-gen-sites",
      title: "生图网站推荐",
      description: "综合助手、专业绘画、设计工具和模型社区，多为免费额度的在线生图平台。",
      items: imageGenSiteRecommendations,
    },
  ];

  const totalRecommendationCount = sections.reduce((sum, section) => sum + section.items.length, 0);

  return (
    <div data-feature-guide="prompt-sites-catalog" className="grid gap-5">
      <header className="grid gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted">{t("资源推荐")}</p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-foreground">{t("资源推荐")}</h1>
          </div>
          <span className="rounded-full border border-border bg-panel px-3 py-1 text-xs font-medium text-muted">
            {t("{count} 个推荐", { count: totalRecommendationCount })}
          </span>
        </div>
      </header>

      {sections.map((section) => (
        <section key={section.id} className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border/60 pb-2">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground">{t(section.title)}</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-muted">{t(section.description)}</p>
            </div>
            <span className="rounded-full border border-border bg-panel px-3 py-1 text-xs font-medium text-muted">
              {t("{count} 个", { count: section.items.length })}
            </span>
          </div>
          <div className="grid gap-3 min-[760px]:grid-cols-2 min-[1180px]:grid-cols-3">
            {orderRecommendations(section.items, starredUrlSet).map((site) => {
              const originalIndex = section.items.indexOf(site);
              return (
                <PromptSiteRecommendationCard
                  key={site.url}
                  site={site}
                  tone={promptSiteCardToneClassNames[originalIndex % promptSiteCardToneClassNames.length]}
                  starred={starredUrlSet.has(site.url)}
                  onToggleStar={() => onToggleStar(site.url)}
                  onCopyUrl={() => onCopySiteUrl(site)}
                  onOpen={() => onOpenSite(site)}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export type PromptSiteCardToneClassNames = {
  article: string;
  button: string;
  header: string;
  icon: string;
  tag: string;
};

const PROMPT_SITE_CARD_TONES: CapsuleTone[] = [
  "sage",
  "mist",
  "rose",
  "sand",
  "lavender",
  "clay",
  "primary",
  "stone",
];

export const promptSiteCardToneClassNames: PromptSiteCardToneClassNames[] = PROMPT_SITE_CARD_TONES.map(
  (tone) => {
    const classNames = CAPSULE_TONES[tone];
    return {
      article: classNames.borderHover,
      button: classNames.buttonOutline,
      header: classNames.solid,
      icon: classNames.iconTone,
      tag: classNames.solid,
    };
  },
);

type PromptSiteRecommendationCardProps = {
  site: PromptSiteRecommendation;
  tone: PromptSiteCardToneClassNames;
  starred: boolean;
  onToggleStar: () => void;
  onCopyUrl: () => void;
  onOpen: () => void;
};

function PromptSiteRecommendationCard({ site, tone, starred, onToggleStar, onCopyUrl, onOpen }: PromptSiteRecommendationCardProps) {
  const { t } = useLocale();
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const imageUrls = resolveRecommendationImageUrls(getRecommendationImagePaths(site.url));
  const hasImages = imageUrls.length > 0;
  const localizedTitle = t(site.title);

  return (
    <article
      className={`group/site grid overflow-hidden rounded-xl border bg-panel shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-image focus-within:-translate-y-1 focus-within:shadow-image ${tone.article}`}
    >
      <div className={`flex min-h-10 items-center gap-2 border-b px-4 py-2 ${tone.header}`}>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-foreground group-hover/site:text-current">{localizedTitle}</h2>
        </div>
        <button
          data-feature-guide="prompt-sites-star"
          aria-label={starred ? t("取消星标：{title}", { title: localizedTitle }) : t("星标并置顶：{title}", { title: localizedTitle })}
          aria-pressed={starred}
          className={`icon-tooltip-button flex size-7 shrink-0 items-center justify-center rounded-lg outline-none transition-all hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary/25 ${
            starred ? "text-warning" : "text-muted hover:text-foreground"
          }`}
          data-tooltip-align="end"
          data-tooltip-placement="above"
          type="button"
          onClick={onToggleStar}
        >
          <Star size={16} className={starred ? "fill-current" : ""} />
          <span className="icon-tooltip-button__bubble" role="tooltip">
            {starred ? t("取消星标") : t("星标置顶")}
          </span>
        </button>
      </div>

      <div className="grid gap-2 p-4">
        <p className="line-clamp-2 text-sm leading-5 text-muted">{t(site.description)}</p>

        <div className="flex flex-wrap gap-1.5">
          {site.tags.map((tag) => (
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${tone.tag}`} key={tag}>
              {t(tag)}
            </span>
          ))}
        </div>

        <div data-feature-guide="prompt-sites-actions" className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className={`min-h-8 w-fit px-2.5 py-1.5 text-xs shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-elevated ${tone.button}`}
              icon={<ExternalLink size={14} />}
              onClick={onOpen}
            >
              {t("直达")}
            </Button>
            {hasImages ? (
              <Button
                className={`min-h-8 w-fit px-2.5 py-1.5 text-xs shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-elevated ${tone.button}`}
                icon={<Images size={14} />}
                onClick={() => setIsViewerOpen(true)}
                title={t("查看 {title} 的图片", { title: localizedTitle })}
              >
                {t("查看 {count}", { count: imageUrls.length })}
              </Button>
            ) : null}
          </div>
          <button
            aria-label={t("复制网址：{title}", { title: localizedTitle })}
            className={`icon-tooltip-button flex size-9 shrink-0 items-center justify-center rounded-lg border bg-panel/85 shadow-sm outline-none transition-all hover:-translate-y-0.5 hover:shadow-elevated focus-visible:ring-2 focus-visible:ring-primary/25 ${tone.icon}`}
            data-tooltip-align="end"
            data-tooltip-placement="above"
            type="button"
            onClick={onCopyUrl}
          >
            <Globe2 size={15} />
            <span className="icon-tooltip-button__bubble" role="tooltip">
              {t("复制网址")}
            </span>
          </button>
        </div>
      </div>

      {isViewerOpen && hasImages
        ? createPortal(
            <RecommendationImageViewer images={imageUrls} title={localizedTitle} onClose={() => setIsViewerOpen(false)} />,
            document.body,
          )
        : null}
    </article>
  );
}

type RecommendationImageViewerProps = {
  images: string[];
  title: string;
  onClose: () => void;
};

function RecommendationImageViewer({ images, title, onClose }: RecommendationImageViewerProps) {
  const { t } = useLocale();
  const [activeIndex, setActiveIndex] = useState(0);
  const currentImage = images[activeIndex] ?? images[0];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveIndex((current) => (current - 1 + images.length) % images.length);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % images.length);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [images.length, onClose]);

return (
    <div
      className="app-window-overlay z-[80] flex items-stretch justify-stretch bg-overlay/75 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <section
        aria-label={t("{title} 截图预览", { title })}
        aria-modal="true"
        className="grid size-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-2xl border border-border bg-panel shadow-image"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">{t("截图预览")}</p>
            <h3 className="truncate text-base font-semibold text-foreground">{title}</h3>
          </div>
          <button
            aria-label={t("关闭预览")}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-panel/80 text-muted transition-colors hover:bg-primary-soft hover:text-foreground"
            type="button"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>

        <div className="relative grid min-h-0 place-items-center overflow-hidden bg-background px-14 py-4">
          <button
            aria-label={t("上一张")}
            className="absolute left-3 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-panel/90 text-foreground shadow-sm transition-colors hover:bg-primary-soft"
            type="button"
            onClick={() => setActiveIndex((current) => (current - 1 + images.length) % images.length)}
          >
            <ChevronLeft size={18} />
          </button>
          <img alt={t("{title} 截图 {index}", { title, index: activeIndex + 1 })} className="max-h-full max-w-full object-contain" src={currentImage} />
          <button
            aria-label={t("下一张")}
            className="absolute right-3 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-panel/90 text-foreground shadow-sm transition-colors hover:bg-primary-soft"
            type="button"
            onClick={() => setActiveIndex((current) => (current + 1) % images.length)}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <footer className="grid gap-3 border-t border-border px-4 py-3">
          <p className="text-center text-xs text-muted" aria-live="polite">
            {activeIndex + 1} / {images.length}
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((image, index) => (
              <button
                aria-current={index === activeIndex ? "true" : undefined}
                aria-label={t("查看第 {index} 张", { index: index + 1 })}
                className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border transition-colors ${
                  index === activeIndex ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"
                }`}
                key={image}
                type="button"
                onClick={() => setActiveIndex(index)}
              >
                <img alt="" className="size-full object-cover object-top" src={image} />
              </button>
            ))}
          </div>
        </footer>
      </section>
    </div>
  );
}

export { promptSiteRecommendations };
export type { PromptSiteRecommendation };
