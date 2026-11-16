import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
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

type FormationBlock = readonly [number, number, number, number, number];

const formationZones = [
  [4, 28, 3, 24], [36, 64, 3, 22], [70, 96, 3, 24],
  [3, 24, 30, 46], [76, 97, 28, 47],
  [3, 24, 55, 73], [76, 97, 54, 73],
  [5, 30, 76, 97], [36, 64, 78, 96],
] as const;

function createFormationBlocks(): FormationBlock[] {
  const zones = [...formationZones];
  for (let index = zones.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [zones[index], zones[swapIndex]] = [zones[swapIndex], zones[index]];
  }
  return zones.map(([leftMin, leftMax, topMin, topMax], index) => [
    leftMin + Math.random() * (leftMax - leftMin),
    topMin + Math.random() * (topMax - topMin),
    17 + Math.random() * (index % 3 === 0 ? 13 : 9),
    12 + Math.random() * (index % 2 === 0 ? 13 : 9),
    -0.9 + Math.random() * 1.8,
  ]);
}

const creationCoreParticles = [
  [8, 22, 29, 45, -0.2], [14, 76, 38, 61, 0.3], [25, 12, 43, 36, -0.6],
  [35, 88, 45, 69, 0.7], [52, 8, 52, 34, 1.1], [68, 15, 61, 40, -0.4],
  [86, 33, 68, 47, 0.2], [91, 72, 67, 59, 0.9], [74, 90, 59, 68, -0.3],
  [18, 46, 42, 49, 0.5], [31, 58, 46, 54, -0.8], [63, 80, 56, 64, 0.1],
] as const;

type PromptParticleProfile = {
  startX: number;
  startY: number;
  midX: number;
  midY: number;
  delay: number;
  duration: number;
};

type PromptTokenProfile = {
  x: number;
  y: number;
  delay: number;
  duration: number;
};

function randomPercent(min: number, max: number) {
  return Number((min + Math.random() * (max - min)).toFixed(2));
}

function createPromptParticleProfiles(): PromptParticleProfile[] {
  return Array.from({ length: 12 }, (_, index) => {
    let startX = 50;
    let startY = 50;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      startX = randomPercent(14, 86);
      startY = randomPercent(12, 78);
      if (Math.hypot(startX - 50, startY - 50) > 25) break;
    }
    // Keep deterministic test seeds and low-entropy random sources distributed.
    if (Math.hypot(startX - 50, startY - 50) <= 25) {
      const angle = (index / 12) * Math.PI * 2;
      const radius = 32 + (index % 3) * 5;
      startX = Number((50 + Math.cos(angle) * radius).toFixed(2));
      startY = Number((50 + Math.sin(angle) * radius * 0.78).toFixed(2));
    }
    return {
      startX,
      startY,
      midX: randomPercent(40, 60),
      midY: randomPercent(34, 62),
      delay: Number((index * 0.18 + Math.random() * 0.72).toFixed(2)),
      duration: Number((3.5 + Math.random() * 2.2).toFixed(2)),
    };
  });
}

function createPromptTokenProfiles(count: number): PromptTokenProfile[] {
  return Array.from({ length: count }, (_, index) => ({
    x: randomPercent(42, 58),
    y: Number((60 + index * 3.8 + (Math.random() - 0.5) * 1.2).toFixed(2)),
    delay: Number((index * 0.72 + Math.random() * 0.38).toFixed(2)),
    duration: Number((4.6 + Math.random() * 1.8).toFixed(2)),
  }));
}

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
  const particleProfiles = useMemo(createPromptParticleProfiles, []);
  const tokenProfiles = useMemo(() => createPromptTokenProfiles(visibleKeywords.length), [visibleKeywords.length]);
  return (
    <div className="canvas-prompt-particle-field" data-canvas-phase={mode}>
      <div className="canvas-prompt-particle-trail">
        {particleProfiles.map((profile, index) => (
          <span
            className="canvas-prompt-particle"
            key={index}
            style={{
              "--particle-index": index,
              "--prompt-particle-start-x": `${profile.startX}%`,
              "--prompt-particle-start-y": `${profile.startY}%`,
              "--prompt-particle-mid-x": `${profile.midX}%`,
              "--prompt-particle-mid-y": `${profile.midY}%`,
              "--prompt-particle-delay": `${profile.delay}s`,
              "--prompt-particle-duration": `${profile.duration}s`,
            } as CSSProperties}
          />
        ))}
      </div>
      {visibleKeywords.map((keyword, index) => (
        <span
          className="canvas-prompt-token"
          key={`${keyword}-${index}`}
          style={{
            "--token-index": index,
            "--token-x": `${tokenProfiles[index].x}%`,
            "--token-y": `${tokenProfiles[index].y}%`,
            "--token-delay": `${tokenProfiles[index].delay}s`,
            "--token-duration": `${tokenProfiles[index].duration}s`,
          } as CSSProperties}
        >
          {keyword}
        </span>
      ))}
    </div>
  );
}

function CanvasFormationField() {
  const formationBlocks = useMemo(createFormationBlocks, []);
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
