import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Eye, ImageIcon, ImageOff, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/LocaleProvider";
import { getImageSrc, getImageThumbnailSrc } from "../utils/getImageSrc";
import { isVideoMediaFile } from "../utils/mediaFileTypes";
import { isNsfwItem } from "../utils/nsfwRating";
import {
  getResolvedThumbnailSrc,
  isImageSrcLoaded,
  rememberLoadedImageSrc,
  rememberResolvedThumbnailSrc,
} from "../utils/thumbnailImageCache";
import type { PromptCardData } from "../utils/promptFilters";

const THUMBNAIL_MAX_RETRIES = 1;
const THUMBNAIL_RETRY_DELAY_MS = 180;
const THUMBNAIL_FALLBACK_TIMEOUT_MS = 1400;
const THUMBNAIL_FALLBACK_ROOT_MARGIN = "400px";
const MAX_THUMBNAIL_TIMEOUT_EVENTS_PER_WINDOW = 8;
const THUMBNAIL_TIMEOUT_EVENT_WINDOW_MS = 10_000;
let thumbnailTimeoutWindowStartedAt = 0;
let thumbnailTimeoutEventCount = 0;

function logRendererStartupEvent(event: string, details: Record<string, unknown>): void {
  try {
    window.suyanApi.logStartupEvent(event, details);
  } catch {
    // Image fallback telemetry must never block rendering.
  }
}

function logThumbnailTimeout(imageFileName: string): void {
  const now = performance.now();
  if (now - thumbnailTimeoutWindowStartedAt >= THUMBNAIL_TIMEOUT_EVENT_WINDOW_MS) {
    thumbnailTimeoutWindowStartedAt = now;
    thumbnailTimeoutEventCount = 0;
  }

  if (thumbnailTimeoutEventCount >= MAX_THUMBNAIL_TIMEOUT_EVENTS_PER_WINDOW) {
    return;
  }

  thumbnailTimeoutEventCount += 1;
  logRendererStartupEvent("media-image:thumbnail-timeout", {
    file: imageFileName,
    timeoutMs: THUMBNAIL_FALLBACK_TIMEOUT_MS,
    sampled: true,
  });
}

type NsfwImageProps = {
  image: Pick<PromptCardData, "imageFileName" | "nsfwRating" | "title"> & {
    mediaStatus?: PromptCardData["mediaStatus"];
    updatedAt?: number | string;
  };
  alt: string;
  blurNsfwImages: boolean;
  activateLabel?: string;
  className?: string;
  fetchPriority?: "auto" | "high" | "low";
  imageClassName?: string;
  loading?: "eager" | "lazy";
  onActivate?: () => void;
  onPreview?: () => void;
  onReveal?: () => void;
  placeholderClassName?: string;
  revealed?: boolean;
  showRevealControl?: boolean;
  source?: "original" | "thumbnail";
  style?: CSSProperties;
};

