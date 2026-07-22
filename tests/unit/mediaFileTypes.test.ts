import { describe, expect, it } from "vitest";
import {
  isAudioMediaFile,
  isImageMediaFile,
  isLikelyRemoteImageUrl,
  isLikelyRemoteVideoUrl,
  isVideoMediaFile,
} from "@/features/library/utils/mediaFileTypes";

describe("mediaFileTypes", () => {
  it("detects supported video files by extension", () => {
    expect(isVideoMediaFile("clip.mp4")).toBe(true);
    expect(isVideoMediaFile("clip.WEBM")).toBe(true);
    expect(isVideoMediaFile("clip.mov?cache=1")).toBe(true);
    expect(isVideoMediaFile("clip.mkv")).toBe(true);
    expect(isVideoMediaFile("clip.avi")).toBe(true);
    expect(isVideoMediaFile("clip.m2ts")).toBe(true);
  });

  it("detects supported image files by extension", () => {
    expect(isImageMediaFile("cover.png")).toBe(true);
    expect(isImageMediaFile("cover.AVIF")).toBe(true);
    expect(isImageMediaFile("cover.heic")).toBe(true);
    expect(isImageMediaFile("cover.tiff")).toBe(true);
    expect(isImageMediaFile("cover.svg")).toBe(true);
    expect(isImageMediaFile("clip.mp4")).toBe(false);
  });

  it("keeps image files out of the video path", () => {
    expect(isVideoMediaFile("cover.png")).toBe(false);
    expect(isVideoMediaFile("cover.jpg")).toBe(false);
    expect(isVideoMediaFile("")).toBe(false);
  });

  it("detects supported audio files by extension", () => {
    expect(isAudioMediaFile("voice.MP3")).toBe(true);
    expect(isAudioMediaFile("voice.m4a?cache=1")).toBe(true);
    expect(isAudioMediaFile("voice.oga")).toBe(true);
    expect(isAudioMediaFile("clip.mp4")).toBe(false);
  });

  it("matches remote media urls by extension and video host hints", () => {
    expect(isLikelyRemoteVideoUrl("https://cdn.example.com/a.mov")).toBe(true);
    expect(isLikelyRemoteVideoUrl("https://cdn.example.com/a.mkv")).toBe(true);
    expect(isLikelyRemoteVideoUrl("https://v3-artist.vlabvod.com/hi720/?a=1")).toBe(true);
    expect(isLikelyRemoteImageUrl("https://cdn.example.com/a.avif")).toBe(true);
    expect(isLikelyRemoteImageUrl("https://cdn.example.com/a.heic")).toBe(true);
    expect(isLikelyRemoteImageUrl("https://cdn.example.com/a.mp4")).toBe(false);
  });
});
