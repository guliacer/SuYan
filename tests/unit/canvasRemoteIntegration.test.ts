import { describe, expect, it } from "vitest";
import {
  buildImageEditRequestForm,
  buildImageGenerationRequestBody,
  buildPromptOptimizationScopeInstructions,
  parseReferenceImageDataUrl,
} from "../../electron/main/ai/remoteAiClient";

const settings = {
  apiKey: "test-key",
  baseUrl: "https://api.example.com/v1",
  enabled: true,
  id: "test-profile",
  model: "gpt-image-1",
  models: [],
  name: "test profile",
};

describe("canvas remote integration", () => {
  it("passes transparent background and PNG output to image generation", () => {
    expect(buildImageGenerationRequestBody(settings, {
      prompt: "a glass icon",
      background: "transparent",
      outputFormat: "png",
      size: "1024x1024",
    })).toMatchObject({
      model: "gpt-image-1",
      prompt: "a glass icon",
      background: "transparent",
      output_format: "png",
      size: "1024x1024",
    });
  });

  it("uses the model already validated for the resolved profile", () => {
    expect(buildImageGenerationRequestBody(settings, {
      apiModelId: "stale-model-from-another-profile",
      prompt: "a glass icon",
    })).toMatchObject({
      model: "gpt-image-1",
    });
  });

  it("does not send an explicit background value for automatic mode", () => {
    const body = buildImageGenerationRequestBody(settings, {
      prompt: "a landscape",
      background: "auto",
    });

    expect(body).not.toHaveProperty("background");
  });

  it("builds multipart image edits with content-derived MIME and filename", async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const reference = parseReferenceImageDataUrl(
      `data:image/jpeg;base64,${pngBytes.toString("base64")}`,
      "mismatched.jpg",
    );
    const form = buildImageEditRequestForm(settings, {
      prompt: "keep the subject",
      size: "2048x2048",
    }, [reference]);
    const image = form.get("image");

    expect(reference).toMatchObject({ mime: "image/png", fileName: "mismatched.png" });
    expect(form.get("model")).toBe("gpt-image-1");
    expect(form.get("prompt")).toBe("keep the subject");
    expect(form.get("size")).toBe("2048x2048");
    expect(image).toBeInstanceOf(Blob);
    expect((image as Blob).type).toBe("image/png");
    expect(Buffer.from(await (image as Blob).arrayBuffer())).toEqual(pngBytes);
  });

  it("builds the documented Grok JSON edit body instead of multipart fields", () => {
    const grokSettings = { ...settings, model: "grok-imagine-image-2.0" };
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const reference = parseReferenceImageDataUrl(
      `data:image/png;base64,${pngBytes.toString("base64")}`,
      "reference.png",
    );
    const body = buildImageGenerationRequestBody(grokSettings, {
      prompt: "render as a pencil sketch",
      ratio: "3:2",
      size: "2496x1664",
    }, { referenceImages: [reference] });

    expect(body).toMatchObject({
      model: "grok-imagine-image-2.0",
      aspect_ratio: "3:2",
      resolution: "2k",
      response_format: "b64_json",
      image: { type: "image_url", url: `data:image/png;base64,${pngBytes.toString("base64")}` },
    });
    expect(body).not.toHaveProperty("size");
    expect(body).not.toHaveProperty("output_format");
    expect(body).not.toHaveProperty("images");
  });

  it("rejects malformed reference image data before sending it upstream", () => {
    expect(() => parseReferenceImageDataUrl("data:image/png;base64,not-base64", "bad.png")).toThrow(
      "base64 编码无效",
    );
  });

  it("adds dedicated constraints when optimizing a negative prompt", () => {
    const negativeInstructions = buildPromptOptimizationScopeInstructions("negative");

    expect(negativeInstructions).toContain("\u8d1f\u5411\u63d0\u793a\u8bcd");
    expect(negativeInstructions).toContain("\u907f\u514d");
    expect(buildPromptOptimizationScopeInstructions("positive")).toBe("");
  });
});
