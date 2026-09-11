import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../..");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8").replace(/\r\n/g, "\n");
}

describe("thumbnail fallback contract", () => {
  it("waits for missing thumbnails and falls back to the original media", () => {
    const mainSource = readSource("electron/main/index.ts");
    const imageSource = readSource("src/features/library/components/NsfwImage.tsx");

    expect(mainSource).toContain("getOrCreateImageThumbnailPathForItem");
    expect(mainSource).toContain('logger.warn("media-thumbnail", "serve:generate-failed"');
    expect(mainSource).toContain("if (imageStats) {");
    expect(imageSource).toContain("thumbnailFallbackToOriginal");
    expect(imageSource).toContain("setThumbnailFallbackToOriginal(true)");
    expect(imageSource).toContain("!thumbnailFallbackToOriginal");
  });

  it("does not start lazy thumbnail timeout until the image nears the viewport", () => {
    const imageSource = readSource("src/features/library/components/NsfwImage.tsx");

    expect(imageSource).toContain("const startFallbackTimer = () =>");
    expect(imageSource).toContain("let isDisposed = false;");
    expect(imageSource).toContain('imageLoading !== "lazy" || typeof IntersectionObserver === "undefined"');
    expect(imageSource).toContain("new IntersectionObserver(");
    expect(imageSource).toContain("{ rootMargin: THUMBNAIL_FALLBACK_ROOT_MARGIN }");
    expect(imageSource).toContain('imageElement.loading = "eager"');
    expect(imageSource).toContain("observer.observe(imageElement);");
    expect(imageSource).toContain("currentImage?.complete && currentImage.naturalWidth > 0");
  });
});

describe("clipboard image decode contract", () => {
  it("decodes by file content and normalizes the copied image to PNG", () => {
    const imageSource = readSource("electron/main/library/imageFiles.ts");

    expect(imageSource).toContain("copyImageFileToClipboard(mediaPath, imageFileName)");
    expect(imageSource).toContain("await resolveMediaPathByImageFileName(imageFileName)");
    // Actual WebP/mismatched-extension decoding is covered by copyImageFile.test.ts.
  });
});

describe("material browser thumbnail performance contract", () => {
  it("keeps unchanged thumbnail URLs stable across launches and avoids thumbnail fade repainting", () => {
    const imageSource = readSource("src/features/library/components/NsfwImage.tsx");

    expect(imageSource).not.toContain("thumbnailSessionVersion");
    expect(imageSource).not.toContain("Date.now()");
    expect(imageSource).toContain("getImageThumbnailSrc(image.imageFileName, mediaVersion || undefined)");
    expect(imageSource).toContain('source === "thumbnail" ? "" : "transition-opacity duration-500 ease-in-out"');
  });

  it("isolates gallery card repainting and reports only slow scroll bursts", () => {
    const libraryViewSource = readSource("src/features/library/components/LibraryView.tsx");

    expect(libraryViewSource).toContain('contain: "layout paint style"');
    expect(libraryViewSource).not.toContain('contentVisibility: "auto"');
    expect(libraryViewSource).toContain("const pageSize = 16");
    expect(libraryViewSource).toContain("ref={homeScrollContainerRef}");
    expect(libraryViewSource).toContain('mainView === "home" ? "z-10 opacity-100" : "z-0 opacity-0 pointer-events-none"');
    expect(libraryViewSource).toContain('willChange: "opacity"');
    expect(libraryViewSource).toContain("const imageCountByItemId = useMemo(() => buildImageCountByItemId(allPromptGroups), [allPromptGroups]);");
    expect(libraryViewSource).toContain("const visibleMasonryItems = useMemo(");
    expect(libraryViewSource).not.toContain("invisible h-0 overflow-hidden pointer-events-none");
    expect(libraryViewSource).not.toContain('mainView === "home" ? "" : "hidden"');
    expect(libraryViewSource).toContain('logRendererStartupEvent("home-scroll:slow"');
    expect(libraryViewSource).toContain("if (maxFrameGapMs >= slowFrameThresholdMs)");
    expect(libraryViewSource).toContain("container.scrollHeight <= container.clientHeight + 2");
    expect(libraryViewSource).toContain("rafId = window.requestAnimationFrame(() => {");
    expect(libraryViewSource).not.toContain('container.addEventListener("scroll", handleScroll, { passive: true });\n    checkLoadMore();');
    expect(libraryViewSource).not.toContain("startTransition(() => {\n      setMainView(view);");
    expect(libraryViewSource).toContain("useLayoutEffect(() => {\n    const switchInfo = viewSwitchStartedAtRef.current;");
  });

  it("reads GPU feature status only after Electron reports it is ready", () => {
    const mainSource = readSource("electron/main/index.ts");

    expect(mainSource).toContain('app.once("gpu-info-update"');
    expect(mainSource).toContain('logger.info("main", "gpu:status-ready"');
    expect(mainSource).not.toContain('logger.info("main", "gpu:status",');
  });
});
