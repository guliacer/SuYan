import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { getAppOverlayBounds } from "@/components/ui/overlayPosition";
import {
  getVisualLifeParticleScale,
  resolveVisualLifeEffect,
  type VisualLifeEffectId,
  type VisualLifeSettings,
} from "../utils/visualLife";

type Props = {
  item: { id: string; category?: string | null; tags?: readonly string[] };
  settings: VisualLifeSettings;
  children: ReactNode;
  className?: string;
};

type Particle = {
  angle: number;
  born: number;
  life: number;
  phase: number;
  radius: number;
  speed: number;
  targetX: number;
  targetY: number;
  x: number;
  y: number;
};

type EffectPalette = {
  accent: string;
  highlight: string;
  secondary: string;
};

// Keep the effect outside the artwork while leaving the strongest light close
// enough to the card to remain visible in dense galleries.
const EFFECT_BLEED = 76;
type OverlayBounds = { left: number; top: number; width: number; height: number; clipTop: number };

/**
 * The outer effect layer is mounted only while the media tile is hovered, so a
 * large library does not keep hundreds of animation loops alive.
 */
export function VisualLifeMediaFrame({ item, settings, children, className = "" }: Props) {
  const [hovered, setHovered] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const active = hovered && (settings.sheenEnabled || settings.outerEffectsEnabled);
  const outerEffectActive = hovered && settings.outerEffectsEnabled;
  const effect = resolveVisualLifeEffect({ ...item, settings });
  const activate = () => setHovered(true);
  const deactivate = () => setHovered(false);

  return (
    <div
      ref={frameRef}
      data-visual-life-active={active ? "true" : "false"}
      data-visual-life-effect={effect}
      className={`visual-life-media-frame relative ${className}`}
      onMouseEnter={activate}
      onMouseMove={activate}
      onMouseLeave={deactivate}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") {
          activate();
        }
      }}
      onPointerMove={(event) => {
        if (event.pointerType !== "touch") {
          activate();
        }
      }}
      onPointerLeave={deactivate}
    >
      {children}
      {active ? (
        <>
          {settings.sheenEnabled ? (
            <span
              aria-hidden="true"
              className="visual-life-internal-sheen"
              data-visual-life-reduced={settings.reduced ? "true" : "false"}
            />
          ) : null}
          {outerEffectActive ? <VisualLifeEffectOverlay anchorRef={frameRef} effect={effect} item={item} settings={settings} /> : null}
        </>
      ) : null}
    </div>
  );
}

