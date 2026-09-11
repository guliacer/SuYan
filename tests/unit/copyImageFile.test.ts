import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createFromBuffer: vi.fn(), writeImage: vi.fn(), warn: vi.fn(), empty: false }));
vi.mock("electron", () => ({ nativeImage: { createFromBuffer: mocks.createFromBuffer }, clipboard: { writeImage: mocks.writeImage } }));
vi.mock("../../electron/main/appLogger", () => ({ logger: { info: vi.fn(), warn: mocks.warn } }));
import { copyImageFileToClipboard } from "../../electron/main/clipboard/copyImageFile";
let directory: string;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-copy-file-"));
  vi.clearAllMocks(); mocks.empty = false;
  mocks.createFromBuffer.mockImplementation(bytes => ({ isEmpty: () => mocks.empty || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) }));
  mocks.writeImage.mockImplementation(() => undefined);
});
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });
describe("copy detail image by content", () => {
  it.each(["webp", "jpg", "png"])("copies actual WebP content with a .%s filename using a native PNG", async extension => {
    const source = path.join(directory, `external.${extension}`);
    const bytes = await sharp({ create: { width: 12, height: 21, channels: 3, background: "green" } }).webp().toBuffer();
    await fs.writeFile(source, bytes);
    await copyImageFileToClipboard(source, `external.${extension}`);
    expect(await sharp(mocks.createFromBuffer.mock.calls[0][0]).metadata()).toMatchObject({ format: "png", width: 12, height: 21 });
    expect(mocks.writeImage).toHaveBeenCalledOnce();
    expect((await fs.readFile(source)).equals(bytes)).toBe(true);
  });
  it.each(["missing", "corrupt", "native-empty", "clipboard-busy"])("reports %s and never writes an empty image", async failure => {
    const source = path.join(directory, "test.webp");
    if (failure === "corrupt") await fs.writeFile(source, "not an image");
    else if (failure !== "missing") await fs.writeFile(source, await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer());
    mocks.empty = failure === "native-empty";
    if (failure === "clipboard-busy") mocks.writeImage.mockImplementation(() => { throw new Error("busy"); });
    await expect(copyImageFileToClipboard(source, "test.webp")).rejects.toMatchObject({ code: "IMAGE_COPY_FAILED" });
    if (failure !== "clipboard-busy") expect(mocks.writeImage).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain(directory);
  });
});
