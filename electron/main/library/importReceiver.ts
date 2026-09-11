import http from "node:http";
import { randomUUID } from "node:crypto";
import { BrowserWindow } from "electron";
import { AppError } from "../ipc/errors";
import { logger } from "../appLogger";
import { importImageBuffers, type ImportImageBufferInput } from "./imageFiles";
import { readLibraryRoots } from "./libraryRoots";
import { ipcChannels } from "../../shared/ipcChannels";
import { createEmptyPromptImportDraft, type PromptImportDraft } from "../../shared/promptImportParser";

/**
 * 素言本地收件服务（ComfyUI 等外部工具推送素材用）。
 *
 * - 仅监听 127.0.0.1 本机回环，不暴露到局域网。
 * - 提供 POST /guli/suyan/import :
 *     body: multipart/form-data，字段：
 *       - 若干 <file> 字段（图像二进制，png/jpg/webp）
 *       可选附加字段（与图像同批次）：
 *       - prompt / negativePrompt / title / tags(JSON字符串数组) / generationMethod
 *     响应: JSON。
 * - 图片经素言既有导入链路落盘到 managed 库（粘贴导入同一路径），
 *   PNG 内嵌 ComfyUI prompt/workflow 元数据会被自动解析建组。
 */
const HOST = "127.0.0.1";
const DEFAULT_PORT = 9477;
const MAX_BODY_BYTES = 64 * 1024 * 1024; // 64 MiB 上限
const MODULE = "import-receiver";

// ComfyUI 等外部工具运行在本机回环的不同端口（如 8188），与 9477 跨端口即跨源，
// 浏览器会强制 CORS 预检。只放行本机回环来源，避免被任意网页调用。
const ALLOWED_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

let server: http.Server | null = null;

type ImportField = { kind: "file"; name: string; data: Buffer } | { kind: "text"; name: string; data: string };

/**
 * 取请求 Origin 是否属于本机回环；用于回显 ACAO。
 * 仅放行 http(s)://127.0.0.1|localhost|[::1]:* 这类同机来源。
 */
function resolveAllowedOrigin(request: http.IncomingMessage): string | null {
  const origin = request.headers.origin;
  if (typeof origin !== "string" || origin.length === 0) return null;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTNAMES.has(hostname)) return null;
  return origin;
}

/** 把 CORS 响应头写到 response 上；origin 为 null 时不写 ACAO（浏览器会拦截）。 */
function applyCorsHeaders(response: http.ServerResponse, origin: string | null): void {
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Credentials", "false");
  }
  // methods/headers 即使没 Origin 也写，便于直连客户端调试。
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Access-Control-Max-Age", "600");
}

export function startImportReceiver(port: number = DEFAULT_PORT): void {
  if (server) return;

  server = http.createServer((request, response) => {
    handleRequest(request, response).catch((error: unknown) => {
      logger.error(MODULE, "request:fatal", {
        message: error instanceof Error ? error.message : String(error),
      });
      // 500 兜底也带上 CORS，避免预检通过后的实际请求因异常被浏览器吞掉错误体。
      applyCorsHeaders(response, resolveAllowedOrigin(request));
      writeJson(response, 500, { ok: false, error: { code: "INTERNAL", message: "收件处理失败。" } });
    });
  });

  server.on("error", (error) => {
    logger.error(MODULE, "server:error", { message: error.message });
  });

  server.listen(port, HOST, () => {
    logger.info(MODULE, "server:listening", { host: HOST, port });
  });
}

export function stopImportReceiver(): void {
  if (!server) return;
  server.close(() => {
    logger.info(MODULE, "server:stopped", {});
  });
  server = null;
}

export function isImportReceiverListening(): boolean {
  return server !== null;
}