function VisualLifeEffectOverlay({ anchorRef, effect, item, settings }: Omit<Props, "children"> & { anchorRef: RefObject<HTMLDivElement | null>; effect: VisualLifeEffectId }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [bounds, setBounds] = useState<OverlayBounds | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const updateBounds = () => {
      const rect = anchor.getBoundingClientRect();
      const top = rect.top - EFFECT_BLEED;
      const contentTop = getAppOverlayBounds(0).top;
      const next = {
        left: rect.left - EFFECT_BLEED,
        top,
        width: rect.width + EFFECT_BLEED * 2,
        height: rect.height + EFFECT_BLEED * 2,
        // Keep the canvas geometry aligned with the card, but hide only the
        // portion that would cross into the app titlebar.
        clipTop: Math.max(0, contentTop - top),
      };
      setBounds((previous) =>
        previous &&
        previous.left === next.left &&
        previous.top === next.top &&
        previous.width === next.width &&
        previous.height === next.height &&
        previous.clipTop === next.clipTop
          ? previous
          : next,
      );
    };

    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(anchor);
    window.addEventListener("resize", updateBounds);
    document.addEventListener("scroll", updateBounds, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateBounds);
      document.removeEventListener("scroll", updateBounds, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    if (!bounds) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const host = canvas.parentElement;
    if (!host) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const canvasElement = canvas;
    const hostElement = host;
    const drawingContext = context;

    const reducedMotion = settings.reduced || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scale = getVisualLifeParticleScale(settings.intensity);
    // A new hover session gets a new sequence, so flock and meteor placement
    // is not repeated for the same card every time.
    const random = createRandom(`${item.id}:${performance.now()}:${Math.random()}`);
    let width = 0;
    let height = 0;
    let ratio = 1;
    let frame = 0;
    let last = 0;
    let nextSpawnAt = 0;
    const isStaggeredEffect = effect === "fallingPetal" || effect === "heart";
    let staggeredSpawnsRemaining = effect === "fallingPetal"
      ? 2 + Math.floor(random() * 4)
      : effect === "heart"
        ? 2 + Math.floor(random() * 4)
        : 0;
    let particles: Particle[] = [];

    function resize() {
      const bounds = hostElement.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(bounds.width));
      const nextHeight = Math.max(1, Math.round(bounds.height));
      ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = nextWidth;
      height = nextHeight;
      canvasElement.width = Math.round(width * ratio);
      canvasElement.height = Math.round(height * ratio);
      canvasElement.style.width = `${width}px`;
      canvasElement.style.height = `${height}px`;
      drawingContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (settings.mode === "static" || reducedMotion) drawStatic();
    }

    function drawStatic() {
      drawingContext.clearRect(0, 0, width, height);
      const primary = getThemeColor(canvasElement, "--color-primary");
      const darkTheme = isDarkTheme(getThemeColor(canvasElement, "--color-background"));
      drawEdgeGlow(
        drawingContext,
        width,
        height,
        0,
        getEffectPalette("rainbow", primary, darkTheme),
        Math.min(scale, 1),
      );
      clearInnerArtwork(drawingContext, width, height);
    }

    function spawn(now: number) {
      if (effect === "meteor") {
        spawnMeteor(now);
        return;
      }
      if (effect === "fallingPetal") {
        spawnFallingPetal(now);
        return;
      }
      if (effect === "heart") {
        spawnHeart(now);
        return;
      }
      if (effect === "geese") {
        spawnGeeseFlock(now);
        return;
      }
      const edge = Math.floor(random() * 4);
      const left = EFFECT_BLEED;
      const right = Math.max(left + 1, width - EFFECT_BLEED);
      const top = EFFECT_BLEED;
      const bottom = Math.max(top + 1, height - EFFECT_BLEED);
      const alongX = left + random() * Math.max(1, right - left);
      const alongY = top + random() * Math.max(1, bottom - top);
      const distance = EFFECT_BLEED * (0.8 + random() * 1.25);
      const x = edge === 0 ? left : edge === 1 ? right : alongX;
      const y = edge === 2 ? top : edge === 3 ? bottom : alongY;
      const targetX = edge === 0 ? Math.max(0, left - distance) : edge === 1 ? Math.min(width, right + distance) : x + (random() - 0.5) * EFFECT_BLEED;
      const targetY = edge === 2 ? Math.max(0, top - distance) : edge === 3 ? Math.min(height, bottom + distance) : y + (random() - 0.5) * EFFECT_BLEED;
      const life = effect === "rainbow"
        ? 2800 + random() * 1500
        : effect === "cosmicDust"
          ? 2500 + random() * 1600
          : 1800 + random() * 1900;
      particles.push({
        angle: Math.atan2(targetY - y, targetX - x),
        born: now,
        life,
        phase: random() * Math.PI * 2,
        radius: effect === "rainbow"
          ? 1.6 + random() * 6.8
          : effect === "musicNote"
            ? 2.6 + random() * 7.4
          : effect === "cosmicDust"
            ? 1.2 + random() * 2.2
            : 2 + random() * 4.6,
        speed: 0.55 + random() * 0.7,
        targetX,
        targetY,
        x,
        y,
      });
    }

    function spawnHeart(now: number) {
      const left = EFFECT_BLEED;
      const right = Math.max(left + 1, width - EFFECT_BLEED);
      const top = EFFECT_BLEED;
      const bottom = Math.max(top + 1, height - EFFECT_BLEED);
      const edge = Math.floor(random() * 4);
      const alongX = left + random() * Math.max(1, right - left);
      const alongY = top + random() * Math.max(1, bottom - top);
      const distance = EFFECT_BLEED * (0.9 + random() * 1.2);
      const x = edge === 0 ? left : edge === 1 ? right : alongX;
      const y = edge === 2 ? top : edge === 3 ? bottom : alongY;
      const targetX = edge === 0 ? Math.max(0, left - distance) : edge === 1 ? Math.min(width, right + distance) : x + (random() - 0.5) * EFFECT_BLEED;
      const targetY = edge === 2 ? Math.max(0, top - distance) : edge === 3 ? Math.min(height, bottom + distance) : y + (random() - 0.5) * EFFECT_BLEED;
      particles.push({
        angle: Math.atan2(targetY - y, targetX - x),
        born: now,
        life: 2200 + random() * 1300,
        phase: random() * Math.PI * 2,
        radius: 3.8 + random() * 6.8,
        speed: 0.64 + random() * 0.24,
        targetX,
        targetY,
        x,
        y,
      });
    }

    function spawnMeteor(now: number) {
      const left = EFFECT_BLEED;
      const right = Math.max(left + 1, width - EFFECT_BLEED);
      const top = EFFECT_BLEED;
      const bottom = Math.max(top + 1, height - EFFECT_BLEED);
      const available = Math.max(0, 2 - particles.length);
      const count = Math.min(1 + Math.floor(random() * 2), available);
      for (let index = 0; index < count; index += 1) {
        // Fixed top-right to bottom-left direction, randomized entry band and
        // timing keep each hover session sparse but visibly different.
        const startX = right + 8 + random() * 44;
        const startY = top - 24 + random() * Math.max(36, spanFor(height) * 0.54);
        const travel = Math.min(Math.max(170, Math.min(width, height) * 0.88), Math.max(210, EFFECT_BLEED * 4));
        const targetX = Math.max(0, left - travel * (0.52 + random() * 0.2));
        const targetY = Math.min(height, bottom + travel * (0.52 + random() * 0.2));
        particles.push({
          angle: Math.atan2(targetY - startY, targetX - startX),
          born: now - random() * 220,
          life: 1150 + random() * 850,
          phase: random() * Math.PI * 2,
          radius: 2.5 + random() * 1.8,
          speed: 0.92 + random() * 0.18,
          targetX,
          targetY,
          x: startX,
          y: startY,
        });
      }
    }

    function spawnFallingPetal(now: number) {
      const left = EFFECT_BLEED;
      const right = Math.max(left + 1, width - EFFECT_BLEED);
      const top = EFFECT_BLEED;
      const bottom = Math.max(top + 1, height - EFFECT_BLEED);
      const onLeft = random() < 0.5;
      const startX = onLeft ? left - 14 - random() * 18 : right + 14 + random() * 18;
      const startY = top - 16 + random() * Math.max(20, spanFor(height) * 0.22);
      const targetX = onLeft ? Math.max(0, startX - 18 - random() * 46) : Math.min(width, startX + 18 + random() * 46);
      const targetY = Math.min(height, bottom + 26 + random() * EFFECT_BLEED);
      particles.push({
        angle: Math.atan2(targetY - startY, targetX - startX),
        born: now,
        life: 3000 + random() * 1800,
        phase: random() * Math.PI * 2,
        radius: 3.4 + random() * 3.2,
        speed: 0.64 + random() * 0.22,
        targetX,
        targetY,
        x: startX,
        y: startY,
      });
    }

    function spawnGeeseFlock(now: number) {
      const left = EFFECT_BLEED;
      const right = Math.max(left + 1, width - EFFECT_BLEED);
      const top = EFFECT_BLEED;
      const bottom = Math.max(top + 1, height - EFFECT_BLEED);
      const direction = random() < 0.5 ? 1 : -1;
      const upperFlight = random() < 0.5;
      const laneDepth = 22 + random() * Math.max(26, spanFor(height) * 0.22);
      const flightY = upperFlight
        ? top - laneDepth
        : bottom + laneDepth;
      const edgePadding = 42 + random() * 34;
      const startX = direction > 0 ? left - edgePadding : right + edgePadding;
      const targetX = direction > 0 ? right + edgePadding : left - edgePadding;
      const available = Math.max(0, 6 - particles.length);
      const flockSize = Math.min(2 + Math.floor(random() * 3), available);
      const spacing = 14 + random() * 8;
      for (let index = 0; index < flockSize; index += 1) {
        const x = startX - direction * index * spacing;
        const y = flightY + (random() - 0.5) * 16;
        particles.push({
          angle: direction > 0 ? 0 : Math.PI,
          born: now - index * 45,
          life: 2500 + random() * 800,
          phase: random() * Math.PI * 2,
          radius: 2.1 + random() * 1.1,
          speed: 0.72 + random() * 0.18,
          targetX,
          targetY: y + (random() - 0.5) * 10,
          x,
          y,
        });
      }
    }

    function spanFor(value: number): number {
      return Math.max(1, value - EFFECT_BLEED * 2);
    }

    function draw(now: number) {
      if (document.hidden || reducedMotion || settings.mode === "static") {
        cancelAnimationFrame(frame);
        frame = 0;
        drawStatic();
        return;
      }

      drawingContext.clearRect(0, 0, width, height);
      const particleLimit = ({
        stardust: 58,
        meteor: 2,
        rainbow: 3,
        fallingPetal: 8,
        geese: 6,
        musicNote: 10,
        cosmicDust: 42,
        heart: 8,
      }[effect] * scale);
      const maxParticles = effect === "meteor" || effect === "geese"
        ? Math.max(1, Math.round(particleLimit))
        : Math.max(8, Math.round(particleLimit));
      const canSpawnStaggeredEffect = !isStaggeredEffect || staggeredSpawnsRemaining > 0;
      if (now - last > 28 && now >= nextSpawnAt && canSpawnStaggeredEffect && particles.length < maxParticles) {
        spawn(now);
        last = now;
        if (isStaggeredEffect) {
          staggeredSpawnsRemaining -= 1;
          // Staggered effects use a random pause so they arrive as separate
          // natural events instead of appearing as one dense burst.
          nextSpawnAt = effect === "fallingPetal"
            ? now + 520 + random() * 920
            : now + 300 + random() * 700;
        }
      }
      particles = particles.filter((particle) => now - particle.born < particle.life);
      const primary = getThemeColor(canvasElement, "--color-primary");
      const foreground = getThemeColor(canvasElement, "--color-foreground");
      const darkTheme = isDarkTheme(getThemeColor(canvasElement, "--color-background"));
      const palette = getEffectPalette(effect, primary, darkTheme);

      // The atmosphere starts at the card boundary and bleeds outward. The
      // portal keeps this layer above neighboring cards instead of clipping it
      // to the hovered card's overflow context.
      drawEdgeGlow(drawingContext, width, height, now, palette, scale);
      for (const particle of particles) drawParticle(drawingContext, particle, effect, now, width, height, palette, foreground);
      // The portal canvas may overlap the card's rectangle by design so its
      // glow can bloom from the edge. Erase that rectangle after every pass;
      // this is more reliable than relying on a browser-specific even-odd
      // canvas clip and guarantees the artwork remains unobstructed.
      clearInnerArtwork(drawingContext, width, height);
      frame = requestAnimationFrame(draw);
    }

    function start() {
      resize();
      if (!reducedMotion && settings.mode !== "static") {
        const initialNow = performance.now();
        const initialSpawnCount = isStaggeredEffect
          ? 0
          : effect === "geese"
          ? 1
          : effect === "meteor"
            ? 1
            : effect === "rainbow"
              ? 2
          : effect === "musicNote"
            ? 6
            : effect === "cosmicDust"
              ? 18
              : Math.max(18, Math.round(28 * scale));
        if (isStaggeredEffect) {
          nextSpawnAt = effect === "fallingPetal"
            ? initialNow + 280 + random() * 520
            : initialNow + 260 + random() * 560;
        }
        for (let index = 0; index < initialSpawnCount; index += 1) spawn(initialNow - index * 31);
        // Start the render loop after the first batch is ready. Without this
        // first frame, dynamic effects only pre-created invisible particles
        // and never painted the outer aura or particle field.
        frame = requestAnimationFrame(draw);
      }
    }

    const observer = new ResizeObserver(resize);
    observer.observe(hostElement);
    start();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      drawingContext.clearRect(0, 0, width, height);
    };
  }, [bounds, effect, item.id, settings.intensity, settings.mode, settings.reduced]);

  if (!bounds) return null;
  return createPortal(
    <div
      aria-hidden="true"
      className="visual-life-effect-overlay pointer-events-none fixed"
      data-visual-life-effect={effect}
      style={{
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        clipPath: bounds.clipTop > 0 ? `inset(${bounds.clipTop}px 0 0 0)` : undefined,
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>,
    document.body,
  );
}

function drawParticle(
  context: CanvasRenderingContext2D,
  particle: Particle,
  effect: VisualLifeEffectId,
  now: number,
  width: number,
  height: number,
  palette: EffectPalette,
  foreground: string,
) {
  const progress = (now - particle.born) / particle.life;
  const fade = Math.min(1, progress / 0.06, (1 - progress) / 0.22);
  const travel = 1 - Math.pow(1 - progress, particle.speed);
  const drift = Math.sin(particle.phase + progress * Math.PI * 2) * 10 * Math.sin(progress * Math.PI);
  const petalWind = effect === "fallingPetal"
    ? Math.sin(particle.phase * 1.7 + progress * Math.PI * 2.2) * (18 + particle.radius * 4) * Math.sin(progress * Math.PI)
    : 0;
  const petalLift = effect === "fallingPetal"
    ? Math.sin(particle.phase + progress * Math.PI * 3.1) * 6 * Math.sin(progress * Math.PI)
    : 0;
  const x = particle.x
    + (particle.targetX - particle.x) * travel
    + Math.cos(particle.angle + Math.PI / 2) * drift
    + petalWind;
  const y = particle.y
    + (particle.targetY - particle.y) * travel
    + Math.sin(particle.angle + Math.PI / 2) * drift
    + petalLift;
  context.save();
  context.globalAlpha = fade * (effect === "geese" ? 0.72 : effect === "cosmicDust" ? 0.74 : 0.88);
  context.fillStyle = effect === "stardust" ? palette.accent : foreground;
  if (effect === "meteor") {
    drawMeteor(context, x, y, particle, palette, fade);
  } else if (effect === "rainbow") {
    drawRainbow(context, x, y, particle, palette, fade);
  } else if (effect === "heart") {
    drawHeart(context, x, y, particle, palette, progress, fade);
  } else if (effect === "fallingPetal") {
    drawNaturalPetal(context, x, y, particle, palette, progress, fade);
  } else if (effect === "geese") {
    drawGoose(context, x, y, particle, palette, now);
  } else if (effect === "musicNote") {
    drawMusicNote(context, x, y, particle, palette, progress);
  } else if (effect === "cosmicDust") {
    drawCosmicDust(context, x, y, particle, palette, fade);
  } else if (effect === "stardust") {
    context.fillStyle = palette.highlight;
    context.shadowBlur = 11;
    context.shadowColor = palette.accent;
    drawStar(context, x, y, particle.radius * 1.8);
    context.fill();
  }
  context.restore();
  void width;
  void height;
}

function drawMeteor(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  particle: Particle,
  palette: EffectPalette,
  fade: number,
): void {
  const tail = 34 + particle.radius * 12;
  const tailX = x - Math.cos(particle.angle) * tail;
  const tailY = y - Math.sin(particle.angle) * tail;
  const gradient = context.createLinearGradient(tailX, tailY, x, y);
  gradient.addColorStop(0, "transparent");
  gradient.addColorStop(0.7, withAlpha(palette.secondary, fade * 0.18));
  gradient.addColorStop(1, withAlpha(palette.highlight, fade * 0.9));
  context.strokeStyle = gradient;
  context.lineWidth = 1.5 + particle.radius * 0.32;
  context.lineCap = "round";
  context.shadowBlur = 12;
  context.shadowColor = palette.accent;
  context.beginPath();
  context.moveTo(tailX, tailY);
  context.lineTo(x, y);
  context.stroke();
  context.fillStyle = palette.highlight;
  context.beginPath();
  context.arc(x, y, particle.radius * 1.12, 0, Math.PI * 2);
  context.fill();
}

function drawRainbow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  particle: Particle,
  palette: EffectPalette,
  fade: number,
): void {
  // Five broad bands keep a rare rainbow legible without making a single
  // particle look like a dense barcode of color.
  const colors = ["#ef4444", "#f59e0b", "#4ade80", "#38bdf8", "#a78bfa"];
  const radius = 16 + particle.radius * 7.2;
  context.translate(x, y);
  context.rotate(particle.phase * 0.18);
  context.lineCap = "round";
  for (let index = 0; index < colors.length; index += 1) {
    context.strokeStyle = withAlpha(colors[index], fade * 0.38);
    context.lineWidth = Math.max(1.2, particle.radius * 0.22);
    context.beginPath();
    context.arc(0, 0, radius - index * 2.7, Math.PI * 1.08, Math.PI * 1.92);
    context.stroke();
  }
  context.fillStyle = withAlpha(palette.highlight, fade * 0.48);
  context.beginPath();
  context.arc(0, 0, 1.4, 0, Math.PI * 2);
  context.fill();
}

