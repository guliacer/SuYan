import { describe, expect, it } from "vitest";
import {
  clampSidebarWidth,
  compactSidebarBreakpoint,
  defaultSidebarWidth,
  fittedSidebarWidth,
  maxSidebarWidth,
  minSidebarWidth,
  normalizeSidebarWidth,
  resizeSidebarWidthBy,
} from "@/features/library/utils/sidebarLayout";

describe("sidebarLayout", () => {
  it("clamps raw drag widths to the supported range", () => {
    expect(clampSidebarWidth(20)).toBe(minSidebarWidth);
    expect(clampSidebarWidth(260.6)).toBe(261);
    expect(clampSidebarWidth(500)).toBe(maxSidebarWidth);
    expect(clampSidebarWidth(Number.NaN)).toBe(defaultSidebarWidth);
  });

  it("snaps the icon-only range to the compact sidebar width", () => {
    expect(normalizeSidebarWidth(minSidebarWidth)).toBe(minSidebarWidth);
    expect(normalizeSidebarWidth(96)).toBe(minSidebarWidth);
    expect(normalizeSidebarWidth(compactSidebarBreakpoint)).toBe(minSidebarWidth);
  });

  it("keeps intermediate widths available for truncated labels", () => {
    expect(normalizeSidebarWidth(compactSidebarBreakpoint + 1)).toBe(compactSidebarBreakpoint + 1);
    expect(normalizeSidebarWidth(fittedSidebarWidth - 1)).toBe(fittedSidebarWidth - 1);
    expect(defaultSidebarWidth).toBe(fittedSidebarWidth);
  });

  it("migrates the old spacious default width to the fitted label width", () => {
    expect(normalizeSidebarWidth(240)).toBe(fittedSidebarWidth);
  });

  it("keeps widths that are large enough to display labels", () => {
    expect(normalizeSidebarWidth(fittedSidebarWidth)).toBe(fittedSidebarWidth);
    expect(normalizeSidebarWidth(fittedSidebarWidth + 16)).toBe(fittedSidebarWidth + 16);
    expect(normalizeSidebarWidth(defaultSidebarWidth)).toBe(defaultSidebarWidth);
  });

  it("lets keyboard resizing expand directly out of compact mode", () => {
    expect(resizeSidebarWidthBy(minSidebarWidth, 16)).toBe(compactSidebarBreakpoint + 1);
    expect(resizeSidebarWidthBy(fittedSidebarWidth + 16, -16)).toBe(fittedSidebarWidth);
    expect(resizeSidebarWidthBy(fittedSidebarWidth, -16)).toBe(fittedSidebarWidth - 16);
  });
});
