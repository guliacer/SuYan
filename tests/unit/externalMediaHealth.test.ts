import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectExternalMedia } from "../../electron/main/library/externalMediaHealth";
import type { LibraryItem, LibraryRoot } from "@/features/library/types/library";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("external media health", () => {
  it("records size and mtime for an available source", async () => {
    const rootPath = await createTemporaryRoot();
    const sourcePath = path.join(rootPath, "素材.png");
    await fs.writeFile(sourcePath, Buffer.from("external-media"));

    const health = await inspectExternalMedia(makeExternalItem("素材.png"), [makeRoot(rootPath)]);

    expect(health?.status).toBe("available");
    expect(health?.size).toBe(14);
    expect(health?.mtimeMs).toBeTypeOf("number");
  });

  it("marks a missing source without throwing", async () => {
    const rootPath = await createTemporaryRoot();

    await expect(inspectExternalMedia(makeExternalItem("missing.png"), [makeRoot(rootPath)])).resolves.toEqual({
      status: "missing",
      size: null,
      mtimeMs: null,
    });
  });

  it("marks entries from a removed root as missing", async () => {
    await expect(inspectExternalMedia(makeExternalItem("missing.png"), [])).resolves.toEqual({
      status: "missing",
      size: null,
      mtimeMs: null,
    });
  });
});

async function createTemporaryRoot(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-external-health-"));
  temporaryDirectories.push(directory);
  return directory;
}

function makeRoot(absolutePath: string): LibraryRoot {
  return { id: "root-1", label: "素材", absolutePath, recursive: true, lastScanAt: null };
}

function makeExternalItem(relativePath: string): LibraryItem {
  return {
    id: "external-1",
    title: "外链素材",
    imageFileName: "external-1.png",
    mediaStorage: { kind: "external", rootId: "root-1", relativePath },
    prompt: "",
    negativePrompt: "",
    tags: [],
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
  };
}