export function NsfwImage({
  image,
  alt,
  blurNsfwImages,
  activateLabel,
  className = "",
  fetchPriority = "auto",
  imageClassName = "",
  loading = "lazy",
  onActivate,
  onPreview,
  onReveal,
  placeholderClassName = "",
  revealed,
  showRevealControl = true,
  source = "original",
  style,
}: NsfwImageProps) {
  const { t } = useLocale();
  const isMissing = image.mediaStatus === "missing";
  const hasImage = Boolean(image.imageFileName) && !isMissing;
  const mediaVersion = image.updatedAt ?? "";
  const originalImageSrc = hasImage ? getImageSrc(image.imageFileName, mediaVersion) : "";
  const isVideoMedia = image.imageFileName ? isVideoMediaFile(image.imageFileName) : false;
  const useVideoThumbnail = isVideoMedia && source === "thumbnail";
  const renderAsVideo = isVideoMedia && !useVideoThumbnail;
  const directThumbnailSrc = useMemo(
    () =>
      source === "thumbnail" && image.imageFileName
        ? getImageThumbnailSrc(image.imageFileName, mediaVersion || undefined)
        : "",
    [image.imageFileName, isVideoMedia, mediaVersion, source],
  );
  const [resolvedThumbnailSrc, setResolvedThumbnailSrc] = useState(() =>
    source === "thumbnail" && image.imageFileName
      ? directThumbnailSrc || getResolvedThumbnailSrc(image.imageFileName) || getImageThumbnailSrc(image.imageFileName)
      : "",
  );
  const [thumbnailRetryIndex, setThumbnailRetryIndex] = useState(0);
  const [thumbnailFallbackToOriginal, setThumbnailFallbackToOriginal] = useState(false);
  const thumbnailSrcWithRetry = useMemo(() => {
    if (source !== "thumbnail" || !resolvedThumbnailSrc || thumbnailRetryIndex === 0) {
      return resolvedThumbnailSrc;
    }

    return `${resolvedThumbnailSrc}${resolvedThumbnailSrc.includes("?") ? "&" : "?"}retry=${thumbnailRetryIndex}`;
  }, [resolvedThumbnailSrc, source, thumbnailRetryIndex]);
  const imageSrc = renderAsVideo || thumbnailFallbackToOriginal
    ? originalImageSrc
    : source === "thumbnail"
      ? thumbnailSrcWithRetry
      : originalImageSrc;
  const [localIsRevealed, setLocalIsRevealed] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(() => Boolean(imageSrc && isImageSrcLoaded(imageSrc)));
  const [hasImageFailed, setHasImageFailed] = useState(false);
  const [baseSrc, setBaseSrc] = useState(() => (imageSrc && isImageSrcLoaded(imageSrc) ? imageSrc : ""));
  const imageRef = useRef<HTMLImageElement | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const thumbnailFallbackTimerRef = useRef<number | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  const prevFileNameRef = useRef(image.imageFileName);
  const imageLoading = loading;
  const isRevealed = revealed ?? localIsRevealed;
  const shouldBlur = blurNsfwImages && isNsfwItem(image) && !isRevealed;
  const shouldDisplayImage = isImageLoaded && !isMissing;
  const hasVisibleBase = !isMissing && !isVideoMedia && Boolean(baseSrc) && baseSrc !== imageSrc;
  const isImagePending = hasImage && !hasImageFailed && !shouldDisplayImage && !hasVisibleBase;
  const shouldShowPlaceholder = isMissing || !hasImage || hasImageFailed || (!shouldDisplayImage && !hasVisibleBase);

  useEffect(() => {
    setLocalIsRevealed(false);
    setHasImageFailed(false);

    if (!hasImage || isMissing) {
      setResolvedThumbnailSrc("");
      setThumbnailRetryIndex(0);
      setThumbnailFallbackToOriginal(false);
      setIsImageLoaded(false);
      setBaseSrc("");
      return;
    }

    if (renderAsVideo) {
      setResolvedThumbnailSrc("");
      setThumbnailRetryIndex(0);
      setThumbnailFallbackToOriginal(false);
      setIsImageLoaded(false);
      return;
    }

    if (source !== "thumbnail") {
      setResolvedThumbnailSrc("");
      setThumbnailRetryIndex(0);
      setThumbnailFallbackToOriginal(false);
      setIsImageLoaded(Boolean(originalImageSrc && isImageSrcLoaded(originalImageSrc)));
      return;
    }

    const nextThumbnailSrc = directThumbnailSrc || getResolvedThumbnailSrc(image.imageFileName);
    setResolvedThumbnailSrc(nextThumbnailSrc);
    setThumbnailRetryIndex(0);
    setThumbnailFallbackToOriginal(false);
    setIsImageLoaded(Boolean(nextThumbnailSrc && isImageSrcLoaded(nextThumbnailSrc)));
  }, [directThumbnailSrc, hasImage, image.imageFileName, isMissing, renderAsVideo, originalImageSrc, source]);

  useEffect(() => {
    if (
      source !== "thumbnail" ||
      !hasImage ||
      isMissing ||
      renderAsVideo ||
      thumbnailFallbackToOriginal ||
      isImageLoaded ||
      !imageSrc
    ) {
      return;
    }

    let isDisposed = false;
    const startFallbackTimer = () => {
      if (isDisposed || thumbnailFallbackTimerRef.current !== null) {
        return;
      }

      // A thumbnail request can wait on first-run generation. Do not leave the
      // card blank while that work runs: the original image is a useful, visible
      // fallback and the request can finish in the background.
      thumbnailFallbackTimerRef.current = window.setTimeout(() => {
        thumbnailFallbackTimerRef.current = null;
        if (isDisposed) {
          return;
        }

        const currentImage = imageRef.current;
        if (currentImage?.complete && currentImage.naturalWidth > 0) {
          handleImageLoad();
          return;
        }

        if (!isImageLoaded) {
          logThumbnailTimeout(image.imageFileName);
          setThumbnailFallbackToOriginal(true);
          setThumbnailRetryIndex(0);
        }
      }, THUMBNAIL_FALLBACK_TIMEOUT_MS);
    };

    let observer: IntersectionObserver | null = null;

    if (imageLoading !== "lazy" || typeof IntersectionObserver === "undefined") {
      startFallbackTimer();
    } else {
      const imageElement = imageRef.current;

      if (!imageElement) {
        return;
      }

      observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) {
            return;
          }

          // Chromium may keep a lazy image queued even after the observer
          // reports it is nearby. Promote this element before timing so the
          // fallback covers an actual thumbnail request, not browser deferral.
          imageElement.loading = "eager";
          observer?.disconnect();
          observer = null;
          startFallbackTimer();
        },
        { rootMargin: THUMBNAIL_FALLBACK_ROOT_MARGIN },
      );
      observer.observe(imageElement);
    }

    return () => {
      isDisposed = true;
      observer?.disconnect();
      if (thumbnailFallbackTimerRef.current !== null) {
        window.clearTimeout(thumbnailFallbackTimerRef.current);
        thumbnailFallbackTimerRef.current = null;
      }
    };
  }, [hasImage, image.imageFileName, imageLoading, imageSrc, isImageLoaded, isMissing, renderAsVideo, source, thumbnailFallbackToOriginal]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
      }
      if (thumbnailFallbackTimerRef.current !== null) {
        window.clearTimeout(thumbnailFallbackTimerRef.current);
      }
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (prevFileNameRef.current !== image.imageFileName) {
      prevFileNameRef.current = image.imageFileName;
      setBaseSrc(imageSrc && isImageSrcLoaded(imageSrc) ? imageSrc : "");
    }
  }, [image.imageFileName, imageSrc]);

  useEffect(() => {
    const currentImage = imageRef.current;

    if (!currentImage || !imageSrc) {
      return;
    }

    if (isImageSrcLoaded(imageSrc) || (currentImage.complete && currentImage.naturalWidth > 0)) {
      rememberLoadedImageSrc(imageSrc);
      setHasImageFailed(false);
      setIsImageLoaded(true);
      setBaseSrc((current) => current || imageSrc);
    }
  }, [imageSrc]);

  function handleImageLoad() {
    if (thumbnailFallbackTimerRef.current !== null) {
      window.clearTimeout(thumbnailFallbackTimerRef.current);
      thumbnailFallbackTimerRef.current = null;
    }
    if (imageSrc) {
      rememberLoadedImageSrc(imageSrc);
    }
    if (source === "thumbnail" && image.imageFileName && imageSrc && !thumbnailFallbackToOriginal) {
      rememberResolvedThumbnailSrc(image.imageFileName, directThumbnailSrc || imageSrc);
    }
    setHasImageFailed(false);
    setIsImageLoaded(true);
    if (imageSrc) {
      setBaseSrc((current) => current || imageSrc);
    }
  }

  function handleImageError() {
    if (source === "thumbnail" && image.imageFileName && !thumbnailFallbackToOriginal) {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
      }

      if (thumbnailRetryIndex < THUMBNAIL_MAX_RETRIES) {
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null;
          setThumbnailRetryIndex((currentIndex) => currentIndex + 1);
        }, THUMBNAIL_RETRY_DELAY_MS);
        setHasImageFailed(false);
        setIsImageLoaded(false);
        return;
      }

      setThumbnailFallbackToOriginal(true);
      setThumbnailRetryIndex(0);
      setHasImageFailed(false);
      setIsImageLoaded(Boolean(originalImageSrc && isImageSrcLoaded(originalImageSrc)));
      return;
    }

    logRendererStartupEvent("media-image:load-failed", {
      file: image.imageFileName,
      source: source === "thumbnail" && thumbnailFallbackToOriginal ? "original-fallback" : source,
    });
    setHasImageFailed(true);
  }

  function handleActivateClick() {
    if (onPreview && !isMissing) {
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
        onPreview();
        return;
      }
      clickTimerRef.current = window.setTimeout(() => {
        clickTimerRef.current = null;
        onActivate?.();
      }, 300);
      return;
    }
    onActivate?.();
  }

  return (
    <div
      className={`relative grid overflow-hidden bg-background [&>*]:col-start-1 [&>*]:row-start-1 ${isMissing ? "min-h-44" : ""} ${className}`}
      style={style}
    >
      {hasVisibleBase && !hasImageFailed ? (
        <img
          aria-hidden="true"
          alt=""
          className={`${imageClassName} ${shouldBlur ? "scale-[1.03] blur-2xl" : ""}`}
          decoding="async"
          key={`base-${baseSrc}`}
          src={baseSrc}
        />
      ) : null}
      {hasImage && imageSrc && !hasImageFailed ? (
        renderAsVideo ? (
          <video
            aria-label={alt}
            className={`${imageClassName} transition-opacity duration-300 ease-out ${
              shouldDisplayImage ? "opacity-100" : "opacity-0"
            } ${shouldBlur ? "scale-[1.03] blur-2xl" : ""}`}
            key={imageSrc}
            muted
            playsInline
            preload="metadata"
            src={imageSrc}
            onError={handleImageError}
            onLoadedData={handleImageLoad}
            onLoadedMetadata={handleImageLoad}
          />
        ) : (
          <img
            ref={imageRef}
            alt={alt}
            className={`${imageClassName} ${
              source === "thumbnail" ? "" : "transition-opacity duration-500 ease-in-out"
            } ${shouldDisplayImage ? "opacity-100" : "opacity-0"} ${shouldBlur ? "scale-[1.03] blur-2xl" : ""}`}
            decoding="async"
            fetchPriority={fetchPriority}
            key={imageSrc}
            loading={imageLoading}
            src={imageSrc}
            onError={handleImageError}
            onLoad={handleImageLoad}
          />
        )
      ) : null}
      {shouldShowPlaceholder ? (
        <div
          className={`${isMissing ? "relative min-h-44 w-full" : "absolute inset-0 h-full w-full"} ${
            isImagePending ? "media-image-placeholder" : "flex items-center justify-center bg-background text-muted"
          } ${placeholderClassName}`}
        >
          {isImagePending ? (
            <span className="media-image-placeholder__shimmer" aria-hidden="true" />
          ) : isMissing ? (
            <span className="flex flex-col items-center gap-2 px-3 py-6 text-center">
              <ImageOff className="text-danger/80" size={36} />
              <span className="text-xs font-semibold text-danger">{t("源文件缺失")}</span>
            </span>
          ) : isVideoMedia ? (
            <Play size={42} />
          ) : (
            <ImageIcon size={42} />
          )}
        </div>
      ) : null}
      {onActivate ? (
        <button
          aria-label={activateLabel ?? alt}
          className="absolute inset-0 z-[1] outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
          type="button"
          onClick={handleActivateClick}
        >
          <span className="sr-only">{activateLabel ?? alt}</span>
        </button>
      ) : null}
      {shouldBlur && showRevealControl ? (
        <div className="group absolute inset-x-0 bottom-0 z-10 flex h-16 items-end justify-center px-2 pb-2">
          <div className="pointer-events-none translate-y-1 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100">
            <Button
              className="min-h-8 rounded-full px-3 text-xs shadow-elevated"
              icon={<Eye size={14} />}
              variant="secondary"
              onClick={(event) => {
                event.stopPropagation();
                if (onReveal) {
                  onReveal();
                  return;
                }

                setLocalIsRevealed(true);
              }}
            >
              {isVideoMedia ? t("显示视频") : t("显示图像")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
