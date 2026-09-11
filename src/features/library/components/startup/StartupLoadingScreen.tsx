import { useEffect, useState, type CSSProperties } from "react";
import startupArt1 from "../../assets/startup-art-1.png?url";
import startupArt2 from "../../assets/startup-art-2.png?url";
import startupArt3 from "../../assets/startup-art-3.png?url";
import startupArt4 from "../../assets/startup-art-4.png?url";
import startupArt5 from "../../assets/startup-art-5.png?url";
import startupArt6 from "../../assets/startup-art-6.png?url";
import { getStartupGalleryImageSrc } from "../../utils/getImageSrc";
import { useLocale } from "@/components/LocaleProvider";
import {
  selectRandomStartupGalleryImages,
  startupGalleryDisplayCount,
} from "../../utils/startupGallerySelection";

const startupLoadingSteps = ["正在唤醒素材库", "翻阅素材星图", "点亮提示词库", "整理你的画廊"];
const startupArtImages = [startupArt1, startupArt2, startupArt3, startupArt4, startupArt5, startupArt6];
/** 首图先停留这么久，之后才开始翻页。 */
const STARTUP_CAROUSEL_LEAD_IN_MS = 2000;
const STARTUP_CAROUSEL_INTERVAL_MS = 1500;

/** 开播 elapsedMs 时应该停在第几格：首图占 LEAD_IN，之后每 INTERVAL 一格。 */
function getStartupCarouselSlot(elapsedMs: number): number {
  if (elapsedMs < STARTUP_CAROUSEL_LEAD_IN_MS) {
    return 0;
  }

  return 1 + Math.floor((elapsedMs - STARTUP_CAROUSEL_LEAD_IN_MS) / STARTUP_CAROUSEL_INTERVAL_MS);
}

/** 第 slot 格相对开播时刻的起始毫秒。 */
function getStartupCarouselSlotStartMs(slot: number): number {
  return slot === 0 ? 0 : STARTUP_CAROUSEL_LEAD_IN_MS + (slot - 1) * STARTUP_CAROUSEL_INTERVAL_MS;
}

function logRendererStartupEvent(event: string, details: Record<string, unknown> = {}): void {
  try {
    window.suyanApi.logStartupEvent(event, details);
  } catch {
    // Startup telemetry must never block the intro screen.
  }
}

type StartupGalleryDisplayImage = {
  height: number;
  source: string;
  width: number;
};

type StartupImageProbeResult = {
  height: number;
  isReady: boolean;
  width: number;
};

type StartupGallerySelection = {
  images: StartupGalleryDisplayImage[];
  sourceCount: number;
  usedFallback: boolean;
  failedImageCount: number;
};

let startupIntroPlayed = false;
let startupGallerySelectionCache: StartupGallerySelection | null = null;
let startupGallerySelectionPromise: Promise<StartupGallerySelection> | null = null;
let startupScreenReadyPromise: Promise<void> | null = null;

/** Survives StartupLoadingScreen remount (full-screen → overlay) so the deck does not jump back to slide 1. */
let startupCarouselActiveIndex = 0;
let startupCarouselStartedAtMs = 0;

