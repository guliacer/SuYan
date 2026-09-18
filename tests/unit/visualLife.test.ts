import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  defaultVisualLifeSettings,
  getVisualLifeParticleScale,
  normalizeVisualLifeSettings,
  resolveVisualLifeEffect,
  stableHash,
  visualLifeEffectIds,
} from "@/features/library/utils/visualLife";

const visualLifeOverlaySource = readFileSync(
  "src/features/library/components/VisualLifeEffectOverlay.tsx",
  { encoding: "utf8" },
);
const visualLifeTokenSource = readFileSync("src/styles/tokens.css", { encoding: "utf8" });

describe("visualLife", () => {
  it("uses only the approved visual effects", () => {
    expect(visualLifeEffectIds).toEqual([
      "stardust",
      "meteor",
      "rainbow",
      "fallingPetal",
      "geese",
      "musicNote",
      "cosmicDust",
      "heart",
    ]);
    expect(normalizeVisualLifeSettings({ mode: "custom", effectPool: ["mist", "musicScale", "musicRay", "stardust"] as never }).effectPool).toEqual(["stardust"]);
  });

  it("keeps legacy or incomplete settings usable", () => {
    expect(normalizeVisualLifeSettings(undefined)).toEqual(defaultVisualLifeSettings);
    expect(defaultVisualLifeSettings).toMatchObject({
      sheenEnabled: true,
      outerEffectsEnabled: true,
      effectPool: ["stardust", "cosmicDust", "meteor"],
    });
    expect(normalizeVisualLifeSettings({ mode: "custom", effectPool: [] })).toMatchObject({
      ...defaultVisualLifeSettings,
      mode: "custom",
    });
    expect(normalizeVisualLifeSettings({ enabled: false, reduced: true, intensity: "low" })).toMatchObject({
      enabled: false,
      reduced: true,
      intensity: "low",
    });
    expect(normalizeVisualLifeSettings({ sheenEnabled: false, outerEffectsEnabled: true })).toMatchObject({
      enabled: true,
      sheenEnabled: false,
      outerEffectsEnabled: true,
    });
    expect(normalizeVisualLifeSettings({ sheenEnabled: true, outerEffectsEnabled: false })).toMatchObject({
      enabled: true,
      sheenEnabled: true,
      outerEffectsEnabled: false,
    });
    expect(normalizeVisualLifeSettings({
      enabled: true,
      effectPool: ["bubble", "stardust"] as never,
    }).effectPool).toEqual(["stardust"]);
  });

  it("uses the selected pool and makes the result stable per card", () => {
    const settings = normalizeVisualLifeSettings({ mode: "custom", effectPool: ["stardust", "cosmicDust"] });
    const input = { id: "card-42", category: "天空", tags: ["星空"], settings };

    expect(resolveVisualLifeEffect(input)).toBe(resolveVisualLifeEffect(input));
    expect(["stardust", "cosmicDust"]).toContain(resolveVisualLifeEffect(input));
    expect(resolveVisualLifeEffect({ ...input, settings: { ...settings, mode: "static" } })).toBe("rainbow");
  });

  it("supports directly previewing every custom effect", () => {
    for (const effect of ["stardust", "meteor", "rainbow", "fallingPetal", "geese", "musicNote", "cosmicDust", "heart"] as const) {
      const settings = normalizeVisualLifeSettings({ mode: "custom", effectPool: [effect] });
      expect(resolveVisualLifeEffect({ id: `preview-${effect}`, settings })).toBe(effect);
    }
  });

  it("matches existing semantic labels without scanning image files", () => {
    const settings = normalizeVisualLifeSettings({
      mode: "smart",
      effectPool: ["fallingPetal", "stardust"],
    });
    expect(resolveVisualLifeEffect({ id: "flower", category: "花卉", tags: [], settings })).toBe("fallingPetal");
    expect(resolveVisualLifeEffect({ id: "sky", category: "天空", tags: [], settings })).not.toBe("mist");
    expect(getVisualLifeParticleScale("immersive")).toBeGreaterThan(getVisualLifeParticleScale("standard"));
    expect(stableHash("same-card")).toBe(stableHash("same-card"));
  });

  it("starts the dynamic outer canvas loop after spawning the initial particles", () => {
    const startFunction = visualLifeOverlaySource.match(/function start\(\) \{[\s\S]*?\n    \}/)?.[0] ?? "";
    expect(startFunction).toContain("frame = requestAnimationFrame(draw);");
  });

  it("clears the card rectangle after drawing so every canvas effect stays outside", () => {
    expect(visualLifeOverlaySource).toContain('context.globalCompositeOperation = "destination-out";');
    expect(visualLifeOverlaySource).toContain("clearInnerArtwork(drawingContext, width, height);");
    expect(visualLifeOverlaySource).not.toContain('context.clip("evenodd")');
  });

  it("keeps a feathered outer boundary and removes retired effects", () => {
    expect(visualLifeOverlaySource).not.toContain('effect === "mist"');
    expect(visualLifeOverlaySource).not.toContain("drawNaturalMist");
    expect(visualLifeOverlaySource).not.toContain("drawMusicScale");
    expect(visualLifeOverlaySource).not.toContain("drawMusicRay");
    expect(visualLifeOverlaySource).toContain('className="visual-life-effect-overlay pointer-events-none fixed"');
    expect(visualLifeOverlaySource).toContain("getAppOverlayBounds(0).top");
    expect(visualLifeOverlaySource).toContain("clipPath: bounds.clipTop > 0");
    expect(visualLifeTokenSource).toContain("rgb(0 0 0 / 0.42) 86%, transparent 100%");
  });

  it("renders the sheen and outer effect layers independently", () => {
    expect(visualLifeOverlaySource).toContain("settings.sheenEnabled || settings.outerEffectsEnabled");
    expect(visualLifeOverlaySource).toContain("settings.sheenEnabled ?");
    expect(visualLifeOverlaySource).toContain("outerEffectActive ? <VisualLifeEffectOverlay");
  });

  it("keeps the requested effects visually distinct", () => {
    expect(visualLifeOverlaySource).toContain("const colors = [\"#ef4444\", \"#f59e0b\", \"#4ade80\", \"#38bdf8\", \"#a78bfa\"]");
    expect(visualLifeOverlaySource).toContain("drawSingleEighthNote");
    expect(visualLifeOverlaySource).toContain("drawBeamedNotes");
    expect(visualLifeOverlaySource).toContain("drawQuarterNote");
    expect(visualLifeOverlaySource).toContain("drawDoubleEighthNote");
    expect(visualLifeOverlaySource).toContain("drawSixteenthNote");
    expect(visualLifeOverlaySource).toContain("drawWholeNote");
    expect(visualLifeOverlaySource).toContain("drawStaffNote");
    expect(visualLifeOverlaySource).toContain("Math.abs(Math.sin(particle.phase * 12.31)) * 7");
    expect(visualLifeOverlaySource).toContain("function spawnHeart");
    expect(visualLifeOverlaySource).toContain("function drawHeart");
    expect(visualLifeOverlaySource).not.toContain("bubble");
    expect(visualLifeOverlaySource).toContain("? 1.6 + random() * 6.8");
    expect(visualLifeOverlaySource).toContain("? 2.6 + random() * 7.4");
    expect(visualLifeOverlaySource).toContain("const petalWind = effect === \"fallingPetal\"");
    expect(visualLifeOverlaySource).toContain("Math.min(1 + Math.floor(random() * 2), available)");
    expect(visualLifeOverlaySource).toContain("Math.min(2 + Math.floor(random() * 3), available)");
    expect(visualLifeOverlaySource).toContain("let staggeredSpawnsRemaining = effect === \"fallingPetal\"");
    expect(visualLifeOverlaySource).toContain("? now + 520 + random() * 920");
    expect(visualLifeOverlaySource).toContain("const initialSpawnCount = isStaggeredEffect\n          ? 0");
    expect(visualLifeOverlaySource).toContain("function isDarkTheme(background: string)");
    expect(visualLifeOverlaySource).toContain("getEffectPalette(effect, primary, darkTheme)");
  });
});
