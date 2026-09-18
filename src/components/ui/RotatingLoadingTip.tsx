import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";

export type RotatingLoadingTipKind = "analysis" | "export" | "processing" | "update";

export const rotatingLoadingTipMessages: Record<RotatingLoadingTipKind, readonly string[]> = {
  analysis: [
    "先把这堆灵感排个队，别让它们互相插话",
    "正在给提示词做一次温柔的拆解",
    "正在给每个词找它该坐的位置",
    "复杂任务先拆成小步骤，我们一块儿来",
    "正在认真归纳，认真到差点忘了喝水",
    "正在把灵感里的重点圈出来",
    "正在给分类和标签牵线搭桥",
    "信息有点多，先给它们排个队形",
    "正在检查：这个标签到底是不是标签",
    "别急，AI 正在把画面看懂再下结论",
    "正在翻阅提示词的小词典",
    "分类马上出炉，先让模型把锅烧热",
  ],
  export: [
    "先把素材排好队，再一起装进小包裹",
    "正在给文件整理行李，马上出发",
    "正在检查每张图，避免有人落单",
    "打包这件事急不得，压缩得漂亮才算赢",
    "正在把分类、标签和提示词一起系好",
    "正在给备份包做最后的安全检查",
    "素材有点多，但我们正在稳稳搬运",
    "正在把大文件分成更好携带的份量",
    "文件们正在排队进入压缩包，请保持秩序",
    "快好了，最后确认一下有没有漏带",
  ],
  processing: [
    "先把任务排好队，别让它们互相踩脚",
    "模型正在认真思考，暂时没有摸鱼",
    "正在给这次操作打磨边角",
    "数据马上到位，先让它们排队进场",
    "这一步需要一点耐心，AI 正在把事情做好",
    "正在核对细节，避免结果少带一只螺丝",
    "后台正在忙活，你可以先看看别的地方",
    "进度条没说话，但事情确实在推进",
    "正在把复杂问题拆开，不让它们打结",
    "快好了，正在进行最后一轮确认",
  ],
  update: [
    "正在给新版本铺红毯，旧版本先别吃醋",
    "升级行李正在打包，data 文件夹记得一起照看",
    "正在确认下载入口，避免把软件送去奇怪的地方",
    "版本号已经排好队，马上轮到安装器登场",
    "正在把升级步骤理顺，别让进度条跑错片场",
    "新版本在门口挥手，先检查一下通行证",
    "下载页面正在热身，安装器很快接棒",
    "正在给这次升级做最后的礼貌确认",
    "升级不赶路，先把每一步走稳再出发",
    "进度条正在认真工作，暂时没有摸鱼",
  ],
};

export function pickNextRotatingLoadingTipIndex(currentIndex: number, count: number, random = Math.random): number {
  if (count <= 1) return 0;
  const candidate = Math.floor(random() * (count - 1));
  return candidate >= currentIndex ? candidate + 1 : candidate;
}

export function pickRandomRotatingLoadingTipIndex(count: number, random = Math.random): number {
  return count <= 1 ? 0 : Math.floor(random() * count);
}

export function pickRotatingLoadingTipDelay(
  minMs: number,
  maxMs: number,
  random = Math.random,
): number {
  const safeMin = Number.isFinite(minMs) ? Math.max(0, minMs) : 0;
  const safeMax = Number.isFinite(maxMs) ? Math.max(safeMin, maxMs) : safeMin;
  return Math.round(safeMin + (safeMax - safeMin) * random());
}

type RotatingLoadingTipProps = {
  kind: RotatingLoadingTipKind;
  intervalMs?: number;
  intervalRangeMs?: readonly [number, number];
  className?: string;
};

/**
 * A small, non-progress loading hint. The actual progress/status must remain
 * visible alongside it; these messages only make a longer wait feel warmer.
 */
export function RotatingLoadingTip({
  kind,
  intervalMs = 3600,
  intervalRangeMs,
  className = "",
}: RotatingLoadingTipProps) {
  const { t } = useLocale();
  const messages = useMemo(() => rotatingLoadingTipMessages[kind].map((message) => t(message)), [kind, t]);
  const [index, setIndex] = useState(() => pickRandomRotatingLoadingTipIndex(messages.length));

  useEffect(() => {
    setIndex(pickRandomRotatingLoadingTipIndex(messages.length));
    if (messages.length <= 1) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let timer: number | null = null;
    const scheduleNext = () => {
      const [rangeMin, rangeMax] = intervalRangeMs ?? [intervalMs, intervalMs];
      const delay = pickRotatingLoadingTipDelay(rangeMin, rangeMax);
      timer = window.setTimeout(() => {
        setIndex((current) => pickNextRotatingLoadingTipIndex(current, messages.length));
        scheduleNext();
      }, delay);
    };

    scheduleNext();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [intervalMs, intervalRangeMs, kind, messages.length]);

  const message = messages[index] ?? messages[0] ?? "";
  return (
    <p className={`rotating-loading-tip ${className}`.trim()} role="status" aria-live="polite">
      <Sparkles aria-hidden="true" className="rotating-loading-tip__icon" size={12} />
      <span className="rotating-loading-tip__dot" aria-hidden="true">·</span>
      <span key={`${kind}-${index}`} className="rotating-loading-tip__text">{message}</span>
    </p>
  );
}
