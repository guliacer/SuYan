import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { AppLogoMark } from "@/components/ui/AppLogoMark";
import { useAccountUser } from "@/features/account/store/useAccountStore";
import { CanvasPointerField } from "./CanvasPointerField";
import { CanvasFlowAtmosphere } from "./CanvasFlowAtmosphere";
import type { CanvasAtmosphereTone } from "../utils/canvasGeneration";

export const canvasRevealDurationMs = 1500;
type CanvasBackdropMode = "empty" | "thinking" | "busy" | "reveal" | "result";

const blankParticlePositions = [
  [12, 22, 0], [25, 68, 0.6], [38, 34, 1.4], [52, 78, 0.3], [66, 24, 1.8],
  [78, 62, 0.9], [88, 34, 1.2], [18, 48, 2.1], [45, 18, 1.1], [72, 82, 2.5],
  [32, 88, 1.7], [94, 74, 0.4], [8, 78, 2.4], [59, 48, 1.9],
] as const;

const formationBlocks = [
  [18, 22, 28, 22, -0.2], [48, 18, 20, 34, 0.4], [68, 32, 18, 18, 0.1],
  [26, 48, 17, 28, 0.7], [44, 55, 30, 19, -0.4], [72, 57, 13, 28, 0.3],
  [12, 73, 24, 12, 0.8], [39, 78, 19, 10, 0.2], [59, 76, 30, 13, 0.6],
] as const;

const creationCoreParticles = [
  [8, 22, 29, 45, -0.2], [14, 76, 38, 61, 0.3], [25, 12, 43, 36, -0.6],
  [35, 88, 45, 69, 0.7], [52, 8, 52, 34, 1.1], [68, 15, 61, 40, -0.4],
  [86, 33, 68, 47, 0.2], [91, 72, 67, 59, 0.9], [74, 90, 59, 68, -0.3],
  [18, 46, 42, 49, 0.5], [31, 58, 46, 54, -0.8], [63, 80, 56, 64, 0.1],
] as const;

export function CanvasMotionBackdrop({
  mode = "result", tone = "neutral", keywords = [], className, children,
}: {
  mode?: CanvasBackdropMode;
  tone?: CanvasAtmosphereTone;
  keywords?: string[];
  className?: string;
  children: ReactNode;
}) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const syncVisibility = () => setPaused(document.hidden);
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  return (
    <div className={`canvas-backdrop ${className ?? ""}`} data-canvas-mode={mode} data-canvas-tone={tone} data-motion-paused={paused}>
      <div className="canvas-background-layers" aria-hidden="true">
        <div className="canvas-studio-surface" />
        <CanvasFlowAtmosphere generating={mode === "thinking" || mode === "busy"} />
        <div className="canvas-focus-halo" />
        <CanvasCreationCore mode={mode} />
        {mode === "empty" ? <CanvasBlankParticles /> : null}
        {mode === "thinking" || mode === "busy" ? <CanvasPromptParticleField keywords={keywords} mode={mode} /> : null}
        {mode === "busy" ? <CanvasFormationField /> : null}
        {mode === "reveal" ? <div className="canvas-reveal-light" /> : null}
        {mode === "busy" || mode === "reveal" ? <div className="canvas-ai-scan" /> : null}
      </div>
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
      <CanvasPointerField />
    </div>
  );
}

