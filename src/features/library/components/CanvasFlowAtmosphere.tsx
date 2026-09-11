import { useEffect, useRef } from "react";

const mistCount = 6;

/** Six dispersed patches take a new, shuffled route each cycle; only transforms animate. */
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
      const cells = Array.from({ length: mistCount }, (_, index) => index);
      for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cells[i], cells[j]] = [cells[j], cells[i]];
      }
      return cells.map(cell => {
        // Each destination occupies a different part of the surface. Jitter stays
        // within that cell so random routes cannot concentrate all color in a corner.
        const x = (cell % 3) * 30 + 8 + Math.random() * 20;
        const y = Math.floor(cell / 3) * 46 + 10 + Math.random() * 26;
        const scale = 0.85 + Math.random() * 0.3;
        return {
          transform: `translate3d(${x / 0.48 - 50}%, ${y / 0.52 - 50}%, 0) rotate(${Math.random() * 100 - 50}deg) scale(${scale})`,
          opacity: String(0.5 + Math.random() * 0.25),
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
      {Array.from({ length: mistCount }, (_, index) => (
        <div className={`canvas-mist-node${index % 3 === 2 ? " canvas-mist-node--light" : ""}`} key={index} />
      ))}
    </div>
  );
}