function drawHeart(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  particle: Particle,
  palette: EffectPalette,
  progress: number,
  fade: number,
): void {
  const size = particle.radius * (0.72 + progress * 0.76);
  context.translate(x, y);
  context.rotate(Math.sin(particle.phase + progress * Math.PI * 2) * 0.18);
  const fill = context.createLinearGradient(0, -size, 0, size);
  fill.addColorStop(0, withAlpha(palette.highlight, fade * 0.94));
  fill.addColorStop(0.42, withAlpha(palette.accent, fade * 0.9));
  fill.addColorStop(1, withAlpha(palette.secondary, fade * 0.62));
  context.fillStyle = fill;
  context.strokeStyle = withAlpha(palette.highlight, fade * 0.7);
  context.lineWidth = Math.max(0.8, particle.radius * 0.13);
  context.shadowBlur = 10 + particle.radius;
  context.shadowColor = withAlpha(palette.accent, fade * 0.65);
  context.beginPath();
  context.moveTo(0, size * 1.05);
  context.bezierCurveTo(-size * 0.22, size * 0.72, -size * 1.12, size * 0.12, -size * 0.92, -size * 0.5);
  context.bezierCurveTo(-size * 0.78, -size * 1.02, -size * 0.14, -size * 1.08, 0, -size * 0.48);
  context.bezierCurveTo(size * 0.14, -size * 1.08, size * 0.78, -size * 1.02, size * 0.92, -size * 0.5);
  context.bezierCurveTo(size * 1.12, size * 0.12, size * 0.22, size * 0.72, 0, size * 1.05);
  context.closePath();
  context.fill();
  context.stroke();
}

