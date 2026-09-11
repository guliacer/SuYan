import { randomToken, sha256Hex, verifyPkce } from "./security.js";
import type { AccountDb } from "./db.js";
import type { Config } from "./config.js";
import { AuthService, type PublicUser, type Session } from "./authService.js";
import { ApiError, badRequest } from "./errors.js";
import { ACCOUNT_ERROR_CODES } from "./errors.js";

/**
 * OAuth 代交换与本地 Mock Provider（方案 §四/§七）：
 *
 * - /auth/oauth/exchange：Electron 把「授权 code + PKCE verifier + state」交给
 *   后端，由后端校验（单次使用、过期、PKCE S256、redirect_uri 匹配）并完成登录
 *   或绑定。真实第三方凭证接入后，后端在此处用受保护的 client_secret 换 token。
 *
 * - /oauth/mock/:provider/*：**仅本地联调**的模拟授权页（MOCK_OAUTH=1 时启用）。
 *   它走的是和真实 OAuth 完全相同的 Authorization Code + PKCE + state 流程，
 *   让 Electron 客户端在没有任何开放平台凭证的情况下端到端联调
 *   （Electron 侧仍是真实 PKCE/state/回调校验，不含任何 mock）。
 */

const PROVIDERS = ["google", "linuxdo"] as const;
export type OAuthProviderId = (typeof PROVIDERS)[number];

export function isProvider(value: string): value is OAuthProviderId {
  return (PROVIDERS as readonly string[]).includes(value);
}

const PROVIDER_LABELS: Record<OAuthProviderId, string> = {
  google: "Google",
  linuxdo: "Linux.do",
};

/** 校验回调地址：只接受 suyan://oauth/callback（可被 SUYAN_OAUTH_REDIRECT_URI 覆盖）。 */
export function isAllowedRedirectUri(config: Config, redirectUri: string): boolean {
  const overridden = process.env.SUYAN_OAUTH_REDIRECT_URI?.trim();
  if (overridden && redirectUri === overridden) {
    return true;
  }
  try {
    const url = new URL(redirectUri);
    return url.protocol === "suyan:" && url.hostname === "oauth" && url.pathname === "/callback";
  } catch {
    return false;
  }
}

export type ExchangeInput = {
  provider: string;
  code: string;
  verifier: string;
  redirectUri: string;
  state: string;
};

type ConsumedCode = {
  provider: OAuthProviderId;
  providerUserId: string;
};

export class OAuthService {
  constructor(
    private readonly db: AccountDb,
    private readonly config: Config,
    private readonly auth: AuthService,
  ) {}

  /** 校验并单次消费授权码（PKCE + redirect_uri + provider 全校验）。 */
  private consumeValidatedCode(input: ExchangeInput): ConsumedCode {
    if (!isProvider(input.provider)) {
      throw new ApiError(ACCOUNT_ERROR_CODES.OAUTH_PROVIDER_ERROR, "不支持的登录渠道。", 400);
    }
    if (!input.code || !input.verifier || !input.redirectUri || !input.state) {
      throw badRequest("OAuth 回调缺少必要参数。");
    }
    if (!isAllowedRedirectUri(this.config, input.redirectUri)) {
      throw new ApiError(ACCOUNT_ERROR_CODES.OAUTH_PROVIDER_ERROR, "OAuth 回调地址不合法。", 400);
    }

    const record = this.db.consumeOAuthCode(sha256Hex(input.code));
    if (!record) {
      throw new ApiError(ACCOUNT_ERROR_CODES.OAUTH_STATE_INVALID, "授权码无效、过期或已被使用。", 400);
    }
    if (record.provider !== input.provider || record.redirect_uri !== input.redirectUri) {
      throw new ApiError(ACCOUNT_ERROR_CODES.OAUTH_STATE_INVALID, "授权码与回调参数不匹配。", 400);
    }
    if (record.expires_at <= Date.now()) {
      throw new ApiError(ACCOUNT_ERROR_CODES.OAUTH_STATE_INVALID, "授权码已过期。", 400);
    }
    if (!verifyPkce(input.verifier, record.code_challenge)) {
      throw new ApiError(ACCOUNT_ERROR_CODES.OAUTH_STATE_INVALID, "PKCE 校验失败。", 400);
    }

    return { provider: record.provider, providerUserId: record.provider_user_id };
  }

  /** 登录（或首次自动注册）：identity 不存在则创建 SuYan 用户。 */
  exchangeForSession(input: ExchangeInput): Session {
    const { provider, providerUserId } = this.consumeValidatedCode(input);
    const user = this.auth.resolveOrCreateOAuthUser(provider, providerUserId, mockUsername(provider, providerUserId));
    return this.auth.issueSession(user);
  }

  /** 绑定到当前登录用户（方案 §十五：已属他人则拒绝，不自动合并）。 */
  linkToCurrentUser(accessToken: string, input: ExchangeInput): PublicUser {
    const { provider, providerUserId } = this.consumeValidatedCode(input);
    return this.auth.attachOAuthIdentity(accessToken, provider, providerUserId);
  }

  // ---- 本地 Mock 授权页 ----

