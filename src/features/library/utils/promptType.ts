import type { LibraryItem, PromptContentType } from "../types/library";
import { isVideoMediaFile } from "./mediaFileTypes";

type PromptTypeContext = Partial<
  Pick<LibraryItem, "category" | "generationMethod" | "imageFileName" | "prompt" | "tags" | "title">
>;

const videoSignalPattern =
  /\b(seedance|runway|kling|veo|sora|hailuo|pixverse|luma|pika|wan\s*2|gen-?3|gen-?4|video|filming|footage|text-to-video|image-to-video|live-recording)\b|视频提示词|视频生成|短片|影片|图生视频|文生视频|运镜|镜头运动/u;

export function normalizePromptType(input: unknown, context?: PromptTypeContext): PromptContentType {
  const parsed = parsePromptType(input);

  if (parsed) {
    return parsed;
  }

  return inferPromptType(context);
}

export function inferPromptType(context?: PromptTypeContext): PromptContentType {
  if (!context) {
    return "image";
  }

  if (typeof context.imageFileName === "string" && isVideoMediaFile(context.imageFileName)) {
    return "video";
  }

  const searchableText = [
    context.generationMethod,
    context.category,
    context.title,
    context.prompt,
    ...(Array.isArray(context.tags) ? context.tags : []),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();

  return videoSignalPattern.test(searchableText) ? "video" : "image";
}

export function getPromptTypeLabel(promptType: PromptContentType): string {
  return promptType === "video" ? "视频" : "图片";
}

function parsePromptType(input: unknown): PromptContentType | null {
  if (typeof input !== "string") {
    return null;
  }

  const normalized = input.trim().toLowerCase();

  if (["video", "videos", "movie", "motion", "视频", "短片", "影片"].includes(normalized)) {
    return "video";
  }

  if (["image", "images", "picture", "photo", "图片", "图像", "照片"].includes(normalized)) {
    return "image";
  }

  return null;
}
