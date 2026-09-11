import http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 素言收件服务只监听 127.0.0.1:9477，ComfyUI 前端在 127.0.0.1:8188 发起 fetch。
// 跨端口即跨源，浏览器强制 CORS 预检：必须能正确回 OPTIONS 204 + ACAO，
// 否则「发送到素言」按钮的 fetch 会被浏览器拦截。
//
// 注：9477 可能被本地 dev 素言 / 打包素言占用。为了让本测试稳定可跑、且不依赖外部进程，
// 这里把 9477 抽成可注入端口：未指定时回退到 9477，被占用时退到空闲端口。

const runtime = vi.hoisted(() => ({
  started: false,
  port: 0,
  startImportReceiver: vi.fn(),
  stopImportReceiver: vi.fn(),
}));

vi.mock("electron", () => ({ app: { getPath: () => "", isPackaged: false } }));

vi.mock("../../electron/main/appLogger", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../electron/main/ipc/errors", () => ({
  AppError: class AppError extends Error {
    constructor(public readonly code: string, message: string) {
      super(message);
      this.name = "AppError";
    }
  },
}));

vi.mock("../../electron/main/library/imageFiles", () => ({
  // 不真正落盘；记录收到几张图即可。fallback 字段在 NO_IMAGES 分支之前不会被用到。
  importImageBuffers: vi.fn(async (images: unknown[]) => ({
    library: { items: [] },
    importedCount: Array.isArray(images) ? images.length : 0,
    importedImageCount: Array.isArray(images) ? images.length : 0,
    importedPromptCount: 0,
    importGroups: [],
    canceled: false,
  })),
}));

import { startImportReceiver, stopImportReceiver } from "../../electron/main/library/importReceiver";

const HOST = "127.0.0.1";

/** 选一个空闲端口：优先 9477，被占用则让操作系统从临时端口中分配。 */
async function pickPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.once("error", () => {
      // 9477 被占用：用 0 让 OS 分配空闲端口。
      const fallback = http.createServer();
      fallback.listen(0, HOST, () => {
        const port = (fallback.address() as { port: number }).port;
        fallback.close(() => resolve(port));
      });
      fallback.once("error", reject);
    });
    probe.listen(9477, HOST, () => {
      const port = (probe.address() as { port: number }).port;
      probe.close(() => resolve(port));
    });
  });
}

async function withServer<T>(fn: (port: number) => Promise<T>): Promise<T> {
  if (runtime.started) {
    return fn(runtime.port);
  }
  const port = await pickPort();
  runtime.port = port;
  startImportReceiver(port);
  runtime.started = true;
  // 监听是异步完成的；给事件循环一圈确认 listening。
  await new Promise((resolve) => setTimeout(resolve, 60));
  try {
    return await fn(port);
  } finally {
    if (runtime.started) {
      stopImportReceiver();
      runtime.started = false;
      runtime.port = 0;
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
  }
}

function request(port: number, method: string, path: string, headers: Record<string, string> = {}, body?: string): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  text: string;
}> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: HOST, port, path, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () =>
        resolve({ status: res.statusCode ?? 0, headers: res.headers, text: Buffer.concat(chunks).toString("utf-8") }),
      );
      res.on("error", reject);
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const ORIGIN_LOOPBACK = "http://127.0.0.1:8188";
const ORIGIN_EXTERNAL = "http://evil.example.com";

describe("importReceiver CORS", () => {
  beforeEach(() => {
    runtime.startImportReceiver.mockClear();
    runtime.stopImportReceiver.mockClear();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("OPTIONS 预检放行本机回环来源并回 204 + ACAO", async () => {
    await withServer(async (port) => {
      const res = await request(port, "OPTIONS", "/guli/suyan/import", {
        Origin: ORIGIN_LOOPBACK,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      });

      expect(res.status).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe(ORIGIN_LOOPBACK);
      expect(String(res.headers["access-control-allow-methods"] ?? "")).toContain("POST");
      expect(String(res.headers["access-control-allow-headers"] ?? "")).toContain("Content-Type");
      expect(String(res.headers["vary"] ?? "")).toContain("Origin");
    });
  });

  it("非回环来源在导入前直接拒绝（不被任意网页调用）", async () => {
    await withServer(async (port) => {
      const res = await request(port, "OPTIONS", "/guli/suyan/import", {
        Origin: ORIGIN_EXTERNAL,
        "Access-Control-Request-Method": "POST",
      });

      // 不能只省略 ACAO；否则普通跨源表单仍可能写入本地数据。
      expect(res.status).toBe(403);
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });
  });

  it("无 Origin 的 OPTIONS 仍 204（直连客户端）", async () => {
    await withServer(async (port) => {
      const res = await request(port, "OPTIONS", "/guli/suyan/import");
      expect(res.status).toBe(204);
    });
  });

  it("GET /guli/suyan/health 带 CORS 头", async () => {
    await withServer(async (port) => {
      const res = await request(port, "GET", "/guli/suyan/health", { Origin: "http://localhost:8188" });

      expect(res.status).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:8188");
      const body = JSON.parse(res.text) as { ok: boolean };
      expect(body.ok).toBe(true);
    });
  });

  it("未实现路径回 404 且带 CORS 头", async () => {
    await withServer(async (port) => {
      const res = await request(port, "GET", "/guli/suyan/nope", { Origin: ORIGIN_LOOPBACK });

      expect(res.status).toBe(404);
      expect(res.headers["access-control-allow-origin"]).toBe(ORIGIN_LOOPBACK);
    });
  });
});