function CanvasCreationCore({ mode }: { mode: CanvasBackdropMode }) {
  const user = useAccountUser();
  const [avatarFailed, setAvatarFailed] = useState(false);
  const active = mode === "thinking" || mode === "busy" || mode === "reveal";
  const state = mode === "empty" ? "dormant" : mode === "thinking" ? "awakening" : mode === "busy" ? "accumulating" : mode;
  const avatarUrl = user?.avatarUrl && !avatarFailed ? user.avatarUrl : null;

  useEffect(() => {
    setAvatarFailed(false);
  }, [user?.avatarUrl]);

  return (
    <div className="canvas-creation-core" data-core-state={state} data-core-active={active}>
      <div className="canvas-core-energy-layer canvas-core-energy-layer--blue" />
      <div className="canvas-core-energy-layer canvas-core-energy-layer--violet" />
      <div className="canvas-core-energy-layer canvas-core-energy-layer--gold" />
      <div className="canvas-core-particle-field">
        {creationCoreParticles.map(([x, y, bendX, bendY, delay], index) => (
          <span
            className="canvas-core-particle"
            key={index}
            style={{
              "--core-particle-x": `${x}%`,
              "--core-particle-y": `${y}%`,
              "--core-particle-bend-x": `${bendX}%`,
              "--core-particle-bend-y": `${bendY}%`,
              "--core-particle-delay": `${delay}s`,
            } as CSSProperties}
          />
        ))}
      </div>
      <div className="canvas-core-orbit canvas-core-orbit--outer"><span /></div>
      <div className="canvas-core-orbit canvas-core-orbit--middle"><span /></div>
      <div className="canvas-core-orbit canvas-core-orbit--inner"><span /></div>
      <div className="canvas-core-aura" />
      <div className="canvas-core-logo-shell">
        <div className="canvas-core-logo-light" />
        {avatarUrl ? (
          <img
            alt=""
            aria-hidden="true"
            className="canvas-core-logo"
            draggable={false}
            onError={() => setAvatarFailed(true)}
            src={avatarUrl}
          />
        ) : (
          <AppLogoMark className="canvas-core-logo" />
        )}
      </div>
    </div>
  );
}

function CanvasBlankParticles() {
  return (
    <div className="canvas-blank-particles">
      {blankParticlePositions.map(([x, y, delay], index) => (
        <span
          className="canvas-blank-particle"
          key={index}
          style={{ "--particle-x": `${x}%`, "--particle-y": `${y}%`, "--particle-delay": `${delay}s` } as CSSProperties}
        />
      ))}
    </div>
  );
}

function CanvasPromptParticleField({ keywords, mode }: { keywords: string[]; mode: "thinking" | "busy" }) {
  const visibleKeywords = keywords.filter(Boolean).slice(0, 5);
  return (
    <div className="canvas-prompt-particle-field" data-canvas-phase={mode}>
      <div className="canvas-prompt-particle-trail">
        {Array.from({ length: 12 }, (_, index) => (
          <span className="canvas-prompt-particle" key={index} style={{ "--particle-index": index } as CSSProperties} />
        ))}
      </div>
      {visibleKeywords.map((keyword, index) => (
        <span className="canvas-prompt-token" key={`${keyword}-${index}`} style={{ "--token-index": index } as CSSProperties}>
          {keyword}
        </span>
      ))}
    </div>
  );
}

function CanvasFormationField() {
  return (
    <div className="canvas-formation-field">
      {formationBlocks.map(([left, top, width, height, delay], index) => (
        <span
          className="canvas-formation-block"
          key={index}
          style={{
            "--block-left": `${left}%`,
            "--block-top": `${top}%`,
            "--block-width": `${width}%`,
            "--block-height": `${height}%`,
            "--block-delay": `${delay}s`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

/** Mounted only once real image/video dimensions are available; never reconstructs a reference. */
export function CanvasArtworkReveal({ image, onActiveChange }: { image: boolean; onActiveChange: (active: boolean) => void }) {
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFinished(true);
      return;
    }
    onActiveChange(true);
    const timer = window.setTimeout(() => {
      setFinished(true);
      onActiveChange(false);
    }, canvasRevealDurationMs);
    return () => {
      window.clearTimeout(timer);
      onActiveChange(false);
    };
  }, [onActiveChange]);

  if (finished || !image) return null;
  return (
    <div className="canvas-image-reconstruction" aria-hidden="true">
      <div className="canvas-reconstruction-frost" />
      <div className="canvas-reconstruction-scan" />
    </div>
  );
}
