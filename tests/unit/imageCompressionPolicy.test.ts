import { describe, expect, it } from "vitest";
import {
  normalizeImportImageExtension,
  selectCompressedImageCandidate,
} from "../../electron/main/library/imageCompressionPolicy";
import {
  getMediaExtensionFromMime,
  normalizeImportAudioExtension,
  normalizeImportVideoExtension,
} from "../../electron/main/library/importedImageWriter";

describe("image compression policy", () => {
  it("normalizes supported image extensions", () => {
    expect(normalizeImportImageExtension(".PNG")).toBe(".png");
    expect(normalizeImportImageExtension(".jpeg")).toBe(".jpg");
    expect(normalizeImportImageExtension(".jfif")).toBe(".jpg");
    expect(normalizeImportImageExtension(".avif")).toBe(".avif");
    expect(normalizeImportImageExtension(".heic")).toBe(".heic");
    expect(normalizeImportImageExtension(".tiff")).toBe(".tiff");
    expect(normalizeImportImageExtension(".svg")).toBe(".svg");
    expect(normalizeImportImageExtension(".txt")).toBeNull();
  });

  it("normalizes supported video extensions", () => {
    expect(normalizeImportVideoExtension(".MP4")).toBe(".mp4");
    expect(normalizeImportVideoExtension(".webm")).toBe(".webm");
    expect(normalizeImportVideoExtension(".mkv")).toBe(".mkv");
    expect(normalizeImportVideoExtension(".avi")).toBe(".avi");
    expect(normalizeImportVideoExtension(".m2ts")).toBe(".m2ts");
    expect(normalizeImportVideoExtension(".txt")).toBeNull();
  });

  it("normalizes supported audio extensions and MIME types", () => {
    expect(normalizeImportAudioExtension(".MP3")).toBe(".mp3");
    expect(normalizeImportAudioExtension(".flac")).toBe(".flac");
    expect(normalizeImportAudioExtension(".txt")).toBeNull();
    expect(getMediaExtensionFromMime("audio/mpeg; charset=binary")).toBe(".mp3");
    expect(getMediaExtensionFromMime("audio/opus")).toBe(".opus");
    expect(getMediaExtensionFromMime("image/avif")).toBe(".avif");
    expect(getMediaExtensionFromMime("image/heic")).toBe(".heic");
    expect(getMediaExtensionFromMime("video/x-matroska")).toBe(".mkv");
    expect(getMediaExtensionFromMime("video/x-msvideo")).toBe(".avi");
    expect(getMediaExtensionFromMime("video/mp2t")).toBe(".ts");
  });

  it("keeps the original image when compression savings are too small", () => {
    const original = { buffer: new Uint8Array(1000), extension: ".png" as const };
    const selected = selectCompressedImageCandidate(original, [
      { buffer: new Uint8Array(990), extension: ".jpg" },
    ]);

    expect(selected).toEqual({
      buffer: original.buffer,
      extension: ".png",
      wasCompressed: false,
    });
  });

  it("uses the first candidate that has meaningful savings", () => {
    const original = { buffer: new Uint8Array(100_000), extension: ".png" as const };
    const selected = selectCompressedImageCandidate(original, [
      { buffer: new Uint8Array(99_500), extension: ".png" },
      { buffer: new Uint8Array(97_900), extension: ".jpg" },
    ]);

    expect(selected.extension).toBe(".jpg");
    expect(selected.buffer.length).toBe(97_900);
    expect(selected.wasCompressed).toBe(true);
  });
});
