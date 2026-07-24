import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Eye, ImageIcon, ImageOff, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
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

const thumbnailSessionVersion = Date.now();

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
        ? getImageThumbnailSrc(
            image.imageFileName,
            mediaVersion ? `${thumbnailSessionVersion}-${mediaVersion}` : thumbnailSessionVersion,
          )
        : "",
    [image.imageFileName, isVideoMedia, mediaVersion, source],
  );
  const [resolvedThumbnailSrc, setResolvedThumbnailSrc] = useState(() =>
    source === "thumbnail" && image.imageFileName
      ? directThumbnailSrc || getResolvedThumbnailSrc(image.imageFileName) || getImageThumbnailSrc(image.imageFileName)
      : "",
  );
  const [thumbnailRetryIndex, setThumbnailRetryIndex] = useState(0);
  const thumbnailSrcWithRetry = useMemo(() => {
    if (source !== "thumbnail" || !resolvedThumbnailSrc || thumbnailRetryIndex === 0) {
      return resolvedThumbnailSrc;
    }

    return `${resolvedThumbnailSrc}${resolvedThumbnailSrc.includes("?") ? "&" : "?"}retry=${thumbnailRetryIndex}`;
  }, [resolvedThumbnailSrc, source, thumbnailRetryIndex]);
  const imageSrc = renderAsVideo
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
  const clickTimerRef = useRef<number | null>(null);
  const prevFileNameRef = useRef(image.imageFileName);
  const imageLoading = loading;
  const isRevealed = revealed ?? localIsRevealed;
  const shouldBlur = blurNsfwImages && isNsfwItem(image) && !isRevealed;
  const shouldDisplayImage = isImageLoaded && !isMissing;
  const hasVisibleBase = !isMissing && !isVideoMedia && Boolean(baseSrc) && baseSrc !== imageSrc;
  const shouldShowPlaceholder = isMissing || !hasImage || hasImageFailed || (!shouldDisplayImage && !hasVisibleBase);

  useEffect(() => {
    setLocalIsRevealed(false);
    setHasImageFailed(false);

    if (!hasImage || isMissing) {
      setResolvedThumbnailSrc("");
      setThumbnailRetryIndex(0);
      setIsImageLoaded(false);
      setBaseSrc("");
      return;
    }

    if (renderAsVideo) {
      setResolvedThumbnailSrc("");
      setThumbnailRetryIndex(0);
      setIsImageLoaded(false);
      return;
    }

    if (source !== "thumbnail") {
      setResolvedThumbnailSrc("");
      setThumbnailRetryIndex(0);
      setIsImageLoaded(Boolean(originalImageSrc && isImageSrcLoaded(originalImageSrc)));
      return;
    }

    const nextThumbnailSrc = directThumbnailSrc || getResolvedThumbnailSrc(image.imageFileName);
    setResolvedThumbnailSrc(nextThumbnailSrc);
    setThumbnailRetryIndex(0);
    setIsImageLoaded(Boolean(nextThumbnailSrc && isImageSrcLoaded(nextThumbnailSrc)));
  }, [directThumbnailSrc, hasImage, image.imageFileName, isMissing, renderAsVideo, originalImageSrc, source]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
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
    if (imageSrc) {
      rememberLoadedImageSrc(imageSrc);
    }
    if (source === "thumbnail" && image.imageFileName && imageSrc) {
      rememberResolvedThumbnailSrc(image.imageFileName, directThumbnailSrc || imageSrc);
    }
    setHasImageFailed(false);
    setIsImageLoaded(true);
    if (imageSrc) {
      setBaseSrc((current) => current || imageSrc);
    }
  }

  function handleImageError() {
    if (source === "thumbnail" && image.imageFileName) {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
      }

      if (thumbnailRetryIndex < 3) {
        const retryDelayMs = Math.min(800 + thumbnailRetryIndex * 700, 2800);

        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null;
          setThumbnailRetryIndex((currentIndex) => currentIndex + 1);
        }, retryDelayMs);
        setHasImageFailed(false);
        setIsImageLoaded(false);
        return;
      }

      setHasImageFailed(true);
      return;
    }

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
            className={`${imageClassName} transition-opacity duration-500 ease-in-out ${
              shouldDisplayImage ? "opacity-100" : "opacity-0"
            } ${shouldBlur ? "scale-[1.03] blur-2xl" : ""}`}
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
          className={`${isMissing ? "relative min-h-44 w-full" : "absolute inset-0 h-full w-full"} flex items-center justify-center bg-background text-muted ${placeholderClassName}`}
        >
          {isMissing ? (
            <span className="flex flex-col items-center gap-2 px-3 py-6 text-center">
              <ImageOff className="text-danger/80" size={36} />
              <span className="text-xs font-semibold text-danger">源文件缺失</span>
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
              {isVideoMedia ? "显示视频" : "显示图像"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
