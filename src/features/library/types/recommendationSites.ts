/**
 * 资源推荐共享的站点数据。
 *
 * 原来定义在 `components/recommendations/PromptSiteRecommendations.tsx` 内部，
 * 网页助手（WebAssistantView）需要把「生图网站推荐」组织成可打开网页的目录，
 * 因此把类型与「生图网站」数组抽到这里共享，避免两处维护同一份数据。
 * 其余分类数组（个人项目/友情项目/代理/API/提示词）仍留在组件文件内。
 */

export type RecommendationSite = {
  description: string;
  domain: string;
  tags: string[];
  title: string;
  url: string;
};

/**
 * 与线上 resource-recommendations 的生图分类对齐。
 *
 * 维护顺序：后续新增的生图站点插入数组最前面；当前前四位是用户指定的重点卡片，
 * 新增站点会自然排在它们之前，其余历史卡片保持原有相对顺序。
 */
export const IMAGE_GEN_SITE_RECOMMENDATIONS: RecommendationSite[] = [
  {
    title: "咕嘎咕嘎",
    domain: "ai.xmiaom.com",
    url: "https://ai.xmiaom.com/sign-up?aff=bibi",
    description: "多方式注册，可签到，可生图。",
    tags: ["L 站", "多方式注册", "可签到", "可生图"],
  },
  {
    title: "智画创",
    domain: "wisart.kuaileshifu.com",
    url: "https://wisart.kuaileshifu.com/",
    description: "L 站注册，需要注册码，可签到，可玩小游戏。",
    tags: ["L 站注册", "需要注册码", "可签到", "小游戏"],
  },
  {
    title: "Agnes",
    domain: "platform.agnes-ai.com",
    url: "https://platform.agnes-ai.com",
    description: "免费生图平台，Agnes Image 2.0 Flash 与 2.1 Flash 当前可免费使用；支持 GitHub 和 Google 注册。",
    tags: ["免费生图", "Agnes Image", "GitHub 注册", "Google 注册"],
  },
  {
    title: "ChatGPT Image",
    domain: "chatgpt.com",
    url: "https://chatgpt.com",
    description: "OpenAI GPT 图像生成，提示词理解强，适合人物、插画和海报。",
    tags: ["综合助手", "免费额度", "GPT 生图"],
  },
  {
    title: "Gemini + Nano Banana",
    domain: "gemini.google.com",
    url: "https://gemini.google.com",
    description: "Google 图像模型，图片编辑强，人物一致性优秀。",
    tags: ["综合助手", "免费额度", "人物一致"],
  },
  {
    title: "Grok Imagine",
    domain: "grok.com",
    url: "https://grok.com",
    description: "xAI 创意生成开放，风格丰富。",
    tags: ["综合助手", "免费额度", "创意风格"],
  },
  {
    title: "豆包 Doubao",
    domain: "doubao.com",
    url: "https://www.doubao.com",
    description: "字节 AI 助手，中文理解优秀，头像、插画、海报方便。",
    tags: ["综合助手", "免费", "中文生图"],
  },
  {
    title: "千问 Qianwen",
    domain: "qianwen.com",
    url: "https://www.qianwen.com",
    description: "阿里官方 AI 助手，支持多模态创作。",
    tags: ["综合助手", "免费额度", "多模态"],
  },
  {
    title: "通义千问 Qwen Chat",
    domain: "chat.qwen.ai",
    url: "https://chat.qwen.ai",
    description: "Qwen 官方聊天入口，支持图片生成。",
    tags: ["综合助手", "免费额度", "Qwen 生图"],
  },
  {
    title: "腾讯元宝",
    domain: "yuanbao.tencent.com",
    url: "https://yuanbao.tencent.com/",
    description: "腾讯混元大模型，支持图片生成与多模态问答。",
    tags: ["综合助手", "免费额度", "混元模型"],
  },
  {
    title: "Microsoft Copilot Chat",
    domain: "m365.cloud.microsoft",
    url: "https://m365.cloud.microsoft/chat",
    description: "微软 AI 助手，支持图片生成，办公场景结合强（视账号权限）。",
    tags: ["综合助手", "免费额度", "办公场景"],
  },
  {
    title: "文心一言 ERNIE",
    domain: "yiyan.baidu.com",
    url: "https://yiyan.baidu.com",
    description: "百度 AI 助手，支持图片创作。",
    tags: ["综合助手", "免费额度", "百度生图"],
  },
  {
    title: "智谱清言",
    domain: "chatglm.cn",
    url: "https://chatglm.cn",
    description: "GLM 大模型，支持多模态创作。",
    tags: ["综合助手", "部分免费", "GLM 模型"],
  },
  {
    title: "Kimi",
    domain: "kimi.moonshot.cn",
    url: "https://kimi.moonshot.cn",
    description: "月之暗面 AI 助手，长文本强，具备多模态能力。",
    tags: ["综合助手", "部分支持", "多模态"],
  },
  {
    title: "讯飞星火",
    domain: "xinghuo.xfyun.cn",
    url: "https://xinghuo.xfyun.cn",
    description: "科大讯飞大模型，支持图像创作。",
    tags: ["综合助手", "部分免费", "讯飞模型"],
  },
  {
    title: "天工 AI",
    domain: "tiangong.cn",
    url: "https://www.tiangong.cn",
    description: "昆仑万维 AI 助手，支持图像生成。",
    tags: ["综合助手", "免费额度", "天工模型"],
  },
  {
    title: "360 智脑",
    domain: "ai.360.com",
    url: "https://ai.360.com",
    description: "360 AI 助手，支持图片生成。",
    tags: ["综合助手", "免费", "360 模型"],
  },
  {
    title: "通义万相",
    domain: "tongyi.aliyun.com",
    url: "https://tongyi.aliyun.com/wanxiang",
    description: "阿里专业 AI 绘画，中文提示词理解强。",
    tags: ["专业生图", "免费额度", "中文绘画"],
  },
  {
    title: "可灵 AI",
    domain: "klingai.com",
    url: "https://klingai.com",
    description: "快手可灵，支持图片与视频生成。",
    tags: ["专业生图", "免费积分", "图片视频"],
  },
  {
    title: "即梦 AI",
    domain: "jimeng.jianying.com",
    url: "https://jimeng.jianying.com",
    description: "字节跳动生图产品，中文体验好。",
    tags: ["专业生图", "免费", "中文体验"],
  },
  {
    title: "文心一格",
    domain: "yige.baidu.com",
    url: "https://yige.baidu.com",
    description: "百度 AI 绘画平台。",
    tags: ["专业生图", "免费额度", "百度绘画"],
  },
  {
    title: "Leonardo AI",
    domain: "leonardo.ai",
    url: "https://leonardo.ai",
    description: "游戏原画与概念设计生图平台。",
    tags: ["专业生图", "每日额度", "游戏原画"],
  },
  {
    title: "Ideogram",
    domain: "ideogram.ai",
    url: "https://ideogram.ai",
    description: "海报文字生成优秀的生图平台。",
    tags: ["专业生图", "免费额度", "文字海报"],
  },
  {
    title: "Adobe Firefly",
    domain: "firefly.adobe.com",
    url: "https://firefly.adobe.com",
    description: "Adobe 商业设计生图，商用友好。",
    tags: ["专业生图", "免费积分", "商业设计"],
  },
  {
    title: "Microsoft Designer",
    domain: "designer.microsoft.com",
    url: "https://designer.microsoft.com",
    description: "微软海报设计与办公图片生成。",
    tags: ["设计工具", "免费", "海报设计"],
  },
  {
    title: "Canva AI",
    domain: "canva.com",
    url: "https://www.canva.com",
    description: "社媒设计与海报制作的 AI 工具。",
    tags: ["设计工具", "免费额度", "社媒海报"],
  },
  {
    title: "美图 WHEE",
    domain: "whee.com",
    url: "https://www.whee.com",
    description: "美图 AI 生图，擅长人像与美化。",
    tags: ["设计工具", "免费额度", "人像美图"],
  },
  {
    title: "堆友 AI",
    domain: "d.design",
    url: "https://d.design",
    description: "阿里电商设计与商品图生成。",
    tags: ["设计工具", "免费", "电商商品图"],
  },
  {
    title: "SeaArt AI",
    domain: "seaart.ai",
    url: "https://www.seaart.ai",
    description: "模型丰富的 AI 生图社区。",
    tags: ["模型社区", "免费积分", "模型丰富"],
  },
  {
    title: "LiblibAI",
    domain: "liblib.art",
    url: "https://www.liblib.art",
    description: "国内 SD 社区，模型与作品丰富。",
    tags: ["模型社区", "免费", "SD 社区"],
  },
  {
    title: "Civitai",
    domain: "civitai.com",
    url: "https://civitai.com",
    description: "全球最大 SD 模型社区。",
    tags: ["模型社区", "部分免费", "SD 模型"],
  },
  {
    title: "Tensor.Art",
    domain: "tensor.art",
    url: "https://tensor.art",
    description: "支持 SDXL / Flux 模型的生图社区。",
    tags: ["模型社区", "免费额度", "SDXL / Flux"],
  },
  {
    title: "Playground AI",
    domain: "playground.com",
    url: "https://playground.com",
    description: "支持图片生成与编辑的生图平台。",
    tags: ["模型社区", "免费额度", "图片编辑"],
  },
];
