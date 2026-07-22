export type VideoCodecInfo = {
  videoCodec: string | null;
  audioCodec: string | null;
  hasAudio: boolean;
};

export type VideoNormalizationPlan = {
  needsAudioTranscode: boolean;
  needsVideoTranscode: boolean;
};

const browserPlayableVideoCodecs = new Set(["h264", "vp8", "vp9", "av1", "theora"]);
const browserPlayableAudioCodecs = new Set(["aac", "mp3", "opus", "vorbis", "flac"]);

export function getVideoNormalizationPlan(info: VideoCodecInfo): VideoNormalizationPlan {
  return {
    needsVideoTranscode: info.videoCodec !== null && !browserPlayableVideoCodecs.has(info.videoCodec),
    needsAudioTranscode:
      info.hasAudio && info.audioCodec !== null && !browserPlayableAudioCodecs.has(info.audioCodec),
  };
}
