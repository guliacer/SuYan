import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "@/features/library/types/library";
import { chooseAndImportManagedDirectory } from "../../electron/main/library/directoryImport";
import { copyImageFileToLibrary } from "../../electron/main/library/imageFiles";

const runtime = vi.hoisted(() => ({
  canceled: false,
  selectedPath: "",
  userDataPath: "",
}));

vi.mock("electron", () => ({
  app: { getPath: () => runtime.userDataPath, isPackaged: false },
  dialog: {
    showOpenDialog: vi.fn(async () => ({
      canceled: runtime.canceled,
      filePaths: runtime.selectedPath ? [runtime.selectedPath] : [],
    })),
  },
}));

vi.mock("../../electron/main/appLogger", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../electron/main/library/imageThumbnails", () => ({
  warmLibraryItemThumbnails: vi.fn(),
}));

vi.mock("../../electron/main/library/imageFiles", () => ({
  copyImageFileToLibrary: vi.fn(),
  isImportCanceled: vi.fn(() => false),
  resetImportCancellation: vi.fn(),
}));

const temporaryDirectories: string[] = [];

beforeEach(() => {
  runtime.canceled = false;
  runtime.selectedPath = "";
  runtime.userDataPath = "";
  vi.mocked(copyImageFileToLibrary).mockReset();
});

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("managed directory import", () => {
  it("recursively imports supported media as managed items without changing source files", async () => {
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-directory-user-data-"));
    const sourcePath = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-directory-source-"));
    temporaryDirectories.push(userDataPath, sourcePath);
    runtime.userDataPath = userDataPath;
    runtime.selectedPath = sourcePath;

    const nested = path.join(sourcePath, "nested");
    await fs.mkdir(nested, { recursive: true });
    const firstPath = path.join(sourcePath, "first.jpg");
    const secondPath = path.join(nested, "second.mp4");
    const ignoredPath = path.join(sourcePath, "notes.txt");
    const firstBytes = Buffer.from("first-source");
    const secondBytes = Buffer.from("second-source");
    await fs.writeFile(firstPath, firstBytes);
    await fs.writeFile(secondPath, secondBytes);
    await fs.writeFile(ignoredPath, "ignored", "utf8");

    vi.mocked(copyImageFileToLibrary).mockImplementation(async (filePath) => makeItem(filePath));
    const progress: string[] = [];
    const result = await chooseAndImportManagedDirectory((entry) => progress.push(entry.currentFile));

    expect(result.canceled).toBe(false);
    expect(result.importedCount).toBe(2);
    expect(result.library.items).toHaveLength(2);
    expect(result.library.items.every((item) => item.mediaStorage === "managed")).toBe(true);
    const first = result.library.items.find(item => item.id === "first") as LibraryItem & { importSource?: { relativePath: string; rootName: string } };
    const second = result.library.items.find(item => item.id === "second") as LibraryItem & { importSource?: { relativePath: string; rootName: string } };
    expect(first.importSource?.relativePath).toBe("first.jpg");
    expect(second.importSource?.relativePath).toBe("nested/second.mp4");
    expect(second.importSource?.rootName).toBe(path.basename(sourcePath));
    expect(progress).toEqual(["first.jpg", path.join("nested", "second.mp4")]);
    expect(await fs.readFile(firstPath)).toEqual(firstBytes);
    expect(await fs.readFile(secondPath)).toEqual(secondBytes);
    expect(copyImageFileToLibrary).not.toHaveBeenCalledWith(ignoredPath);
  });

  it("does not modify the library when directory selection is canceled", async () => {
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-directory-cancel-"));
    temporaryDirectories.push(userDataPath);
    runtime.userDataPath = userDataPath;
    runtime.canceled = true;

    const result = await chooseAndImportManagedDirectory();

    expect(result.canceled).toBe(true);
    expect(result.importedCount).toBe(0);
    expect(result.library.items).toEqual([]);
    expect(copyImageFileToLibrary).not.toHaveBeenCalled();
  });
});

async function makeItem(filePath: string): Promise<LibraryItem> {
  const extension = path.extname(filePath);
  const id = path.basename(filePath, extension);
  return {
    id,
    title: "",
    imageFileName: `${id}${extension}`,
    mediaStorage: "managed",
    prompt: "",
    negativePrompt: "",
    category: null,
    tags: [],
    generationMethod: null,
    promptType: extension === ".mp4" ? "video" : "image",
    sourceUrl: null,
    authorName: null,
    authorUrl: null,
    authorAvatarUrl: null,
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
  };
}
