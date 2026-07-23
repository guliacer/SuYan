import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reconcileExternalLibraryEvents } from "../../electron/main/library/externalLibrarySync";
import type { LibraryFile, LibraryItem, LibraryRoot } from "@/features/library/types/library";

vi.mock("../../electron/main/appLogger", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../../electron/main/library/imageThumbnails", () => ({
  warmLibraryItemThumbnails: vi.fn(),
}));

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("external library watcher reconciliation", () => {
  it("indexes a newly added file without changing the source bytes", async () => {
    const root = await createRoot();
    const sourcePath = path.join(root.absolutePath, "new-image.png");
    const source = Buffer.from("user-owned-source");
    await fs.writeFile(sourcePath, source);

    const result = await reconcileExternalLibraryEvents(makeLibrary(), root, {
      addedOrChangedPaths: [sourcePath],
      removedPaths: [],
    });

    expect(result.importedCount).toBe(1);
    expect(result.library.items[0].mediaStorage).toMatchObject({
      kind: "external",
      relativePath: "new-image.png",
      rootId: root.id,
      status: "available",
    });
    expect(await fs.readFile(sourcePath)).toEqual(source);
  });

  it("marks a removed source missing without deleting its index", async () => {
    const root = await createRoot();
    const sourcePath = path.join(root.absolutePath, "removed.png");
    await fs.writeFile(sourcePath, Buffer.from("source"));
    const stats = await fs.stat(sourcePath);
    const item = makeExternalItem("removed.png", stats.size, stats.mtimeMs);
    await fs.unlink(sourcePath);

    const result = await reconcileExternalLibraryEvents(makeLibrary(item), root, {
      addedOrChangedPaths: [],
      removedPaths: [sourcePath],
    });

    expect(result.importedCount).toBe(0);
    expect(result.missingCount).toBe(1);
    expect(result.library.items).toHaveLength(1);
    expect(result.library.items[0].mediaStorage).toMatchObject({ status: "missing" });
  });

  it("updates relativePath when a rename has one unique file signature", async () => {
    const root = await createRoot();
    const oldPath = path.join(root.absolutePath, "before.png");
    const newPath = path.join(root.absolutePath, "after.png");
    await fs.writeFile(oldPath, Buffer.from("rename-me"));
    const stats = await fs.stat(oldPath);
    const item = makeExternalItem("before.png", stats.size, stats.mtimeMs);
    await fs.rename(oldPath, newPath);

    const result = await reconcileExternalLibraryEvents(makeLibrary(item), root, {
      addedOrChangedPaths: [newPath],
      removedPaths: [oldPath],
    });

    expect(result.importedCount).toBe(0);
    expect(result.missingCount).toBe(0);
    expect(result.renamedCount).toBe(1);
    expect(result.library.items).toHaveLength(1);
    expect(result.library.items[0].id).toBe(item.id);
    expect(result.library.items[0].mediaStorage).toMatchObject({
      relativePath: "after.png",
      status: "available",
    });
  });

  it("falls back to missing plus a new index when a rename is ambiguous", async () => {
    const root = await createRoot();
    const newPath = path.join(root.absolutePath, "new.png");
    await fs.writeFile(newPath, Buffer.from("same-size"));
    const stats = await fs.stat(newPath);
    const first = makeExternalItem("first.png", stats.size, stats.mtimeMs, "first");
    const second = makeExternalItem("second.png", stats.size, stats.mtimeMs, "second");

    const result = await reconcileExternalLibraryEvents(makeLibrary(first, second), root, {
      addedOrChangedPaths: [newPath],
      removedPaths: [path.join(root.absolutePath, "first.png"), path.join(root.absolutePath, "second.png")],
    });

    expect(result.importedCount).toBe(1);
    expect(result.missingCount).toBe(2);
    expect(result.renamedCount).toBe(0);
    expect(result.library.items).toHaveLength(3);
    expect(result.library.items.filter((item) => item.mediaStorage !== "managed" && item.mediaStorage?.status === "missing"))
      .toHaveLength(2);
  });

  it("ignores unsupported and out-of-root paths", async () => {
    const root = await createRoot();
    const textPath = path.join(root.absolutePath, "notes.txt");
    const outsideDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-external-sync-outside-"));
    temporaryDirectories.push(outsideDirectory);
    const outsidePath = path.join(outsideDirectory, "outside.png");
    await fs.writeFile(textPath, "notes");
    await fs.writeFile(outsidePath, "outside");

    const result = await reconcileExternalLibraryEvents(makeLibrary(), root, {
      addedOrChangedPaths: [textPath, outsidePath],
      removedPaths: [],
    });

    expect(result.changedCount).toBe(0);
    expect(result.library.items).toHaveLength(0);
  });
});

async function createRoot(): Promise<LibraryRoot> {
  const absolutePath = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-external-sync-"));
  temporaryDirectories.push(absolutePath);
  return {
    id: "root-1",
    label: "素材",
    absolutePath,
    recursive: true,
    watchEnabled: true,
    lastScanAt: null,
  };
}

function makeLibrary(...items: LibraryItem[]): LibraryFile {
  return {
    schemaVersion: 1,
    updatedAt: "2026-07-23T00:00:00.000Z",
    items,
  };
}

function makeExternalItem(
  relativePath: string,
  size: number,
  mtimeMs: number,
  id = "external-1",
): LibraryItem {
  return {
    id,
    title: relativePath,
    imageFileName: `${id}.png`,
    mediaStorage: { kind: "external", rootId: "root-1", relativePath, size, mtimeMs, status: "available" },
    prompt: "",
    negativePrompt: "",
    tags: [],
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
  };
}
