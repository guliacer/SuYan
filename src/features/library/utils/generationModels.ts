export type GenerationModelKind = "image" | "video" | "image-video";

export type GenerationModelEntry = {
  aliases: string[];
  kind: GenerationModelKind;
  label: string;
};

export type GenerationModelPreferences = {
  generationModelOrder?: readonly string[];
  hiddenGenerationModels?: readonly string[];
};

export const generationModelEntries: GenerationModelEntry[] = [
  {
    label: "GPT Image 2",
    kind: "image",
    aliases: ["GPT Image 2", "GPT-Image-2", "GPT Image 2.0", "ChatGPT Images 2.0", "gpt-image-2", "gptimage2"],
  },
  {
    label: "Nano Banana 2",
    kind: "image",
    aliases: ["Nano Banana 2", "NanoBanana 2", "nanobanana2", "Gemini 3.1 Flash Image"],
  },
  {
    label: "Nano Banana Pro",
    kind: "image",
    aliases: ["Nano Banana Pro", "NanoBanana-Pro", "NanoBanana Pro", "nanobananapro", "Gemini 3 Pro Image", "gemini_image3_pro"],
  },
  {
    label: "Qwen-Image",
    kind: "image",
    aliases: ["Qwen-Image", "Qwen Image", "QwenImage", "qwen-image", "通义千问图像"],
  },
  {
    label: "Z-Image",
    kind: "image",
    aliases: ["Z-Image", "Z Image", "ZImage", "z-image", "zimage"],
  },
  {
    label: "Krea 2",
    kind: "image",
    aliases: ["Krea 2", "Krea2", "krea-2", "krea2"],
  },
  {
    label: "Anima",
    kind: "image",
    aliases: ["Anima", "Anima AI", "anima-ai"],
  },
  {
    label: "FLUX.2 Klein",
    kind: "image",
    aliases: ["FLUX.2 Klein", "Flux 2 Klein", "FLUX 2 Klein", "flux2klein", "flux-2-klein"],
  },
  {
    label: "FLUX.2 Pro",
    kind: "image",
    aliases: ["FLUX.2 Pro", "Flux 2 Pro", "FLUX 2 Pro", "flux2pro", "flux-2-pro"],
  },
  {
    label: "FLUX.2 Dev",
    kind: "image",
    aliases: ["FLUX.2 Dev", "Flux 2 Dev", "FLUX 2 Dev", "flux2dev", "flux-2-dev"],
  },
  {
    label: "FLUX.2 Schnell",
    kind: "image",
    aliases: ["FLUX.2 Schnell", "Flux 2 Schnell", "FLUX 2 Schnell", "flux2schnell", "flux-2-schnell"],
  },
  {
    label: "Wan 2.2",
    kind: "video",
    aliases: ["Wan 2.2", "Wanx 2.2", "通义万相 2.2", "wan2.2"],
  },
  {
    label: "Wan 2.7",
    kind: "video",
    aliases: ["Wan 2.7", "Wanx 2.7", "通义万相 2.7", "wan2.7"],
  },
  {
    label: "LTX-2.3",
    kind: "video",
    aliases: ["LTX-2.3", "LTX 2.3", "LTX Video 2.3", "ltx23", "ltx-2-3"],
  },
  {
    label: "LTX Video",
    kind: "video",
    aliases: ["LTX Video", "LTX-Video", "LTXVideo", "ltxvideo", "ltx-video"],
  },
  {
    label: "Midjourney V7",
    kind: "image",
    aliases: ["Midjourney V7", "MJ V7", "mjv7", "midjourney-v7"],
  },
  {
    label: "Midjourney Niji V7",
    kind: "image",
    aliases: ["Midjourney Niji V7", "Niji V7", "MJ Niji V7", "niji-v7", "nijiv7", "Midjourney Niji 7"],
  },
  {
    label: "DALL・E 3",
    kind: "image",
    aliases: ["DALL・E 3", "DALL-E 3", "DALL·E 3", "Dall E 3", "dalle3", "DALLE3"],
  },
  {
    label: "Grok Imagine",
    kind: "image",
    aliases: ["Grok Imagine", "Grok-Imagine", "grok-imagine", "grokimagine", "xAI Grok Imagine"],
  },
  {
    label: "Google Imagen 3",
    kind: "image",
    aliases: ["Google Imagen 3", "Imagen 3", "Google Imagen3", "imagen-3", "googleimagen3"],
  },
  {
    label: "Google Veo 3",
    kind: "video",
    aliases: ["Google Veo 3", "Veo 3", "Google Veo3", "veo-3", "veo3", "googleveo3"],
  },
  {
    label: "Adobe Firefly 5",
    kind: "image",
    aliases: ["Adobe Firefly 5", "Firefly 5", "Firefly Image 5", "adobe-firefly-5", "firefly5"],
  },
  {
    label: "Ideogram 3.0",
    kind: "image",
    aliases: ["Ideogram 3.0", "Ideogram 3", "ideogram-3.0", "ideogram-3", "ideogram3"],
  },
  {
    label: "Leonardo AI",
    kind: "image",
    aliases: ["Leonardo AI", "Leonardo.AI", "Leonardo", "leonardo-ai", "leonardoai"],
  },
  {
    label: "HunyuanImage 3.0",
    kind: "image",
    aliases: ["HunyuanImage 3.0", "Hunyuan Image 3.0", "HunyuanImage3", "hunyuan-image-3", "腾讯混元图像 3.0"],
  },
  {
    label: "HunyuanVideo",
    kind: "video",
    aliases: ["HunyuanVideo", "Hunyuan Video", "腾讯混元视频", "混元视频", "hunyuanvideo"],
  },
  {
    label: "文心一格",
    kind: "image",
    aliases: ["文心一格", "Wenxin Yige", "ERNIE-ViLG", "百度文心一格", "wenxin-yige"],
  },
  {
    label: "Kolors 2.0",
    kind: "image",
    aliases: ["Kolors 2.0", "Kolors2", "kolors-2", "kolors2", "快手 Kolors 2.0", "可图 2.0"],
  },
  {
    label: "Kling 3.0",
    kind: "image-video",
    aliases: ["Kling 3.0", "Kling Video 3.0", "Kling VIDEO 3.0", "Kling AI 3.0", "kling3", "可灵 3.0"],
  },
  {
    label: "Seedream 5.0",
    kind: "image",
    aliases: ["Seedream 5.0", "Seedream-5.0", "seedream50", "即梦 Seedream 5.0"],
  },
  {
    label: "Seedance 2.0",
    kind: "video",
    aliases: ["Seedance 2.0", "Seedance 2", "Seedance-2-0", "Seedance2.0", "seedance2", "Doubao Seedance 2.0", "豆包 Seedance 2.0", "即梦 Seedance 2.0"],
  },
  {
    label: "GLM-Image",
    kind: "image",
    aliases: ["GLM-Image", "GLM Image", "GLMImage", "glm-image", "glmimage", "智谱 GLM-Image"],
  },
  {
    label: "Janus-Pro",
    kind: "image",
    aliases: ["Janus-Pro", "Janus Pro", "JanusPro", "janus-pro", "januspro", "DeepSeek Janus-Pro"],
  },
  {
    label: "HiDream-I1",
    kind: "image",
    aliases: ["HiDream-I1", "HiDream I1", "HiDreamI1", "hidream-i1", "hidreami1"],
  },
  {
    label: "Stable Diffusion 3.5",
    kind: "image",
    aliases: ["Stable Diffusion 3.5", "SD 3.5", "SD3.5", "stable-diffusion-3.5", "sd35"],
  },
  {
    label: "SDXL 1.0",
    kind: "image",
    aliases: ["SDXL 1.0", "Stable Diffusion XL 1.0", "SDXL", "SDXL 1", "sdxl-1.0", "sdxl10"],
  },
  {
    label: "PixArt Σ",
    kind: "image",
    aliases: ["PixArt Σ", "PixArt-Sigma", "PixArt Sigma", "PixArtSigma", "pixart-sigma", "pixartsigma"],
  },
  {
    label: "NVIDIA Sana",
    kind: "image",
    aliases: ["NVIDIA Sana", "Sana", "Nvidia Sana", "nvidia-sana", "sana"],
  },
  {
    label: "DreamShaper 8",
    kind: "image",
    aliases: ["DreamShaper 8", "DreamShaper8", "dreamshaper-8", "dreamshaper8", "DS8"],
  },
  {
    label: "MajicMIX Realistic V7",
    kind: "image",
    aliases: ["MajicMIX Realistic V7", "MajicMix Realistic V7", "majicmix-realistic-v7", "majicmixrealisticv7"],
  },
  {
    label: "Counterfeit V5",
    kind: "image",
    aliases: ["Counterfeit V5", "CounterfeitV5", "counterfeit-v5", "counterfeitv5", "Counterfeit 5"],
  },
  {
    label: "MeinaMix",
    kind: "image",
    aliases: ["MeinaMix", "Meina Mix", "meinamix", "meina-mix"],
  },
  {
    label: "Pika Image",
    kind: "image",
    aliases: ["Pika Image", "PikaImage", "pika-image", "pikaimage", "Pika 1.5 Image"],
  },
  {
    label: "Pika 3.0",
    kind: "video",
    aliases: ["Pika 3.0", "Pika3", "Pika-3.0", "pika3", "pika-3"],
  },
  {
    label: "Sora",
    kind: "video",
    aliases: ["Sora", "OpenAI Sora"],
  },
  {
    label: "Runway Gen-4.5",
    kind: "video",
    aliases: ["Runway Gen-4.5", "Gen-4.5", "Gen 4.5", "runway-gen-4.5", "gen4.5"],
  },
  {
    label: "Hailuo Video",
    kind: "video",
    aliases: ["Hailuo Video", "HailuoVideo", "MiniMax Hailuo", "hailuo-video", "hailuovideo", "海螺视频"],
  },
  {
    label: "LongCat-Video",
    kind: "video",
    aliases: ["LongCat-Video", "LongCat Video", "LongCatVideo", "longcat-video", "longcatvideo", "长猫视频"],
  },
  {
    label: "Movie Gen",
    kind: "video",
    aliases: ["Movie Gen", "Meta Movie Gen", "movie-gen", "moviegen", "Meta MovieGen"],
  },
];

