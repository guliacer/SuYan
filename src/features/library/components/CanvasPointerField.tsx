import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  bendX: number;
  bendY: number;
  born: number;
  life: number;
  radius: number;
  previousX: number;
  previousY: number;
}

/** Local decoration only: no pointer capture, React updates or work while inactive. */
export function CanvasPointerField({ scope = "artwork" }: { scope?: "page" | "artwork" }) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const field = fieldRef.current;
    const canvas = canvasRef.current;
    const glow = glowRef.current;
    const host = scope === "page" ? field?.closest<HTMLElement>(".library-background-layer") : field?.parentElement;
    const context = canvas?.getContext("2d");
    if (!field || !canvas || !glow || !host || !context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let canvasTop = 0;
    let pixelRatio = 0;
    let targetX = 0;
    let targetY = 0;
    let frame = 0;
    let lastSpawn = 0;
    let active = false;
    let color = getComputedStyle(canvas).color;

    const clear = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      particles = [];
      context.clearRect(0, 0, width, height);
    };
    const stop = () => {
      active = false;
      field.dataset.active = "false";
      clear();
    };
    const resize = () => {
      const nextWidth = host.clientWidth;
      let nextHeight = host.clientHeight;
      let nextTop = 0;
      if (scope === "page") {
        // The background grows with the document, but its bitmap only covers the
        // visible scrollport. This bounds memory even with very long settings.
        const bounds = host.getBoundingClientRect();
        const scrollport = host.parentElement?.getBoundingClientRect();
        const top = Math.max(bounds.top, scrollport?.top ?? 0, 0);
        const bottom = Math.min(bounds.bottom, scrollport?.bottom ?? innerHeight, innerHeight);
        nextTop = Math.max(0, top - bounds.top);
        nextHeight = Math.max(0, bottom - top);
      }
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      // ResizeObserver's initial notification must not erase a just-entered pointer.
      if (width === nextWidth && height === nextHeight && canvasTop === nextTop && pixelRatio === ratio) return;
      stop();
      width = nextWidth;
      height = nextHeight;
      canvasTop = nextTop;
      pixelRatio = ratio;
      canvas.style.top = `${canvasTop}px`;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const spawn = (now: number) => {
      const edge = Math.floor(Math.random() * 4);
      const offset = 20 + Math.random() * 40;
      const x = edge === 0 ? -offset : edge === 1 ? width + offset : Math.random() * width;
      const y = edge === 2 ? -offset : edge === 3 ? height + offset : Math.random() * height;
      const dx = targetX - x;
      const dy = targetY - y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const bend = (Math.random() - 0.5) * Math.min(distance * 0.4, 200);
      particles.push({ x, y, bendX: -dy / distance * bend, bendY: dx / distance * bend,
        born: now, life: 1200 + Math.random() * 1200, radius: 0.9 + Math.random(),
        previousX: x, previousY: y });
    };
    const draw = (now: number) => {
      if (!active || document.hidden || reducedMotion.matches) { clear(); return; }
      context.clearRect(0, 0, width, height);
      // Never catch up missed frames with a burst after a slow frame or suspended app.
      if (now - lastSpawn >= (scope === "page" ? 120 : 85) && particles.length < (scope === "page" ? 24 : 32)) {
        spawn(now);
        lastSpawn = now;
      }
      particles = particles.filter(p => now - p.born < p.life);
      context.lineCap = "round";
      for (const p of particles) {
        const progress = (now - p.born) / p.life;
        const t = progress ** 1.2;
        const curve = Math.sin(Math.PI * t);
        const x = p.x + (targetX - p.x) * t + p.bendX * curve;
        const y = p.y + (targetY - p.y) * t + p.bendY * curve;
        const alpha = Math.min(1, progress / 0.12, (1 - progress) / 0.12);
        const dx = x - p.previousX;
        const dy = y - p.previousY;
        const length = Math.max(1, Math.hypot(dx, dy));
        const trail = Math.min(24, length * 2.5);
        const tailX = x - dx / length * trail;
        const tailY = y - dy / length * trail;
        // Short soft streaks stay bounded even when the mouse jumps across the canvas.
        const light = context.createLinearGradient(tailX, tailY, x, y);
        light.addColorStop(0, "transparent");
        light.addColorStop(1, color);
        context.strokeStyle = light;
        context.beginPath();
        context.moveTo(tailX, tailY);
        context.lineTo(x, y);
        context.globalAlpha = alpha * 0.12;
        context.lineWidth = 5;
        context.stroke();
        context.globalAlpha = alpha * 0.6;
        context.lineWidth = 1;
        context.stroke();
        context.fillStyle = color;
        context.globalAlpha = alpha * 0.72;
        context.beginPath();
        context.arc(x, y, p.radius, 0, Math.PI * 2);
        context.fill();
        p.previousX = x;
        p.previousY = y;
      }
      context.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch" || document.hidden) return;
      const bounds = host.getBoundingClientRect();
      targetX = event.clientX - bounds.left - host.clientLeft;
      targetY = event.clientY - bounds.top - host.clientTop - canvasTop;
      if (targetX < 0 || targetX > width || targetY < 0 || targetY > height) { stop(); return; }
      glow.style.transform = `translate3d(${targetX}px, ${targetY + canvasTop}px, 0)`;
      field.dataset.active = "true";
      if (!active) {
        active = true;
        lastSpawn = performance.now() - 120;
      }
      if (!frame && !reducedMotion.matches) frame = requestAnimationFrame(draw);
    };
    const syncMotion = () => {
      clear();
      if (active && !reducedMotion.matches) frame = requestAnimationFrame(draw);
    };
    const syncColor = () => { color = getComputedStyle(canvas).color; };
    const syncVisibility = () => { if (document.hidden) stop(); };
    const syncScroll = () => { stop(); if (scope === "page") resize(); };
    const resizeObserver = new ResizeObserver(resize);
    const themeObserver = new MutationObserver(syncColor);
    resize();
    resizeObserver.observe(host);
    if (scope === "page" && host.parentElement) resizeObserver.observe(host.parentElement);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-theme", "data-theme-preset"] });
    host.addEventListener("pointerenter", move);
    host.addEventListener("pointermove", move, { passive: true });
    host.addEventListener("pointerleave", stop);
    host.addEventListener("pointercancel", stop);
    // Scrolling can move the canvas out from under a stationary mouse.
    document.addEventListener("scroll", syncScroll, true);
    document.addEventListener("visibilitychange", syncVisibility);
    window.addEventListener("blur", stop);
    reducedMotion.addEventListener("change", syncMotion);
    systemTheme.addEventListener("change", syncColor);
    return () => {
      stop();
      resizeObserver.disconnect();
      themeObserver.disconnect();
      host.removeEventListener("pointerenter", move);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", stop);
      host.removeEventListener("pointercancel", stop);
      document.removeEventListener("scroll", syncScroll, true);
      document.removeEventListener("visibilitychange", syncVisibility);
      window.removeEventListener("blur", stop);
      reducedMotion.removeEventListener("change", syncMotion);
      systemTheme.removeEventListener("change", syncColor);
    };
  }, [scope]);

  return (
    <div ref={fieldRef} className="canvas-pointer-field" data-pointer-scope={scope} aria-hidden="true">
      <canvas ref={canvasRef} className="canvas-pointer-particles" />
      <div ref={glowRef} className="canvas-pointer-glow" />
    </div>
  );
}
