import { describe, expect, it } from "vitest";
import {
  pickNextRotatingLoadingTipIndex,
  pickRandomRotatingLoadingTipIndex,
  pickRotatingLoadingTipDelay,
  rotatingLoadingTipMessages,
} from "../../src/components/ui/RotatingLoadingTip";

describe("RotatingLoadingTip", () => {
  it("keeps separate humorous message pools for analysis, export, processing, and updates", () => {
    expect(rotatingLoadingTipMessages.analysis.length).toBeGreaterThanOrEqual(8);
    expect(rotatingLoadingTipMessages.export.length).toBeGreaterThanOrEqual(8);
    expect(rotatingLoadingTipMessages.processing.length).toBeGreaterThanOrEqual(8);
    expect(rotatingLoadingTipMessages.update.length).toBeGreaterThanOrEqual(8);
    expect(rotatingLoadingTipMessages.analysis).not.toEqual(rotatingLoadingTipMessages.export);
    expect(rotatingLoadingTipMessages.processing).not.toEqual(rotatingLoadingTipMessages.analysis);
    expect(rotatingLoadingTipMessages.update).not.toEqual(rotatingLoadingTipMessages.processing);
  });

  it("never repeats the current message on the next rotation", () => {
    expect(pickNextRotatingLoadingTipIndex(2, 5, () => 0)).toBe(0);
    expect(pickNextRotatingLoadingTipIndex(2, 5, () => 0.5)).toBe(3);
    expect(pickNextRotatingLoadingTipIndex(0, 1, () => 0.5)).toBe(0);
  });

  it("can choose a valid random first message", () => {
    expect(pickRandomRotatingLoadingTipIndex(10, () => 0)).toBe(0);
    expect(pickRandomRotatingLoadingTipIndex(10, () => 0.99)).toBe(9);
    expect(pickRandomRotatingLoadingTipIndex(0, () => 0.5)).toBe(0);
  });

  it("chooses each rotation delay inside the configured range", () => {
    expect(pickRotatingLoadingTipDelay(2800, 5200, () => 0)).toBe(2800);
    expect(pickRotatingLoadingTipDelay(2800, 5200, () => 0.5)).toBe(4000);
    expect(pickRotatingLoadingTipDelay(2800, 5200, () => 1)).toBe(5200);
    expect(pickRotatingLoadingTipDelay(5200, 2800, () => 0.5)).toBe(5200);
  });
});