function drawNaturalPetal(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  particle: Particle,
  palette: EffectPalette,
  progress: number,
  fade: number,
): void {
  const size = particle.radius * (1.15 + Math.sin(progress * Math.PI) * 0.16);
  context.translate(x, y);
  context.rotate(particle.phase + progress * 4.6);
  const gradient = context.createLinearGradient(0, -size * 1.4, 0, size * 1.3);
  gradient.addColorStop(0, withAlpha(palette.highlight, fade * 0.88));
  gradient.addColorStop(0.38, withAlpha(palette.accent, fade * 0.86));
  gradient.addColorStop(1, withAlpha(palette.secondary, fade * 0.54));
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(0, -size * 1.35);
  context.bezierCurveTo(size * 0.9, -size * 0.78, size * 0.86, size * 0.54, 0, size * 1.28);
  context.bezierCurveTo(-size * 0.84, size * 0.5, -size * 0.9, -size * 0.76, 0, -size * 1.35);
  context.closePath();
  context.fill();
  context.strokeStyle = withAlpha(palette.highlight, fade * 0.7);
  context.lineWidth = 0.7;
  context.stroke();
  context.strokeStyle = withAlpha(palette.secondary, fade * 0.62);
  context.beginPath();
  context.moveTo(0, -size * 0.98);
  context.quadraticCurveTo(size * 0.08, 0, -size * 0.04, size * 0.96);
  context.stroke();
}

