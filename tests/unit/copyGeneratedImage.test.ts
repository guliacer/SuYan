import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { copyGeneratedImageToClipboard } from "../../electron/main/clipboard/copyGeneratedImage";

const mocks = vi.hoisted(() => ({
  image: { isEmpty: vi.fn(() => false) },
  createFromBuffer: vi.fn(),
  writeImage: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("electron", () => ({
  nativeImage: { createFromBuffer: mocks.createFromBuffer },
  clipboard: { writeImage: mocks.writeImage },
}));
vi.mock("../../electron/main/appLogger", () => ({ logger: { info: vi.fn(), warn: mocks.warn } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.image.isEmpty.mockReturnValue(false);
  mocks.createFromBuffer.mockReturnValue(mocks.image);
  mocks.writeImage.mockImplementation(() => undefined);
});

describe("copy unarchived generated images", () => {
  it("decodes WebP by content despite a PNG MIME and writes a native PNG image", async () => {
    const bytes = await sharp({ create: { width: 2, height: 3, channels: 3, background: "red" } }).webp().toBuffer();
    await copyGeneratedImageToClipboard(`data:image/png;base64,${bytes.toString("base64")}`);
    const png = mocks.createFromBuffer.mock.calls[0][0] as Buffer;
    expect(await sharp(png).metadata()).toMatchObject({ format: "png", width: 2, height: 3 });
    expect(mocks.writeImage).toHaveBeenCalledWith(mocks.image);
  });

  it("rejects corrupt data without touching the clipboard or logging image content", async () => {
    await expect(copyGeneratedImageToClipboard("data:image/png;base64,invalid"))
      .rejects.toMatchObject({ code: "IMAGE_COPY_FAILED" });
    expect(mocks.writeImage).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain("base64");
  });

  it.each(["empty", "write-failed"])("returns a clear error for %s", async (failure) => {
    const bytes = await sharp({ create: { width: 1, height: 1, channels: 3, background: "red" } }).png().toBuffer();
    if (failure === "empty") mocks.image.isEmpty.mockReturnValue(true);
    else mocks.writeImage.mockImplementation(() => { throw new Error("clipboard busy"); });
    await expect(copyGeneratedImageToClipboard(`data:image/png;base64,${bytes.toString("base64")}`))
      .rejects.toMatchObject({ code: "IMAGE_COPY_FAILED" });
    if (failure === "empty") expect(mocks.writeImage).not.toHaveBeenCalled();
  });
});
