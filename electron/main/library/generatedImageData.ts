export type GeneratedImageExtension = ".png" | ".jpg" | ".webp";

export type DecodedGeneratedImage = {
  buffer: Buffer;
  extension: GeneratedImageExtension;
};

export type DecodedGeneratedMedia = {
  buffer: Buffer;
  extension: string;
};

/**
 * Decode an AI-generated image data URL and determine its format from the file
 * signature. The declared MIME type is deliberately not trusted because remote
 * providers can return a mismatched content type.
 */
export function decodeGeneratedImageDataUrl(dataUrl: string): DecodedGeneratedImage {
  const match = /^data:[^,]*;base64,([\s\S]+)$/i.exec(dataUrl.trim());

  if (!match) {
    throw new Error("生成图片数据格式无效");
  }

  const buffer = Buffer.from(match[1].replace(/\s+/g, ""), "base64");
  const extension = detectGeneratedImageExtension(buffer);

  if (buffer.length === 0 || !extension) {
    throw new Error("生成图片内容无法识别");
  }

  return { buffer, extension };
}

/** Decode generated image/video data URLs using the declared media MIME. */
export function decodeGeneratedMediaDataUrl(dataUrl: string): DecodedGeneratedMedia {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(dataUrl.trim());
  if (!match) {
    throw new Error("生成媒体数据格式无效");
  }
  const mime = match[1].toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (buffer.length === 0) {
    throw new Error("生成媒体内容为空");
  }
  if (mime.startsWith("video/")) {
    if (mime.includes("webm")) return { buffer, extension: ".webm" };
    if (mime.includes("quicktime") || mime.includes("mov")) return { buffer, extension: ".mov" };
    return { buffer, extension: ".mp4" };
  }
  const image = decodeGeneratedImageDataUrl(dataUrl);
  return image;
}

export function detectGeneratedImageExtension(buffer: Uint8Array): GeneratedImageExtension | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return ".png";
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return ".jpg";
  }

  if (
    buffer.length >= 12 &&
    ascii(buffer, 0, 4) === "RIFF" &&
    ascii(buffer, 8, 12) === "WEBP"
  ) {
    return ".webp";
  }

  return null;
}

function ascii(buffer: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...buffer.subarray(start, end));
}
