import { useEffect, useState, type CSSProperties } from "react";
import { useLibraryStore } from "../store/useLibraryStore";
import { canvasBackgroundImageUrl, isDarkCanvasColor } from "../utils/canvasBackground";

export function useCanvasBackground(enabled = true) {
  const settings = useLibraryStore(state => state.canvasBackground);
  const url = enabled && settings.mode === "image" && settings.imageFileName ? canvasBackgroundImageUrl(settings.imageFileName) : "";
  const [loaded, setLoaded] = useState({ url: "", ok: false });
  useEffect(() => {
    if (!url) return;
    let active = true;
    const image = new Image();
    image.onload = () => { if (active) setLoaded({ url, ok: true }); };
    image.onerror = () => { if (active) setLoaded({ url, ok: false }); };
    image.src = url;
    return () => { active = false; image.onload = null; image.onerror = null; };
  }, [url]);
  const ready = !!url && loaded.url === url && loaded.ok;
  const mode = settings.mode === "image" && !ready ? "mist" : settings.mode;
  return {
    mode,
    dark: mode === "color" && isDarkCanvasColor(settings.color),
    imageError: enabled && settings.mode === "image" && (!url || (loaded.url === url && !loaded.ok)),
    style: {
      "--canvas-custom-background-color": settings.color ?? undefined,
      "--canvas-custom-background-image": ready ? `url("${url}")` : undefined,
    } as CSSProperties,
  };
}
