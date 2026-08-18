import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";

/** Newest backup is `.bak`; older slots are `.bak.1` then `.bak.2`. */
export const LIBRARY_BACKUP_SLOT_COUNT = 3;

export function getLibraryBackupPaths(libraryPath: string): string[] {
  return Array.from({ length: LIBRARY_BACKUP_SLOT_COUNT }, (_, index) =>
    index === 0 ? `${libraryPath}.bak` : `${libraryPath}.bak.${index}`,
  );
}

export async function writeTextFileAtomically(targetPath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  const tempPath = `${targetPath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await fs.writeFile(tempPath, content, "utf8");
    await replaceFileAtomically(tempPath, targetPath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

/**
 * Persist library.json with rolling backups.
 * Order: write temp → copy current into bak chain → replace target.
 * If the process dies after removing the target but before rename finishes,
 * the next boot can restore from `.bak`.
 */
export async function writeLibraryJsonAtomically(libraryPath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(libraryPath), { recursive: true });

  const tempPath = `${libraryPath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await fs.writeFile(tempPath, content, "utf8");
    await rotateLibraryBackups(libraryPath);
    await replaceFileAtomically(tempPath, libraryPath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

export async function rotateLibraryBackups(libraryPath: string): Promise<void> {
  try {
    await fs.access(libraryPath);
  } catch {
    return;
  }

  const backups = getLibraryBackupPaths(libraryPath);
  const oldest = backups[backups.length - 1];
  await fs.unlink(oldest).catch(() => undefined);

  for (let index = backups.length - 1; index > 0; index -= 1) {
    await fs.rename(backups[index - 1], backups[index]).catch(() => undefined);
  }

  // Copy (not rename) so a failed subsequent replace still leaves library.json intact.
  await fs.copyFile(libraryPath, backups[0]);
}

export async function replaceFileAtomically(tempPath: string, targetPath: string): Promise<void> {
  try {
    await fs.rename(tempPath, targetPath);
    return;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // Windows cannot rename over an existing file; some AV locks cause transient EPERM.
    if (code !== "EEXIST" && code !== "EPERM" && code !== "EACCES" && code !== "EBUSY") {
      throw error;
    }
  }

  const backoffMs = [20, 50, 100, 200, 400];
  let lastError: unknown;

  for (let attempt = 0; attempt <= backoffMs.length; attempt += 1) {
    try {
      await fs.rm(targetPath, { force: true });
      await fs.rename(tempPath, targetPath);
      return;
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= backoffMs.length || !code || !["EPERM", "EACCES", "EBUSY", "EEXIST"].includes(code)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, backoffMs[attempt]));
    }
  }

  throw lastError;
}

export type LibraryJsonReadResult =
  | { ok: true; content: string; restoredFromBackup: string | null }
  | { ok: false; error: unknown };

/**
 * Read library.json; if missing/unreadable/empty, walk bak slots newest→oldest
 * and promote the first non-empty backup back to the primary path.
 */
export async function readLibraryJsonWithBackupRestore(
  libraryPath: string,
): Promise<LibraryJsonReadResult> {
  const primary = await readTextFileIfPresent(libraryPath);
  if (primary !== null && primary.trim().length > 0) {
    return { ok: true, content: primary, restoredFromBackup: null };
  }

  for (const backupPath of getLibraryBackupPaths(libraryPath)) {
    const backup = await readTextFileIfPresent(backupPath);
    if (backup === null || backup.trim().length === 0) {
      continue;
    }

    try {
      await writeTextFileAtomically(libraryPath, backup);
      return { ok: true, content: backup, restoredFromBackup: backupPath };
    } catch (error) {
      return { ok: false, error };
    }
  }

  if (primary !== null) {
    return { ok: true, content: primary, restoredFromBackup: null };
  }

  return {
    ok: false,
    error: Object.assign(new Error(`找不到素材库文件: ${libraryPath}`), { code: "ENOENT" }),
  };
}

async function readTextFileIfPresent(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
