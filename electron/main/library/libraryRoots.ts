import { dialog } from "electron";
import type { BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { LibraryRoot } from "../../../src/features/library/types/library";
import { validateExternalRemap } from "../../../src/features/library/utils/externalMediaPath";
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

    return Promise.all(parsed.roots.map(async (root) => withRootStatus(normalizeRoot(root))));
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

export async function chooseAndRemapLibraryRoot(
  rootId: string,
  relativePaths: readonly string[],
  ownerWindow?: BrowserWindow | null,
): Promise<{ root: LibraryRoot | null; canceled: boolean }> {
  const roots = await readLibraryRoots();
  const index = roots.findIndex((candidate) => candidate.id === rootId);

  if (index < 0) {
    throw new AppError("LIBRARY_ROOT_NOT_FOUND", "素材目录不存在。请重新添加目录。");
  }

  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, { title: "重新定位素材目录", properties: ["openDirectory"] })
    : await dialog.showOpenDialog({ title: "重新定位素材目录", properties: ["openDirectory"] });

  if (result.canceled || result.filePaths.length === 0) {
    return { root: null, canceled: true };
  }

  const absolutePath = path.resolve(result.filePaths[0]);

  if (roots.some((candidate) => candidate.id !== rootId && path.resolve(candidate.absolutePath) === absolutePath)) {
    throw new AppError("LIBRARY_ROOT_ALREADY_MOUNTED", "这个素材目录已经挂载。");
  }

  try {
    validateExternalRemap(absolutePath, relativePaths);
  } catch {
    throw new AppError("EXTERNAL_MEDIA_PATH_INVALID", "素材相对路径超出新目录，无法重新定位。");
  }

  const stats = await fs.stat(absolutePath).catch(() => null);

  if (!stats?.isDirectory()) {
    throw new AppError("LIBRARY_ROOT_UNAVAILABLE", "选择的素材目录不可访问。");
  }

  const root = normalizeRoot({ ...roots[index], absolutePath, status: "available" });
  roots[index] = root;
  await writeLibraryRoots(roots);
  return { root, canceled: false };
}

export async function removeLibraryRoot(rootId: string): Promise<LibraryRoot[]> {
  const roots = await readLibraryRoots();

  if (!roots.some((root) => root.id === rootId)) {
    throw new AppError("LIBRARY_ROOT_NOT_FOUND", "素材目录不存在。请刷新后重试。");
  }

  await writeLibraryRoots(roots.filter((root) => root.id !== rootId));
  return readLibraryRoots();
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

async function withRootStatus(root: LibraryRoot): Promise<LibraryRoot> {
  const stats = await fs.stat(root.absolutePath).catch(() => null);
  return { ...root, status: stats?.isDirectory() ? "available" : "missing" };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
