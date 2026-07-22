import zlib from "node:zlib";
import type { LibraryFile, LibraryItem } from "../../../src/features/library/types/library";

type SeedImagePalette = {
  imageFileName: string;
  from: readonly [number, number, number];
  to: readonly [number, number, number];
  accent: readonly [number, number, number];
};

const seedUpdatedAt = "2026-07-04T00:00:00.000Z";

export const defaultLibrarySeedItems: LibraryItem[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    title: "品牌营销提案生成器",
    imageFileName: "00000000-0000-4000-8000-000000000101.png",
    prompt:
      "你是一名资深品牌营销顾问。请根据【产品名称】【目标用户】【核心卖点】【投放渠道】生成一份中文营销提案，包含目标洞察、主张定位、三条传播口号、内容节奏和可执行的下一步行动。",
    negativePrompt: "避免空泛口号、过度承诺和没有执行路径的建议。",
    tags: ["品牌营销", "商业计划", "内容策略"],
    createdAt: "2026-07-04T10:00:00.000Z",
    updatedAt: seedUpdatedAt,
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    title: "职业发展路线规划",
    imageFileName: "00000000-0000-4000-8000-000000000102.png",
    prompt:
      "你是一名职业发展教练。请基于【当前岗位】【已有技能】【目标岗位】【可投入时间】制定 90 天成长计划，输出阶段目标、每周行动、作品集方向、复盘问题和风险提醒。",
    negativePrompt: "不要给出泛泛而谈的鸡汤式建议。",
    tags: ["职业发展", "学习提升", "计划拆解"],
    createdAt: "2026-07-04T09:30:00.000Z",
    updatedAt: seedUpdatedAt,
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    title: "结构化文本生成器",
    imageFileName: "00000000-0000-4000-8000-000000000103.png",
    prompt:
      "请把【原始内容】整理成结构清晰的中文文档。要求先提炼核心观点，再按背景、问题、方案、行动清单、注意事项输出，语言简洁，适合直接发送给团队成员。",
    negativePrompt: "不要改变事实，不要扩写未经提供的信息。",
    tags: ["文本生成器", "写作指南", "效率工具"],
    createdAt: "2026-07-04T09:00:00.000Z",
    updatedAt: seedUpdatedAt,
  },
  {
    id: "00000000-0000-4000-8000-000000000104",
    title: "角色设定完善助手",
    imageFileName: "00000000-0000-4000-8000-000000000104.png",
    prompt:
      "你是一名角色设定架构师。请根据【角色名称】【使用场景】【能力边界】【语气偏好】完善角色配置，输出背景、目标、约束、工作流程、技能清单和初始化话术。",
    negativePrompt: "避免堆砌形容词，所有能力都要能落到实际行为。",
    tags: ["角色", "提示词工程", "写作指南"],
    createdAt: "2026-07-04T08:30:00.000Z",
    updatedAt: seedUpdatedAt,
  },
  {
    id: "00000000-0000-4000-8000-000000000105",
    title: "长文写作大纲生成",
    imageFileName: "00000000-0000-4000-8000-000000000105.png",
    prompt:
      "请围绕【主题】生成一份适合中文长文的写作大纲。需要包含标题备选、读者画像、文章主线、三级标题、关键论据、案例建议和结尾行动引导。",
    negativePrompt: "不要使用夸张标题党，不要输出重复段落。",
    tags: ["写作指南", "内容策略", "文本生成器"],
    createdAt: "2026-07-04T08:00:00.000Z",
    updatedAt: seedUpdatedAt,
  },
  {
    id: "00000000-0000-4000-8000-000000000106",
    title: "商业计划快速评审",
    imageFileName: "00000000-0000-4000-8000-000000000106.png",
    prompt:
      "你是一名冷静的商业分析师。请评审【商业想法】的可行性，按目标用户、真实痛点、替代方案、收入模式、获客路径、关键风险和最小验证实验输出。",
    negativePrompt: "不要只给正面评价，必须指出最可能失败的原因。",
    tags: ["商业计划", "创业分析", "决策辅助"],
    createdAt: "2026-07-04T07:30:00.000Z",
    updatedAt: seedUpdatedAt,
  },
  {
    id: "00000000-0000-4000-8000-000000000107",
    title: "社交媒体内容日历",
    imageFileName: "00000000-0000-4000-8000-000000000107.png",
    prompt:
      "请为【品牌/个人账号】设计 14 天中文社交媒体内容日历，包含每日主题、标题方向、正文要点、互动问题、配图建议和复盘指标。",
    negativePrompt: "不要生成不可执行的宏大策略，避免同质化选题。",
    tags: ["社交媒体", "品牌营销", "内容策略"],
    createdAt: "2026-07-04T07:00:00.000Z",
    updatedAt: seedUpdatedAt,
  },
  {
    id: "00000000-0000-4000-8000-000000000108",
    title: "产品需求拆解模板",
    imageFileName: "00000000-0000-4000-8000-000000000108.png",
    prompt:
      "你是一名产品经理。请把【需求描述】拆解成可开发的需求文档，包含用户场景、目标、非目标、功能清单、状态流转、异常情况、验收标准和优先级建议。",
    negativePrompt: "不要跳过边界情况，不要把未确认的需求当成事实。",
    tags: ["产品设计", "需求分析", "项目管理"],
    createdAt: "2026-07-04T06:30:00.000Z",
    updatedAt: seedUpdatedAt,
  },
  {
    id: "00000000-0000-4000-8000-000000000109",
    title: "图像生成提示词优化",
    imageFileName: "00000000-0000-4000-8000-000000000109.png",
    prompt:
      "请把【画面想法】改写成高质量图像生成提示词，包含主体、构图、镜头、光线、材质、色彩、背景、氛围和质量描述，并给出可选风格版本。",
    negativePrompt: "低清晰度、畸形结构、多余文字、过曝、脏污背景、主体缺失。",
    tags: ["图像生成", "视觉风格", "提示词工程"],
    createdAt: "2026-07-04T06:00:00.000Z",
    updatedAt: seedUpdatedAt,
  },
  {
    id: "00000000-0000-4000-8000-000000000110",
    title: "客服回复质量提升",
    imageFileName: "00000000-0000-4000-8000-000000000110.png",
    prompt:
      "请把【用户问题】改写成专业、克制、友好的中文客服回复。需要先确认用户诉求，再解释处理路径，最后给出下一步操作，语气真诚但不承诺无法保证的结果。",
    negativePrompt: "不要责备用户，不要暴露内部流程，不要承诺未确认的赔偿。",
    tags: ["客服运营", "沟通表达", "效率工具"],
    createdAt: "2026-07-04T05:30:00.000Z",
    updatedAt: seedUpdatedAt,
  },
  {
    id: "00000000-0000-4000-8000-000000000111",
    title: "数据分析结论解释器",
    imageFileName: "00000000-0000-4000-8000-000000000111.png",
    prompt:
      "你是一名数据分析师。请根据【数据现象】【指标变化】【业务背景】输出中文分析结论，包含可能原因、验证路径、影响范围、建议动作和需要补充的数据。",
    negativePrompt: "不要把相关性直接说成因果关系，不要隐藏不确定性。",
    tags: ["数据分析", "决策辅助", "商业计划"],
    createdAt: "2026-07-04T05:00:00.000Z",
    updatedAt: seedUpdatedAt,
  },
  {
    id: "00000000-0000-4000-8000-000000000112",
    title: "会议纪要行动清单",
    imageFileName: "00000000-0000-4000-8000-000000000112.png",
    prompt:
      "请把【会议记录】整理为中文会议纪要，输出会议目标、关键结论、待办事项、负责人、截止时间、风险点和下次会议需要确认的问题。",
    negativePrompt: "不要添加会议中没有出现的决定，不要遗漏责任人和时间。",
    tags: ["项目管理", "文本生成器", "效率工具"],
    createdAt: "2026-07-04T04:30:00.000Z",
    updatedAt: seedUpdatedAt,
  },
];

