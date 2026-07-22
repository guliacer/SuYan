import { describe, expect, it } from "vitest";
import { aiFeatureActionMeta, aiFeatureActions } from "../../src/features/library/types/ai";
import { aiSettingsGeneralActions } from "../../src/features/library/utils/aiSettingsDraft";
import {
  defaultAiProviderSettings,
  mergeAiProviderSettingsPayload,
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
      if (action === "prompt") {
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

  it("keeps every preset rule in the structured rule format", () => {
    for (const action of aiFeatureActions) {
      for (const preset of aiFeatureActionMeta[action].rulePresets) {
        expect(preset.instructions).toContain("=====");
        expect(preset.instructions).toContain("【核心宗旨】");
        expect(preset.instructions).toContain("输出格式");
        expect(preset.instructions).toContain("核心约束");
      }
    }
  });

  it("uses the structured analysis rule as the default prompt analysis preset", () => {
    const promptMeta = aiFeatureActionMeta.prompt;

    expect(promptMeta.defaultRulePreset.id).toBe("prompt-structured-analysis");
    expect(promptMeta.defaultRulePreset.label).toBe("结构化提示词分析");
    expect(promptMeta.rulePresets.map((preset) => preset.label)).toEqual(["结构化提示词分析"]);
    expect(promptMeta.defaultRulePreset.instructions.length).toBeLessThan(4200);
    expect(promptMeta.defaultRulePreset.instructions).toContain("多维度结构化分析方法");
    expect(promptMeta.defaultRulePreset.instructions).toContain("普通分析最多 10 个胶囊");
    expect(promptMeta.defaultRulePreset.instructions).toContain("只返回系统要求的 JSON");
    expect(promptMeta.defaultRulePreset.instructions).toContain("不得臆造原文没有的主体");
    expect(promptMeta.defaultRulePreset.instructions).toContain("Role-Background-Attention");
  });

  it("exposes prompt optimization and prompt parameter analysis as separate visible settings actions", () => {
    expect(aiSettingsGeneralActions).toContain("prompt");
    expect(aiSettingsGeneralActions).toContain("prompt-optimization");
    expect(aiFeatureActionMeta["prompt-optimization"].label).toBe("提示词优化");
    expect(aiFeatureActionMeta["prompt-optimization"].description).toContain("优化结构");
    expect(aiFeatureActionMeta.prompt.label).toBe("提示词参数分析");
    expect(aiFeatureActionMeta.prompt.description).toContain("拆解胶囊");
  });

  it("applies the default rule when an action has no explicit rule selection", () => {
    const instructions = resolveAiActionCustomInstructions(defaultAiProviderSettings, "prompt");

    expect(instructions).toContain("【结构化提示词分析】");
    expect(instructions).toContain("结构化提示词分析规则");
    expect(instructions.length).toBeLessThan(4200);
  });

  it("migrates saved legacy prompt analysis defaults to the reliable compact preset", () => {
    const settings = normalizeAiProviderSettings({
      activeProfileId: "main",
      actionPreferences: {
        prompt: {
          rules: [
            {
              id: "prompt-parameterization-system",
              label: "提示词分析-参数化系统",
              instructions: "旧版长规则。复杂叙事型 Prompt 胶囊边界。foodPhysicalForm: foodPhysicalForm:",
            },
          ],
          rulePresetIds: ["prompt-parameterization-system"],
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
    const promptPreference = settings.actionPreferences.prompt;
    const rules = promptPreference?.rules ?? [];

    expect(promptPreference?.rulePresetIds).toEqual(["prompt-structured-analysis"]);
    expect(rules[0]?.id).toBe("prompt-structured-analysis");
    expect(rules[0]?.label).toBe("结构化提示词分析");
    expect(rules[0]?.instructions.length).toBeLessThan(3600);
    expect(rules[0]?.instructions).not.toContain("foodPhysicalForm: foodPhysicalForm:");
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

  it("keeps visible source UI tags separate from hidden source metadata", () => {
    const tagRule = aiFeatureActionMeta["image-tags"].rulePresets.find((preset) => preset.id === "concrete-image-tags");

    expect(tagRule?.label).toBe("具体标签");
    expect(tagRule?.instructions).toContain("来源头像");
    expect(tagRule?.instructions).toContain("不可见来源或营销元信息");
    expect(tagRule?.instructions).toContain("域名标签");
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

  it("requires a complete connection only when remote AI is enabled", () => {
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

    expect(() =>
      mergeAiProviderSettingsPayload(defaultAiProviderSettings, {
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
      }),
    ).toThrow("请先填写接口地址、模型和 API Key。");
  });

  it("persists only encrypted API keys", () => {
    expect(
      toPersistedAiSettingsFile(
        {
          activeProfileId: "main",
          actionPreferences: {},
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

  it("persists selected rule presets and combines them with custom instructions", () => {
    const settings = mergeAiProviderSettingsPayload(
      {
        activeProfileId: "main",
        actionPreferences: {},
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
