import { describe, expect, it } from "vitest";
import { buildAiErrorPresentation } from "@/features/library/utils/aiErrorPresentation";

describe("aiErrorPresentation", () => {
  it("explains quota failures with provider balance details and stops background work", () => {
    const result = buildAiErrorPresentation(
      "AI_REMOTE_REQUEST_FAILED",
      "HTTP 403: \u7528\u6237\u5269\u4f59\u989d\u5ea6: $0.017900, \u672c\u6b21\u8bf7\u6c42\u9700\u8981\u989d\u5ea6: $0.075090",
      "image-category",
    );

    expect(result.code).toBe("AI_QUOTA_EXCEEDED");
    expect(result.summary).toContain("$0.017900");
    expect(result.summary).toContain("$0.075090");
    expect(result.shouldStopBackground).toBe(true);
    expect(result.retryable).toBe(false);
  });

  it("classifies transport errors as retryable and pauses background batches", () => {
    const result = buildAiErrorPresentation("AI_REMOTE_REQUEST_FAILED", "socket hang up during TLS handshake", "image-category");

    expect(result.title).toContain("\u8fde\u63a5\u5931\u8d25");
    expect(result.retryable).toBe(true);
    expect(result.shouldStopBackground).toBe(true);
  });

  it("keeps missing-image errors local to the current item", () => {
    const result = buildAiErrorPresentation("AI_IMAGE_REQUIRED", "missing image", "image-category");

    expect(result.title).toContain("\u53c2\u8003\u56fe");
    expect(result.shouldStopBackground).toBe(false);
    expect(result.retryable).toBe(false);
  });

  it("redacts HTML and request identifiers from unknown provider errors", () => {
    const result = buildAiErrorPresentation(
      "AI_REMOTE_REQUEST_FAILED",
      "<html>bad gateway</html> request id: secret-123",
      "image-category",
    );

    expect(result.summary).not.toContain("<html>");
    expect(result.summary).not.toContain("secret-123");
    expect(result.summary).toContain("<redacted>");
  });

  it("explains Ollama availability and model capability errors", () => {
    const unavailable = buildAiErrorPresentation("AI_OLLAMA_UNAVAILABLE", "无法连接 Ollama", "image-tags");
    expect(unavailable.title).toContain("Ollama");
    expect(unavailable.actions.join(" ")).toContain("ollama serve");
    expect(unavailable.shouldStopBackground).toBe(true);

    const mismatch = buildAiErrorPresentation("AI_MODEL_CAPABILITY_MISMATCH", "模型能力不匹配", "image-reverse");
    expect(mismatch.summary).toContain("视觉模型");
    expect(mismatch.retryable).toBe(false);
  });

  it("explains that Ollama cannot be used for image generation", () => {
    const presentation = buildAiErrorPresentation("AI_PROVIDER_UNSUPPORTED", "不支持", "image-generation");
    expect(presentation.summary).toContain("不能直接生成图片或视频");
    expect(presentation.actions.join(" ")).toContain("生图 API");
  });
});