async function handleRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  const url = request.url ?? "/";
  const pathname = url.split("?")[0];
  const origin = resolveAllowedOrigin(request);

  // A cross-origin form POST can still mutate local data even when the browser
  // refuses to expose the response. Reject it before reading or importing the
  // body; requests without Origin remain available to local CLI integrations.
  if (request.headers.origin !== undefined && origin === null) {
    writeJson(response, 403, { ok: false, error: { code: "ORIGIN_NOT_ALLOWED", message: "仅允许本机来源访问收件服务。" } });
    return;
  }

  // CORS 预检：OPTIONS 一律先放行（带 CORS 头即可，不需路由命中）。
  if (request.method === "OPTIONS") {
    applyCorsHeaders(response, origin);
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && pathname === "/guli/suyan/health") {
    applyCorsHeaders(response, origin);
    writeJson(response, 200, { ok: true, data: { listening: true } });
    return;
  }

  if (request.method !== "POST" || pathname !== "/guli/suyan/import") {
    applyCorsHeaders(response, origin);
    writeJson(response, 404, { ok: false, error: { code: "NOT_FOUND", message: "接口不存在。" } });
    return;
  }

  // POST 响应也必须带 CORS 头，否则浏览器会拦截 success body 的读取。
  applyCorsHeaders(response, origin);

  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    writeJson(response, 400, { ok: false, error: { code: "BAD_CONTENT_TYPE", message: "仅接受 multipart/form-data。" } });
    return;
  }

  let body: Buffer;
  try {
    body = await readBody(request);
  } catch (error) {
    writeJson(response, 413, {
      ok: false,
      error: { code: "BODY_TOO_LARGE", message: error instanceof Error ? error.message : "请求体过大。" },
    });
    return;
  }

  let fields: ImportField[];
  try {
    fields = await parseMultipartFields(body, contentType);
  } catch (error) {
    writeJson(response, 400, {
      ok: false,
      error: { code: "MULTIPART_INVALID", message: error instanceof Error ? error.message : "请求格式错误。" },
    });
    return;
  }

  // 收集图片与文本字段
  const images: ImportImageBufferInput[] = [];
  const textByName = new Map<string, string>();

  for (const field of fields) {
    if (field.kind === "file") {
      if (field.data.byteLength > 0) {
        images.push({ name: field.name, data: field.data });
      }
    } else {
      textByName.set(field.name.toLowerCase(), field.data);
    }
  }

  const prompt = textByName.get("prompt") ?? "";
  const negativePrompt = textByName.get("negativeprompt") ?? "";
  const title = textByName.get("title") ?? "";
  const generationMethod = textByName.get("generationmethod") ?? "comfyui";

  if (images.length === 0) {
    writeJson(response, 400, { ok: false, error: { code: "NO_IMAGES", message: "未收到任何图片。" } });
    return;
  }

  logger.info(MODULE, "import:received", {
    imageCount: images.length,
    hasPrompt: Boolean(prompt.trim()),
  });

  // 外置文本字段作为整批 fallback：PNG 内嵌元数据未覆盖的字段会被它补全。
  const fallbackDraft: PromptImportDraft = {
    ...createEmptyPromptImportDraft(),
    title,
    prompt,
    negativePrompt,
    generationMethod: generationMethod || null,
  };

  const result = await importImageBuffers(images, { fallbackDraft });

  // 落库后广播，让素材库界面立刻刷新（与外部目录 watch 同步一致）。
  const roots = await readLibraryRoots();
  const changedData = {
    library: result.library,
    roots,
    rootId: null,
    importedCount: result.importedImageCount ?? result.importedCount ?? 0,
    missingCount: 0,
    renamedCount: 0,
  };
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send(ipcChannels.libraryExternalChanged, changedData);
    }
  });

  writeJson(response, 200, {
    ok: true,
    data: {
      importedCount: result.importedCount,
      importedImageCount: result.importedImageCount ?? result.importedCount,
      importedPromptCount: result.importedPromptCount ?? 0,
      prompt: prompt || title || null,
    },
  });
}

function readBody(request: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    request.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new AppError("BODY_TOO_LARGE", "请求体超过 64MB 限制。"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", (error) => reject(error));
  });
}

function parseMultipartFields(body: Buffer, contentType: string): Promise<ImportField[]> {
  return new Promise((resolve) => {
    const boundaryMatch = /boundary="?([^";\r\n]+)"?/i.exec(contentType);
    if (!boundaryMatch) {
      resolve([]);
      return;
    }
    resolve(parseMultipartFieldsSync(body, boundaryMatch[1]));
  });
}

function parseMultipartFieldsSync(body: Buffer, boundary: string): ImportField[] {
  const fields: ImportField[] = [];
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  let cursor = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const nextBoundary = body.indexOf(boundaryBuffer, cursor);
    if (nextBoundary < 0) break;

    const partStart = nextBoundary + boundaryBuffer.length;
    // 跳过结尾 "--"（结束标记）
    if (body[partStart] === 0x2d && body[partStart + 1] === 0x2d) break;
    // 跳过 \r\n
    let headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), partStart);
    if (headerEnd < 0) break;
    const header = body.slice(partStart, headerEnd).toString("latin1");
    const dataStart = headerEnd + 4;

    // 下一边界前的数据
    const nextNext = body.indexOf(boundaryBuffer, dataStart);
    if (nextNext < 0) break;
    const partData = body.slice(dataStart, nextNext);
    // 去掉尾部 \r\n
    const endMarker = Buffer.from("\r\n");
    const trimmedData =
      partData.length >= 2 && partData.subarray(partData.length - 2).equals(endMarker)
        ? partData.subarray(0, partData.length - 2)
        : partData;

    const nameMatch = /name="([^"]*)"/i.exec(header);
    const fileNameMatch = /filename="([^"]*)"/i.exec(header);
    const name = nameMatch?.[1] ?? `image_${randomUUID()}.png`;
    const fileName = fileNameMatch?.[1] ?? "";

    if (fileName) {
      fields.push({ kind: "file", name: fileName, data: trimmedData });
    } else {
      fields.push({ kind: "text", name, data: trimmedData.toString("utf-8") });
    }

    cursor = nextNext;
  }

  return fields;
}

function writeJson(response: http.ServerResponse, status: number, payload: unknown): void {
  const text = JSON.stringify(payload);
  // 注：CORS 等头由 applyCorsHeaders 在 writeHead 之前 setHeader，
  // 这里 writeHead 时已合并在内；Content-Length 必须显式写，避免分块传输。
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    Connection: "close",
  });
  response.end(text);
}