export function StartupLoadingScreen({ onSkip }: { onSkip?: () => void }) {
  const { t } = useLocale();
  const replay = startupIntroPlayed;
  const [galleryImages, setGalleryImages] = useState<StartupGalleryDisplayImage[]>(
    () => startupGallerySelectionCache?.images ?? [],
  );
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, startupCarouselActiveIndex));

  useEffect(() => {
    startupIntroPlayed = true;
    if (startupCarouselStartedAtMs === 0) {
      startupCarouselStartedAtMs = performance.now();
    }
  }, []);

  useEffect(() => {
    let isDisposed = false;

    void loadStartupGallerySelection().then((selection) => {
      if (isDisposed) {
        return;
      }

      setGalleryImages(selection.images);
      // Keep the shared carousel cursor; only clamp if the new list is shorter.
      const nextIndex =
        selection.images.length === 0
          ? 0
          : Math.min(startupCarouselActiveIndex, selection.images.length - 1);
      startupCarouselActiveIndex = nextIndex;
      setActiveIndex(nextIndex);
      void notifyStartupScreenReadyAfterPaint();
    });

    return () => {
      isDisposed = true;
    };
  }, []);

  useEffect(() => {
    if (galleryImages.length < 2) {
      return;
    }

    // 按「开播时刻」的墙钟排期，而不是每次挂载重起 interval：首图停留
    // STARTUP_CAROUSEL_LEAD_IN_MS，之后每 STARTUP_CAROUSEL_INTERVAL_MS 翻一张。
    // 全屏阶段 → 淡出浮层的重挂载既不会让首图的停留重来一遍，也不会把 index 退回 0。
    let timerId = 0;

    const scheduleNextFlip = () => {
      const elapsed = performance.now() - startupCarouselStartedAtMs;
      const nextFlipAt = getStartupCarouselSlotStartMs(getStartupCarouselSlot(elapsed) + 1);
      timerId = window.setTimeout(
        () => {
          setActiveIndex((index) => {
            const nextIndex = (index + 1) % galleryImages.length;
            startupCarouselActiveIndex = nextIndex;
            return nextIndex;
          });
          scheduleNextFlip();
        },
        Math.max(0, nextFlipAt - elapsed),
      );
    };

    scheduleNextFlip();

    return () => window.clearTimeout(timerId);
  }, [galleryImages.length]);

  return (
    <main
      className={`startup-scene${replay ? " startup-scene--replay" : ""}`}
      aria-label={t("正在加载素言")}
    >
      <div className="startup-scene__backdrop" aria-hidden="true" />

      {onSkip ? (
        <button
          className="startup-scene__skip"
          type="button"
          onClick={onSkip}
        >
          {t("跳过")}
        </button>
      ) : null}

      <div className="startup-stage" aria-hidden="true">
        <div className="startup-stage__deck">
          {galleryImages.map((image, index) => {
            // Prefer the shortest circular offset so the deck always slides toward
            // the next card instead of jumping across the whole strip.
            const offset = getStartupCarouselOffset(index, activeIndex, galleryImages.length);
            const absOffset = Math.abs(offset);
            const isActive = offset === 0;
            const shift = getStartupSlideShift(offset);
            const scale = isActive ? 1.88 : Math.max(0.72, 1.38 - absOffset * 0.12);
            const dimOpacity = isActive ? 0 : Math.min(0.58, 0.12 + absOffset * 0.14);

            return (
              <figure
                className={`startup-slide${isActive ? " is-active" : ""}`}
                key={`${image.source}-${index}`}
                style={
                  {
                    "--startup-slide-shift": shift,
                    "--startup-slide-scale": scale,
                    "--startup-slide-dim-opacity": dimOpacity,
                    zIndex: getStartupSlideZIndex(offset),
                  } as CSSProperties
                }
              >
                <img
                  className="startup-slide__img"
                  src={image.source}
                  alt=""
                  decoding="async"
                  loading="eager"
                />
              </figure>
            );
          })}
        </div>
      </div>

      <div className="startup-scene__overlay">
        <div className="startup-scene__panel">
          <h1 className="startup-scene__title">{t("正在加载素材库")}</h1>
          <p className="startup-scene__subtitle">{t("正在为你准备提示词与作品")}</p>

          <ol className="startup-scene__steps">
            {startupLoadingSteps.map((step, index) => (
              <li
                className="startup-scene__step"
                key={step}
                style={{ animationDelay: `${0.45 + index * 1.05}s` }}
              >
                <span className="startup-scene__step-dot" aria-hidden="true" />
                {t(step)}
              </li>
            ))}
          </ol>

          <div className="startup-scene__progress" aria-hidden="true">
            <span />
          </div>
        </div>
      </div>
    </main>
  );
}

let libraryViewRenderCount = 0;
let libraryViewFirstRenderMs = 0;
let libraryViewLastReportMs = 0;

function recordLibraryViewRender(): void {
  const now = Date.now();

  if (libraryViewFirstRenderMs === 0) {
    libraryViewFirstRenderMs = now;
  }

  libraryViewRenderCount += 1;
  const sinceFirstMs = now - libraryViewFirstRenderMs;

  if (sinceFirstMs > 30000) {
    return;
  }

  if (now - libraryViewLastReportMs >= 500 || libraryViewRenderCount % 50 === 0) {
    libraryViewLastReportMs = now;
    try {
      window.suyanApi.logStartupEvent("render:count", {
        renderCount: libraryViewRenderCount,
        sinceFirstMs,
      });
    } catch {
    }
  }
}

function measureDerivation<T>(label: string, inputSize: number, compute: () => T): T {
  const startedAt = performance.now();
  const result = compute();
  const durationMs = performance.now() - startedAt;

  if (durationMs >= 30) {
    try {
      window.suyanApi.logStartupEvent("derivation:slow", {
        label,
        inputSize,
        durationMs: Math.round(durationMs * 100) / 100,
      });
    } catch {
    }
  }

  return result;
}

function getStartupCarouselOffset(index: number, activeIndex: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  // Shortest circular distance keeps the deck sliding forward instead of leaping
  // across the whole strip when the active card wraps past the last image.
  let offset = index - activeIndex;
  const half = total / 2;

  if (offset > half) {
    offset -= total;
  } else if (offset < -half) {
    offset += total;
  }

  return offset;
}

function getStartupSlideZIndex(offset: number): number {
  return 100 - Math.abs(offset) * 10;
}

