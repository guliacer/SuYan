import type { NsfwGradingSpeed } from "../types/library";

export type NsfwGradingSpeedOption = {
  value: NsfwGradingSpeed;
  label: string;
  description: string;
  concurrency: number;
};

export const defaultNsfwGradingSpeed: NsfwGradingSpeed = "fast";

export const nsfwGradingSpeedOptions: NsfwGradingSpeedOption[] = [
  {
    value: "stable",
    label: "稳定",
    description: "2 路并发，适合限速接口",
    concurrency: 2,
  },
  {
    value: "fast",
    label: "快速",
    description: "4 路并发，推荐日常使用",
    concurrency: 4,
  },
  {
    value: "turbo",
    label: "极速",
    description: "6 路并发，接口稳定时使用",
    concurrency: 6,
  },
];

export function isNsfwGradingSpeed(input: unknown): input is NsfwGradingSpeed {
  return input === "stable" || input === "fast" || input === "turbo";
}

export function normalizeNsfwGradingSpeed(input: unknown): NsfwGradingSpeed {
  return isNsfwGradingSpeed(input) ? input : defaultNsfwGradingSpeed;
}

export function getNsfwGradingConcurrency(speed: NsfwGradingSpeed): number {
  return nsfwGradingSpeedOptions.find((option) => option.value === speed)?.concurrency ?? 4;
}
