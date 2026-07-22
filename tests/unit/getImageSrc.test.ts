import { describe, expect, it } from "vitest";
import { getImageSrc, getImageThumbnailSrc, getStartupGalleryImageSrc } from "@/features/library/utils/getImageSrc";

describe("getImageSrc", () => {
  it("builds app protocol URLs for original and thumbnail media", () => {
    expect(getImageSrc("sample image.png")).toBe("app-image://local/sample%20image.png");
    expect(getImageThumbnailSrc("sample image.png")).toBe("app-thumbnail://local/sample%20image.png");
    expect(getStartupGalleryImageSrc("sample image.png")).toBe("app-startup://local/sample%20image.png?v=hd1600");
  });

  it("adds an encoded version query when media content changes in place", () => {
    expect(getImageSrc("sample.png", "2026-07-11T07:58:00.000Z")).toBe(
      "app-image://local/sample.png?v=2026-07-11T07%3A58%3A00.000Z",
    );
    expect(getImageThumbnailSrc("sample.png", 1234)).toBe("app-thumbnail://local/sample.png?v=1234");
    expect(getStartupGalleryImageSrc("sample.png", 1234)).toBe("app-startup://local/sample.png?v=1234");
  });
});
