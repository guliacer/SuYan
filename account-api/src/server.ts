import { createServer } from "node:http";
import type { Server } from "node:http";
import { loadConfig } from "./config.js";
import { openAccountDb } from "./db.js";
import { AuthService, type PublicUser, type Session } from "./authService.js";
import { OAuthService } from "./oauthService.js";
import { Router, handleError, readBearerToken, readFormBody, readJsonBody, requireString, sendHtml, sendJson, sendRedirect } from "./router.js";
import { ApiError } from "./errors.js";

/**
 * SuYan Account API 本地参考实现（方案 §四）。
 * 启动：pnpm dev（零运行时依赖）。联调指引见 account-api/README.md。
 */

export type ApiApp = {
  server: Server;
  auth: AuthService;
  oauth: OAuthService;
  close: () => Promise<void>;
};

export function buildApp(options: { env?: NodeJS.ProcessEnv; dbPath?: string } = {}): {
  config: ReturnType<typeof loadConfig>;
  auth: AuthService;
  oauth: OAuthService;
  router: Router;
  createServer: () => Server;
  close: () => void;
} {
  const config = loadConfig(options.env ?? process.env);
  if (options.dbPath) {
    config.dbPath = options.dbPath;
  }
  const db = openAccountDb(config);
  const auth = new AuthService(db, config);
  const oauth = new OAuthService(db, config, auth);
  const router = new Router();

  registerRoutes(router, auth, oauth, config.mockOAuth);

  return {
    config,
    auth,
    oauth,
    router,
    createServer: () =>
      createServer((req, res) => {
        void router.dispatch(req, res).catch((error) => handleError(res, error));
      }),
    close: () => db.close(),
  };
}

export async function startServer(options: { env?: NodeJS.ProcessEnv; dbPath?: string } = {}): Promise<ApiApp> {
  const app = buildApp(options);
  const server = app.createServer();

  await new Promise<void>((resolve) => server.listen(app.config.port, "127.0.0.1", resolve));

  console.log(`[suyan-account-api] listening on http://127.0.0.1:${app.config.port}`);
  console.log(`[suyan-account-api] db: ${app.config.dbPath}`);
  console.log(`[suyan-account-api] emailVerifyMode=${app.config.emailVerifyMode} mockOAuth=${app.config.mockOAuth} dev=${app.config.dev}`);

  return {
    server,
    auth: app.auth,
    oauth: app.oauth,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      app.close();
    },
  };
}

function registerRoutes(
  router: Router,
  auth: AuthService,
  oauth: OAuthService,
  mockOAuth: boolean,
): void {
  router.get("/health", () => ({ ok: true, service: "suyan-account-api" }));

  router.post("/auth/register", async ({ req }) => {
    const body = await readJsonBody(req);
    const result = await auth.register({
      email: requireString(body, "email"),
      password: requireString(body, "password"),
    });
    if ("verificationRequired" in result) {
      return { verificationRequired: true, ...(result.devVerifyUrl ? { devVerifyUrl: result.devVerifyUrl } : {}) };
    }
    return { session: result };
  });

  router.post("/auth/login", async ({ req }) => {
    const body = await readJsonBody(req);
    const session = auth.login({
      email: requireString(body, "email"),
      password: requireString(body, "password"),
    });
    return { session };
  });

  router.post("/auth/refresh", async ({ req }) => {
    const body = await readJsonBody(req);
    const session = auth.refresh(requireString(body, "refreshToken"));
    return { session };
  });

  router.post("/auth/logout", async ({ req }) => {
    const token = readBearerToken(req);
    if (!token) {
      throw new ApiError("ACCOUNT_NOT_LOGGED_IN", "未登录。", 401);
    }
    const body = await readJsonBody(req);
    const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : undefined;
    return auth.logout(token, refreshToken);
  });

  router.get("/auth/me", ({ req }) => {
    const token = readBearerToken(req);
    if (!token) {
      throw new ApiError("ACCOUNT_NOT_LOGGED_IN", "未登录。", 401);
    }
    return { user: auth.me(token) };
  });

  // 邮件验证占位（EMAIL_VERIFY_MODE=token 时使用；无 SMTP 服务，链接由响应/控制台给出）。
  router.post("/auth/verify-email", async ({ req }) => {
    const body = await readJsonBody(req);
    const user = auth.verifyEmail(requireString(body, "token"));
    return { user };
  });
  router.get("/auth/verify-email", ({ req, res }) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const token = url.searchParams.get("token") ?? "";
    const user = auth.verifyEmail(token);
    sendHtml(res, `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px">邮箱 <b>${escapeHtml(user.email ?? "")}</b> 已验证成功，可以回到素言登录。</body>`);
  });

  // ---- OAuth 代交换（真实流程） ----
  router.post("/auth/oauth/exchange", async ({ req }) => {
    const body = await readJsonBody(req);
    const session: Session = oauth.exchangeForSession({
      provider: requireString(body, "provider"),
      code: requireString(body, "code"),
      verifier: requireString(body, "verifier"),
      redirectUri: requireString(body, "redirectUri"),
      state: requireString(body, "state"),
    });
    return { session };
  });

  router.post("/auth/link", async ({ req }) => {
    const token = readBearerToken(req);
    if (!token) {
      throw new ApiError("ACCOUNT_NOT_LOGGED_IN", "未登录。", 401);
    }
    const body = await readJsonBody(req);
    const user: PublicUser = oauth.linkToCurrentUser(token, {
      provider: requireString(body, "provider"),
      code: requireString(body, "code"),
      verifier: requireString(body, "verifier"),
      redirectUri: requireString(body, "redirectUri"),
      state: requireString(body, "state"),
    });
    return { user };
  });

  router.post("/auth/unlink", async ({ req }) => {
    const token = readBearerToken(req);
    if (!token) {
      throw new ApiError("ACCOUNT_NOT_LOGGED_IN", "未登录。", 401);
    }
    const body = await readJsonBody(req);
    return { user: auth.unlinkIdentity(token, requireString(body, "provider")) };
  });

  // ---- 本地 Mock OAuth 授权页（仅联调，走完整 PKCE + state + 回调流程） ----
  if (mockOAuth) {
    router.get("/oauth/mock/:provider/authorize", ({ req, res, params }) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      sendHtml(res, oauth.mockAuthorizePage(params.provider ?? "", url.searchParams));
    });

    router.post("/oauth/mock/:provider/confirm", async ({ req, res, params }) => {
      const form = await readFormBody(req);
      const redirect = oauth.mockConfirm(params.provider ?? "", form);
      sendRedirect(res, redirect.location);
    });

    router.post("/oauth/mock/:provider/deny", async ({ req, res, params }) => {
      const form = await readFormBody(req);
      const redirect = oauth.mockDeny(params.provider ?? "", form);
      sendRedirect(res, redirect.location);
    });
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 直接运行时启动（`node dist/src/server.js`）。
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href;
if (isMain) {
  void startServer();
}
