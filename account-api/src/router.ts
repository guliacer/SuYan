import type { IncomingMessage, ServerResponse } from "node:http";
import { ApiError, badRequest } from "./errors.js";

/**
 * 极简路由：方法 + 路径匹配（支持 :param），JSON body 解析，
 * 统一错误契约 { code, message }（对齐 Electron accountApiClient 的解析逻辑）。
 */

export type RouteContext = {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
};

type Handler = (ctx: RouteContext) => Promise<unknown> | unknown;
type RouteEntry = { method: string; pattern: RegExp; keys: string[]; handler: Handler };

export class Router {
  private routes: RouteEntry[] = [];

  get(path: string, handler: Handler): void {
    this.add("GET", path, handler);
  }

  post(path: string, handler: Handler): void {
    this.add("POST", path, handler);
  }

  private add(method: string, path: string, handler: Handler): void {
    const keys: string[] = [];
    const pattern = path.replace(/:[a-zA-Z_]+/g, (match) => {
      keys.push(match.slice(1));
      return "([^/]+)";
    });
    this.routes.push({ method, pattern: new RegExp(`^${pattern}$`), keys, handler });
  }

  async dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;

    for (const route of this.routes) {
      if (route.method !== req.method) {
        continue;
      }
      const match = route.pattern.exec(pathname);
      if (!match) {
        continue;
      }

      const params: Record<string, string> = {};
      route.keys.forEach((key, index) => {
        params[key] = decodeURIComponent(match[index + 1] ?? "");
      });

      try {
        const result = await route.handler({ req, res, params });
        if (!res.writableEnded) {
          sendJson(res, 200, result);
        }
      } catch (error) {
        handleError(res, error);
      }
      return;
    }

    sendJson(res, 404, { code: "ACCOUNT_INPUT_INVALID", message: "接口不存在。" });
  }
}

export async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) {
      throw badRequest("请求体过大。");
    }
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not-object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw badRequest("请求体不是合法 JSON。");
  }
}

export async function readFormBody(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

export function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

export function sendRedirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store" });
  res.end();
}

export function handleError(res: ServerResponse, error: unknown): void {
  if (error instanceof ApiError) {
    sendJson(res, error.status, error.toPayload());
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  sendJson(res, 500, { code: "ACCOUNT_NETWORK_ERROR", message: `服务器内部错误：${message}` });
}

export function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    throw badRequest(`缺少参数 ${key}。`);
  }
  return value.trim();
}

export function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function readBearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? null;
}