const genericGenerationLabels = new Set([
  "aiart.pics",
  "prompt fill",
  "twitter",
  "webtomind",
  "x",
  "图像提示词",
  "图片提示词",
  "未分类",
  "网页分享",
  "网络提示词",
  "视频提示词",
  "本地提示词",
]);

const preferredGenerationModelOrder = [
  "GPT Image 2",
  "Nano Banana 2",
  "Nano Banana Pro",
  "Qwen-Image",
  "Z-Image",
  "Krea 2",
  "Anima",
  "FLUX.2 Klein",
  "FLUX.2 Pro",
  "FLUX.2 Dev",
  "FLUX.2 Schnell",
  "Wan 2.2",
  "Wan 2.7",
  "LTX-2.3",
  "LTX Video",
  "Midjourney V7",
  "Midjourney Niji V7",
  "DALL・E 3",
  "Grok Imagine",
  "Google Imagen 3",
  "Google Veo 3",
  "Adobe Firefly 5",
  "Ideogram 3.0",
  "Leonardo AI",
  "HunyuanImage 3.0",
  "HunyuanVideo",
  "文心一格",
  "Kolors 2.0",
  "Kling 3.0",
  "Seedream 5.0",
  "Seedance 2.0",
  "GLM-Image",
  "Janus-Pro",
  "HiDream-I1",
  "Stable Diffusion 3.5",
  "SDXL 1.0",
  "PixArt Σ",
  "NVIDIA Sana",
  "DreamShaper 8",
  "MajicMIX Realistic V7",
  "Counterfeit V5",
  "MeinaMix",
  "Pika Image",
  "Pika 3.0",
  "Sora",
  "Runway Gen-4.5",
  "Hailuo Video",
  "LongCat-Video",
  "Movie Gen",
];

