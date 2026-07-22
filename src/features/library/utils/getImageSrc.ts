export function getImageSrc(imageFileName: string, version?: string | number | null): string {
  return appendImageSrcVersion(`app-image://local/${encodeURIComponent(imageFileName)}`, version);
}

export function getImageThumbnailSrc(imageFileName: string, version?: string | number | null): string {
  return appendImageSrcVersion(`app-thumbnail://local/${encodeURIComponent(imageFileName)}`, version);
}

const startupGallerySrcVersion = "hd1600";

export function getStartupGalleryImageSrc(imageFileName: string, version?: string | number | null): string {
  const effectiveVersion = version === null || version === undefined || version === "" ? startupGallerySrcVersion : version;
  return appendImageSrcVersion(`app-startup://local/${encodeURIComponent(imageFileName)}`, effectiveVersion);
}

function appendImageSrcVersion(src: string, version?: string | number | null): string {
  if (version === null || version === undefined || version === "") {
    return src;
  }

  return `${src}?v=${encodeURIComponent(String(version))}`;
}
