import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { CanvasPointerField } from "./CanvasPointerField";
import { CanvasFlowAtmosphere } from "./CanvasFlowAtmosphere";

export const canvasRevealDurationMs = 600;
type CanvasBackdropMode = "empty" | "thinking" | "busy" | "reveal" | "result";

// Bounded, deterministic geometry: eight nodes and six streams, all close to the work.
const neuralNodes = [[128, 154], [320, 84], [488, 162], [528, 344], [432, 486], [252, 526], [102, 424], [72, 276]];
const dataStreams = [[56, 132], [42, 296], [78, 464], [536, 174], [554, 342], [512, 502]];

export function CanvasMotionBackdrop({
  blurPreviewSrc, mode = "result", className, children,
}: {
  blurPreviewSrc: string;
  mode?: CanvasBackdropMode;
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
    <div className={`canvas-backdrop ${className ?? ""}`} data-canvas-mode={mode} data-motion-paused={paused}>
      <div className="canvas-background-layers" aria-hidden="true">
        <div className="canvas-studio-surface" />
        <CanvasFlowAtmosphere generating={mode === "busy"} />
        {blurPreviewSrc.startsWith("data:image/") ? <img className="canvas-color-atmosphere" src={blurPreviewSrc} alt="" /> : null}
        <div className="canvas-focus-halo" />
        {mode === "busy" || mode === "reveal" ? (
          <>
            <div className="canvas-compute-field">
              <div className="canvas-energy-field"><div className="canvas-energy-core" /></div>
              {mode === "busy" ? (
                <svg className="canvas-neural-field" viewBox="0 0 600 600" focusable="false">
                  {neuralNodes.map(([x, y], index) => (
                    <g className="canvas-neural-node" key={index} style={{
                      "--node-x": `${(300 - x) * 0.88}px`, "--node-y": `${(300 - y) * 0.88}px`,
                      "--node-delay": `${-index * 0.47}s`,
                    } as CSSProperties}>
                      {index % 2 === 0 ? <path className="canvas-neural-link" d={`M${x} ${y} l${x < 300 ? 34 : -34} ${y < 300 ? 24 : -24}`} /> : null}
                      <circle cx={x} cy={y} r={index % 3 === 0 ? 2.2 : 1.6} />
                    </g>
                  ))}
                  {dataStreams.map(([x, y], index) => (
                    <g className="canvas-data-stream" key={index} style={{
                      "--stream-x": `${x < 300 ? 135 : -135}px`, "--stream-y": `${(300 - y) * 0.25}px`,
                      "--stream-delay": `${-index * 0.61}s`,
                    } as CSSProperties}>
                      <path d={`M${x} ${y} h12 m-8 8 h4 m-6 9 h9 m-3 7 h2`} />
                    </g>
                  ))}
                </svg>
              ) : <div className="canvas-reveal-light" />}
            </div>
            <div className="canvas-ai-scan" />
          </>
        ) : null}
      </div>
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
      <CanvasPointerField />
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
