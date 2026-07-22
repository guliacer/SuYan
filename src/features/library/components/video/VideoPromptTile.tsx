import { memo, useCallback, useState } from "react";
import { Film, Play } from "lucide-react";
import { NsfwImage } from "../NsfwImage";
import { getImageThumbnailSrc } from "../../utils/getImageSrc";
import { formatVideoDuration } from "../../utils/videoDisplay";
import type { PromptCardData } from "../../utils/promptFilters";

type VideoPromptTileProps = {
  blurNsfwImages: boolean;
  isPriorityImage: boolean;
  item: PromptCardData;
  onViewDetail: (itemId: string) => void;
};

function VideoPromptTileComponent({ blurNsfwImages, isPriorityImage, item, onViewDetail }: VideoPromptTileProps) {
  const [isHovered, setIsHovered] = useState(false);
  const handleViewDetail = useCallback(() => onViewDetail(item.id), [onViewDetail, item.id]);
  const durationLabel = formatVideoDuration(item.videoDurationSec);
  const keyframes = item.videoKeyframes;
  const hasKeyframes = keyframes.length > 0;
  const posterImage = item.videoPosterFileName
    ? { imageFileName: item.videoPosterFileName, nsfwRating: item.nsfwRating, title: item.title, updatedAt: item.updatedAt }
    : item;

  return (
    <article
      className="group/tile block min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-panel shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-image"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="group relative block w-full overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/35">
        <NsfwImage
          activateLabel={`查看 ${item.title || "未命名视频提示词"} 的详情`}
          alt={item.title || "视频提示词封面"}
          blurNsfwImages={blurNsfwImages}
          className="w-full"
          fetchPriority={isPriorityImage ? "high" : "auto"}
          image={posterImage}
          imageClassName="block h-auto w-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
          loading={isPriorityImage ? "eager" : "lazy"}
          onActivate={handleViewDetail}
          placeholderClassName="min-h-44"
          showRevealControl={false}
          source="thumbnail"
        />

        <span className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-overlay/45 text-primary-foreground backdrop-blur-sm transition-transform duration-200 group-hover/tile:scale-110">
            <Play size={20} fill="currentColor" />
          </span>
        </span>

        <span className="pointer-events-none absolute left-2 top-2 z-[2] inline-flex min-h-6 items-center gap-1 rounded-lg bg-overlay/55 px-2 text-[11px] font-medium text-primary-foreground backdrop-blur">
          <Film size={12} />
          视频
        </span>
        {durationLabel ? (
          <span className="pointer-events-none absolute bottom-2 right-2 z-[2] inline-flex min-h-6 items-center rounded-lg bg-overlay/55 px-2 text-[11px] font-medium tabular-nums text-primary-foreground backdrop-blur">
            {durationLabel}
          </span>
        ) : null}
      </div>

      {hasKeyframes && isHovered ? (
        <div className="flex gap-1 overflow-hidden border-t border-border/60 bg-background/60 p-1.5">
          {keyframes.slice(0, 5).map((keyframe, index) => (
            <div
              className="relative min-w-0 flex-1 overflow-hidden rounded-md bg-background"
              key={`${keyframe.imageFileName}-${index}`}
              title={keyframe.label}
            >
              <img
                alt={`关键帧 ${keyframe.label}`}
                className="block aspect-video w-full object-cover"
                decoding="async"
                loading="lazy"
                src={getImageThumbnailSrc(keyframe.imageFileName, item.updatedAt)}
              />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-overlay/55 text-center text-[9px] leading-4 text-primary-foreground">
                {keyframe.label}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export const VideoPromptTile = memo(VideoPromptTileComponent);
