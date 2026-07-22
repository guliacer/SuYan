import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAsarUnpackedPath } from "../../electron/main/runtime/videoRuntime";
import {
  buildFfmpegArgs,
  parseProgressFraction,
  selectVideoTargetItems,
  type VideoCompressOptions,
} from "../../electron/main/batch/videoCompressor";
import type { LibraryItem } from "../../src/features/library/types/library";

function makeVideoItem(id: string, imageFileName: string): LibraryItem {
  return {
    id,
    title: `视频素材 ${id}`,
    imageFileName,
    prompt: "",
    negativePrompt: "",
    tags: [],
    promptType: "video",
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  };
}

function makeImageItem(id: string, imageFileName: string): LibraryItem {
  return {
    id,
    title: `图片素材 ${id}`,
    imageFileName,
    prompt: "",
    negativePrompt: "",
    tags: [],
    promptType: "image",
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  };
}

const baseOptions: VideoCompressOptions = {
  resolution: "original",
  crf: 23,
  codec: "h264",
};

describe("video compressor path resolver", () => {
  it("rewrites packaged ffmpeg paths to app.asar.unpacked", () => {
    const packedPath = path.join("C:", "Apps", "Prompt", "resources", "app.asar", "node_modules", "ffmpeg-static", "ffmpeg.exe");

    expect(resolveAsarUnpackedPath(packedPath)).toBe(
      path.join("C:", "Apps", "Prompt", "resources", "app.asar.unpacked", "node_modules", "ffmpeg-static", "ffmpeg.exe"),
    );
  });

  it("keeps vendor ffmpeg paths unchanged", () => {
    const vendorPath = path.join("C:", "Apps", "Prompt", "resources", "vendor", "node_modules", "ffmpeg-static", "ffmpeg.exe");

    expect(resolveAsarUnpackedPath(vendorPath)).toBe(vendorPath);
    expect(resolveAsarUnpackedPath(null)).toBeNull();
  });

  it("rewrites slash separated packaged paths", () => {
    expect(resolveAsarUnpackedPath("C:/Apps/Prompt/resources/app.asar/node_modules/ffmpeg-static/ffmpeg.exe")).toBe(
      "C:/Apps/Prompt/resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe",
    );
  });
});

describe("buildFfmpegArgs", () => {
  it("omits scale filter for original resolution", () => {
    const args = buildFfmpegArgs("in.mp4", "out.mp4", { ...baseOptions, resolution: "original" });

    expect(args).not.toContain("-vf");
  });

  it("applies scale=-2:1080 for 1080p", () => {
    const args = buildFfmpegArgs("in.mp4", "out.mp4", { ...baseOptions, resolution: "1080p" });
    const vfIndex = args.indexOf("-vf");

    expect(vfIndex).toBeGreaterThan(-1);
    expect(args[vfIndex + 1]).toBe("scale=-2:1080");
  });

  it("applies scale=-2:720 for 720p", () => {
    const args = buildFfmpegArgs("in.mp4", "out.mp4", { ...baseOptions, resolution: "720p" });

    expect(args[args.indexOf("-vf") + 1]).toBe("scale=-2:720");
  });

  it("applies scale=-2:480 for 480p", () => {
    const args = buildFfmpegArgs("in.mp4", "out.mp4", { ...baseOptions, resolution: "480p" });

    expect(args[args.indexOf("-vf") + 1]).toBe("scale=-2:480");
  });

  it("uses libx264 for h264 codec", () => {
    const args = buildFfmpegArgs("in.mp4", "out.mp4", { ...baseOptions, codec: "h264" });

    expect(args).toContain("libx264");
    expect(args).not.toContain("libx265");
  });

  it("uses libx265 for h265 codec", () => {
    const args = buildFfmpegArgs("in.mp4", "out.mp4", { ...baseOptions, codec: "h265" });

    expect(args).toContain("libx265");
  });

  it("stringifies crf value and includes preset, audio, and overwrite flags", () => {
    const args = buildFfmpegArgs("in.mp4", "out.mp4", { ...baseOptions, crf: 18 });

    expect(args).toContain("-crf");
    expect(args[args.indexOf("-crf") + 1]).toBe("18");
    expect(args).toContain("-preset");
    expect(args[args.indexOf("-preset") + 1]).toBe("medium");
    expect(args).toContain("-c:a");
    expect(args[args.indexOf("-c:a") + 1]).toBe("aac");
    expect(args).toContain("-b:a");
    expect(args[args.indexOf("-b:a") + 1]).toBe("128k");
    expect(args).toContain("-y");
    expect(args[args.indexOf("-y") + 1]).toBe("out.mp4");
  });

  it("starts with input flag", () => {
    const args = buildFfmpegArgs("input.mp4", "out.mp4", baseOptions);

    expect(args[0]).toBe("-i");
    expect(args[1]).toBe("input.mp4");
  });
});

describe("parseProgressFraction", () => {
  it("returns 0 when no time= token is present", () => {
    expect(parseProgressFraction("frame=  100 fps=30", 60)).toBe(0);
  });

  it("parses time=hh:mm:ss.ss into a fraction of total duration", () => {
    expect(parseProgressFraction("frame= 2000 time=00:01:23.45 bitrate=1000", 100)).toBeCloseTo(0.8345, 4);
  });

  it("parses time without hours", () => {
    expect(parseProgressFraction("time=00:00:30.00", 60)).toBeCloseTo(0.5, 4);
  });

  it("clamps fraction to 1 when current time exceeds duration", () => {
    expect(parseProgressFraction("time=00:02:00.00", 60)).toBe(1);
  });

  it("returns 0 when duration is 0", () => {
    expect(parseProgressFraction("time=00:00:10.00", 0)).toBe(0);
  });
});

describe("selectVideoTargetItems", () => {
  it("returns only video items matching itemIds", () => {
    const items = [
      makeVideoItem("v1", "v1.mp4"),
      makeVideoItem("v2", "v2.mov"),
      makeImageItem("i1", "i1.png"),
    ];

    const result = selectVideoTargetItems(items, ["v1"]);

    expect(result.map((item) => item.id)).toEqual(["v1"]);
  });

  it("excludes non-video files even when listed in itemIds", () => {
    const items = [makeVideoItem("v1", "v1.mp4"), makeImageItem("i1", "i1.png")];

    const result = selectVideoTargetItems(items, ["v1", "i1"]);

    expect(result.map((item) => item.id)).toEqual(["v1"]);
  });

  it("returns all video items when itemIds is undefined", () => {
    const items = [
      makeVideoItem("v1", "v1.mp4"),
      makeImageItem("i1", "i1.png"),
      makeVideoItem("v2", "v2.webm"),
    ];

    const result = selectVideoTargetItems(items, undefined);

    expect(result.map((item) => item.id)).toEqual(["v1", "v2"]);
  });

  it("includes items with video extensions even without promptType=video", () => {
    const items = [
      { ...makeImageItem("v1", "clip.mp4"), promptType: undefined },
      makeImageItem("i1", "i1.png"),
    ];

    const result = selectVideoTargetItems(items, undefined);

    expect(result.map((item) => item.id)).toEqual(["v1"]);
  });

  it("includes items with promptType=video even without video extension", () => {
    const items = [
      makeVideoItem("v1", "thumb.jpg"),
      makeImageItem("i1", "i1.png"),
    ];

    const result = selectVideoTargetItems(items, undefined);

    expect(result.map((item) => item.id)).toEqual(["v1"]);
  });
});
