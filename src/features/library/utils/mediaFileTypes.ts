/** 本地库与远程导入共用的媒体扩展名定义（含点）。 */

export const videoFileExtensions = [
  ".mp4",
  ".webm",
  ".mov",
  ".m4v",
  ".ogv",
  ".ogg",
  ".mkv",
  ".avi",
  ".wmv",
  ".flv",
  ".3gp",
  ".3g2",
  ".ts",
  ".mts",
  ".m2ts",
  ".mpeg",
  ".mpg",
  ".asf",
  ".f4v",
] as const;

export const imageFileExtensions = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".avif",
  ".heic",
  ".heif",
  ".tif",
  ".tiff",
  ".svg",
  ".ico",
  ".jfif",
  ".apng",
] as const;

export const audioFileExtensions = [".mp3", ".wav", ".m4a", ".aac", ".flac", ".opus", ".oga"] as const;

const videoFileExtensionSet = new Set<string>(videoFileExtensions);
const imageFileExtensionSet = new Set<string>(imageFileExtensions);
const audioFileExtensionSet = new Set<string>(audioFileExtensions);

/** 用于 URL/路径正则的图片扩展名（不含点，jpeg 用 jpe?g）。 */
export const remoteImageExtensionPattern = "png|jpe?g|jfif|webp|gif|bmp|avif|heic|heif|tiff?|svg|ico|apng";

/** 用于 URL/路径正则的视频扩展名（不含点）。 */
export const remoteVideoExtensionPattern =
  "mp4|webm|mov|m4v|ogv|ogg|mkv|avi|wmv|flv|3gp|3g2|ts|mts|m2ts|mpeg|mpg|asf|f4v";

export function getMediaFileExtension(fileName: string): string {
  const normalizedFileName = fileName.trim().split(/[?#]/, 1)[0]?.toLowerCase() ?? "";

  if (!normalizedFileName) {
    return "";
  }

  const match = normalizedFileName.match(/(\.[a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase() ?? "";
}

export function isVideoMediaFile(fileName: string): boolean {
  return videoFileExtensionSet.has(getMediaFileExtension(fileName));
}

export function isImageMediaFile(fileName: string): boolean {
  return imageFileExtensionSet.has(getMediaFileExtension(fileName));
}

export function isAudioMediaFile(fileName: string): boolean {
  return audioFileExtensionSet.has(getMediaFileExtension(fileName));
}

export function isLikelyRemoteVideoUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url.trim());
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();
    const mediaHint = `${parsedUrl.pathname}${parsedUrl.search}`.toLowerCase();

    if (new RegExp(`\\.(?:${remoteVideoExtensionPattern})$`, "i").test(pathname)) {
      return true;
    }

    return (
      hostname === "vlabvod.com" ||
      hostname.endsWith(".vlabvod.com") ||
      mediaHint.includes("video_mp4") ||
      mediaHint.includes("mime_type=video") ||
      /[?&](?:type|mime|format)=video(?:\/|\b)/i.test(mediaHint) ||
      mediaHint.includes("content-type=video")
    );
  } catch {
    return new RegExp(`\\.(?:${remoteVideoExtensionPattern})(?:$|[?#])`, "i").test(url);
  }
}

export function isLikelyRemoteImageUrl(url: string): boolean {
  try {
    const pathname = new URL(url.trim()).pathname.toLowerCase();
    return new RegExp(`\\.(?:${remoteImageExtensionPattern})$`, "i").test(pathname);
  } catch {
    return new RegExp(`\\.(?:${remoteImageExtensionPattern})(?:$|[?#])`, "i").test(url);
  }
}
