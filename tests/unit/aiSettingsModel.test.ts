import { describe, expect, it } from "vitest";
import {
  aiFeatureActionMeta,
  aiFeatureActions,
} from "../../src/features/library/types/ai";
import { aiSettingsGeneralActions } from "../../src/features/library/utils/aiSettingsDraft";
import { aiSettingsActionEntries, resolveAiSettingsEntryAction } from "../../src/features/library/components/aiSettingsDialogData";
import {
  defaultAiProviderSettings,
  mergeAiProviderSettingsPayload,
  normalizeAiSettingsActionOrder,
  normalizeAiProviderSettings,
  resolveAiActionCustomInstructions,
  toPersistedAiSettingsFile,
  toPublicAiProviderSettings,
} from "../../electron/main/ai/aiSettingsModel";

const model = (id: string, capabilities: ("text" | "vision")[] = ["text", "vision"]) => ({
  id,
  label: id,
  capabilities,
});

describe("aiSettingsModel", () => {
  it("defines editable rule presets for every AI action", () => {
    for (const action of aiFeatureActions) {
      expect(aiFeatureActionMeta[action].defaultRulePreset.label).toBeTruthy();
      expect(aiFeatureActionMeta[action].defaultRulePreset.instructions.length).toBeGreaterThan(20);
      // image-generation 为模型选择型动作，rulePresets 仅作辅助说明，不强制结构化预设
      if (action === "image-generation") {
        expect(aiFeatureActionMeta[action].rulePresets.length).toBe(1);
      } else {
        expect(aiFeatureActionMeta[action].rulePresets.length).toBeGreaterThanOrEqual(3);
      }
      expect(aiFeatureActionMeta[action].rulePresets.every((preset) => preset.id && preset.instructions)).toBe(true);
      expect(new Set(aiFeatureActionMeta[action].rulePresets.map((preset) => preset.id)).size).toBe(
        aiFeatureActionMeta[action].rulePresets.length,
      );
    }
  });

  it("persists a user-defined AI settings entry order without duplicates", () => {
    const order = normalizeAiSettingsActionOrder([
      "image-generation",
      "prompt-optimization",
      "image-generation",
      "prompt-optimization",
    ]);
    expect(order).toEqual(["image-generation", "prompt-optimization"]);

    const profile = defaultAiProviderSettings.profiles[0];
    const settings = mergeAiProviderSettingsPayload(defaultAiProviderSettings, {
      activeProfileId: profile.id,
      actionOrder: order,
      profiles: [
        {
          id: profile.id,
          name: profile.name,
          enabled: profile.enabled,
          baseUrl: profile.baseUrl,
          model: profile.model,
          models: profile.models,
        },
      ],
    });

    expect(settings.actionOrder).toEqual(order);
    expect(toPublicAiProviderSettings(settings).actionOrder).toEqual(order);
    expect(toPersistedAiSettingsFile(settings, () => "").actionOrder).toEqual(order);
  });

  it("keeps every preset rule in the structured rule format", () => {
    for (const action of aiFeatureActions) {
      // image-generation 是模型选择动作，其 rulePresets 仅为辅助说明，不走结构化格式
      if (action === "image-generation") {
        continue;
      }
      for (const preset of aiFeatureActionMeta[action].rulePresets) {
        expect(preset.instructions).toContain("=====");
        expect(preset.instructions).toContain("【核心宗旨】");
        expect(preset.instructions).toContain("输出格式");
        expect(preset.instructions).toContain("核心约束");
      }
    }
  });

  it("exposes prompt optimization as a visible settings action", () => {
    expect(aiSettingsGeneralActions).toContain("prompt-optimization");
    expect(aiFeatureActionMeta["prompt-optimization"].label).toBe("提示词优化");
    expect(aiFeatureActionMeta["prompt-optimization"].description).toContain("优化结构");
  });

  it("applies the default rule when an action has no explicit rule selection", () => {
    const instructions = resolveAiActionCustomInstructions(defaultAiProviderSettings, "prompt-optimization");

    expect(instructions).toContain("【提示词优化-通用】");
    expect(instructions).toContain("提示词优化-通用规则");
  });

  it("includes the portrait pixel reverse rule for image reverse", () => {
    const portraitRule = aiFeatureActionMeta["image-reverse"].rulePresets.find((preset) => preset.id === "pixel-reverse");

    expect(portraitRule?.label).toBe("人像像素级反推");
    expect(portraitRule?.instructions).toContain("全局像素级图像反推规则（EcomPhotoForge）");
    expect(portraitRule?.instructions).toContain("人物主体像素级拆解");
    expect(portraitRule?.instructions).toContain("末尾必须附带“--ar X:Y”参数");
    expect(portraitRule?.instructions).toContain("可见界面来源元素");
  });

  it("includes the Adan pixel description rule for image reverse", () => {
    const adanRule = aiFeatureActionMeta["image-reverse"].rulePresets.find(
      (preset) => preset.id === "adan-pixel-description",
    );

    expect(adanRule?.label).toBe("图像反推-像素级描述（by:阿丹）");
    expect(adanRule?.instructions).toContain("Nano Banana Pro");
    expect(adanRule?.instructions).toContain("全要素提取");
    expect(adanRule?.instructions).toContain("去水印机制");
    expect(adanRule?.instructions).toContain("作者头像");
    expect(adanRule?.instructions).toContain("双模态输入判断");
  });

  it("includes the Detail Caption rule for image reverse", () => {
    const detailCaptionRule = aiFeatureActionMeta["image-reverse"].rulePresets.find(
      (preset) => preset.id === "detail-caption",
    );

    expect(detailCaptionRule?.label).toBe("图像反推-Detail Caption");
    expect(detailCaptionRule?.instructions).toContain("professional AI Image Prompt and Reverse Engineering Expert");
    expect(detailCaptionRule?.instructions).toContain("Final prompts must be in English");
    expect(detailCaptionRule?.instructions).toContain("Style, Core Elements, Specific Content, and Text Information");
    expect(detailCaptionRule?.instructions).toContain("Anti-Watermark Mechanism");
    expect(detailCaptionRule?.instructions).toContain("visible source chips");
  });

  it("uses evidence-based entity tags and excludes source UI metadata", () => {
    const tagRule = aiFeatureActionMeta["image-tags"].rulePresets.find((preset) => preset.id === "concrete-image-tags");

    expect(tagRule?.label).toBe("具体标签");
    expect(tagRule?.instructions).toContain("来源头像");
    expect(tagRule?.instructions).toContain("不提取水印、来源头像、网站图标、平台名称");
    expect(tagRule?.instructions).toContain("dimension、confidence");
    expect(tagRule?.instructions).toContain("红叶/黄叶/绿叶保留差异");
  });

  it("includes the CJL image-to-video prompt rule for image reverse", () => {
    const cjlRule = aiFeatureActionMeta["image-reverse"].rulePresets.find(
      (preset) => preset.id === "cjl-image-to-video",
    );

    expect(cjlRule?.label).toBe("图像反推-图像到视频提示词（by:CJL）");
    expect(cjlRule?.instructions).toContain("Wan、Kling、Sora");
    expect(cjlRule?.instructions).toContain("初始姿态 -> 关键过渡帧 -> 核心高潮动作");
    expect(cjlRule?.instructions).toContain("服饰褶皱动态适配");
    expect(cjlRule?.instructions).toContain("[全景环境与运镜] + [核心动作链条] + [服饰与惯性物理细节] + [表情与氛围]");
  });

  it("uses an independent prompt optimization rule as the visible default preset", () => {
    const generalRule = aiFeatureActionMeta["prompt-optimization"].rulePresets.find(
      (preset) => preset.id === "prompt-optimization-general",
    );
    const legacyRule = aiFeatureActionMeta["prompt-optimization"].rulePresets.find(
      (preset) => preset.id === "prompt-optimization-general-legacy",
    );

    expect(generalRule?.label).toBe("提示词优化-通用");
    expect(generalRule?.instructions).toContain("提示词优化-通用规则");
    expect(generalRule?.instructions).toContain("最少必要的视觉控制");
    expect(generalRule?.instructions).toContain("只输出优化后的提示词正文");
    expect(generalRule?.instructions.length).toBeLessThan(5200);
    expect(generalRule?.instructions).not.toContain("【一】优化后提示词");
    expect(generalRule?.instructions).not.toContain("【二】参数胶囊结构");
    expect(generalRule?.instructions).not.toContain("fixed_core、high_value、mid_low_value、negative");
    expect(legacyRule?.label).toBe("提示词优化-通用（旧版）");
    expect(legacyRule?.instructions).toContain("语言自适应");
    expect(legacyRule?.instructions).toContain("领域侧重点判定");
    expect(legacyRule?.instructions).toContain("严禁跨领域混用术语");
  });

  it("normalizes saved prompt optimization defaults back to the independent preset", () => {
    const settings = normalizeAiProviderSettings({
      activeProfileId: "main",
      actionPreferences: {
        "prompt-optimization": {
          rules: [
            {
              id: "prompt-optimization-general",
              label: "提示词优化-通用",
              instructions: "语言自适应。领域侧重点判定。严禁跨领域混用术语。最终只输出优化后的提示词正文。",
            },
          ],
          rulePresetIds: ["prompt-optimization-general"],
        },
      },
      profiles: [
        {
          id: "main",
          name: "主接口",
          enabled: true,
          baseUrl: "https://api.example.com/v1",
          apiKey: "sk-main",
          model: "text-model",
          models: [model("text-model", ["text"])],
        },
      ],
    });
    const promptOptimizationPreference = settings.actionPreferences["prompt-optimization"];
    const rules = promptOptimizationPreference?.rules ?? [];

    expect(promptOptimizationPreference?.rulePresetIds).toEqual(["prompt-optimization-general"]);
    expect(rules[0]?.id).toBe("prompt-optimization-general");
    expect(rules[0]?.label).toBe("提示词优化-通用");
    expect(rules[0]?.instructions).toContain("只输出优化后的提示词正文");
    expect(rules[0]?.instructions).not.toContain("【二】参数胶囊结构");
    expect(rules).toHaveLength(1);
  });

  it("keeps prompt optimization presets compact and reliable", () => {
    const defaultInstructions = aiFeatureActionMeta["prompt-optimization"].defaultRulePreset.instructions;

    expect(defaultInstructions.length).toBeLessThan(5200);

    for (const preset of aiFeatureActionMeta["prompt-optimization"].rulePresets) {
      expect(preset.instructions).toContain("提示词优化与结构化换行");
      expect(preset.instructions).toContain("题材自适应简表");
      expect(preset.instructions).toContain("最终只输出优化后的提示词正文");
      expect(preset.instructions.length).toBeLessThan(7600);
      expect(preset.instructions).not.toContain("复杂叙事型 Prompt 重排");
      expect(preset.instructions).not.toContain("食品产品广告 Prompt 模板化");
      expect(preset.instructions).not.toContain("【二】参数胶囊结构");
      expect(preset.instructions).not.toContain("fixed_core、high_value、mid_low_value、negative");
    }
  });
  it("includes the portrait master prompt optimization preset", () => {
    const portraitMasterRule = aiFeatureActionMeta["prompt-optimization"].rulePresets.find(
      (preset) => preset.id === "prompt-optimization-portrait-master",
    );

    expect(portraitMasterRule?.label).toBe("提示词优化-人像大师");
    expect(portraitMasterRule?.instructions).toContain("人像摄影提示词专家");
    expect(portraitMasterRule?.instructions).toContain("影楼写真、街拍潮流、手机自拍、古装文化、人文故事");
    expect(portraitMasterRule?.instructions).toContain("皮肤与质感");
    expect(portraitMasterRule?.instructions).toContain("最终结果应为 3-5 个细节丰富的长句");
  });

  it("includes the video prompt optimization preset", () => {
    const videoRule = aiFeatureActionMeta["prompt-optimization"].rulePresets.find(
      (preset) => preset.id === "prompt-optimization-video",
    );

    expect(videoRule?.label).toBe("提示词优化-视频");
    expect(videoRule?.instructions).toContain("通义万相 Wan 2.1");
    expect(videoRule?.instructions).toContain("[主体] + [场景] + [运动] + [美学控制] + [风格化]");
    expect(videoRule?.instructions).toContain("动态物理逻辑");
    expect(videoRule?.instructions).toContain("主体描述 -> 场景描述 -> 运动描述 -> 美学与灯光 -> 风格总结");
  });

  it("includes the Chinese detail prompt optimization preset", () => {
    const detailRule = aiFeatureActionMeta["prompt-optimization"].rulePresets.find(
      (preset) => preset.id === "prompt-optimization-detail-cn",
    );

    expect(detailRule?.label).toBe("提示词优化-细节优化（中文）");
    expect(detailRule?.instructions).toContain("资深视觉艺术总监");
    expect(detailRule?.instructions).toContain("莹润肌肤与精致细节");
    expect(detailRule?.instructions).toContain("全部输出为中文");
    expect(detailRule?.instructions).toContain("editorial portrait");
  });

  it("masks the API key in public settings", () => {
    expect(
      toPublicAiProviderSettings({
        activeProfileId: "main",
        actionPreferences: {},
        recognitionSourcePreferences: {},
        profiles: [
          {
            id: "main",
            name: "主接口",
            enabled: true,
            baseUrl: "https://api.example.com/v1",
            apiKey: "sk-test",
            model: "test-model",
            models: [model("test-model")],
          },
        ],
      }),
    ).toEqual({
      activeProfileId: "main",
      actionPreferences: {},
      recognitionSourcePreferences: {},
      profiles: [
        {
          id: "main",
          name: "主接口",
          enabled: true,
          baseUrl: "https://api.example.com/v1",
          hasApiKey: true,
          apiKeyPreview: "sk****st",
          model: "test-model",
          models: [model("test-model")],
        },
      ],
      enabled: true,
      baseUrl: "https://api.example.com/v1",
      hasApiKey: true,
      apiKeyPreview: "sk****st",
      model: "test-model",
    });
  });

  it("preserves an existing key when saving without a new key", () => {
    expect(
      mergeAiProviderSettingsPayload(
        {
          activeProfileId: "main",
          actionPreferences: {},
          recognitionSourcePreferences: {},
          profiles: [
            {
              id: "main",
              name: "主接口",
              enabled: false,
              baseUrl: "https://api.example.com/v1",
              apiKey: "sk-existing",
              model: "old-model",
              models: [model("old-model")],
            },
          ],
        },
        {
          activeProfileId: "main",
          actionPreferences: {},
          recognitionSourcePreferences: {},
          profiles: [
            {
              id: "main",
              name: "主接口",
              enabled: true,
              baseUrl: "https://api.example.com/v1",
              model: "new-model",
              models: [model("new-model")],
            },
          ],
        },
      ),
    ).toEqual({
      activeProfileId: "main",
      actionPreferences: {},
      recognitionSourcePreferences: {},
      profiles: [
        {
          id: "main",
          name: "主接口",
          enabled: true,
          baseUrl: "https://api.example.com/v1",
          apiKey: "sk-existing",
          model: "new-model",
          models: [model("new-model")],
        },
      ],
    });
  });

  it("does not block saves on incomplete profiles", () => {
    expect(
      mergeAiProviderSettingsPayload(defaultAiProviderSettings, {
        activeProfileId: "default",
        profiles: [
          {
            id: "default",
            name: "默认 API",
            enabled: false,
            baseUrl: "",
            model: "",
            models: [],
            clearApiKey: true,
          },
        ],
      }).profiles[0].enabled,
    ).toBe(false);

    // mergeAiProviderSettingsPayload no longer validates per-profile completeness
    // in the save path — incomplete enabled profiles are allowed to pass through
    // so saves on other profiles are not blocked. Validation is enforced in the
    // import/merge path (aiSettingsMerge.ts) and connection test / model query
    // paths (resolveAiProviderSettingsForPayload).
    const result = mergeAiProviderSettingsPayload(defaultAiProviderSettings, {
      activeProfileId: "default",
      profiles: [
        {
          id: "default",
          name: "默认 API",
          enabled: true,
          baseUrl: "https://api.example.com/v1",
          model: "test-model",
          models: [model("test-model")],
        },
      ],
    });
    expect(result.profiles[0].enabled).toBe(true);
    expect(result.profiles[0].apiKey).toBe("");
  });

  it("persists only encrypted API keys", () => {
    expect(
      toPersistedAiSettingsFile(
        {
          activeProfileId: "main",
          actionPreferences: {},
          recognitionSourcePreferences: {},
          profiles: [
            {
              id: "main",
              name: "主接口",
              enabled: true,
              baseUrl: "https://api.example.com/v1",
              apiKey: "sk-secret",
              model: "test-model",
              models: [model("test-model")],
            },
          ],
        },
        (apiKey) => `encrypted:${apiKey.length}`,
      ),
    ).toEqual({
      schemaVersion: 3,
      activeProfileId: "main",
      actionPreferences: {},
      recognitionSourcePreferences: {},
      profiles: [
        {
          id: "main",
          name: "主接口",
          enabled: true,
          baseUrl: "https://api.example.com/v1",
          model: "test-model",
          models: [model("test-model")],
          apiKeyEncrypted: "encrypted:9",
        },
      ],
    });
  });

  it("does not fall back to plaintext when key encryption is unavailable", () => {
    expect(() =>
      toPersistedAiSettingsFile(
        {
          activeProfileId: "main",
          actionPreferences: {},
          recognitionSourcePreferences: {},
          profiles: [
            {
              id: "main",
              name: "主接口",
              enabled: true,
              baseUrl: "https://api.example.com/v1",
              apiKey: "sk-secret",
              model: "test-model",
              models: [model("test-model")],
            },
          ],
        },
        () => "",
      ),
    ).toThrow("当前系统无法安全保存 API Key");
  });

  it("persists and exposes action-level AI preferences", () => {
    const settings = mergeAiProviderSettingsPayload(
      {
        activeProfileId: "main",
        actionPreferences: {},
        recognitionSourcePreferences: {},
        profiles: [
          {
            id: "main",
            name: "主接口",
            enabled: true,
            baseUrl: "https://api.example.com/v1",
            apiKey: "sk-main",
            model: "text-model",
            models: [model("text-model", ["text"]), model("vision-model", ["vision"])],
          },
        ],
      },
      {
        activeProfileId: "main",
        actionPreferences: {
          "image-reverse": {
            profileId: "main",
            modelId: "vision-model",
            customInstructions: "按主体、场景、光影、镜头顺序反推。",
          },
        },
        profiles: [
          {
            id: "main",
            name: "主接口",
            enabled: true,
            baseUrl: "https://api.example.com/v1",
            model: "text-model",
            models: [model("text-model", ["text"]), model("vision-model", ["vision"])],
          },
        ],
      },
    );

    expect(toPublicAiProviderSettings(settings).actionPreferences["image-reverse"]).toEqual({
      profileId: "main",
      modelId: "vision-model",
      customInstructions: "按主体、场景、光影、镜头顺序反推。",
    });
    expect(toPersistedAiSettingsFile(settings, (apiKey) => `encrypted:${apiKey.length}`).actionPreferences).toEqual({
      "image-reverse": {
        profileId: "main",
        modelId: "vision-model",
        customInstructions: "按主体、场景、光影、镜头顺序反推。",
      },
    });
  });

  it("persists quick recognition source preferences", () => {
    const settings = mergeAiProviderSettingsPayload(
      {
        activeProfileId: "main",
        actionPreferences: {},
        recognitionSourcePreferences: {},
        profiles: [
          {
            id: "main",
            name: "主接口",
            enabled: true,
            baseUrl: "https://api.example.com/v1",
            apiKey: "sk-main",
            model: "vision-model",
            models: [model("vision-model", ["vision"])],
          },
        ],
      },
      {
        activeProfileId: "main",
        recognitionSourcePreferences: {
          category: "image",
          tags: "prompt",
        },
        profiles: [
          {
            id: "main",
            name: "主接口",
            enabled: true,
            baseUrl: "https://api.example.com/v1",
            model: "vision-model",
            models: [model("vision-model", ["vision"])],
          },
        ],
      },
    );

    expect(toPublicAiProviderSettings(settings).recognitionSourcePreferences).toEqual({
      category: "image",
      tags: "prompt",
    });
    expect(
      toPersistedAiSettingsFile(settings, (apiKey) => `encrypted:${apiKey.length}`).recognitionSourcePreferences,
    ).toEqual({
      category: "image",
      tags: "prompt",
    });
    const reloaded = toPublicAiProviderSettings(normalizeAiProviderSettings(JSON.parse(JSON.stringify(
      toPersistedAiSettingsFile(settings, (apiKey) => `encrypted:${apiKey.length}`),
    ))));
    expect(resolveAiSettingsEntryAction(aiSettingsActionEntries[0]!, "image-reverse", reloaded.recognitionSourcePreferences)).toBe("image-category");
    expect(resolveAiSettingsEntryAction(aiSettingsActionEntries[1]!, "image-category", reloaded.recognitionSourcePreferences)).toBe("prompt-tags");
  });

  it("persists selected rule presets and combines them with custom instructions", () => {
    const settings = mergeAiProviderSettingsPayload(
      {
        activeProfileId: "main",
        actionPreferences: {},
        recognitionSourcePreferences: {},
        profiles: [
          {
            id: "main",
            name: "主接口",
            enabled: true,
            baseUrl: "https://api.example.com/v1",
            apiKey: "sk-main",
            model: "vision-model",
            models: [model("vision-model", ["vision"])],
          },
        ],
      },
      {
        activeProfileId: "main",
        actionPreferences: {
          "image-reverse": {
            profileId: "main",
            modelId: "vision-model",
            rulePresetIds: ["pixel-reverse", "visible-only", "unknown-preset"],
            customInstructions: "补充：输出更偏中文长提示词。",
          },
        },
        profiles: [
          {
            id: "main",
            name: "主接口",
            enabled: true,
            baseUrl: "https://api.example.com/v1",
            model: "vision-model",
            models: [model("vision-model", ["vision"])],
          },
        ],
      },
    );

    expect(toPublicAiProviderSettings(settings).actionPreferences["image-reverse"]).toMatchObject({
      rulePresetIds: ["pixel-reverse", "visible-only"],
      customInstructions: "补充：输出更偏中文长提示词。",
    });
    expect(resolveAiActionCustomInstructions(settings, "image-reverse")).toContain("【人像像素级反推】");
    expect(resolveAiActionCustomInstructions(settings, "image-reverse")).toContain("人物受光专项");
    expect(resolveAiActionCustomInstructions(settings, "image-reverse")).toContain("【只写可见事实】");
    expect(resolveAiActionCustomInstructions(settings, "image-reverse")).toContain("补充：输出更偏中文长提示词。");
  });

  it("honors explicit runtime rule overrides including an empty rule selection", () => {
    const settings = mergeAiProviderSettingsPayload(
      {
        activeProfileId: "main",
        actionPreferences: {},
        recognitionSourcePreferences: {},
        profiles: [
          {
            id: "main",
            name: "主接口",
            enabled: true,
            baseUrl: "https://api.example.com/v1",
            apiKey: "sk-main",
            model: "vision-model",
            models: [model("vision-model", ["vision"])],
          },
        ],
      },
      {
        activeProfileId: "main",
        actionPreferences: {
          "image-reverse": {
            profileId: "main",
            modelId: "vision-model",
            rulePresetIds: ["pixel-reverse"],
          },
        },
        profiles: [
          {
            id: "main",
            name: "主接口",
            enabled: true,
            baseUrl: "https://api.example.com/v1",
            model: "vision-model",
            models: [model("vision-model", ["vision"])],
          },
        ],
      },
    );

    expect(resolveAiActionCustomInstructions(settings, "image-reverse")).toContain("【人像像素级反推】");
    expect(resolveAiActionCustomInstructions(settings, "image-reverse", "本次只输出一句中文提示词。")).toBe(
      "本次只输出一句中文提示词。",
    );
    expect(resolveAiActionCustomInstructions(settings, "image-reverse", "")).toBe("");
  });

  it("persists editable action rule lists and uses selected custom rules", () => {
    const settings = mergeAiProviderSettingsPayload(
      {
        activeProfileId: "main",
        actionPreferences: {},
        recognitionSourcePreferences: {},
        profiles: [
          {
            id: "main",
            name: "主接口",
            enabled: true,
            baseUrl: "https://api.example.com/v1",
            apiKey: "sk-main",
            model: "vision-model",
            models: [model("vision-model", ["vision"])],
          },
        ],
      },
      {
        activeProfileId: "main",
        actionPreferences: {
          "image-reverse": {
            profileId: "main",
            modelId: "vision-model",
            rules: [
              {
                id: "cn-detail",
                label: "中文细节反推",
                instructions: "使用中文长句描述主体、服装、场景、光影和镜头参数。",
              },
              {
                id: "short-tags",
                label: "短标签反推",
                instructions: "只输出短标签，不输出长句。",
              },
            ],
            rulePresetIds: ["cn-detail"],
          },
        },
        profiles: [
          {
            id: "main",
            name: "主接口",
            enabled: true,
            baseUrl: "https://api.example.com/v1",
            model: "vision-model",
            models: [model("vision-model", ["vision"])],
          },
        ],
      },
    );

    expect(toPublicAiProviderSettings(settings).actionPreferences["image-reverse"]?.rules).toHaveLength(2);
    expect(resolveAiActionCustomInstructions(settings, "image-reverse")).toContain("【中文细节反推】");
    expect(resolveAiActionCustomInstructions(settings, "image-reverse")).not.toContain("【短标签反推】");
  });

  it("migrates legacy single API settings into a default profile", () => {
    expect(
      normalizeAiProviderSettings({
        enabled: true,
        baseUrl: "https://legacy.example.com/v1",
        apiKey: "sk-legacy",
        model: "legacy-model",
      }),
    ).toEqual({
      activeProfileId: "default",
      actionPreferences: {},
      recognitionSourcePreferences: {},
      profiles: [
        {
          id: "default",
          name: "默认 API",
          enabled: true,
          baseUrl: "https://legacy.example.com/v1",
          apiKey: "sk-legacy",
          model: "legacy-model",
          models: [model("legacy-model")],
        },
      ],
    });
  });
});
