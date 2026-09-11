import { describe, expect, it, vi } from "vitest";
import {
  generateImagesWithRemoteApi,
  normalizeImageEditsEndpoint,
  normalizeImagesEndpoint,
  normalizeAgnesImageSize,
  resolveAgnesImageRequestSize,
} from "../../electron/main/ai/remoteAiClient";

const opaquePngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

describe("AI image generation", () => {
  const downloadSettings = {
    apiKey: "test-key", baseUrl: "https://api.example.com/v1", enabled: true,
    id: "download-test", model: "grok-imagine-image-2.0", models: [], name: "test",
  };

  it.each(["grok-imagine-image", "grok-imagine-image-2.0"])("sends %s edits as JSON and decodes the returned image", async (model) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [{ b64_json: opaquePngBase64 }] }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await generateImagesWithRemoteApi({ ...downloadSettings, model }, {
        prompt: "render as a pencil sketch", size: "2496x1664", ratio: "3:2",
        quality: "high", outputFormat: "png", background: "transparent",
        // Content sniffing also applies to the new JSON path.
        referenceImageDataUrls: [`data:image/jpeg;base64,${opaquePngBase64}`],
      });
      expect(result.images[0].dataUrl).toBe(`data:image/png;base64,${opaquePngBase64}`);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [endpoint, init] = fetchMock.mock.calls[0];
      expect(endpoint).toBe("https://api.example.com/v1/images/edits");
      expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
      expect(JSON.parse(init.body)).toEqual({
        model, prompt: "render as a pencil sketch", n: 1,
        response_format: "b64_json", aspect_ratio: "3:2", resolution: "2k",
        ...(model.endsWith("2.0") ? { quality: "medium" } : {}),
        image: { type: "image_url", url: `data:image/png;base64,${opaquePngBase64}` },
      });
    } finally { vi.unstubAllGlobals(); }
  });

  it("does not submit a billable Grok edit request to the known incompatible Baige proxy", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(generateImagesWithRemoteApi({ ...downloadSettings, baseUrl: "https://api.sccens.net/v1" }, {
        prompt: "sketch", referenceImageDataUrls: [`data:image/png;base64,${opaquePngBase64}`],
      })).rejects.toMatchObject({ code: "AI_REFERENCE_IMAGE_PROVIDER_UNSUPPORTED", message: expect.stringContaining("当前模型或接口不支持参考图图生图") });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it("sends multiple Grok references in order using images and preserves the 1K tier for wide images", async () => {
    const secondImage = "data:image/jpeg;base64,/9j/";
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [{ b64_json: opaquePngBase64 }] }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await generateImagesWithRemoteApi(downloadSettings, {
        prompt: "combine", size: "1568x672", ratio: "21:9",
        referenceImageDataUrls: [`data:image/png;base64,${opaquePngBase64}`, secondImage],
      });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.images).toEqual([
        { type: "image_url", url: `data:image/png;base64,${opaquePngBase64}` },
        { type: "image_url", url: secondImage },
      ]);
      expect(body).not.toHaveProperty("image");
      expect(body.resolution).toBe("1k");
    } finally { vi.unstubAllGlobals(); }
  });

  it("reports a rejected request media type without blaming the image or retrying a paid POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("unsupported media type", { status: 415 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(generateImagesWithRemoteApi(downloadSettings, {
        prompt: "sketch", referenceImageDataUrls: [`data:image/png;base64,${opaquePngBase64}`],
      })).rejects.toMatchObject({
        code: "AI_REFERENCE_IMAGE_REQUEST_FAILED",
        message: expect.stringContaining("状态码 415"),
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });

  it("requests inline Grok output and retries only the result GET after a dropped download", async () => {
    let downloads = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        expect(JSON.parse(String(init.body)).response_format).toBe("b64_json");
        return Response.json({ data: [{ url: "/generated/result.png?signature=private" }] });
      }
      expect(String(input)).toBe("https://api.example.com/generated/result.png?signature=private");
      expect(new Headers(init?.headers).has("Authorization")).toBe(false);
      if (++downloads === 1) throw new TypeError("net::ERR_CONNECTION_CLOSED");
      return new Response(Buffer.from(opaquePngBase64, "base64"));
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await generateImagesWithRemoteApi(downloadSettings, { prompt: "test", n: 1 });
      expect(result.images).toHaveLength(1);
      expect(downloads).toBe(2);
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    } finally { vi.unstubAllGlobals(); }
  });

  it("does not repeat a possibly billed POST after a lost response", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed", {
      cause: { code: "UND_ERR_SOCKET" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(generateImagesWithRemoteApi(downloadSettings, { prompt: "test", n: 1 }))
        .rejects.toThrow("未自动重发");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });

  it.each([403, 503])("reports result download failure for HTTP %i without a second paid POST", async (status) => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "POST"
        ? Response.json({ data: [{ url: "https://cdn.example.com/result" }] })
        : new Response("unavailable", { status }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(generateImagesWithRemoteApi(downloadSettings, { prompt: "test", n: 1 }))
        .rejects.toMatchObject({ code: "AI_IMAGE_DOWNLOAD_FAILED", message: expect.stringContaining("可能已扣费") });
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(status === 403 ? 2 : 4);
    } finally { vi.unstubAllGlobals(); }
  });

  it("normalizes OpenAI-compatible image endpoints", () => {
    expect(normalizeImagesEndpoint("https://api.example.com/v1")).toBe("https://api.example.com/v1/images/generations");
    expect(normalizeImagesEndpoint("https://api.example.com/v1/chat/completions")).toBe(
      "https://api.example.com/v1/images/generations",
    );
    expect(normalizeImagesEndpoint("https://api.example.com/v1/images/generations")).toBe(
      "https://api.example.com/v1/images/generations",
    );
    expect(normalizeImageEditsEndpoint("https://api.example.com/v1")).toBe("https://api.example.com/v1/images/edits");
    expect(normalizeImageEditsEndpoint("https://api.example.com/v1/images/generations")).toBe(
      "https://api.example.com/v1/images/edits",
    );
    expect(normalizeImagesEndpoint("https://platform.agnes-ai.com/v1")).toBe(
      "https://apihub.agnes-ai.com/v1/images/generations",
    );
    expect(normalizeImageEditsEndpoint("https://platform.agnes-ai.com/v1/images/edits")).toBe(
      "https://apihub.agnes-ai.com/v1/images/generations",
    );
  });

  it("parses base64 image results from an OpenAI-compatible response", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.example.com/v1/images/generations");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer test-key" });
      expect(JSON.parse(String(init?.body))).toMatchObject({
        model: "image-model",
        prompt: "a red fox",
        n: 2,
        size: "auto",
        output_format: "png",
      });
      return new Response(JSON.stringify({
        data: [
          { b64_json: opaquePngBase64, revised_prompt: "a vivid red fox" },
          { b64_json: opaquePngBase64, revised_prompt: "a vivid red fox" },
        ],
      }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(
        generateImagesWithRemoteApi(
          {
            apiKey: "test-key",
            baseUrl: "https://api.example.com/v1",
            enabled: true,
            id: "profile",
            model: "image-model",
            models: [],
            name: "test",
          },
          {
            prompt: "a red fox",
            size: "auto",
            n: 2,
            outputFormat: "png",
          },
        ),
      ).resolves.toEqual({
        images: [
          { dataUrl: `data:image/png;base64,${opaquePngBase64}`, revisedPrompt: "a vivid red fox" },
          { dataUrl: `data:image/png;base64,${opaquePngBase64}`, revisedPrompt: "a vivid red fox" },
        ],
        model: "image-model",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses the Agnes API Hub endpoint and documented JSON body", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== "https://apihub.agnes-ai.com/v1/images/generations") {
        return new Response(Buffer.from(opaquePngBase64, "base64"), { status: 200 });
      }
      expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toMatchObject({
        model: "agnes-image-2.0-flash",
        prompt: "a red fox",
        size: "1024x1024",
        extra_body: { response_format: "url" },
      });
      expect(body).not.toHaveProperty("n");
      expect(body).not.toHaveProperty("quality");
      expect(body).not.toHaveProperty("output_format");
      expect(body).not.toHaveProperty("background");
      return new Response(JSON.stringify({ data: [{ url: "https://cdn.example.com/agnes-result" }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(generateImagesWithRemoteApi({
        apiKey: "test-key",
        baseUrl: "https://apihub.agnes-ai.com/v1/images/generations",
        enabled: true,
        id: "agnes",
        model: "agnes-image-2.0-flash",
        models: [],
        name: "Agnes",
      }, {
        n: 1,
        prompt: "a red fox",
        size: "auto",
        outputFormat: "webp",
        quality: "high",
        background: "transparent",
      })).resolves.toMatchObject({ model: "agnes-image-2.0-flash", images: [{ dataUrl: expect.stringMatching(/^data:image\/png;base64,/) }] });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("preserves explicit Agnes canvas tiers and only resolves automatic size", () => {
    expect(normalizeAgnesImageSize("1280x1920")).toBe("1280x1920");
    expect(normalizeAgnesImageSize("2048x2048")).toBe("2048x2048");
    expect(normalizeAgnesImageSize("1920x1080")).toBe("1920x1080");
    expect(normalizeAgnesImageSize("auto")).toBe("1024x1024");
  });

  it("uses the Agnes 2.1 native tier and ratio for formula-derived canvas sizes", () => {
    expect(resolveAgnesImageRequestSize("agnes-image-2.1-flash", {
      size: "1280x1920",
      ratio: "2:3",
    })).toEqual({ size: "2K", ratio: "2:3" });
    expect(resolveAgnesImageRequestSize("agnes-image-2.1-flash", {
      size: "2624x1472",
      ratio: "16:9",
    })).toEqual({ size: "2K", ratio: "16:9" });
    expect(resolveAgnesImageRequestSize("agnes-image-2.0-flash", {
      size: "1664x2496",
      ratio: "2:3",
    })).toEqual({ size: "1664x2496" });
  });

  it("sends Agnes 2.1 size tiers with ratio", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== "https://apihub.agnes-ai.com/v1/images/generations") {
        return new Response(Buffer.from(opaquePngBase64, "base64"), { status: 200 });
      }
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toMatchObject({
        model: "agnes-image-2.1-flash",
        prompt: "a red fox",
        size: "2K",
        ratio: "2:3",
        extra_body: { response_format: "url" },
      });
      return new Response(JSON.stringify({ data: [{ url: "https://cdn.example.com/agnes-result" }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(generateImagesWithRemoteApi({
        apiKey: "test-key",
        baseUrl: "https://apihub.agnes-ai.com/v1",
        enabled: true,
        id: "agnes",
        model: "agnes-image-2.1-flash",
        models: [],
        name: "Agnes",
      }, {
        prompt: "a red fox",
        size: "1664x2496",
        ratio: "2:3",
      })).resolves.toMatchObject({ images: [{ dataUrl: expect.any(String) }] });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("sends Agnes reference images as Data URIs on the generations endpoint", async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== "https://apihub.agnes-ai.com/v1/images/generations") {
        return new Response(Buffer.from(opaquePngBase64, "base64"), { status: 200 });
      }
      expect(init?.body).not.toBeInstanceOf(FormData);
      const body = JSON.parse(String(init?.body)) as Record<string, any>;
      expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
      expect(body.extra_body.response_format).toBe("url");
      expect(body.extra_body.image).toEqual([`data:image/png;base64,${pngBytes.toString("base64")}`]);
      expect(body.size).toBe("1024x1024");
      return new Response(JSON.stringify({ data: [{ url: "https://cdn.example.com/agnes-edit-result" }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(generateImagesWithRemoteApi({
        apiKey: "test-key",
        baseUrl: "https://apihub.agnes-ai.com/v1/images/generations",
        enabled: true,
        id: "agnes",
        model: "agnes-image-2.0-flash",
        models: [],
        name: "Agnes",
      }, {
        prompt: "preserve composition",
        referenceImageDataUrls: [`data:image/jpeg;base64,${pngBytes.toString("base64")}`],
        referenceImageFileNames: ["source.jpg"],
      })).resolves.toMatchObject({ images: [{ dataUrl: expect.stringMatching(/^data:image\/png;base64,/) }] });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("falls back from a saved Agnes /v1 route and reports the working endpoint", async () => {
    const calls: string[] = [];
    const onEndpointResolved = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(input));
      if (calls.length === 1) {
        return new Response("Invalid URL (POST /v1)", { status: 404 });
      }
      expect(init?.body).toBeTypeOf("string");
      return new Response(JSON.stringify({ data: [{ b64_json: opaquePngBase64 }] }), { status: 200 });
    }));

    try {
      await expect(generateImagesWithRemoteApi({
        apiKey: "test-key",
        baseUrl: "https://platform.agnes-ai.com/v1",
        enabled: true,
        id: "agnes",
        model: "agnes-image-2.0-flash",
        models: [],
        name: "Agnes",
      }, { prompt: "a red fox" }, undefined, onEndpointResolved)).resolves.toMatchObject({ images: [{ dataUrl: expect.any(String) }] });
      expect(calls).toEqual([
        "https://platform.agnes-ai.com/v1",
        "https://apihub.agnes-ai.com/v1/images/generations",
      ]);
      expect(onEndpointResolved).toHaveBeenCalledWith("https://apihub.agnes-ai.com/v1/images/generations");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses multipart /images/edits when a reference image is present", async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.example.com/v1/images/edits");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer test-key");
      expect(headers.get("content-type")).toBeNull();

      const form = init?.body as FormData;
      expect(form).toBeInstanceOf(FormData);
      expect(form.get("model")).toBe("image-model");
      expect(form.get("prompt")).toBe("preserve composition");
      expect(form.get("size")).toBe("auto");
      const imageField = form.get("image");
      expect(imageField).toBeInstanceOf(Blob);
      if (imageField instanceof Blob) {
        const imageBytes = new Uint8Array(await imageField.arrayBuffer());
        expect(imageBytes).toEqual(new Uint8Array(pngBytes));
      }
      return new Response(JSON.stringify({ data: [{ b64_json: opaquePngBase64 }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(
        generateImagesWithRemoteApi(
          {
            apiKey: "test-key",
            baseUrl: "https://api.example.com/v1",
            enabled: true,
            id: "profile",
            model: "image-model",
            models: [],
            name: "test",
          },
          {
            prompt: "preserve composition",
            referenceImageDataUrls: [`data:application/octet-stream;base64,${pngBytes.toString("base64")}`],
            referenceImageFileNames: ["source.bin"],
            size: "auto",
          },
        ),
      ).resolves.toMatchObject({
        model: "image-model",
        images: [{ dataUrl: `data:image/png;base64,${opaquePngBase64}` }],
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("restores a persisted reference image by file name after a renderer restart", async () => {
    const readCanvasReferenceImage = vi.fn(async () => ({
      dataUrl: `data:image/png;base64,${opaquePngBase64}`,
      fileName: "canvas-reference-restored.png",
      height: 1,
      title: "restored",
      width: 1,
    }));
    vi.doMock("../../electron/main/library/canvasReferenceImages", () => ({
      readCanvasReferenceImage,
    }));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.example.com/v1/images/edits");
      const form = init?.body as FormData;
      expect(form).toBeInstanceOf(FormData);
      const imageField = form.get("image");
      expect(imageField).toBeInstanceOf(Blob);
      return new Response(JSON.stringify({ data: [{ b64_json: opaquePngBase64 }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(
        generateImagesWithRemoteApi(
          {
            apiKey: "test-key",
            baseUrl: "https://api.example.com/v1",
            enabled: true,
            id: "profile",
            model: "image-model",
            models: [],
            name: "test",
          },
          {
            prompt: "preserve the restored composition",
            referenceImageFileNames: ["canvas-reference-restored.png"],
            outputFormat: "png",
          },
        ),
      ).resolves.toMatchObject({ model: "image-model", images: [{ dataUrl: `data:image/png;base64,${opaquePngBase64}` }] });
      expect(readCanvasReferenceImage).toHaveBeenCalledWith("canvas-reference-restored.png");
    } finally {
      vi.unstubAllGlobals();
      vi.doUnmock("../../electron/main/library/canvasReferenceImages");
    }
  });

  it("explains when the upstream does not support reference-image editing", async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));

    try {
      await expect(
        generateImagesWithRemoteApi(
          {
            apiKey: "test-key",
            baseUrl: "https://api.example.com/v1",
            enabled: true,
            id: "profile",
            model: "image-model",
            models: [],
            name: "test",
          },
          {
            prompt: "edit image",
            referenceImageDataUrls: [`data:image/png;base64,${pngBytes.toString("base64")}`],
          },
        ),
      ).rejects.toThrow("当前接口不支持参考图生成");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
