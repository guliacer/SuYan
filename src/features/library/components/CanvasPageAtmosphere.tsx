import { useEffect, useState } from "react";
import { useLibraryStore } from "../store/useLibraryStore";
import { CanvasPointerField } from "./CanvasPointerField";
import { CanvasFlowAtmosphere } from "./CanvasFlowAtmosphere";

/** Page-wide decorative atmosphere. It fills the natural scroll surface, never the app chrome. */
export function CanvasPageAtmosphere() {
  const generating = useLibraryStore((state) => state.canvasIsGenerating);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const syncVisibility = () => setPaused(document.hidden);
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  return (
    <div className="canvas-page-atmosphere" aria-hidden="true" data-generating={generating} data-motion-paused={paused}>
      <CanvasFlowAtmosphere generating={generating} />
      <div className="canvas-page-grain" />
      <CanvasPointerField scope="page" />
    </div>
  );
}