  mockAuthorizePage(providerRaw: string, params: URLSearchParams): string {
    if (!this.config.mockOAuth) {
      throw new ApiError(ACCOUNT_ERROR_CODES.PROVIDER_UNAVAILABLE, "Mock OAuth 未启用（需 MOCK_OAUTH=1）。", 404);
    }
    if (!isProvider(providerRaw)) {
      throw new ApiError(ACCOUNT_ERROR_CODES.OAUTH_PROVIDER_ERROR, "不支持的登录渠道。", 400);
    }
    const redirectUri = params.get("redirect_uri") ?? "";
    if (!isAllowedRedirectUri(this.config, redirectUri)) {
      throw badRequest("回调地址不合法。");
    }
    const state = params.get("state") ?? "";
    if (!state) {
      throw badRequest("缺少 state 参数。");
    }
    const codeChallenge = params.get("code_challenge") ?? "";
    if (!codeChallenge) {
      throw badRequest("缺少 code_challenge（PKCE 必须）。");
    }
    if ((params.get("code_challenge_method") ?? "S256").toUpperCase() !== "S256") {
      throw badRequest("仅支持 S256 code_challenge_method。");
    }

    const hiddenFields: Array<[string, string]> = [
      ["client_id", params.get("client_id") ?? ""],
      ["redirect_uri", redirectUri],
      ["response_type", params.get("response_type") ?? "code"],
      ["scope", params.get("scope") ?? ""],
      ["state", state],
      ["code_challenge", codeChallenge],
      ["code_challenge_method", "S256"],
    ];
    const hidden = hiddenFields
      .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`)
      .join("\n");

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>模拟授权 · ${escapeHtml(PROVIDER_LABELS[providerRaw])}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f6f5f1; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #fff; border: 1px solid #e6e2da; border-radius: 16px; padding: 28px; width: 340px; box-shadow: 0 8px 24px rgba(0,0,0,.06); }
    h1 { font-size: 18px; margin: 0 0 4px; }
    p { color: #777; font-size: 13px; margin: 0 0 16px; }
    label { font-size: 12px; color: #555; }
    input[type=text] { width: 100%; box-sizing: border-box; margin: 6px 0 16px; padding: 8px 10px; border: 1px solid #d9d4ca; border-radius: 8px; font-size: 14px; }
    .row { display: flex; gap: 8px; }
    button { flex: 1; padding: 10px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; border: 1px solid; }
    .allow { background: #2f6f4f; color: #fff; border-color: #2f6f4f; }
    .deny { background: #fff; color: #555; border-color: #d9d4ca; }
    .hint { margin-top: 14px; font-size: 11px; color: #999; }
  </style>
</head>
<body>
  <form class="card" method="post" action="/oauth/mock/${encodeURIComponent(providerRaw)}/confirm">
    <h1>${escapeHtml(PROVIDER_LABELS[providerRaw])} 模拟授权</h1>
    <p>本地联调用 Mock Provider（真实 OAuth 流程，无第三方凭证）。</p>
    ${hidden}
    <label for="mock_user">模拟账号 ID（换一个即可测试「账号切换」）</label>
    <input id="mock_user" name="mock_user" type="text" value="user-1" />
    <div class="row">
      <button class="allow" type="submit">确认授权</button>
      <button class="deny" type="submit" formaction="/oauth/mock/${encodeURIComponent(providerRaw)}/deny">拒绝</button>
    </div>
    <p class="hint">拒绝将回跳 error=access_denied，用于测试 ACCOUNT_OAUTH_CANCELLED。</p>
  </form>
</body>
</html>`;
  }

  /** Mock 确认：签发授权码并回跳 suyan://oauth/callback。 */
  mockConfirm(providerRaw: string, params: URLSearchParams): { location: string; status: 302 } {
    const redirectUri = requireMockParam(params, "redirect_uri");
    const state = requireMockParam(params, "state");
    const codeChallenge = requireMockParam(params, "code_challenge");
    if (!isAllowedRedirectUri(this.config, redirectUri)) {
      throw badRequest("回调地址不合法。");
    }
    const mockUser = (params.get("mock_user") ?? "user-1").trim() || "user-1";
    const code = randomToken();
    this.db.insertOAuthCode(
      sha256Hex(code),
      providerRaw,
      mockUser,
      codeChallenge,
      redirectUri,
      Date.now() + this.config.oauthCodeTtlMs,
    );

    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set("state", state);
    callbackUrl.searchParams.set("code", code);
    return { location: callbackUrl.toString(), status: 302 };
  }

  /** Mock 拒绝：回跳 error=access_denied。 */
  mockDeny(providerRaw: string, params: URLSearchParams): { location: string; status: 302 } {
    const redirectUri = requireMockParam(params, "redirect_uri");
    const state = requireMockParam(params, "state");
    if (!isAllowedRedirectUri(this.config, redirectUri)) {
      throw badRequest("回调地址不合法。");
    }
    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set("state", state);
    callbackUrl.searchParams.set("error", "access_denied");
    callbackUrl.searchParams.set("error_description", "用户在模拟授权页拒绝了授权。");
    return { location: callbackUrl.toString(), status: 302 };
  }
}

function requireMockParam(params: URLSearchParams, name: string): string {
  const value = params.get(name) ?? "";
  if (!value) {
    throw badRequest(`缺少 ${name} 参数。`);
  }
  return value;
}

function mockUsername(provider: string, providerUserId: string): string {
  return `${PROVIDER_LABELS[provider as OAuthProviderId] ?? "第三方"}·${providerUserId}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