const seedImagePalettes: SeedImagePalette[] = [
  { imageFileName: "00000000-0000-4000-8000-000000000101.png", from: [49, 89, 81], to: [221, 98, 76], accent: [251, 214, 119] },
  { imageFileName: "00000000-0000-4000-8000-000000000102.png", from: [45, 80, 126], to: [94, 171, 161], accent: [245, 197, 93] },
  { imageFileName: "00000000-0000-4000-8000-000000000103.png", from: [64, 72, 92], to: [211, 132, 95], accent: [132, 202, 184] },
  { imageFileName: "00000000-0000-4000-8000-000000000104.png", from: [63, 58, 111], to: [172, 84, 118], accent: [236, 191, 105] },
  { imageFileName: "00000000-0000-4000-8000-000000000105.png", from: [46, 96, 113], to: [230, 145, 86], accent: [238, 220, 145] },
  { imageFileName: "00000000-0000-4000-8000-000000000106.png", from: [57, 75, 62], to: [171, 117, 72], accent: [123, 190, 148] },
  { imageFileName: "00000000-0000-4000-8000-000000000107.png", from: [50, 76, 130], to: [204, 89, 117], accent: [94, 200, 205] },
  { imageFileName: "00000000-0000-4000-8000-000000000108.png", from: [72, 82, 92], to: [80, 143, 138], accent: [242, 181, 92] },
  { imageFileName: "00000000-0000-4000-8000-000000000109.png", from: [42, 69, 101], to: [188, 92, 79], accent: [233, 214, 154] },
  { imageFileName: "00000000-0000-4000-8000-000000000110.png", from: [53, 91, 89], to: [146, 125, 178], accent: [246, 190, 103] },
  { imageFileName: "00000000-0000-4000-8000-000000000111.png", from: [44, 76, 102], to: [104, 154, 101], accent: [235, 177, 87] },
  { imageFileName: "00000000-0000-4000-8000-000000000112.png", from: [67, 76, 98], to: [185, 108, 89], accent: [127, 198, 176] },
];

