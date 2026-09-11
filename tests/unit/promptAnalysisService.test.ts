import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serviceSpies = vi.hoisted(() => ({
  generateImages: vi.fn(),
  generateVideos: vi.fn(),
  writeSettings: vi.fn(),
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  readSettings: vi.fn(),
}));

vi.mock("../../electron/main/appLogger", () => ({ logger: serviceSpies.logger }));
vi.mock("../../electron/main/ai/aiSettingsStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../electron/main/ai/aiSettingsStore")>()),
  readPrivateAiProviderSettings: serviceSpies.readSettings,
  writeAiProviderSettings: serviceSpies.writeSettings,
}));
vi.mock("../../electron/main/ai/remoteAiClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../electron/main/ai/remoteAiClient")>()),
  generateImagesWithRemoteApi: serviceSpies.generateImages,
  generateVideosWithRemoteApi: serviceSpies.generateVideos,
}));

import { generateImagesWithRemoteAi } from "../../electron/main/ai/promptAnalysisService";

const privateSettings = {
  activeProfileId: "image-profile",
  actionPreferences: {
    "image-generation": {
      customInstructions: "Keep all visible product text unchanged.",
      modelId: "image-model",
      profileId: "image-profile",
      rulePresetIds: ["saved-image-rule"],
      rules: [
        {
          id: "saved-image-rule",
          instructions: "Preserve the reference composition and subject identity.",
          label: "Saved image rule",
        },
      ],
    },
  },
  recognitionSourcePreferences: {},
  profiles: [
    {
      apiKey: "test-key",
      baseUrl: "https://api.example.com/v1",
      enabled: true,
      id: "image-profile",
      model: "image-model",
      models: [
        {
          capabilities: ["image-generation" as const],
          id: "image-model",
          label: "image-model",
        },
      ],
      name: "Image provider",
    },
  ],
};

const generatedData = {
  images: [{ dataUrl: "data:image/png;base64,AA==", revisedPrompt: null }],
  model: "image-model",
};

describe("promptAnalysisService image generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceSpies.readSettings.mockResolvedValue(privateSettings);
    serviceSpies.generateImages.mockResolvedValue(generatedData);
    serviceSpies.writeSettings.mockResolvedValue(privateSettings);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes persisted image-generation rules into the remote generation runtime", async () => {
    await generateImagesWithRemoteAi({ prompt: "A ceramic tea set" });

    expect(serviceSpies.generateImages).toHaveBeenCalledWith(
      expect.objectContaining({ id: "image-profile", model: "image-model" }),
      expect.objectContaining({ prompt: "A ceramic tea set" }),
      expect.stringContaining("Preserve the reference composition and subject identity."),
    );
    expect(serviceSpies.generateImages.mock.calls[0]?.[2]).toContain(
      "Keep all visible product text unchanged.",
    );
  });

  it("routes an Agnes video model to the video API when older payloads omit mediaType", async () => {
    const videoSettings = {
      ...privateSettings,
      actionPreferences: {
        ...privateSettings.actionPreferences,
        "image-generation": {
          ...privateSettings.actionPreferences["image-generation"],
          modelId: "agnes-video-2.5",
        },
      },
      profiles: privateSettings.profiles.map((profile) => ({
        ...profile,
        model: "agnes-video-2.5",
        models: [{ id: "agnes-video-2.5", label: "Agnes Video 2.5", capabilities: ["video-generation" as const] }],
      })),
    };
    const videoData = {
      images: [{ dataUrl: "data:video/mp4;base64,AA==", mediaType: "video" as const }],
      mediaType: "video" as const,
      model: "agnes-video-2.5",
    };
    serviceSpies.readSettings.mockResolvedValue(videoSettings);
    serviceSpies.generateVideos.mockResolvedValue(videoData);

    await expect(generateImagesWithRemoteAi({ prompt: "雨夜城市" })).resolves.toEqual(videoData);
    expect(serviceSpies.generateVideos).toHaveBeenCalledWith(
      expect.objectContaining({ model: "agnes-video-2.5" }),
      expect.objectContaining({ prompt: "雨夜城市" }),
      expect.any(String),
    );
    expect(serviceSpies.generateImages).not.toHaveBeenCalled();
  });

  it("persists the working Agnes image endpoint after fallback", async () => {
    const agnesSettings = {
      ...privateSettings,
      profiles: privateSettings.profiles.map((profile) => ({
        ...profile,
        baseUrl: "https://platform.agnes-ai.com/v1",
      })),
    };
    serviceSpies.readSettings.mockResolvedValue(agnesSettings);
    serviceSpies.generateImages.mockImplementation(async (...args: unknown[]) => {
      const onEndpointResolved = args[3] as ((endpoint: string) => Promise<void>) | undefined;
      await onEndpointResolved?.("https://apihub.agnes-ai.com/v1/images/generations");
      return generatedData;
    });

    await generateImagesWithRemoteAi({ prompt: "A ceramic tea set" });

    expect(serviceSpies.writeSettings).toHaveBeenCalledWith(expect.objectContaining({
      profiles: [expect.objectContaining({
        id: "image-profile",
        baseUrl: "https://apihub.agnes-ai.com/v1/images/generations",
      })],
    }));
  });

  it("does not contact TapRelay when completion notifications are disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await generateImagesWithRemoteAi({
      notificationEnabled: false,
      prompt: "A ceramic tea set",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts and logs a successful TapRelay completion notification", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await generateImagesWithRemoteAi({
      notificationEnabled: true,
      prompt: "A ceramic tea set",
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:1122/send");
    expect(JSON.parse(String(init.body))).toMatchObject({
      source: "suyan",
      status: "completed",
    });
    await vi.waitFor(() => {
      expect(serviceSpies.logger.info).toHaveBeenCalledWith(
        "ai",
        "tap-relay-hook-sent",
        expect.objectContaining({ event: "image-generation-success", httpStatus: 204, imageCount: 1 }),
      );
    });
  });

  it("logs a non-success TapRelay response without failing image generation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateImagesWithRemoteAi({
      notificationEnabled: true,
      prompt: "A ceramic tea set",
    })).resolves.toEqual(generatedData);

    await vi.waitFor(() => {
      expect(serviceSpies.logger.warn).toHaveBeenCalledWith(
        "ai",
        "tap-relay-hook-non-ok",
        expect.objectContaining({ event: "image-generation-success", httpStatus: 503 }),
      );
    });
  });

  it("posts a failed-generation notification and contains TapRelay network errors", async () => {
    const generationError = new Error("upstream unavailable");
    const fetchMock = vi.fn().mockRejectedValue(new Error("relay offline"));
    serviceSpies.generateImages.mockRejectedValueOnce(generationError);
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateImagesWithRemoteAi({
      notificationEnabled: true,
      prompt: "A ceramic tea set",
    })).rejects.toBe(generationError);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      source: "suyan",
      status: "failed",
    });
    await vi.waitFor(() => {
      expect(serviceSpies.logger.warn).toHaveBeenCalledWith(
        "ai",
        "tap-relay-hook-failed",
        expect.objectContaining({
          error: "relay offline",
          errorCode: "AI_IMAGE_GENERATION_FAILED",
          event: "image-generation-failed",
        }),
      );
    });
  });
});
