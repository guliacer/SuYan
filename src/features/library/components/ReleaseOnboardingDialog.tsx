import { ArrowRight, Brush, FolderTree, LayoutPanelTop, Sparkles, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";

type ReleaseOnboardingDialogProps = {
  isUpgrade: boolean;
  version: string;
  onComplete: () => Promise<boolean>;
};

const highlights: Array<{ icon: LucideIcon; title: string; description: string }> = [
  {
    icon: Brush,
    title: "创作画布显影",
    description: "生成前、生成中、生成后保持同一块创作空间，作品批次会完整保留并按最新结果置顶。",
  },
  {
    icon: LayoutPanelTop,
    title: "主题与柔雾背景",
    description: "创作页面背景、生成作品区和系统设置统一跟随主题，画布与作品展示更连贯。",
  },
  {
    icon: FolderTree,
    title: "分类与标签整理",
    description: "手动填写的分类和标签会持续保存，分类浏览、标签知识库与 AI 整理可以继续衔接。",
  },
  {
    icon: Sparkles,
    title: "AI 配置更清晰",
    description: "连接、模型、规则和本地 AI 能力分区管理；错误状态会给出更明确的处理入口。",
  },
];

export function ReleaseOnboardingDialog({ isUpgrade, version, onComplete }: ReleaseOnboardingDialogProps) {
  const { t } = useLocale();
  const [isSaving, setIsSaving] = useState(false);

  async function finish() {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      await onComplete();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppDialog
      overlayClassName="z-[10020] px-4 py-6"
      panelClassName="flex max-h-full w-full max-w-3xl flex-col"
      titleId="release-onboarding-title"
      onClose={() => void finish()}
    >
      <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Sparkles size={19} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-primary">{t(isUpgrade ? "本次更新引导" : "欢迎使用素言")}</p>
            <h2 className="mt-0.5 text-lg font-semibold" id="release-onboarding-title">
              {t(isUpgrade ? "先了解这次新增与优化" : "先了解素言可以做什么")}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              {t(isUpgrade ? "当前版本 v{version} 已准备好，下面用几步带你了解主要变化。" : "当前版本 v{version}，用几步了解从灵感到作品的主要工作流。", { version })}
            </p>
          </div>
        </div>
        <DialogCloseButton ariaLabel={t("跳过本次引导")} onClick={() => void finish()} />
      </header>

      <div className="min-h-0 overflow-y-auto px-5 py-5">
        <div className="grid gap-3 min-[640px]:grid-cols-2">
          {highlights.map(({ icon: Icon, title, description }) => (
            <section className="grid gap-2 rounded-xl border border-border bg-background/70 p-4" key={title}>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Icon size={16} />
                </span>
                {t(title)}
              </div>
              <p className="text-sm leading-6 text-muted">{t(description)}</p>
            </section>
          ))}
        </div>

        {isUpgrade ? (
          <div className="mt-4 rounded-xl border border-primary/25 bg-primary-soft/45 px-4 py-3 text-sm leading-6 text-foreground">
            <strong className="font-semibold">{t("升级前提醒")}</strong>
            <span className="ml-1">{t("安装版升级可能替换软件目录；如需保留本地素材和设置，请先复制整个 data 文件夹到软件目录之外。")}</span>
          </div>
        ) : null}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
        <Button className="min-h-9 px-3 py-1.5 text-xs" disabled={isSaving} variant="ghost" onClick={() => void finish()}>
          {t("跳过本次引导")}
        </Button>
        <Button className="min-h-9 px-3 py-1.5 text-xs" disabled={isSaving} icon={<ArrowRight size={14} />} variant="primary" onClick={() => void finish()}>
          {t("进入素言")}
        </Button>
      </footer>
    </AppDialog>
  );
}
