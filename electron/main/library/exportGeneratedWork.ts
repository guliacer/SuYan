import { dialog } from "../app/fileDialogs";
import { formatExportFileName } from "../app/exportFileName";
import { reportExportProgress } from "../app/exportTask";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { ExportImageData, GeneratedWorkExportInput } from "../../../src/types/suyanApi";
import { AppError } from "../ipc/errors";
import { getSharp } from "../runtime/imageRuntime";
import { decodeGeneratedImageDataUrl, decodeGeneratedMediaDataUrl } from "./generatedImageData";
import { attributeGeneratedWork } from "./workAttribution";
import { embedWorkInPng } from "./workImageExchange";
import { compactAutomaticPromptTitle } from "../../../src/features/prompts/utils/promptTitle";

/** Unsaved canvas export uses main's generation receipt, never a renderer-supplied account. */
export async function exportGeneratedWork(value: unknown): Promise<ExportImageData> {
  const input = value as GeneratedWorkExportInput;
  if (!input || typeof input.dataUrl !== "string" || input.dataUrl.length > 512 * 1024 * 1024 ||
      (input.attributionId !== undefined && (typeof input.attributionId !== "string" || input.attributionId.length > 128)) ||
      [input.prompt, input.negativePrompt, input.generationMethod].some(field => typeof field !== "string" || field.length > 500000) ||
      (input.mediaType !== undefined && input.mediaType !== "image" && input.mediaType !== "video")) {
    throw new AppError("WORK_EXPORT_INVALID", "生成作品资料无效，请重新选择生成结果。");
  }
  const video = input.mediaType === "video";
  const target = await dialog.showSaveDialog({
    title: video ? "导出视频（完整资料请收录后使用分享包）" : "导出 PNG 作品（含提示词与作者）",
    defaultPath: formatExportFileName(video ? "视频作品" : "图像作品", video ? decodeGeneratedMediaDataUrl(input.dataUrl).extension : "png"),
    filters: [{ name: video ? "视频文件" : "PNG 作品文件", extensions: video ? ["mp4", "webm", "mov"] : ["png"] }],
  });
  if (target.canceled || !target.filePath) return { canceled: true, filePath: null };
  reportExportProgress(video ? "正在准备视频文件…" : "正在处理图像与作品资料…");
  const decoded = video ? decodeGeneratedMediaDataUrl(input.dataUrl) : decodeGeneratedImageDataUrl(input.dataUrl);
  let bytes = decoded.buffer;
  if (!video) {
    const now = new Date().toISOString();
    const item = attributeGeneratedWork({ id: randomUUID(), imageFileName: "", title: compactAutomaticPromptTitle(input.prompt, "AI 生成作品"),
      prompt: input.prompt, negativePrompt: input.negativePrompt, generationMethod: input.generationMethod, tags: [], createdAt: now, updatedAt: now }, input.dataUrl, input.attributionId);
    bytes = await embedWorkInPng(await getSharp()(bytes).png({ compressionLevel: 6, palette: false, quality: 100 }).toBuffer(), item);
  }
  const temp = `${target.filePath}.${randomUUID()}.tmp`;
  reportExportProgress("正在保存作品文件…");
  try { await fs.writeFile(temp, bytes); await fs.rename(temp, target.filePath); }
  finally { await fs.rm(temp, { force: true }).catch(() => undefined); }
  return { canceled: false, filePath: target.filePath };
}
