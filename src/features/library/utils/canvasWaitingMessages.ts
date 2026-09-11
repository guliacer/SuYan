export type CanvasWaitingPhase = "thinking" | "generating" | "finishing";

export const thinkingMessages = [
  "正在把你的描述拆成画面", "你的灵感我收到了，正在认真消化",
  "正在研究这张图应该长什么样", "正在寻找最合适的构图", "先让我想想画面怎么展开",
] as const;

// Waiting atmosphere, not a claim of measurable provider progress.
export const generatingMessages = [
  "正在把你的想法揉成一张图…", "正在给画面留一点呼吸", "让光影先聊一会儿",
  "颜色正在慢慢找到彼此", "正在寻找画面最舒服的位置", "正在给这个画面增加一点温度",
  "正在把想象变成看得见的东西", "正在和光影进行友好协商", "正在努力让一切看起来很自然",
  "让灵感多停留一会儿", "给颜色一点相遇的时间", "在留白里，藏一点想象",
  "正在给细节挨个安排座位", "正在把“差不多”变成“就是它”", "光正在寻找落下的位置",
  "想象正在纸上慢慢展开", "给画面一点安静的时间", "正在寻找光与影的默契",
  "把日常的想法，画得不太日常", "让画面带着一点自己的性格",
] as const;

export const easterEggMessages = [
  "正在和现实世界暂时谈判", "别急，灵感正在加载", "让想象力伸个懒腰", "正在给灵感倒一杯茶",
] as const;

// Only used after image bytes have actually arrived, during the reveal phase.
export const finishingMessages = ["作品已就位，马上见面", "最后一笔，别眨眼", "你的想法，有了画面"] as const;

export function pickCanvasWaitingMessage(phase: CanvasWaitingPhase, previous = "", random = Math.random): string {
  const pool = phase === "thinking" ? thinkingMessages
    : phase === "finishing" ? finishingMessages
      : random() < 0.1 ? easterEggMessages : generatingMessages;
  const candidates = pool.filter((text) => text !== previous);
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
}

export function getCanvasWaitingDelay(random = Math.random): number {
  return 4000 + Math.floor(random() * 2001);
}