export function shouldEnableDefaultLibrarySeed(enableSeedEnv: string | undefined = process.env.PROMPT_LIBRARY_ENABLE_SEED): boolean {
  return enableSeedEnv === "true";
}

export function createDefaultLibrary(): LibraryFile {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    items: defaultLibrarySeedItems.map((item) => ({
      ...item,
      tags: [...item.tags],
    })),
  };
}

export function getDefaultSeedImageFileNames(): string[] {
  return seedImagePalettes.map((palette) => palette.imageFileName);
}

export function createDefaultSeedImage(imageFileName: string): Buffer {
  const paletteIndex = seedImagePalettes.findIndex((palette) => palette.imageFileName === imageFileName);
  const palette = seedImagePalettes[paletteIndex];

  if (!palette) {
    throw new Error(`Unknown default seed image: ${imageFileName}`);
  }

  return createPatternPng(480, 320, palette, paletteIndex);
}

export function createImportedPromptPlaceholderImage(seedText: string): Buffer {
  const paletteIndex = positiveModulo(hashText(seedText), seedImagePalettes.length);
  const palette = seedImagePalettes[paletteIndex];

  return createPatternPng(480, 480, palette, paletteIndex + seedText.length);
}

function createPatternPng(width: number, height: number, palette: SeedImagePalette, paletteIndex: number): Buffer {
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel + 1;
  const raw = Buffer.alloc(stride * height);
  const centerX = width * (0.64 - (paletteIndex % 3) * 0.08);
  const centerY = height * (0.38 + (paletteIndex % 4) * 0.06);
  const radius = 78 + (paletteIndex % 5) * 12;

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * stride;
    raw[rowStart] = 0;

    for (let x = 0; x < width; x += 1) {
      const offset = rowStart + 1 + x * bytesPerPixel;
      const mixRatio = (x / width) * 0.56 + (y / height) * 0.44;
      const wave = Math.sin((x + y + paletteIndex * 31) / 28) * 9;
      let red = lerp(palette.from[0], palette.to[0], mixRatio) + wave;
      let green = lerp(palette.from[1], palette.to[1], mixRatio) + wave;
      let blue = lerp(palette.from[2], palette.to[2], mixRatio) + wave;
      const diagonal = positiveModulo(x - y + paletteIndex * 18, 96);
      const distance = Math.hypot(x - centerX, y - centerY);

      if (diagonal < 18) {
        [red, green, blue] = blend([red, green, blue], palette.accent, 0.18);
      }

      if (distance < radius) {
        const strength = 0.28 * (1 - distance / radius);
        [red, green, blue] = blend([red, green, blue], palette.accent, strength);
      }

      if (x > width * 0.1 && x < width * 0.9 && y > height * 0.72 && y < height * 0.76) {
        [red, green, blue] = blend([red, green, blue], [255, 255, 255], 0.32);
      }

      raw[offset] = clampColor(red);
      raw[offset + 1] = clampColor(green);
      raw[offset + 2] = clampColor(blue);
      raw[offset + 3] = 255;
    }
  }

  return encodePng(width, height, raw);
}

function encodePng(width: number, height: number, rawRgbaRows: Buffer): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);

  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    createPngChunk("IHDR", ihdr),
    createPngChunk("IDAT", zlib.deflateSync(rawRgbaRows)),
    createPngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function createPngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);

  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

function blend(
  base: readonly [number, number, number],
  overlay: readonly [number, number, number],
  amount: number,
): [number, number, number] {
  return [
    lerp(base[0], overlay[0], amount),
    lerp(base[1], overlay[1], amount),
    lerp(base[2], overlay[2], amount),
  ];
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function clampColor(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function hashText(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
