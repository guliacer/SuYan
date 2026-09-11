import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getLibraryDataDir } from "../library/libraryPaths";

const AVATAR_DIRECTORY_NAME = "account-avatars";
const AVATAR_KEY_PATTERN = /^[a-f0-9]{64}$/;
const AVATAR_EXTENSIONS = [".png", ".jpg", ".webp", ".gif", ".avif"] as const;
export const ACCOUNT_AVATAR_UPLOAD_MAX_BYTES = 256 * 1024;

export const ACCOUNT_AVATAR_PROTOCOL = "app-account-avatar" as const;
const avatarWrites = new Map<string, Promise<string | null>>();

export function getAccountAvatarCacheKey(uid: string): string {
  return createHash("sha256").update(uid, "utf8").digest("hex");
}

export function getAccountAvatarUrl(uid: string): string {
  return `${ACCOUNT_AVATAR_PROTOCOL}://avatar/${getAccountAvatarCacheKey(uid)}`;
}

export function getAccountAvatarDirectory(): string {
  return path.join(getLibraryDataDir(), AVATAR_DIRECTORY_NAME);
}

export async function cacheAccountAvatar(
  uid: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string | null> {
  const pending = (avatarWrites.get(uid) ?? Promise.resolve(null))
    .catch(() => null)
    .then(() => writeAccountAvatar(uid, bytes, contentType));
  avatarWrites.set(uid, pending);
  try { return await pending; }
  finally { if (avatarWrites.get(uid) === pending) avatarWrites.delete(uid); }
}

async function writeAccountAvatar(
  uid: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string | null> {
  const extension = extensionForContentType(contentType);
  if (!extension || bytes.byteLength === 0 || bytes.byteLength > 2 * 1024 * 1024) {
    return null;
  }

  const key = getAccountAvatarCacheKey(uid);
  const directory = getAccountAvatarDirectory();
  await fs.mkdir(directory, { recursive: true });

  const targetPath = path.join(directory, `${key}${extension}`);
  const tempPath = `${targetPath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tempPath, bytes);
    await fs.rename(tempPath, targetPath);
    // Remove older formats only after the new file is in place. A failed refresh
    // must leave the previous avatar usable.
    await Promise.all(
      AVATAR_EXTENSIONS
        .filter((candidate) => candidate !== extension)
        .map((candidate) => fs.rm(path.join(directory, `${key}${candidate}`), { force: true })),
    );
    return `${getAccountAvatarUrl(uid)}?v=${createHash("sha256").update(bytes).digest("hex")}`;
  } catch {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    return null;
  }
}

export async function removeAccountAvatar(uid: string): Promise<void> {
  await removeCachedAccountAvatarByKey(getAccountAvatarCacheKey(uid));
}

export async function readCachedAccountAvatar(
  uid: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const filePath = await findCachedAccountAvatarPath(getAccountAvatarCacheKey(uid));
  if (!filePath) {
    return null;
  }
  try {
    const bytes = new Uint8Array(await fs.readFile(filePath));
    return {
      bytes,
      contentType: getAccountAvatarContentType(filePath),
    };
  } catch {
    return null;
  }
}

/** 头像上传必须按真实文件头判断格式，不能信任扩展名或 MIME 声明。 */
export async function readAccountAvatarFile(
  filePath: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const stats = await fs.stat(filePath);
  if (!stats.isFile() || stats.size <= 0 || stats.size > ACCOUNT_AVATAR_UPLOAD_MAX_BYTES) {
    throw new Error("头像文件为空或超过 256 KiB。");
  }
  const bytes = new Uint8Array(await fs.readFile(filePath));
  const contentType = matchAccountAvatarContentType(bytes);
  if (!contentType) {
    throw new Error("头像只支持 PNG、JPEG 或 WebP 图片。");
  }
  return { bytes, contentType };
}

export function matchAccountAvatarContentType(bytes: Uint8Array): string | null {
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.byteLength >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export async function findCachedAccountAvatarPath(key: string): Promise<string | null> {
  if (!AVATAR_KEY_PATTERN.test(key)) {
    return null;
  }

  const directory = getAccountAvatarDirectory();
  for (const extension of AVATAR_EXTENSIONS) {
    const candidate = path.join(directory, `${key}${extension}`);
    try {
      const stats = await fs.stat(candidate);
      if (stats.isFile()) {
        return candidate;
      }
    } catch {
      // Try the next supported image format.
    }
  }
  return null;
}

export function getAccountAvatarContentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".avif":
      return "image/avif";
    default:
      return "application/octet-stream";
  }
}

async function removeCachedAccountAvatarByKey(key: string): Promise<void> {
  if (!AVATAR_KEY_PATTERN.test(key)) {
    return;
  }
  const directory = getAccountAvatarDirectory();
  await Promise.all(
    AVATAR_EXTENSIONS.map((extension) =>
      fs.rm(path.join(directory, `${key}${extension}`), { force: true }),
    ),
  );
}

function extensionForContentType(contentType: string): (typeof AVATAR_EXTENSIONS)[number] | null {
  const normalized = contentType.split(";", 1)[0]?.trim().toLowerCase();
  switch (normalized) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/avif":
      return ".avif";
    default:
      return null;
  }
}
