import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  dialog: {},
  nativeImage: {},
}));

import { getPromptContentImageFileName } from "../../electron/main/library/promptContentImageStore";

describe("灵感正文图片资产", () => {
  it("uses a deterministic SHA-256 filename for identical bytes", () => {
    const first = getPromptContentImageFileName(new Uint8Array([1, 2, 3]));
    const second = getPromptContentImageFileName(new Uint8Array([1, 2, 3]));
    expect(first).toBe(second);
    expect(first).toMatch(/^prompt-[a-f0-9]{64}\.png$/);
  });

  it("changes the filename when encoded bytes change", () => {
    expect(getPromptContentImageFileName(new Uint8Array([1, 2, 3])))
      .not.toBe(getPromptContentImageFileName(new Uint8Array([1, 2, 4])));
  });
});