function drawGoose(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  particle: Particle,
  palette: EffectPalette,
  now: number,
): void {
  const direction = particle.targetX >= particle.x ? 1 : -1;
  const flap = Math.sin(now / 210 + particle.phase) * 0.18;
  const size = particle.radius * 2.8;
  context.translate(x, y);
  context.scale(direction, 1);
  context.strokeStyle = withAlpha(palette.accent, 0.9);
  context.lineWidth = Math.max(1.1, particle.radius * 0.42);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowBlur = 5;
  context.shadowColor = palette.secondary;
  context.beginPath();
  context.moveTo(-size * 1.45, 0.05 * size);
  context.quadraticCurveTo(-size * 0.68, (-0.82 + flap) * size, 0, 0.02 * size);
  context.quadraticCurveTo(size * 0.54, (-0.68 - flap) * size, size * 1.18, -0.04 * size);
  context.stroke();
  context.beginPath();
  context.moveTo(size * 1.02, -0.04 * size);
  context.lineTo(size * 1.55, -0.18 * size);
  context.stroke();
}

function drawMusicNote(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  particle: Particle,
  palette: EffectPalette,
  progress: number,
): void {
  const size = particle.radius * 2.3;
  const variant = Math.floor(Math.abs(Math.sin(particle.phase * 12.31)) * 7);
  context.translate(x, y);
  context.rotate(Math.sin(particle.phase + progress * 3.2) * 0.18);
  context.strokeStyle = withAlpha(palette.accent, 0.94);
  context.fillStyle = withAlpha(palette.accent, 0.9);
  context.lineWidth = Math.max(1.15, particle.radius * 0.4);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowBlur = 8;
  context.shadowColor = withAlpha(palette.accent, 0.65);
  if (variant === 0) {
    drawSingleEighthNote(context, size);
  } else if (variant === 1) {
    drawBeamedNotes(context, size);
  } else if (variant === 2) {
    drawQuarterNote(context, size);
  } else if (variant === 3) {
    drawDoubleEighthNote(context, size);
  } else if (variant === 4) {
    drawSixteenthNote(context, size);
  } else if (variant === 5) {
    drawWholeNote(context, size);
  } else {
    drawStaffNote(context, size);
  }
}

