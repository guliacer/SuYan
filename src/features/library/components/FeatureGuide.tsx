import { useEffect, useLayoutEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CircleHelp, X } from "lucide-react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/LocaleProvider";
import { clampOverlayPosition, getAppOverlayBounds } from "@/components/ui/overlayPosition";
import { featureGuideDefinitions } from "./featureGuides";

type FeatureGuideProps = {
  guideId: string;
  onComplete: (guideId: string) => Promise<boolean>;
  onStepChange?: (stepIndex: number) => void;
};

type TargetRect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

type MeasuredTarget = TargetRect & {
  selector: string;
};

const viewportPadding = 16;
const popoverWidth = 360;
const popoverHeight = 300;
const targetLookupRetryMs = 2400;
const targetLookupRetryDelayMs = 80;

export function FeatureGuide({ guideId, onComplete, onStepChange }: FeatureGuideProps) {
  const { t } = useLocale();
  const definition = featureGuideDefinitions[guideId as keyof typeof featureGuideDefinitions];
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<MeasuredTarget | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setStepIndex(0);
    setTargetRect(null);
    setIsSaving(false);
  }, [guideId]);

  useEffect(() => {
    onStepChange?.(stepIndex);
  }, [onStepChange, stepIndex]);

  const step = definition?.steps[stepIndex];
  const localizedTitle = definition ? t(definition.title) : "";
  const localizedIntro = definition ? t(definition.intro) : "";
  const localizedStep = step
    ? { title: t(step.title), description: t(step.description) }
    : null;

  useLayoutEffect(() => {
    // 每一步必须独立测量目标；不能在新目标不存在或尚未完成布局时沿用上一步的高亮范围。
    setTargetRect(null);

    if (!step) {
      return;
    }

    const selector = step.target;
    if (!selector) {
      return;
    }

    let frame = 0;
    let retryTimer: number | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let observedTarget: HTMLElement | null = null;
    const retryDeadline = performance.now() + targetLookupRetryMs;

    const scheduleTargetRetry = () => {
      if (retryTimer !== null || performance.now() >= retryDeadline) {
        return;
      }

      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        updateTarget();
      }, targetLookupRetryDelayMs);
    };

    const updateTarget = () => {
      const selectors = selector
        .split(",")
        .map((candidateSelector) => candidateSelector.trim())
        .filter(Boolean);
      const isVisibleTarget = (candidate: HTMLElement) => {
        const rect = candidate.getBoundingClientRect();
        let current: HTMLElement | null = candidate;
        let isHiddenByAncestor = false;
        while (current && current !== document.body) {
          const style = window.getComputedStyle(current);
          if (
            current.hidden ||
            current.getAttribute("aria-hidden") === "true" ||
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.opacity === "0" ||
            style.pointerEvents === "none"
          ) {
            isHiddenByAncestor = true;
            break;
          }
          current = current.parentElement;
        }
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          !isHiddenByAncestor
        );
      };
      // A comma-separated target may contain fallbacks. Preserve the declared
      // priority instead of letting document order choose an earlier fallback.
      const target = selectors
        .map((candidateSelector) =>
          Array.from(document.querySelectorAll<HTMLElement>(candidateSelector)).find(isVisibleTarget),
        )
        .find((candidate): candidate is HTMLElement => Boolean(candidate));
      if (!target) {
        resizeObserver?.disconnect();
        resizeObserver = null;
        observedTarget = null;
        setTargetRect(null);
        scheduleTargetRetry();
        return;
      }

      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        setTargetRect(null);
        scheduleTargetRetry();
        return;
      }

      // Pages such as the lexicon workspace have their own scroll container. Keep
      // the highlighted control in view before measuring it, otherwise the guide
      // falls back to a centered card with no useful visual anchor.
      if (rect.bottom < viewportPadding || rect.top > window.innerHeight - viewportPadding) {
        target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
        frame = window.requestAnimationFrame(updateTarget);
        return;
      }

      // Images and responsive panels may change size after the first measurement.
      // Keep the highlight attached to the rendered target instead of freezing the
      // dimensions captured before asynchronous content has finished laying out.
      if (observedTarget !== target) {
        resizeObserver?.disconnect();
        observedTarget = target;
        resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => scheduleUpdate());
        resizeObserver?.observe(target);
      }

      setTargetRect({
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        selector,
        top: rect.top,
        width: rect.width,
      });
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
      frame = window.requestAnimationFrame(updateTarget);
    };

    scheduleUpdate();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    return () => {
      window.cancelAnimationFrame(frame);
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [step]);

  if (!definition || !step) {
    return null;
  }

  const isLastStep = stepIndex === definition.steps.length - 1;
  const overlayBounds = getAppOverlayBounds(viewportPadding);
  const cardWidth = Math.min(popoverWidth, Math.max(280, window.innerWidth - viewportPadding * 2));
  const left = targetRect
    ? clampOverlayPosition(targetRect.left, cardWidth, overlayBounds.left, overlayBounds.right)
    : Math.max(overlayBounds.left, (overlayBounds.left + overlayBounds.right - cardWidth) / 2);
  const hasRoomBelow = targetRect ? targetRect.bottom + 12 + popoverHeight <= overlayBounds.bottom : false;
  const top = targetRect
    ? hasRoomBelow
      ? targetRect.bottom + 12
      : clampOverlayPosition(targetRect.top - popoverHeight - 12, popoverHeight, overlayBounds.top, overlayBounds.bottom)
    : clampOverlayPosition(
        (overlayBounds.top + overlayBounds.bottom - popoverHeight) / 2,
        popoverHeight,
        overlayBounds.top,
        overlayBounds.bottom,
      );

  const finish = () => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    void onComplete(guideId).finally(() => setIsSaving(false));
  };

  const moveNext = () => {
    if (isLastStep) {
      finish();
      return;
    }

    setStepIndex((current) => current + 1);
  };

  return createPortal(
    <div
      aria-live="polite"
      className="app-window-overlay pointer-events-none z-[10010]"
      data-feature-guide-overlay="true"
    >
      {targetRect && targetRect.selector === step.target ? (
        <div
          aria-hidden="true"
          className="fixed rounded-xl border-2 border-primary bg-primary/5 shadow-[0_0_0_9999px_rgba(15,23,42,0.18),0_0_0_3px_rgba(255,255,255,0.85),0_0_16px_4px_rgba(99,102,241,0.3)] transition-all duration-200"
          style={{
            height: targetRect.height + 8,
            left: targetRect.left - 4,
            top: targetRect.top - 4,
            width: targetRect.width + 8,
          }}
        />
      ) : null}
      <section
        aria-label={`${localizedTitle}${t("功能引导")}`}
        className="pointer-events-auto fixed flex flex-col gap-3 overflow-y-auto rounded-2xl border border-primary/30 bg-panel/95 p-4 text-foreground shadow-elevated backdrop-blur-xl"
        role="dialog"
        style={{
          left,
          maxHeight: Math.max(180, overlayBounds.bottom - top),
          maxWidth: overlayBounds.right - overlayBounds.left,
          top,
          width: cardWidth,
        }}
      >
        <header className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <CircleHelp size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="truncate text-sm font-semibold">{localizedTitle}{t("功能引导")}</h2>
              <span className="shrink-0 text-xs text-muted">{stepIndex + 1} / {definition.steps.length}</span>
            </div>
            {stepIndex === 0 ? <p className="mt-1 text-xs leading-5 text-muted">{localizedIntro}</p> : null}
          </div>
          <button
            aria-label={t("跳过本页引导")}
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-primary-soft hover:text-foreground"
            title={t("跳过本页引导")}
            type="button"
            onClick={finish}
          >
            <X size={15} />
          </button>
        </header>

        <div className="rounded-xl border border-border bg-background/70 px-3 py-2.5">
          <h3 className="text-sm font-semibold">{localizedStep?.title}</h3>
          <p className="mt-1 text-xs leading-5 text-muted">{localizedStep?.description}</p>
        </div>

        <footer className="flex items-center justify-between gap-2">
          <Button className="min-h-8 px-2.5 py-1.5 text-xs" disabled={isSaving} icon={<X size={13} />} onClick={finish} variant="ghost">
            {t("跳过本页")}
          </Button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 ? (
              <Button className="min-h-8 px-2.5 py-1.5 text-xs" disabled={isSaving} icon={<ArrowLeft size={13} />} onClick={() => setStepIndex((current) => current - 1)}>
                {t("上一步")}
              </Button>
            ) : null}
            <Button className="min-h-8 px-2.5 py-1.5 text-xs" disabled={isSaving} icon={<ArrowRight size={13} />} onClick={moveNext} variant="primary">
              {isLastStep ? t("完成") : t("下一步")}
            </Button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
