import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listOllamaModels,
  normalizeOllamaBaseUrl,
  parseOllamaChatResponse,
  parseOllamaModelCapabilities,
  parseOllamaReverseImagePromptContent,
  parseOllamaTags,
  testOllamaConnection,
} from "../../electron/main/ai/ollamaAiClient";

const settings = {
  apiKey: "",
  baseUrl: "http://127.0.0.1:11434",
  enabled: true,
  id: "ollama",
  model: "qwen2.5:7b",
  models: [],
  name: "本地 Ollama",
};

describe("ollamaAiClient", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("normalizes native Ollama endpoints without adding /v1", () => {
    expect(normalizeOllamaBaseUrl("http://127.0.0.1:11434/api/tags")).toBe("http://127.0.0.1:11434");
    expect(normalizeOllamaBaseUrl("http://127.0.0.1:11434/v1/")).toBe("http://127.0.0.1:11434");
  });

  it("parses installed model names and rejects an empty model list", () => {
    expect(parseOllamaTags({ models: [{ name: "llama3.2:latest" }, { model: "qwen2.5:7b" }, { name: "llama3.2:latest" }] })).toEqual([
      { id: "llama3.2:latest", label: "llama3.2:latest" },
      { id: "qwen2.5:7b", label: "qwen2.5:7b" },
    ]);
    expect(() => parseOllamaTags({ models: [] })).toThrowError(/没有已安装模型/);
    expect(parseOllamaTags({ models: [{ name: "Qwen3.5-Vision:latest", capabilities: ["completion", "vision"] }] })).toEqual([
      { id: "Qwen3.5-Vision:latest", label: "Qwen3.5-Vision:latest", capabilities: ["text", "vision"] },
    ]);
  });

  it("recognizes Ollama vision metadata while leaving text and embedding models text-only", () => {
    expect(parseOllamaModelCapabilities({ details: { families: ["mllama", "clip"] } }, "llama3.2:11b")).toEqual([
      "text",
      "vision",
    ]);
    expect(parseOllamaModelCapabilities({ model_info: { "vision.block_count": 32 } }, "granite3.2:8b")).toEqual([
      "text",
      "vision",
    ]);
    expect(parseOllamaModelCapabilities({ details: { families: ["bert"] } }, "nomic-embed-text")).toEqual(["text"]);
    expect(parseOllamaModelCapabilities({ details: { families: ["clip"] } }, "clip-embedding")).toEqual(["text"]);
  });

  it("queries /api/tags and /api/show, returning per-model capabilities", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/tags")) {
        return Promise.resolve(new Response(JSON.stringify({ models: [{ name: "llama3.2-vision:11b" }, { name: "qwen2.5:7b" }] }), { status: 200 }));
      }
      const requestedModel = JSON.parse(String(init?.body)).model as string;
      const model = requestedModel.includes("qwen2.5") ? "qwen2.5:7b" : "llama3.2-vision:11b";
      const detail = model.includes("vision")
        ? { details: { family: "mllama" } }
        : { details: { family: "qwen" }, capabilities: ["completion", "vision"] };
      return Promise.resolve(new Response(JSON.stringify(detail), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(listOllamaModels(settings)).resolves.toEqual([
      { id: "llama3.2-vision:11b", label: "llama3.2-vision:11b", capabilities: ["text", "vision"] },
      { id: "qwen2.5:7b", label: "qwen2.5:7b", capabilities: ["text", "vision"] },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("uses native chat without sending an API key", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: { content: "连接成功" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(testOllamaConnection(settings)).resolves.toEqual({ connected: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(url).toBe("http://127.0.0.1:11434/api/chat");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(body).toMatchObject({ model: "qwen2.5:7b", stream: false });
    expect(body).not.toHaveProperty("api_key");
  });

  it("maps unavailable, missing-model and malformed responses to diagnostic errors", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "model 'qwen2.5:7b' not found" }), { status: 404 }))
      .mockResolvedValueOnce(new Response("not-json", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(testOllamaConnection(settings)).rejects.toMatchObject({ code: "AI_OLLAMA_UNAVAILABLE" });
    await expect(testOllamaConnection(settings)).rejects.toMatchObject({ code: "AI_OLLAMA_MODEL_NOT_FOUND" });
    await expect(testOllamaConnection(settings)).rejects.toMatchObject({ code: "AI_OLLAMA_RESPONSE_INVALID" });
  });

  it("aborts a slow local model request as a timeout", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);

    const request = testOllamaConnection(settings);
    const expectation = expect(request).rejects.toMatchObject({ code: "AI_OLLAMA_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(30_000);
    await expectation;
  });

  it("rejects malformed chat messages", () => {
    expect(() => parseOllamaChatResponse({ message: { content: "" } })).toThrowError(/没有返回可用内容/);
  });

  it("never promotes Ollama thinking into visible chat content", () => {
    expect(() => parseOllamaChatResponse({ message: { content: "", thinking: "内部分析过程" } })).toThrowError(/没有返回可用内容/);
    expect(parseOllamaChatResponse({ message: { content: "<think>内部分析</think>最终内容" } })).toBe("最终内容");
  });

  it("accepts only the final reverse prompt and rejects visible analysis sections", () => {
    expect(parseOllamaReverseImagePromptContent('{"prompt":"中景人像，柔和自然光，竖幅构图"}')).toBe(
      "中景人像，柔和自然光，竖幅构图",
    );
    expect(parseOllamaReverseImagePromptContent('```json\n{"prompt":"中景人像，柔和自然光，竖幅构图"}\n```')).toBe(
      "中景人像，柔和自然光，竖幅构图",
    );
    expect(() => parseOllamaReverseImagePromptContent('{"prompt":"1. 角色分析（Role）\n2. 背景分析（Background）"}')).toThrowError(/分析过程/);
    expect(() => parseOllamaReverseImagePromptContent("1. 角色分析\n2. 背景分析\n3. 工作流分析")).toThrowError(/分析过程/);
  });
});
