import { describe, expect, it } from "vitest";
import {
  easterEggMessages, finishingMessages, generatingMessages, getCanvasWaitingDelay,
  pickCanvasWaitingMessage, thinkingMessages,
} from "../../src/features/library/utils/canvasWaitingMessages";

describe("canvas waiting messages", () => {
  it("keeps thinking and actual completion separate from provider waiting", () => {
    for (const value of [0, 0.05, 0.1, 0.5, 0.999999]) {
      expect(thinkingMessages).toContain(pickCanvasWaitingMessage("thinking", "", () => value));
      expect(finishingMessages).toContain(pickCanvasWaitingMessage("finishing", "", () => value));
      const waiting = pickCanvasWaitingMessage("generating", "", () => value);
      expect([...generatingMessages, ...easterEggMessages]).toContain(waiting);
      expect(finishingMessages).not.toContain(waiting);
    }
  });

  it("never repeats the preceding message, even with a fixed random source", () => {
    for (const phase of ["thinking", "generating", "finishing"] as const) {
      for (const value of [0, 0.5, 0.999999]) {
        let previous = "";
        for (let i = 0; i < 30; i++) {
          const message = pickCanvasWaitingMessage(phase, previous, () => value);
          expect(message).toBeTruthy();
          expect(message).not.toBe(previous);
          previous = message;
        }
      }
    }
  });

  it("uses the rare pool for only the first 10 percent of probability", () => {
    for (let bucket = 0; bucket < 100; bucket++) {
      let call = 0;
      const message = pickCanvasWaitingMessage("generating", "", () => call++ === 0 ? bucket / 100 : 0.5);
      expect(bucket < 10 ? easterEggMessages : generatingMessages).toContain(message);
    }
  });

  it("chooses a variable delay within 4–6 seconds, inclusive", () => {
    expect(getCanvasWaitingDelay(() => 0)).toBe(4000);
    expect(getCanvasWaitingDelay(() => 0.5)).toBe(5000);
    expect(getCanvasWaitingDelay(() => 0.999999)).toBe(6000);
  });
});
