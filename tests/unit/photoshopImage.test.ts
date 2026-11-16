import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { isPackaged: false, getPath: () => "" }, nativeImage: {} }));
vi.mock("../../electron/main/appLogger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../../electron/main/account/accountService", () => ({ getAuthorInfo: () => null }));
import { deflateSync } from "node:zlib";
import { isSupportedExternalMediaPath } from "../../electron/main/library/externalLibraryScanner";
import { normalizeImportImageExtension, isPassthroughImportImageExtension } from "../../electron/main/library/imageCompressionPolicy";

function psd(compression: number, payload: Buffer, width = 2, height = 1) {
  const header = Buffer.alloc(40); header.write("8BPS", 0, "ascii"); header.writeUInt16BE(1, 4); header.writeUInt16BE(3, 12); header.writeUInt32BE(height, 14); header.writeUInt32BE(width, 18); header.writeUInt16BE(8, 22); header.writeUInt16BE(3, 24); header.writeUInt16BE(compression, 38); return Buffer.concat([header, payload]);
}
async function decoder() {
  const mod = await import("../../electron/main/library/photoshopImage").catch(() => null);
  expect(mod?.decodePhotoshopComposite).toBeTypeOf("function"); return mod!.decodePhotoshopComposite;
}
describe("Photoshop composite previews", () => {
  it("accepts PSD in both external indexes and lossless managed imports", () => {
    expect(isSupportedExternalMediaPath("photo.psd")).toBe(true);
    expect(normalizeImportImageExtension(".psd")).toBe(".psd");
    expect(isPassthroughImportImageExtension(".psd")).toBe(true);
  });
  it("decodes planar uncompressed RGB to the correct interleaved pixels", async () => {
    const decode = await decoder(); const result = decode(psd(0, Buffer.from([255, 0, 0, 255, 0, 0])));
    expect(result).toMatchObject({ width: 2, height: 1, channels: 3 }); expect([...result.data]).toEqual([255, 0, 0, 0, 255, 0]);
  });
  it("decodes PackBits RLE planes", async () => {
    const decode = await decoder(); const lengths = Buffer.from([0, 3, 0, 3, 0, 3]);
    const result = decode(psd(1, Buffer.concat([lengths, Buffer.from([1, 255, 0, 1, 0, 255, 1, 0, 0])])));
    expect([...result.data]).toEqual([255, 0, 0, 0, 255, 0]);
  });
  it("decodes zipped composite data and 8-bit ZIP prediction", async () => {
    const decode = await decoder();
    expect([...decode(psd(2, deflateSync(Buffer.from([255, 0, 0, 255, 0, 0])))).data]).toEqual([255, 0, 0, 0, 255, 0]);
    expect([...decode(psd(3, deflateSync(Buffer.from([255, 1, 0, 255, 0, 0])))).data]).toEqual([255, 0, 0, 0, 255, 0]);
  });
  it("rejects truncated data, invalid dimensions, and malformed RLE rows", async () => {
    const decode = await decoder(); expect(() => decode(Buffer.from("8BPS"))).toThrow();
    expect(() => decode(psd(0, Buffer.alloc(1)))).toThrow();
    expect(() => decode(psd(0, Buffer.alloc(6), 0, 1))).toThrow();
    expect(() => decode(psd(1, Buffer.from([0, 1, 0, 1, 0, 1, 127, 127, 127])))).toThrow();
  });
});
