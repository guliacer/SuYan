import { describe, expect, it, vi } from "vitest";
import { collectArchiveExportEntries, toPortableArchiveItem } from "../../electron/main/library/archiveExportPolicy";
import type { LibraryItem } from "@/features/library/types/library";

describe("external archive export", () => {
  it("reads external bytes through the media resolver", async () => {
    const item = makeExternalItem();
    const resolvePath = vi.fn().mockResolvedValue("/mounted/source.png");
    const readFile = vi.fn().mockResolvedValue(Buffer.from("external-bytes"));

    const entries = await collectArchiveExportEntries([item], resolvePath, readFile);

    expect(resolvePath).toHaveBeenCalledWith(item);
    expect(readFile).toHaveBeenCalledWith("/mounted/source.png");
    expect(entries[0].imageBuffer.toString()).toBe("external-bytes");
  });

  it("makes exported external metadata portable for ZIP import", () => {
    expect(toPortableArchiveItem(makeExternalItem()).mediaStorage).toBe("managed");
  });

  it("reports a missing source with a stable export error", async () => {
    await expect(
      collectArchiveExportEntries(
        [makeExternalItem()],
        vi.fn().mockResolvedValue("/mounted/missing.png"),
        vi.fn().mockRejectedValue(new Error("ENOENT")),
      ),
    ).rejects.toMatchObject({ code: "ZIP_MEDIA_MISSING" });
  });
});

function makeExternalItem(): LibraryItem {
  return {
    id: "external-1",
    title: "外链素材",
    imageFileName: "external-1.png",
    mediaStorage: { kind: "external", rootId: "root-1", relativePath: "素材.png" },
    prompt: "",
    negativePrompt: "",
    tags: [],
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
  };
}