function getStartupSlideShift(offset: number): number {
  const direction = Math.sign(offset);
  const steps = Math.abs(offset);
  const stepIncrements = [0, 30, 20, 15, 13];
  let shift = 0;

  for (let step = 1; step <= steps; step += 1) {
    shift += stepIncrements[Math.min(step, stepIncrements.length - 1)];
  }

  return direction * shift;
}

function loadStartupGallerySelection(): Promise<StartupGallerySelection> {
  if (startupGallerySelectionCache) {
    return Promise.resolve(startupGallerySelectionCache);
  }

  if (startupGallerySelectionPromise) {
    return startupGallerySelectionPromise;
  }

  startupGallerySelectionPromise = window.suyanApi
    .listStartupGalleryImages()
    .then(async (result) => {
      const gallerySources = result.ok
        ? [...result.data]
            .sort((left, right) => left.order - right.order)
            .map((image) => getStartupGalleryImageSrc(image.fileName))
        : [];
      const sourceImages = gallerySources.length > 0 ? gallerySources : startupArtImages;
      const selectedSources = selectRandomStartupGalleryImages(
        sourceImages,
        startupGalleryDisplayCount,
      );
      const probes = await Promise.all(selectedSources.map(preloadStartupImage));
      const failedImageCount = probes.filter((probe) => !probe.isReady).length;
      const displayImages = await Promise.all(
        selectedSources.map((source, index) => {
          const probe = probes[index];
          if (probe?.isReady) {
            return Promise.resolve(createStartupDisplayImage(source, probe));
          }

          return preloadStartupDisplayImage(startupArtImages[index % startupArtImages.length]);
        }),
      );

      const selection: StartupGallerySelection = {
        images: displayImages,
        sourceCount: gallerySources.length,
        usedFallback: gallerySources.length === 0 || failedImageCount > 0,
        failedImageCount,
      };

      startupGallerySelectionCache = selection;
      logRendererStartupEvent("startup-gallery:selection-ready", {
        sourceCount: selection.sourceCount,
        displayCount: selection.images.length,
        usedFallback: selection.usedFallback,
        failedImageCount: selection.failedImageCount,
      });
      return selection;
    })
    .catch(async () => {
      const sources = selectRandomStartupGalleryImages(
        startupArtImages,
        startupGalleryDisplayCount,
      );
      const images = await Promise.all(sources.map(preloadStartupDisplayImage));
      const selection: StartupGallerySelection = {
        images,
        sourceCount: 0,
        usedFallback: true,
        failedImageCount: 0,
      };

      startupGallerySelectionCache = selection;
      logRendererStartupEvent("startup-gallery:selection-ready", {
        sourceCount: 0,
        displayCount: selection.images.length,
        usedFallback: true,
        failedImageCount: 0,
      });
      return selection;
    });

  return startupGallerySelectionPromise;
}

// Start gallery preload as soon as this module finishes defining the loader so
// cold start does not wait for StartupLoadingScreen mount + Suspense resolution.
if (typeof window !== "undefined" && typeof window.suyanApi?.listStartupGalleryImages === "function") {
  void loadStartupGallerySelection();
}

function createStartupDisplayImage(
  source: string,
  probe: StartupImageProbeResult,
): StartupGalleryDisplayImage {
  return {
    height: probe.height,
    source,
    width: probe.width,
  };
}

function preloadStartupDisplayImage(source: string): Promise<StartupGalleryDisplayImage> {
  return preloadStartupImage(source).then((probe) => createStartupDisplayImage(source, probe));
}

function preloadStartupImage(source: string): Promise<StartupImageProbeResult> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    const resolveReady = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      resolve({
        height,
        isReady: true,
        width,
      });
    };

    image.onload = () => {
      if (typeof image.decode !== "function") {
        resolveReady();
        return;
      }

      void image.decode().then(
        () => resolveReady(),
        () => resolveReady(),
      );
    };
    image.onerror = () =>
      resolve({
        height: 0,
        isReady: false,
        width: 0,
      });
    image.src = source;
  });
}

function notifyStartupScreenReadyAfterPaint(): Promise<void> {
  if (startupScreenReadyPromise) {
    return startupScreenReadyPromise;
  }

  startupScreenReadyPromise = new Promise((resolve) => {
    let isComplete = false;
    let firstFrame = 0;
    let secondFrame = 0;
    let thirdFrame = 0;

    function finish() {
      if (isComplete) {
        return;
      }

      isComplete = true;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.cancelAnimationFrame(thirdFrame);
      window.suyanApi.notifyStartupScreenReady();
      resolve();
    }

    // Three frames: commit React tree, apply layout/paint, then allow image decode to composite.
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        thirdFrame = window.requestAnimationFrame(finish);
      });
    });
  });

  return startupScreenReadyPromise;
}
