import { useEffect, useRef, type CSSProperties } from "react";

const mistProfiles = [
  { width: 11, height: 8, blur: 54, opacity: 0.16, light: false, radius: "62% 38% 54% 46% / 48% 58% 42% 52%", focalPoint: "42% 46%" },
  { width: 15, height: 10, blur: 62, opacity: 0.1, light: true, radius: "43% 57% 36% 64% / 60% 40% 60% 40%", focalPoint: "54% 42%" },
  { width: 10, height: 13, blur: 48, opacity: 0.18, light: false, radius: "51% 49% 66% 34% / 42% 61% 39% 58%", focalPoint: "46% 56%" },
  { width: 16, height: 9, blur: 70, opacity: 0.08, light: true, radius: "58% 42% 45% 55% / 38% 56% 44% 62%", focalPoint: "48% 48%" },
  { width: 13, height: 14, blur: 58, opacity: 0.14, light: false, radius: "39% 61% 52% 48% / 54% 42% 58% 46%", focalPoint: "58% 52%" },
  { width: 9, height: 11, blur: 46, opacity: 0.2, light: false, radius: "55% 45% 40% 60% / 63% 37% 59% 41%", focalPoint: "44% 48%" },
  { width: 15, height: 8, blur: 66, opacity: 0.09, light: true, radius: "47% 53% 61% 39% / 52% 48% 42% 58%", focalPoint: "58% 44%" },
  { width: 11, height: 12, blur: 52, opacity: 0.15, light: false, radius: "57% 43% 48% 52% / 44% 56% 39% 61%", focalPoint: "44% 56%" },
  { width: 14, height: 9, blur: 60, opacity: 0.11, light: true, radius: "41% 59% 56% 44% / 47% 53% 63% 37%", focalPoint: "52% 48%" },
  { width: 10, height: 15, blur: 50, opacity: 0.17, light: false, radius: "64% 36% 43% 57% / 56% 44% 58% 42%", focalPoint: "46% 42%" },
  { width: 12, height: 8, blur: 74, opacity: 0.07, light: true, radius: "52% 48% 38% 62% / 45% 55% 60% 40%", focalPoint: "56% 54%" },
  { width: 9, height: 12, blur: 44, opacity: 0.21, light: false, radius: "45% 55% 62% 38% / 58% 42% 47% 53%", focalPoint: "42% 52%" },
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
      const points: Array<{ x: number; y: number }> = [];
      return mistProfiles.map((profile) => {
        let point = { x: 50, y: 50 };
        let placed = false;
        for (let attempt = 0; attempt < 32; attempt += 1) {
          const candidate = { x: 6 + Math.random() * 88, y: 6 + Math.random() * 88 };
          const outsideCore = Math.hypot(candidate.x - 50, candidate.y - 50) > 25;
          const farEnough = points.every((existing) => Math.hypot(existing.x - candidate.x, existing.y - candidate.y) > 22);
          if (outsideCore && farEnough) {
            point = candidate;
            placed = true;
            break;
          }
        }
        if (!placed) {
          const angle = Math.random() * Math.PI * 2;
          const radius = 30 + Math.random() * 22;
          point = {
            x: Math.max(6, Math.min(94, 50 + Math.cos(angle) * radius)),
            y: Math.max(6, Math.min(94, 50 + Math.sin(angle) * radius)),
          };
        }
        points.push(point);
        const scale = 0.72 + Math.random() * 0.5;
        return {
          transform: `translate3d(${point.x / (profile.width / 100) - 50}%, ${point.y / (profile.height / 100) - 50}%, 0) rotate(${Math.random() * 80 - 40}deg) scale(${scale})`,
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
