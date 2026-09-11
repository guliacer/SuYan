export const systemPreferenceSections = [
  "proxy",
  "performance",
  "appearance",
  "canvasBackground",
  "layout",
  "sidebar",
  "modules",
  "startupGallery",
] as const;

export type SystemPreferenceSection = (typeof systemPreferenceSections)[number];

export const defaultSystemPreferenceSection: SystemPreferenceSection = "proxy";

export const systemPreferenceSectionMeta: Record<
  SystemPreferenceSection,
  { label: string; description: string }
> = {
  proxy: {
    label: "网络代理",
    description: "网页解析与远程下载",
  },
  performance: {
    label: "启动加速",
    description: "GPU / 稳定渲染模式",
  },
  appearance: {
    label: "主题",
    description: "选择应用的颜色与强调色",
  },
  layout: {
    label: "界面布局",
    description: "工作区宽度与层级",
  },
  canvasBackground: {
    label: "创作页面背景",
    description: "整页底色、柔雾与背景图",
  },
  sidebar: {
    label: "边栏入口",
    description: "自定义显示的功能入口",
  },
  modules: {
    label: "模块管理",
    description: "功能开关与可选依赖",
  },
  startupGallery: {
    label: "启动图库",
    description: "启动页轮播图片",
  },
};

export function isSystemPreferenceSection(value: string): value is SystemPreferenceSection {
  return (systemPreferenceSections as readonly string[]).includes(value);
}
