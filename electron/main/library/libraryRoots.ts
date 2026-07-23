import { dialog } from "electron";
import type { BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { LibraryRoot } from "../../../src/features/library/types/library";
import { AppError } from "../ipc/errors";
import { getLibraryDataDir, getLibraryRootsPath } from "./libraryPaths";

type LibraryRootsFile = {
  schemaVersion: 1;
  roots: LibraryRoot[];
};

export async function readLibraryRoots(): Promise<LibraryRoot[]> {
  try {
    const content = await fs.readFile(getLibraryRootsPath(), "utf8");
    const parsed = JSON.parse(content) as unknown;

    if (!isRootsFile(parsed)) {
      return [];
    }

    return parsed.roots.map(normalizeRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw new AppError("LIBRARY_ROOTS_INVALID", "素材目录配置无法读取。");
  }
}

export async function writeLibraryRoots(roots: LibraryRoot[]): Promise<LibraryRoot[]> {
  const normalized = roots.map(normalizeRoot);
  await fs.mkdir(getLibraryDataDir(), { recursive: true });
  const tempPath = `${getLibraryRootsPath()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify({ schemaVersion: 1, roots: normalized } satisfies LibraryRootsFile), "utf8");
  await fs.rename(tempPath, getLibraryRootsPath());
  return normalized;
}

export async function chooseAndAddLibraryRoot(ownerWindow?: BrowserWindow | null): Promise<{
  root: LibraryRoot | null;
  added: boolean;
  canceled: boolean;
}> {
  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, { title: "添加素材目录", properties: ["openDirectory"] })
    : await dialog.showOpenDialog({ title: "添加素材目录", properties: ["openDirectory"] });

  if (result.canceled || result.filePaths.length === 0) {
    return { root: null, added: false, canceled: true };
  }

  const absolutePath = path.resolve(result.filePaths[0]);
  const roots = await readLibraryRoots();
  const existing = roots.find((root) => path.resolve(root.absolutePath) === absolutePath);

  if (existing) {
    return { root: existing, added: false, canceled: false };
  }

  const root: LibraryRoot = {
    id: randomUUID(),
    label: path.basename(absolutePath) || absolutePath,
    absolutePath,
    recursive: true,
    lastScanAt: null,
  };
  await writeLibraryRoots([...roots, root]);
  return { root, added: true, canceled: false };
}

export async function updateLibraryRoot(root: LibraryRoot): Promise<LibraryRoot> {
  const roots = await readLibraryRoots();
  const index = roots.findIndex((candidate) => candidate.id === root.id);

  if (index < 0) {
    throw new AppError("LIBRARY_ROOT_NOT_FOUND", "素材目录不存在。请重新添加目录。");
  }

  const normalized = normalizeRoot(root);
  roots[index] = normalized;
  await writeLibraryRoots(roots);
  return normalized;
}

function isRootsFile(input: unknown): input is LibraryRootsFile {
  return (
    isRecord(input) &&
    input.schemaVersion === 1 &&
    Array.isArray(input.roots) &&
    input.roots.every(
      (root) =>
        isRecord(root) &&
        typeof root.id === "string" &&
        typeof root.label === "string" &&
        typeof root.absolutePath === "string" &&
        typeof root.recursive === "boolean" &&
        (typeof root.lastScanAt === "string" || root.lastScanAt === null),
    )
  );
}

function normalizeRoot(root: LibraryRoot): LibraryRoot {
  return {
    id: root.id.trim(),
    label: root.label.trim() || path.basename(root.absolutePath) || root.absolutePath,
    absolutePath: path.resolve(root.absolutePath),
    recursive: root.recursive !== false,
    lastScanAt: typeof root.lastScanAt === "string" ? root.lastScanAt : null,
  };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