function drawSingleEighthNote(context: CanvasRenderingContext2D, size: number): void {
  context.beginPath();
  context.moveTo(size * 0.34, -size * 1.02);
  context.lineTo(size * 0.34, size * 0.42);
  context.quadraticCurveTo(size * 0.72, size * 0.16, size * 0.88, size * 0.02);
  context.stroke();
  context.beginPath();
  context.ellipse(-size * 0.02, size * 0.58, size * 0.54, size * 0.32, -0.2, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.moveTo(size * 0.34, -size * 1.02);
  context.quadraticCurveTo(size * 0.78, -size * 1.13, size * 0.98, -size * 0.82);
  context.stroke();
}

function drawBeamedNotes(context: CanvasRenderingContext2D, size: number): void {
  const left = -size * 0.48;
  const right = size * 0.48;
  context.beginPath();
  context.moveTo(left, -size * 0.8);
  context.lineTo(left, size * 0.5);
  context.moveTo(right, -size * 0.98);
  context.lineTo(right, size * 0.32);
  context.moveTo(left, -size * 0.8);
  context.lineTo(right, -size * 0.98);
  context.moveTo(left, -size * 0.56);
  context.lineTo(right, -size * 0.74);
  context.stroke();
  context.beginPath();
  context.ellipse(left - size * 0.08, size * 0.64, size * 0.44, size * 0.27, -0.2, 0, Math.PI * 2);
  context.ellipse(right - size * 0.08, size * 0.46, size * 0.44, size * 0.27, -0.2, 0, Math.PI * 2);
  context.fill();
}

function drawQuarterNote(context: CanvasRenderingContext2D, size: number): void {
  context.beginPath();
  context.moveTo(size * 0.28, -size * 1.08);
  context.lineTo(size * 0.28, size * 0.5);
  context.stroke();
  context.beginPath();
  context.ellipse(-size * 0.05, size * 0.66, size * 0.58, size * 0.34, -0.2, 0, Math.PI * 2);
  context.fill();
}

function drawDoubleEighthNote(context: CanvasRenderingContext2D, size: number): void {
  const left = -size * 0.32;
  const right = size * 0.42;
  context.beginPath();
  context.moveTo(left, -size * 0.98);
  context.lineTo(left, size * 0.45);
  context.moveTo(right, -size * 0.78);
  context.lineTo(right, size * 0.66);
  context.moveTo(left, -size * 0.98);
  context.lineTo(right, -size * 0.78);
  context.stroke();
  context.beginPath();
  context.ellipse(left - size * 0.08, size * 0.62, size * 0.42, size * 0.27, -0.2, 0, Math.PI * 2);
  context.ellipse(right - size * 0.08, size * 0.84, size * 0.42, size * 0.27, -0.2, 0, Math.PI * 2);
  context.fill();
}

function drawSixteenthNote(context: CanvasRenderingContext2D, size: number): void {
  const stemX = size * 0.28;
  context.beginPath();
  context.moveTo(stemX, -size * 1.12);
  context.lineTo(stemX, size * 0.52);
  context.moveTo(stemX, -size * 1.12);
  context.quadraticCurveTo(size * 0.82, -size * 1.2, size * 0.98, -size * 0.92);
  context.moveTo(stemX, -size * 0.82);
  context.quadraticCurveTo(size * 0.8, -size * 0.9, size * 0.95, -size * 0.62);
  context.stroke();
  context.beginPath();
  context.ellipse(-size * 0.08, size * 0.68, size * 0.54, size * 0.31, -0.2, 0, Math.PI * 2);
  context.fill();
}

function drawWholeNote(context: CanvasRenderingContext2D, size: number): void {
  context.beginPath();
  context.ellipse(0, size * 0.14, size * 0.7, size * 0.42, -0.18, 0, Math.PI * 2);
  context.stroke();
}

function drawStaffNote(context: CanvasRenderingContext2D, size: number): void {
  const left = -size * 0.92;
  const right = size * 0.92;
  const spacing = size * 0.3;
  context.lineWidth = Math.max(0.8, size * 0.11);
  context.globalAlpha *= 0.72;
  context.beginPath();
  for (let index = -2; index <= 2; index += 1) {
    const lineY = index * spacing;
    context.moveTo(left, lineY);
    context.lineTo(right, lineY);
  }
  context.stroke();
  context.globalAlpha /= 0.72;
  context.lineWidth = Math.max(1.15, particleLineWidth(size));
  const noteY = spacing * 0.5;
  context.beginPath();
  context.moveTo(size * 0.15, noteY);
  context.lineTo(size * 0.15, -size * 0.95);
  context.stroke();
  context.beginPath();
  context.ellipse(-size * 0.12, noteY, size * 0.47, size * 0.28, -0.2, 0, Math.PI * 2);
  context.fill();
}

function particleLineWidth(size: number): number {
  return size * 0.32;
}

function drawCosmicDust(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  particle: Particle,
  palette: EffectPalette,
  fade: number,
): void {
  const clusterRadius = 9 + particle.radius * 4;
  context.translate(x, y);
  for (let index = 0; index < 5; index += 1) {
    const angle = particle.phase + index * 1.28;
    const distance = clusterRadius * (0.18 + (index % 3) * 0.2);
    const dustX = Math.cos(angle) * distance;
    const dustY = Math.sin(angle) * distance;
    const size = particle.radius * (0.32 + (index % 2) * 0.24);
    context.fillStyle = withAlpha(index % 3 === 0 ? palette.highlight : palette.accent, fade * (0.28 + (index % 2) * 0.1));
    context.shadowBlur = index === 0 ? 7 : 3;
    context.shadowColor = palette.secondary;
    context.beginPath();
    context.arc(dustX, dustY, size, 0, Math.PI * 2);
    context.fill();
  }
}

function drawEdgeGlow(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  now: number,
  palette: EffectPalette,
  scale: number,
) {
  const pulse = 0.5 + Math.sin(now / 850) * 0.24;
  const left = EFFECT_BLEED;
  const right = Math.max(left + 1, width - EFFECT_BLEED);
  const top = EFFECT_BLEED;
  const bottom = Math.max(top + 1, height - EFFECT_BLEED);
  const spanX = Math.max(1, right - left);
  const spanY = Math.max(1, bottom - top);
  const cardRadius = Math.min(26, Math.max(14, Math.min(spanX, spanY) * 0.08));
  const glowOffset = 8 + scale * 2;
  const auraWidth = 16 + scale * 4;
  const outerOffset = glowOffset + 11 + scale * 2;
  const accentAlpha = Math.min(0.34, 0.2 + scale * 0.045);
  const secondaryAlpha = Math.min(0.26, 0.12 + scale * 0.035);

  context.save();
  context.globalCompositeOperation = "source-over";

  // A narrow, offset stroke creates a soft aura outside the card. It is
  // intentionally not a filled rectangle: the image stays readable and the
  // effect reads as light escaping from the edge instead of a color overlay.
  const auraGradient = context.createLinearGradient(left, top, right, bottom);
  auraGradient.addColorStop(0, withAlpha(palette.highlight, accentAlpha * 0.72));
  auraGradient.addColorStop(0.42, withAlpha(palette.accent, accentAlpha));
  auraGradient.addColorStop(1, withAlpha(palette.secondary, secondaryAlpha));
  context.globalAlpha = 0.78 + pulse * 0.22;
  context.strokeStyle = auraGradient;
  context.lineWidth = auraWidth;
  context.shadowBlur = 25 + scale * 7;
  context.shadowColor = withAlpha(palette.accent, accentAlpha);
  context.beginPath();
  context.roundRect(left - glowOffset, top - glowOffset, spanX + glowOffset * 2, spanY + glowOffset * 2, cardRadius + glowOffset);
  context.stroke();

  // The outer contour stays broad and translucent so the mask dissolves
  // into the page instead of reading like a clipped rectangle.
  context.globalAlpha = 0.34;
  context.lineWidth = 6 + scale * 1.5;
  context.shadowBlur = 24 + scale * 6;
  context.strokeStyle = withAlpha(palette.secondary, secondaryAlpha * 0.72 + pulse * 0.025);
  context.beginPath();
  context.roundRect(left - outerOffset, top - outerOffset, spanX + outerOffset * 2, spanY + outerOffset * 2, cardRadius + outerOffset);
  context.stroke();

  // Four small light blooms give the outer aura depth without turning the
  // whole gutter into a solid block of color.
  const nodeOffset = glowOffset + 4;
  const nodeRadius = 22 + scale * 3;
  const nodeAlpha = 0.14;
  for (const [x, y] of [
    [left - nodeOffset, top - nodeOffset],
    [right + nodeOffset, top - nodeOffset],
    [left - nodeOffset, bottom + nodeOffset],
    [right + nodeOffset, bottom + nodeOffset],
  ]) {
    drawOuterGlowNode(context, x, y, nodeRadius, palette, nodeAlpha);
  }

  // A restrained moving highlight gives the ring a living edge rather than a
  // permanently lit outline.
  const sweep = (now / 2300) % 1;
  const sweepX = left + sweep * spanX;
  const sweepGradient = context.createLinearGradient(sweepX - 30, 0, sweepX + 30, 0);
  sweepGradient.addColorStop(0, "transparent");
  sweepGradient.addColorStop(0.5, withAlpha(palette.highlight, Math.min(0.72, 0.28 + scale * 0.05)));
  sweepGradient.addColorStop(1, "transparent");
  context.strokeStyle = sweepGradient;
  context.lineWidth = 3;
  context.globalAlpha = 0.72;
  context.beginPath();
  context.moveTo(left - glowOffset, top - glowOffset - 1);
  context.lineTo(right + glowOffset, top - glowOffset - 1);
  context.stroke();
  context.restore();
}

function drawOuterGlowNode(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  palette: EffectPalette,
  alpha: number,
): void {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, withAlpha(palette.highlight, alpha * 0.9));
  gradient.addColorStop(0.34, withAlpha(palette.accent, alpha));
  gradient.addColorStop(0.72, withAlpha(palette.secondary, alpha * 0.34));
  gradient.addColorStop(1, "transparent");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function clearInnerArtwork(context: CanvasRenderingContext2D, width: number, height: number): void {
  const left = EFFECT_BLEED - 1;
  const top = EFFECT_BLEED - 1;
  const spanX = Math.max(1, width - EFFECT_BLEED * 2 + 2);
  const spanY = Math.max(1, height - EFFECT_BLEED * 2 + 2);
  const radius = Math.min(28, Math.max(14, Math.min(spanX, spanY) * 0.08)) + 1;
  context.save();
  context.globalCompositeOperation = "destination-out";
  context.shadowBlur = 0;
  context.fillStyle = "rgba(0,0,0,1)";
  context.beginPath();
  context.roundRect(left, top, spanX, spanY, radius);
  context.fill();
  context.restore();
}

function getEffectPalette(effect: VisualLifeEffectId, primary: string, darkTheme: boolean): EffectPalette {
  if (effect === "stardust") {
    return darkTheme
      ? { accent: "#c4b5fd", highlight: "#ffffff", secondary: "#67e8f9" }
      : { accent: "#7c3aed", highlight: "#eef2ff", secondary: "#0284c7" };
  }
  if (effect === "meteor") {
    return darkTheme
      ? { accent: "#93c5fd", highlight: "#fff7ed", secondary: "#d8b4fe" }
      : { accent: "#2563eb", highlight: "#fff7ed", secondary: "#9333ea" };
  }
  if (effect === "rainbow") {
    return darkTheme
      ? { accent: "#f9a8d4", highlight: "#ffffff", secondary: "#93c5fd" }
      : { accent: "#db2777", highlight: "#fff7ed", secondary: "#2563eb" };
  }
  if (effect === "fallingPetal") {
    return darkTheme
      ? { accent: "#f9a8d4", highlight: "#fff1f8", secondary: "#fda4af" }
      : { accent: "#db2777", highlight: "#fff1f8", secondary: "#fb7185" };
  }
  if (effect === "geese") {
    return darkTheme
      ? { accent: "#94a3b8", highlight: "#cbd5e1", secondary: "#64748b" }
      : { accent: "#475569", highlight: "#334155", secondary: "#64748b" };
  }
  if (effect === "musicNote") {
    return darkTheme
      ? { accent: "#f472b6", highlight: "#fce7f3", secondary: "#f9a8d4" }
      : { accent: "#db2777", highlight: "#ffd1e6", secondary: "#ec4899" };
  }
  if (effect === "cosmicDust") {
    return darkTheme
      ? { accent: "#a5b4fc", highlight: "#f5f3ff", secondary: "#67e8f9" }
      : { accent: "#4f46e5", highlight: "#f5f3ff", secondary: "#0284c7" };
  }
  if (effect === "heart") {
    return darkTheme
      ? { accent: "#fb7185", highlight: "#fff1f2", secondary: "#f9a8d4" }
      : { accent: "#e11d48", highlight: "#fff1f2", secondary: "#ec4899" };
  }
  return darkTheme
    ? { accent: primary || "#c4b5fd", highlight: "#ffffff", secondary: "#67e8f9" }
    : { accent: primary || "#7c3aed", highlight: "#eef2ff", secondary: "#0284c7" };
}

function drawStar(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  context.beginPath();
  for (let index = 0; index < 8; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI) / 4;
    const distance = index % 2 === 0 ? radius : radius * 0.24;
    const pointX = x + Math.cos(angle) * distance;
    const pointY = y + Math.sin(angle) * distance;
    if (index === 0) context.moveTo(pointX, pointY);
    else context.lineTo(pointX, pointY);
  }
  context.closePath();
}

