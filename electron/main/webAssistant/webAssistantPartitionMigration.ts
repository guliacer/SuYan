import fs from "node:fs";
import path from "node:path";
import { isLocalPackageIterationRoot } from "../app/appStoragePath";

/**
 * One-time recovery of Web Assistant Chromium partitions.
 *
 * Local iteration (`electron .` and `release\win-unpacked`) now share the live
 * portable profile at `release\win-unpacked\data`. This helper still:
 * 1. Adopts leftover partitions from other local rebuild folders
 *    (`release-next`, `release-ui-preview`) when those dirs exist.
 * 2. Renames Chinese / URI-encoded / old slugs
 *    (`webassistant-豆包`, `webassistant-chatgpt-image`) to stable ASCII
 *    (`webassistant-doubao`, `webassistant-chatgpt`) in place.
 *
 * Official installed / portable builds keep `<root>\data` and are not rewritten
 * by this helper except for in-place slug rename inside that same userData.
 * Never copy `%APPDATA%\SuYan` into the portable profile.
 */

const PARTITION_PREFIX = "webassistant-";

/** Old folder suffixes (raw or decodeURIComponent) → current ASCII slug. */
const LEGACY_PARTITION_SLUGS: Record<string, string> = {
  豆包: "doubao",
  腾讯元宝: "yuanbao",
  文心一言: "yiyan",
  智谱清言: "chatglm",
  Kimi: "kimi",
  "chatgpt-image": "chatgpt",
  "qwen-chat": "qwen",
};

export type PartitionMigrationResult = {
  recoveredFrom: string[];
  renamed: Array<{ from: string; to: string }>;
};

export function listLeftoverLocalIterationDataDirs(options: {
  cwd?: string;
  packagedRoot?: string | null;
}): string[] {
  const candidates: string[] = [];
  const cwd = options.cwd?.trim();
  if (cwd) {
    candidates.push(
      path.join(cwd, "release", "win-unpacked", "data"),
      path.join(cwd, "release-next", "win-unpacked", "data"),
      path.join(cwd, "release-ui-preview", "win-unpacked", "data"),
    );
  }
  if (options.packagedRoot && isLocalPackageIterationRoot(options.packagedRoot)) {
    candidates.push(path.join(options.packagedRoot, "data"));
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (seen.has(resolved) || !fs.existsSync(resolved)) {
      continue;
    }
    seen.add(resolved);
    unique.push(resolved);
  }
  return unique;
}

export function migrateWebAssistantPartitions(options: {
  userDataPath: string;
  leftoverDataDirs?: string[];
}): PartitionMigrationResult {
  const result: PartitionMigrationResult = { recoveredFrom: [], renamed: [] };
  const userDataPath = path.resolve(options.userDataPath);
  const destPartitions = path.join(userDataPath, "Partitions");
  fs.mkdirSync(destPartitions, { recursive: true });

  for (const leftover of options.leftoverDataDirs ?? []) {
    const leftoverRoot = path.resolve(leftover);
    if (leftoverRoot === userDataPath) {
      continue;
    }
    const leftoverPartitions = path.join(leftoverRoot, "Partitions");
    if (!fs.existsSync(leftoverPartitions)) {
      continue;
    }
    let recovered = false;
    for (const entry of safeReadDir(leftoverPartitions)) {
      if (!entry.isDirectory() || !entry.name.startsWith(PARTITION_PREFIX)) {
        continue;
      }
      const adopted = adoptPartition(
        path.join(leftoverPartitions, entry.name),
        path.join(destPartitions, entry.name),
      );
      recovered = recovered || adopted;
    }
    if (recovered) {
      result.recoveredFrom.push(leftoverRoot);
    }
  }

  for (const entry of safeReadDir(destPartitions)) {
    if (!entry.isDirectory() || !entry.name.startsWith(PARTITION_PREFIX)) {
      continue;
    }
    const canonical = canonicalPartitionFolderName(entry.name);
    if (!canonical || canonical === entry.name) {
      continue;
    }
    const sourceDir = path.join(destPartitions, entry.name);
    const destDir = path.join(destPartitions, canonical);
    if (adoptPartition(sourceDir, destDir)) {
      result.renamed.push({ from: entry.name, to: canonical });
    }
  }

  return result;
}

export function canonicalPartitionFolderName(folderName: string): string | null {
  if (!folderName.startsWith(PARTITION_PREFIX)) {
    return null;
  }
  const raw = folderName.slice(PARTITION_PREFIX.length);
  const decoded = decodePartitionSlug(raw);
  const mapped = LEGACY_PARTITION_SLUGS[raw] ?? LEGACY_PARTITION_SLUGS[decoded];
  return mapped ? `${PARTITION_PREFIX}${mapped}` : null;
}

function decodePartitionSlug(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function adoptPartition(sourceDir: string, destDir: string): boolean {
  if (!fs.existsSync(sourceDir)) {
    return false;
  }
  if (path.resolve(sourceDir) === path.resolve(destDir)) {
    return false;
  }
  const sourceHasCookies = partitionHasCookies(sourceDir);
  const destExists = fs.existsSync(destDir);
  const destHasCookies = destExists && partitionHasCookies(destDir);
  if (destHasCookies) {
    return false;
  }
  if (!sourceHasCookies && destExists) {
    return false;
  }
  if (destExists) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }
  fs.cpSync(sourceDir, destDir, { recursive: true, force: true });
  return true;
}

function partitionHasCookies(partitionDir: string): boolean {
  return [
    path.join(partitionDir, "Network", "Cookies"),
    path.join(partitionDir, "Cookies"),
  ].some((cookiePath) => {
    try {
      return fs.statSync(cookiePath).isFile() && fs.statSync(cookiePath).size > 0;
    } catch {
      return false;
    }
  });
}

function safeReadDir(dirPath: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}
