import { describe, expect, it } from "vitest";
import { getVideoNormalizationPlan } from "../../electron/main/library/videoImportPolicy";

describe("videoImportPolicy", () => {
  it("keeps Chromium-compatible H.264 and AAC streams", () => {
    expect(
      getVideoNormalizationPlan({
        videoCodec: "h264",
        audioCodec: "aac",
        hasAudio: true,
      }),
    ).toEqual({
      needsAudioTranscode: false,
      needsVideoTranscode: false,
    });
  });

  it("transcodes HEVC video and unsupported audio", () => {
    expect(
      getVideoNormalizationPlan({
        videoCodec: "hevc",
        audioCodec: "pcm_s16le",
        hasAudio: true,
      }),
    ).toEqual({
      needsAudioTranscode: true,
      needsVideoTranscode: true,
    });
  });

  it("does not request audio transcoding when the video has no audio stream", () => {
    expect(
      getVideoNormalizationPlan({
        videoCodec: "vp9",
        audioCodec: null,
        hasAudio: false,
      }),
    ).toEqual({
      needsAudioTranscode: false,
      needsVideoTranscode: false,
    });
  });
});