function getThemeColor(element: HTMLElement, name: string): string {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  return value || "rgb(15, 118, 110)";
}

function isDarkTheme(background: string): boolean {
  const channels = parseColorChannels(background);
  if (!channels) return false;
  const [red, green, blue] = channels.map((channel) => channel / 255);
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance < 0.42;
}

function parseColorChannels(color: string): [number, number, number] | null {
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const expanded = hex.length === 3 ? hex.split("").map((channel) => channel + channel).join("") : hex;
    return [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16)) as [number, number, number];
  }
  const match = color.match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;
  const channels = match[1].split(/[ ,/]+/).filter(Boolean).slice(0, 3).map(Number);
  return channels.length === 3 && channels.every(Number.isFinite) ? channels as [number, number, number] : null;
}

function withAlpha(color: string, alpha: number): string {
  const hex = color.match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (hex && (hex.length === 3 || hex.length === 6)) {
    const expanded = hex.length === 3 ? hex.split("").map((channel) => channel + channel).join("") : hex;
    const channels = [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16));
    return `rgba(${channels.join(",")},${alpha})`;
  }
  const match = color.match(/rgba?\(([^)]+)\)/i);
  if (!match) return color;
  const channels = match[1].split(/[ ,/]+/).filter(Boolean).slice(0, 3);
  return `rgba(${channels.join(",")},${alpha})`;
}

function createRandom(seed: string): () => number {
  let value = hash(seed) || 1;
  return () => {
    value = Math.imul(value * 1664525 + 1013904223, 1) >>> 0;
    return value / 0x100000000;
  };
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}
