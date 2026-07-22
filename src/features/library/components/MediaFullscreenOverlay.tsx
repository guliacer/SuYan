import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getImageSrc } from "../utils/getImageSrc";
import { isAudioMediaFile, isVideoMediaFile } from "../utils/mediaFileTypes";
import { getStoredAudioMuted, getStoredAudioVolume, storeAudioMuted, storeAudioVolume } from "../utils/videoPlaybackPrefs";
import type { PromptCardData } from "../utils/promptFilters";

type MediaFullscreenOverlayProps = {
  item: PromptCardData;
  onClose: () => void;
};

export function MediaFullscreenOverlay({ item, onClose }: MediaFullscreenOverlayProps) {
  const mediaSrc = item.imageFileName ? getImageSrc(item.imageFileName, item.updatedAt) : "";
  const isVideo = item.imageFileName ? isVideoMediaFile(item.imageFileName) : false;
  const isAudio = item.imageFileName ? isAudioMediaFile(item.imageFileName) : false;
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    setImageAspectRatio(null);
  }, [mediaSrc]);

  const imageFitStyle = useMemo<CSSProperties>(() => {
    const ratio = imageAspectRatio && Number.isFinite(imageAspectRatio) ? imageAspectRatio : 16 / 9;

    return {
      width: `min(96vw, calc(92vh * ${ratio}))`,
    };
  }, [imageAspectRatio]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-overlay/90 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      {isVideo ? (
        <video
          aria-label={item.title || "提示词效果视频"}
          autoPlay
          className="max-h-[92vh] max-w-[96vw] rounded-lg object-contain shadow-2xl"
          controls
          src={mediaSrc}
          onClick={(event) => event.stopPropagation()}
        />
      ) : isAudio ? (
        <audio
          aria-label={item.title || "音频素材"}
          className="w-[min(88vw,640px)] rounded-lg bg-panel p-4 shadow-2xl"
          controls
          ref={(element) => {
            if (!element) {
              return;
            }
            element.volume = getStoredAudioVolume();
            element.muted = getStoredAudioMuted();
          }}
          src={mediaSrc}
          onClick={(event) => event.stopPropagation()}
          onVolumeChange={(event) => {
            storeAudioVolume(event.currentTarget.volume);
            storeAudioMuted(event.currentTarget.muted);
          }}
        />
      ) : (
        <img
          alt={item.title || "提示词效果图"}
          className="block h-auto max-h-[92vh] max-w-[96vw] rounded-lg object-contain shadow-2xl"
          src={mediaSrc}
          style={imageFitStyle}
          onLoad={(event) => {
            const { naturalHeight, naturalWidth } = event.currentTarget;
            if (naturalWidth > 0 && naturalHeight > 0) {
              setImageAspectRatio(naturalWidth / naturalHeight);
            }
          }}
        />
      )}
    </div>
  );
}
