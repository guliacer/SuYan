import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => "",
  },
}));
vi.mock("../../electron/main/appLogger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  createNsfwInputTensor,
  preprocessNsfwImage,
  resolveNsfwScore,
} from "../../electron/main/ai/localNsfwClassifier";

describe("local NSFW model preprocessing", () => {
  it("uses the first softmax class as the NSFW score", () => {
    expect(resolveNsfwScore([2, 0])).toBeCloseTo(0.8808, 4);
    expect(resolveNsfwScore([0, 2])).toBeCloseTo(0.1192, 4);
  });

  it("packs RGB uint8 pixels as NCHW values in [-1, 1]", () => {
    const raw = Buffer.alloc(384 * 384 * 3);
    raw[0] = 0;
    raw[1] = 127;
    raw[2] = 255;

    const tensor = createNsfwInputTensor(raw);
    expect(tensor[0]).toBe(-1);
    expect(tensor[384 * 384]).toBeCloseTo(127 / 127.5 - 1, 6);
    expect(tensor[384 * 384 * 2]).toBe(1);
    expect(tensor.length).toBe(384 * 384 * 3);
  });

  it("rejects buffers that are not RGB", () => {
    expect(() => createNsfwInputTensor(Buffer.alloc(3))).toThrow("通道数");
  });

  it("converts an image to a 384x384 RGB tensor before inference", async () => {
    const tensor = await preprocessNsfwImage("tests/fixtures/compress-test.png");

    expect(tensor).toBeInstanceOf(Float32Array);
    expect(tensor.length).toBe(384 * 384 * 3);
    expect(Array.from(tensor).every((value) => value >= -1 && value <= 1)).toBe(true);
  });
});