const preferredGenerationModelRanks = new Map(
  preferredGenerationModelOrder.map((label, index) => [normalizeModelNeedle(label), index]),
);

const fallbackKindRanks: Record<GenerationModelKind, number> = {
  image: 1_000,
  "image-video": 2_000,
  video: 3_000,
};

export function getGenerationModelOptions(preferences: GenerationModelPreferences = {}): string[] {
  const orderedOptions = orderGenerationModelLabels(getDefaultGenerationModelOptions(), preferences.generationModelOrder ?? []);
  const hiddenModelKeys = new Set((preferences.hiddenGenerationModels ?? []).map(normalizeModelNeedle));

  return orderedOptions.filter((option) => !hiddenModelKeys.has(normalizeModelNeedle(option)));
}

export function moveGenerationModelOption(
  currentOrder: readonly string[],
  sourceLabel: string,
  targetLabel: string,
): string[] {
  const orderedOptions = orderGenerationModelLabels(getDefaultGenerationModelOptions(), currentOrder);
  const sourceIndex = findGenerationModelIndex(orderedOptions, sourceLabel);
  const targetIndex = findGenerationModelIndex(orderedOptions, targetLabel);

  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return orderedOptions;
  }

  const nextOptions = [...orderedOptions];
  const [movedOption] = nextOptions.splice(sourceIndex, 1);

  nextOptions.splice(targetIndex, 0, movedOption);

  return nextOptions;
}

