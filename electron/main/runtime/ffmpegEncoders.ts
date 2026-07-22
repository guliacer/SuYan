import { spawn } from "node:child_process";
import { getFfmpegPath } from "./videoRuntime";

export type TargetVideoCodec = "h264" | "h265";
export type HardwareEncoderVendor = "nvenc" | "qsv" | "amf";

export type VideoEncoderPlan = {
  encoder: string;
  hardware: boolean;
  vendor: HardwareEncoderVendor | null;
  videoArgs: string[];
};

const hardwareEncodersByCodec: Record<TargetVideoCodec, Array<{ encoder: string; vendor: HardwareEncoderVendor }>> = {
  h264: [
    { encoder: "h264_nvenc", vendor: "nvenc" },
    { encoder: "h264_qsv", vendor: "qsv" },
    { encoder: "h264_amf", vendor: "amf" },
  ],
  h265: [
    { encoder: "hevc_nvenc", vendor: "nvenc" },
    { encoder: "hevc_qsv", vendor: "qsv" },
    { encoder: "hevc_amf", vendor: "amf" },
  ],
};

const softwareEncoderByCodec: Record<TargetVideoCodec, string> = {
  h264: "libx264",
  h265: "libx265",
};

const smokeTestTimeoutMs = 15_000;

const encoderAvailabilityCache = new Map<string, boolean>();

export function buildHardwareQualityArgs(vendor: HardwareEncoderVendor, crf: number): string[] {
  const q = clampQuality(crf);

  if (vendor === "nvenc") {
    return ["-rc", "vbr", "-cq", String(q), "-preset", "p5"];
  }

  if (vendor === "qsv") {
    return ["-global_quality", String(q), "-preset", "medium"];
  }

  return ["-rc", "cqp", "-qp_i", String(q), "-qp_p", String(q), "-quality", "balanced"];
}

export function buildSoftwareQualityArgs(codec: TargetVideoCodec, crf: number): string[] {
  return ["-c:v", softwareEncoderByCodec[codec], "-crf", String(clampQuality(crf)), "-preset", "medium"];
}

function clampQuality(crf: number): number {
  if (!Number.isFinite(crf)) {
    return 23;
  }

  return Math.min(51, Math.max(0, Math.round(crf)));
}

export function buildSoftwareEncoderPlan(codec: TargetVideoCodec, crf: number): VideoEncoderPlan {
  return {
    encoder: softwareEncoderByCodec[codec],
    hardware: false,
    vendor: null,
    videoArgs: buildSoftwareQualityArgs(codec, crf),
  };
}

export function buildHardwareEncoderPlan(
  encoder: string,
  vendor: HardwareEncoderVendor,
  crf: number,
): VideoEncoderPlan {
  return {
    encoder,
    hardware: true,
    vendor,
    videoArgs: ["-c:v", encoder, ...buildHardwareQualityArgs(vendor, crf)],
  };
}

export async function resolveVideoEncoderPlans(codec: TargetVideoCodec, crf: number): Promise<VideoEncoderPlan[]> {
  const plans: VideoEncoderPlan[] = [];
  const candidates = hardwareEncodersByCodec[codec];

  for (const candidate of candidates) {
    if (await isEncoderUsable(candidate.encoder)) {
      plans.push(buildHardwareEncoderPlan(candidate.encoder, candidate.vendor, crf));
      break;
    }
  }

  plans.push(buildSoftwareEncoderPlan(codec, crf));

  return plans;
}

async function isEncoderUsable(encoder: string): Promise<boolean> {
  const cached = encoderAvailabilityCache.get(encoder);

  if (cached !== undefined) {
    return cached;
  }

  const usable = await runEncoderSmokeTest(encoder);
  encoderAvailabilityCache.set(encoder, usable);

  return usable;
}

function runEncoderSmokeTest(encoder: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ffmpegPath = getFfmpegPath();

    if (!ffmpegPath) {
      resolve(false);
      return;
    }

    const args = [
      "-hide_banner",
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=0.1:size=128x128:rate=10",
      "-frames:v",
      "1",
      "-c:v",
      encoder,
      "-f",
      "null",
      "-",
    ];

    let settled = false;
    const finish = (result: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(ffmpegPath, args, { windowsHide: true });
    } catch {
      finish(false);
      return;
    }

    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
      }
      finish(false);
    }, smokeTestTimeoutMs);

    proc.on("error", () => {
      clearTimeout(timer);
      finish(false);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      finish(code === 0);
    });
  });
}

export function resetEncoderAvailabilityCacheForTests(): void {
  encoderAvailabilityCache.clear();
}
