import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicAiProviderSettings } from "../../src/features/library/types/ai";
import { useLibraryStore } from "../../src/features/library/store/useLibraryStore";

const initialAiSettings = useLibraryStore.getState().aiSettings;

function createVisionSettings(): PublicAiProviderSettings {
  return {
    ...initialAiSettings,
    activeProfileId: "background-test",
    enabled: true,
    baseUrl: "https://ai.example.com/v1",
    hasApiKey: true,
    apiKeyPreview: "sk-***test",
    model: "vision-model",
    profiles: [
      {
        id: "background-test",
        name: "后台分析测试模型",
        enabled: true,
        baseUrl: "https://ai.example.com/v1",
        hasApiKey: true,
        apiKeyPreview: "sk-***test",
        model: "vision-model",
        models: [{ id: "vision-model", label: "vision-model", capabilities: ["vision"] }],
      },
    ],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  useLibraryStore.setState({
    aiSettings: initialAiSettings,
    aiErrorDialog: null,
    aiAnalysisCircuitOpen: false,
    statusMessage: null,
  });
});

describe("background AI analysis isolation", () => {
  it("does not open a blocking AI dialog when a background classification fails", async () => {
    const analyzePromptWithAi = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: "AI_REMOTE_REQUEST_FAILED", message: "HTTP 403: quota exceeded" },
    });
    vi.stubGlobal("window", {
      suyanApi: {
        analyzePromptWithAi,
        logStartupEvent: vi.fn(),
      },
    });
    useLibraryStore.setState({
      aiSettings: createVisionSettings(),
      aiErrorDialog: null,
      aiAnalysisCircuitOpen: false,
    });

    await useLibraryStore.getState().analyzePromptWithAi({
      target: "image-category",
      title: "",
      imageFileName: "image.png",
      prompt: "",
      negativePrompt: "",
      tags: [],
      category: "",
      runInBackground: true,
    });

    expect(analyzePromptWithAi).toHaveBeenCalledTimes(1);
    expect(useLibraryStore.getState().aiErrorDialog).toBeNull();
    expect(useLibraryStore.getState().aiAnalysisCircuitOpen).toBe(true);
  });
});