export function hideGenerationModelOption(currentHiddenModels: readonly string[], label: string): string[] {
  return uniqueGenerationModelLabels([...currentHiddenModels, label]);
}

function getDefaultGenerationModelOptions(): string[] {
  return generationModelEntries
    .map((entry, index) => ({ entry, index }))
    .sort((first, second) => {
      const firstRank = getGenerationModelSortRank(first.entry);
      const secondRank = getGenerationModelSortRank(second.entry);

      return firstRank - secondRank || first.index - second.index;
    })
    .map(({ entry }) => entry.label);
}

function orderGenerationModelLabels(labels: readonly string[], savedOrder: readonly string[]): string[] {
  const labelsByKey = new Map(labels.map((label) => [normalizeModelNeedle(label), label]));
  const orderedLabels = uniqueGenerationModelLabels(savedOrder)
    .map((label) => labelsByKey.get(normalizeModelNeedle(label)))
    .filter((label): label is string => Boolean(label));
  const orderedKeys = new Set(orderedLabels.map(normalizeModelNeedle));

  return [...orderedLabels, ...labels.filter((label) => !orderedKeys.has(normalizeModelNeedle(label)))];
}

function uniqueGenerationModelLabels(values: readonly string[]): string[] {
  const seenKeys = new Set<string>();
  const labels: string[] = [];

  for (const value of values) {
    const label = value.trim();
    const key = normalizeModelNeedle(label);

    if (!label || !key || seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    labels.push(label);
  }

  return labels;
}

function findGenerationModelIndex(labels: readonly string[], label: string): number {
  return labels.findIndex((item) => isSameGenerationModelLabel(item, label));
}

export function isGenericGenerationModelLabel(value: string | null | undefined): boolean {
  const normalized = value?.trim();

  return !normalized || genericGenerationLabels.has(normalized.toLowerCase());
}

export function isSameGenerationModelLabel(first: string, second: string): boolean {
  return normalizeModelNeedle(first) === normalizeModelNeedle(second);
}

export function matchGenerationModelLabel(input: string | readonly string[] | null | undefined): string | null {
  const text = typeof input === "string" ? input : input ? input.join("\n") : "";
  const haystack = normalizeModelNeedle(text);

  if (!haystack) {
    return null;
  }

  let bestMatch: { index: number; label: string; length: number } | null = null;

  for (const entry of generationModelEntries) {
    for (const alias of [entry.label, ...entry.aliases]) {
      const needle = normalizeModelNeedle(alias);

      if (!needle || needle.length < 2) {
        continue;
      }

      const index = haystack.indexOf(needle);

      if (index < 0) {
        continue;
      }

      if (
        !bestMatch ||
        index < bestMatch.index ||
        (index === bestMatch.index && needle.length > bestMatch.length)
      ) {
        bestMatch = { index, label: entry.label, length: needle.length };
      }
    }
  }

  return bestMatch?.label ?? null;
}

export function resolveGenerationModelLabel(input: {
  category?: string | null;
  generationMethod?: string | null;
  prompt?: string | null;
  sourceUrl?: string | null;
  tags?: readonly string[] | null;
  title?: string | null;
}): string | null {
  const generationMethod = input.generationMethod?.trim() ?? "";
  const generationMethodMatch = matchGenerationModelLabel(generationMethod);

  if (generationMethodMatch) {
    return generationMethodMatch;
  }

  if (generationMethod && !isGenericGenerationModelLabel(generationMethod)) {
    return generationMethod;
  }

  const metadataMatch = matchGenerationModelLabel([
    input.category ?? "",
    ...(input.tags ?? []),
    input.title ?? "",
    input.prompt ?? "",
    input.sourceUrl ?? "",
  ]);

  if (metadataMatch) {
    return metadataMatch;
  }

  return input.sourceUrl ? "未识别模型" : null;
}

function normalizeModelNeedle(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function getGenerationModelSortRank(entry: GenerationModelEntry): number {
  const preferredRank = preferredGenerationModelRanks.get(normalizeModelNeedle(entry.label));

  return preferredRank ?? fallbackKindRanks[entry.kind];
}
