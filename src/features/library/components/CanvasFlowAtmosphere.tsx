import { useEffect, useRef, type CSSProperties } from "react";

const mistProfiles = [
  { width: 28, height: 22, blur: 132, opacity: 0.055, light: false, radius: "62% 38% 54% 46% / 48% 58% 42% 52%", focalPoint: "42% 46%" },
  { width: 38, height: 25, blur: 168, opacity: 0.038, light: true, radius: "43% 57% 36% 64% / 60% 40% 60% 40%", focalPoint: "54% 42%" },
  { width: 25, height: 34, blur: 124, opacity: 0.062, light: false, radius: "51% 49% 66% 34% / 42% 61% 39% 58%", focalPoint: "46% 56%" },
  { width: 42, height: 24, blur: 188, opacity: 0.032, light: true, radius: "58% 42% 45% 55% / 38% 56% 44% 62%", focalPoint: "48% 48%" },
  { width: 34, height: 36, blur: 154, opacity: 0.048, light: false, radius: "39% 61% 52% 48% / 54% 42% 58% 46%", focalPoint: "58% 52%" },
  { width: 24, height: 29, blur: 118, opacity: 0.068, light: false, radius: "55% 45% 40% 60% / 63% 37% 59% 41%", focalPoint: "44% 48%" },
  { width: 38, height: 21, blur: 176, opacity: 0.035, light: true, radius: "47% 53% 61% 39% / 52% 48% 42% 58%", focalPoint: "58% 44%" },
  { width: 29, height: 31, blur: 142, opacity: 0.052, light: false, radius: "57% 43% 48% 52% / 44% 56% 39% 61%", focalPoint: "44% 56%" },
  { width: 36, height: 23, blur: 162, opacity: 0.04, light: true, radius: "41% 59% 56% 44% / 47% 53% 63% 37%", focalPoint: "52% 48%" },
  { width: 26, height: 38, blur: 136, opacity: 0.058, light: false, radius: "64% 36% 43% 57% / 56% 44% 58% 42%", focalPoint: "46% 42%" },
  { width: 31, height: 22, blur: 196, opacity: 0.028, light: true, radius: "52% 48% 38% 62% / 45% 55% 60% 40%", focalPoint: "56% 54%" },
  { width: 23, height: 32, blur: 112, opacity: 0.064, light: false, radius: "45% 55% 62% 38% / 58% 42% 47% 53%", focalPoint: "42% 52%" },
] as const;

// Ratios are relative to each node's own size. This keeps the nodes spread
// across a broad canvas even when their widths and heights are different.
const mistZones = [
  { x: [0.25, 0.55], y: [0.22, 0.58] },
  { x: [0.82, 1.08], y: [0.22, 0.58] },
  { x: [1.45, 1.98], y: [0.22, 0.58] },
  { x: [0.25, 0.55], y: [1.2, 1.55] },
  { x: [0.82, 1.08], y: [1.2, 1.55] },
  { x: [1.45, 1.98], y: [1.2, 1.55] },
  { x: [0.25, 0.55], y: [2.15, 2.65] },
  { x: [0.82, 1.08], y: [2.15, 2.65] },
  { x: [1.45, 1.98], y: [2.15, 2.65] },
  { x: [0.42, 0.72], y: [0.66, 0.92] },
  { x: [1.12, 1.36], y: [0.66, 0.92] },
  { x: [1.12, 1.36], y: [1.68, 1.98] },
] as const;

/** Small dispersed patches take a new, shuffled route each cycle; only transforms animate. */
export function CanvasFlowAtmosphere({ generating = false }: { generating?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const generatingRef = useRef(generating);
  generatingRef.current = generating;

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const nodes = [...host.children] as HTMLElement[];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animations: Animation[] = [];
    let timer = 0;
    let duration = 0;
    let visible = true;
    let disposed = false;
    const targets = () => {
      // Stratified normalized zones keep the mist spread across the full
      // canvas while the point inside each zone changes on every cycle.
      const zones = [...mistZones];
      for (let index = zones.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [zones[index], zones[swapIndex]] = [zones[swapIndex], zones[index]];
      }
      return mistProfiles.map((profile, index) => {
        const zone = zones[index];
        const point = {
          x: zone.x[0] + Math.random() * (zone.x[1] - zone.x[0]),
          y: zone.y[0] + Math.random() * (zone.y[1] - zone.y[0]),
        };
        const scale = 0.72 + Math.random() * 0.5;
        return {
          transform: `translate3d(${point.x * 100 - 50}%, ${point.y * 100 - 50}%, 0) rotate(${Math.random() * 80 - 40}deg) scale(${scale})`,
          opacity: String(profile.opacity * (0.76 + Math.random() * 0.42)),
        };
      });
    };
    let positions = targets();
    nodes.forEach((node, index) => Object.assign(node.style, positions[index]));
    const canRun = () => !disposed && !document.hidden && !reduced.matches && visible;
    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(cycle, delay);
    };
    function cycle() {
      if (!canRun()) return;
      const next = targets();
      duration = (generatingRef.current ? 8000 : 13000) + Math.random() * 5000;
      animations.forEach(animation => animation.cancel());
      animations = nodes.map((node, index) => node.animate([positions[index], next[index]], {
        duration, easing: "cubic-bezier(.45, 0, .55, 1)", fill: "forwards",
      }));
      positions = next;
      schedule(duration);
    }
    const sync = () => {
      window.clearTimeout(timer);
      if (!canRun()) {
        animations.forEach(animation => animation.pause());
        return;
      }
      if (animations.length) {
        animations.forEach(animation => animation.play());
        schedule(Math.max(1, duration - Number(animations[0].currentTime ?? 0)));
      } else cycle();
    };
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      sync();
    });
    observer.observe(host);
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    sync();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      animations.forEach(animation => animation.cancel());
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      reduced.removeEventListener("change", sync);
    };
  }, []);

  return (
    <div ref={ref} className="canvas-mist-field" aria-hidden="true">
      {mistProfiles.map((profile, index) => (
        <div
          className={`canvas-mist-node${profile.light ? " canvas-mist-node--light" : ""}`}
          key={index}
          style={{
            "--mist-width": `${profile.width}%`,
            "--mist-height": `${profile.height}%`,
            "--mist-blur": `${profile.blur}px`,
            "--mist-radius": profile.radius,
            "--mist-focal-point": profile.focalPoint,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}
