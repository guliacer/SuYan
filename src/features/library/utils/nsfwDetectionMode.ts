import type { NsfwDetectionMode } from "../types/library";

export const defaultNsfwDetectionMode: NsfwDetectionMode = "local-first";

export function isNsfwDetectionMode(input: unknown): input is NsfwDetectionMode {
  return input === "local-first" || input === "remote-only" || input === "local-only";
}

export function normalizeNsfwDetectionMode(input: unknown): NsfwDetectionMode {
  return isNsfwDetectionMode(input) ? input : defaultNsfwDetectionMode;
}
