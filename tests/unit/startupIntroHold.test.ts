import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (filePath: string) => readFileSync(filePath, "utf8");

const libraryViewSource = read("src/features/library/components/LibraryView.tsx");
const startupScreenSource = read("src/features/library/components/startup/StartupLoadingScreen.tsx");
const tokenSource = read("src/styles/tokens.css");

const holdMs = Number(libraryViewSource.match(/const STARTUP_OVERLAY_FIXED_MS = (\d+);/)?.[1] ?? "0");

describe("startup intro hold contract", () => {
  it("reserves a fixed wall-clock window instead of a flash-avoidance minimum", () => {
    // 启动页是「预留时长」而不是「最小时长」：库就绪得再快也不能提前收掉。
    expect(holdMs).toBeGreaterThan(0);
    expect(libraryViewSource).toContain("const remaining = Math.max(0, STARTUP_OVERLAY_FIXED_MS - elapsed);");
    // 计时只在挂载时起一次（空依赖数组），不会因为 ready 状态变化被重算成 0。
    const holdEffect =
      libraryViewSource.match(/useEffect\(\(\) => \{[^]*?STARTUP_OVERLAY_FIXED_MS - elapsed[^]*?\n  \}, \[\]\);/)?.[0] ??
      "";
    expect(holdEffect).not.toBe("");
    expect(holdEffect).toContain("setHasStartupHoldElapsed(true)");
  });

  it("lets only the 跳过 button end the intro early", () => {
    // 放行开关只有两个写入点：固定计时到点，以及用户点「跳过」。
    // 多出第三个写入点就意味着又有别的条件能提前结束启动页。
    const releases = [...libraryViewSource.matchAll(/setHasStartupHoldElapsed\(true\)/g)];
    expect(releases).toHaveLength(2);

    expect(libraryViewSource).toContain("const skipStartupIntro = useCallback(");
    expect(libraryViewSource).toContain('logRendererStartupEvent("startup-overlay:skip"');
    // 两个渲染分支（全屏阶段 + 淡出浮层）都必须挂上跳过回调，否则某一阶段无法手动跳过。
    expect([...libraryViewSource.matchAll(/<StartupLoadingScreen onSkip=\{skipStartupIntro\} \/>/g)]).toHaveLength(2);
    expect(startupScreenSource).toContain('className="startup-scene__skip"');
    expect(startupScreenSource).toContain("onClick={onSkip}");

    // 退出闸门必须同时要求「固定时长已到」，不得只看数据就绪。
    expect(libraryViewSource).toContain(
      "if (!hasInitialLoadFinished || !hasStartupHoldElapsed || startupOverlayPhase !== \"visible\") {",
    );
  });

  it("holds long enough for the intro's own timeline to finish", () => {
    // 预留时长必须盖住启动页自己的时间线：步骤逐条揭示的最后一条要播完，
    // 否则动画还没走完就开始淡出，观感就是「启动页被直接跳过了」。
    const stepsBlock = startupScreenSource.match(/const startupLoadingSteps = \[([^\]]*)\]/)?.[1] ?? "";
    const stepCount = [...stepsBlock.matchAll(/"/g)].length / 2;
    expect(stepCount).toBeGreaterThan(1);

    const delay = startupScreenSource.match(/animationDelay: `\$\{([\d.]+) \+ index \* ([\d.]+)\}s`/);
    const baseDelaySec = Number(delay?.[1] ?? "0");
    const perStepDelaySec = Number(delay?.[2] ?? "0");
    expect(perStepDelaySec).toBeGreaterThan(0);

    const stepDurationSec = Number(tokenSource.match(/animation: startup-step-in ([\d.]+)s/)?.[1] ?? "0");
    expect(stepDurationSec).toBeGreaterThan(0);

    const lastStepEndsMs = (baseDelaySec + (stepCount - 1) * perStepDelaySec + stepDurationSec) * 1000;
    expect(holdMs).toBeGreaterThanOrEqual(lastStepEndsMs);
  });

  it("holds long enough for the gallery to reach its last image", () => {
    // 画廊排期：首图停留 LEAD_IN，之后每 INTERVAL 翻一张。预留时长必须让最后一张
    // 真的翻到并留出停留时间，否则用户永远看不到后面几张图。
    const leadInMs = Number(startupScreenSource.match(/const STARTUP_CAROUSEL_LEAD_IN_MS = (\d+);/)?.[1] ?? "0");
    const intervalMs = Number(startupScreenSource.match(/const STARTUP_CAROUSEL_INTERVAL_MS = (\d+);/)?.[1] ?? "0");
    const displayCount = Number(
      read("src/features/library/utils/startupGallerySelection.ts").match(
        /export const startupGalleryDisplayCount = (\d+);/,
      )?.[1] ?? "0",
    );
    expect(leadInMs).toBeGreaterThan(0);
    expect(intervalMs).toBeGreaterThan(0);
    expect(displayCount).toBeGreaterThan(1);

    // 第 (displayCount - 1) 格（最后一张）的起始时刻。
    const lastSlideStartsMs = leadInMs + (displayCount - 2) * intervalMs;
    expect(holdMs).toBeGreaterThan(lastSlideStartsMs);
    // 翻页排期按开播墙钟计算，重挂载不得让首图的停留重新计时。
    expect(startupScreenSource).toContain("performance.now() - startupCarouselStartedAtMs");
    expect(startupScreenSource).not.toContain("window.setInterval(");
  });
});
