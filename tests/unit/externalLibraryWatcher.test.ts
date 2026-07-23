import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  setExternalLibraryRootWatch,
  shutdownExternalLibraryWatchers,
} from "../../electron/main/library/externalLibraryWatcher";
import { IpcChannelName } from "../../electron/shared/ipcChannels";
import type { LibraryFile } from "@/features/library/types/library";

const runtime = vi.hoisted(() => ({
  send: vi.fn(),
  userDataPath: "",
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => runtime.userDataPath,
    isPackaged: false,
  },
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: { send: runtime.send },
      },
    ],
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
}));

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
  await shutdownExternalLibraryWatchers();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
  runtime.send.mockClear();
  runtime.userDataPath = "";
});

describe("external library root watcher", () => {
  it("indexes additions while enabled and stops after being disabled", { timeout: 10_000 }, async () => {
    const { libraryPath, rootPath } = await createWatcherFixture();
    const initialRoots = await setExternalLibraryRootWatch("root-1", true);
    expect(initialRoots.root.watchEnabled).toBe(true);

    const watchedPath = path.join(rootPath, "watched.png");
    const watchedBytes = Buffer.from("watched-source");
    await fs.writeFile(watchedPath, watchedBytes);

    const watchedLibrary = await waitForLibrary(libraryPath, (library) => library.items.length === 1);
    expect(watchedLibrary.items[0].mediaStorage).toMatchObject({
      kind: "external",
      relativePath: "watched.png",
      status: "available",
    });
    expect(await fs.readFile(watchedPath)).toEqual(watchedBytes);
    expect(runtime.send).toHaveBeenCalledWith(
      IpcChannelName.LibraryExternalChanged,
      expect.objectContaining({ importedCount: 1, rootId: "root-1" }),
    );

    const stoppedRoots = await setExternalLibraryRootWatch("root-1", false);
    expect(stoppedRoots.root.watchEnabled).toBe(false);
    await fs.writeFile(path.join(rootPath, "ignored-after-stop.png"), Buffer.from("ignored"));
    await new Promise((resolve) => setTimeout(resolve, 2_000));

    expect((await readLibrary(libraryPath)).items).toHaveLength(1);
  });
});

async function createWatcherFixture(): Promise<{ libraryPath: string; rootPath: string }> {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-watcher-user-data-"));
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-watcher-root-"));
  temporaryDirectories.push(userDataPath, rootPath);
  runtime.userDataPath = userDataPath;
  const libraryDirectory = path.join(userDataPath, "library");
  const libraryPath = path.join(libraryDirectory, "library.json");
  await fs.mkdir(path.join(libraryDirectory, "images"), { recursive: true });
  await fs.writeFile(
    path.join(libraryDirectory, "library-roots.json"),
    JSON.stringify({
      schemaVersion: 1,
      roots: [
        {
          id: "root-1",
          label: "素材",
          absolutePath: rootPath,
          recursive: true,
          lastScanAt: null,
        },
      ],
    }),
    "utf8",
  );
  await fs.writeFile(
    libraryPath,
    JSON.stringify({ schemaVersion: 1, updatedAt: "2026-07-23T00:00:00.000Z", items: [] }),
    "utf8",
  );
  await fs.writeFile(path.join(libraryDirectory, ".default-library-seeded"), "seeded", "utf8");
  return { libraryPath, rootPath };
}

async function waitForLibrary(
  libraryPath: string,
  predicate: (library: LibraryFile) => boolean,
): Promise<LibraryFile> {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const library = await readLibrary(libraryPath);

    if (predicate(library)) {
      return library;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Timed out waiting for the external library watcher.");
}

async function readLibrary(libraryPath: string): Promise<LibraryFile> {
  return JSON.parse(await fs.readFile(libraryPath, "utf8")) as LibraryFile;
}
