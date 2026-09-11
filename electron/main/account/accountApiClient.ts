import type {
  AccountIdentityProviderId,
  AccountProviderId,
  AccountRegistrationResult,
  AccountSession,
  AccountUser,
  AccountIdentity,
  EmailLoginInput,
  EmailRegisterInput,
} from "../../../src/features/account/types/account";
import { ACCOUNT_IDENTITY_PROVIDER_IDS } from "../../../src/features/account/types/account";
import { net } from "electron";
import {
  ACCOUNT_ERROR_CODES,
  type AccountErrorCode,
} from "../../../src/features/account/types/account";
import { AccountError, isAccountErrorCode } from "./errors";
import { DEFAULT_GULI_IDENTITY_ISSUER } from "./oauth/guliIdentityClient";
import { readGuliIdentityConfigValue } from "./oauth/guliIdentityConfig";

/**
 * SuYan Account API 客户端（方案 §四 / §二十三）。
 *
 * 当前后端未部署：baseUrl 由环境变量 SUYAN_ACCOUNT_API_URL 提供，未配置时
 * 所有网络操作抛出 ACCOUNT_BACKEND_NOT_CONFIGURED（BLOCKED_EXTERNAL_DEPENDENCIES），
 * 绝不伪造本地登录冒充正式功能。Phase 3（邮箱）/ Phase 4-5（OAuth）在此之上补齐。
 *
 * 代理：接入 remoteAiClient 同一代理策略（方案 §二十三），当前仅实现直连 + 超时。
 */

export const ACCOUNT_REQUEST_TIMEOUT_MS = 15_000;

type AccountApiTarget = {
  baseUrl: string;
  kind: "identity" | "legacy";
};

type JsonResponse<T> = {
  payload: T;
  status: number;
};

export function getAccountApiBaseUrl(): string {
  return resolveAccountApiTarget()?.baseUrl ?? "";
}

export async function registerAccount(
  input: EmailRegisterInput,
): Promise<AccountSession | AccountRegistrationResult> {
  const target = requireAccountApiTarget();
  const apiPath =
    target.kind === "identity" ? "/v1/account/register" : "/auth/register";
  const response = await requestJsonWithStatus<unknown>(target.baseUrl, apiPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // confirmPassword 只用于客户端校验，不能发送到身份服务的严格 schema。
    body: JSON.stringify({ email: input.email, password: input.password }),
  });

  if (target.kind === "identity") {
    return parseIdentityRegistration(response.payload, input.email, response.status);
  }
  return parseLegacyRegistration(response.payload, input.email);
}

export async function loginAccount(
  input: EmailLoginInput,
): Promise<AccountSession> {
  return postJson("/auth/login", input);
}

export async function refreshAccountSession(
  refreshToken: string,
): Promise<AccountSession> {
  return postJson("/auth/refresh", { refreshToken });
}

/**
 * 主动退出时通知统一账号中心吊销 refresh token。
 * 本地会话清理由 AccountService 独立完成，因此网络失败不会阻止用户退出本机。
 */
export async function logoutAccountSession(
  accessToken: string,
  refreshToken?: string,
): Promise<void> {
  const baseUrl = requireLegacyApiBaseUrl();
  await requestJson<{ loggedOut?: boolean }>(baseUrl, "/auth/logout", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(refreshToken ? { refreshToken } : {}),
  });
}

/** OAuth 代交换（方案 §四）：把授权 code + PKCE verifier 交给后端，换取 AccountSession。 */
export async function exchangeOAuthCode(
  provider: string,
  exchange: {
    code: string;
    verifier: string;
    redirectUri: string;
    state: string;
  },
): Promise<AccountSession> {
  return postJson("/auth/oauth/exchange", { provider, ...exchange });
}

export async function fetchCurrentUser(
  accessToken: string,
): Promise<AccountUser> {
  const baseUrl = requireLegacyApiBaseUrl();
  const payload = await requestJson<{ user?: unknown }>(baseUrl, "/auth/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return parseAccountUser(payload.user);
}

/** 绑定第三方身份的 API 契约。OAuth code 仍只在主进程内流转。 */
export async function linkAccountIdentity(
  accessToken: string,
  input: {
    provider: string;
    code: string;
    verifier: string;
    redirectUri: string;
    state: string;
  },
): Promise<AccountUser> {
  const baseUrl = requireLegacyApiBaseUrl();
  const payload = await requestJson<{ user?: unknown }>(baseUrl, "/auth/link", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  return parseAccountUser(payload.user);
}

export async function unlinkAccountIdentity(
  accessToken: string,
  provider: AccountProviderId,
): Promise<AccountUser> {
  const baseUrl = requireLegacyApiBaseUrl();
  const payload = await requestJson<{ user?: unknown }>(
    baseUrl,
    "/auth/unlink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ provider }),
    },
  );
  return parseAccountUser(payload.user);
}

async function postJson(
  apiPath: string,
  body: unknown,
): Promise<AccountSession> {
  const baseUrl = requireLegacyApiBaseUrl();
  const payload = await requestJson<{ session?: unknown }>(baseUrl, apiPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseAccountSession(payload.session);
}

function requireAccountApiTarget(): AccountApiTarget {
  const target = resolveAccountApiTarget();
  if (!target) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.BACKEND_NOT_CONFIGURED,
      "账号服务尚未配置，请完成登录服务配置后重试。",
    );
  }
  return target;
}

function requireLegacyApiBaseUrl(): string {
  const target = requireAccountApiTarget();
  if (target.kind === "identity") {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.PROVIDER_UNAVAILABLE,
      "当前身份服务使用统一登录页面，请从登录窗口重新开始。",
    );
  }
  return target.baseUrl;
}

function resolveAccountApiTarget(): AccountApiTarget | null {
  const explicitBaseUrl = process.env.SUYAN_ACCOUNT_API_URL?.trim();
  const identityBaseUrl = getConfiguredIdentityBaseUrl();

  if (explicitBaseUrl) {
    const baseUrl = trimTrailingSlash(explicitBaseUrl);
    return {
      baseUrl,
      kind:
        identityBaseUrl && baseUrl === identityBaseUrl ? "identity" : "legacy",
    };
  }

  return identityBaseUrl
    ? { baseUrl: identityBaseUrl, kind: "identity" }
    : null;
}

function getConfiguredIdentityBaseUrl(): string {
  // Registration is a public endpoint on the same origin as the OIDC issuer.
  // Requiring the public client id prevents an unconfigured build from making
  // requests to the default host accidentally.
  if (!readGuliIdentityConfigValue("GULI_IDENTITY_CLIENT_ID")) {
    return "";
  }

  const value =
    readGuliIdentityConfigValue("GULI_IDENTITY_ISSUER") ||
    DEFAULT_GULI_IDENTITY_ISSUER;
  try {
    const url = new URL(value);
    const isLoopbackHttp =
      url.protocol === "http:" && isLoopbackHost(url.hostname);
    if (url.protocol !== "https:" && !isLoopbackHttp) {
      return "";
    }
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return trimTrailingSlash(url.toString());
  } catch {
    return "";
  }
}

function parseIdentityRegistration(
  input: unknown,
  email: string,
  status: number,
): AccountRegistrationResult {
  if (status !== 202) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.NETWORK_ERROR,
      "账号服务未确认验证邮件请求已受理。",
    );
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.NETWORK_ERROR,
      "账号服务返回了无法解析的数据。",
    );
  }
  const record = input as Record<string, unknown>;
  const data = record.data;
  if (
    record.ok !== true ||
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    typeof (data as Record<string, unknown>).message !== "string"
  ) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.NETWORK_ERROR,
      "账号服务返回的注册结果不完整。",
    );
  }
  return {
    verificationRequired: true,
    email,
    message: (data as Record<string, unknown>).message as string,
    deliveryStatus: "accepted",
  };
}

function parseLegacyRegistration(
  input: unknown,
  email: string,
): AccountSession | AccountRegistrationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.NETWORK_ERROR,
      "账号服务返回了无法解析的数据。",
    );
  }
  const record = input as Record<string, unknown>;
  if (record.session !== undefined) {
    return parseAccountSession(record.session);
  }
  if (record.verificationRequired === true) {
    return {
      verificationRequired: true,
      email,
      message: "验证邮件已发送，请查收邮件并完成邮箱验证。",
      deliveryStatus: "accepted",
    };
  }
  throw new AccountError(
    ACCOUNT_ERROR_CODES.NETWORK_ERROR,
    "账号服务返回的注册结果不完整。",
  );
}

async function requestJson<T>(
  baseUrl: string,
  apiPath: string,
  init: { method: string; headers?: Record<string, string>; body?: string },
): Promise<T> {
  const response = await requestJsonWithStatus<T>(baseUrl, apiPath, init);
  return response.payload;
}

async function requestJsonWithStatus<T>(
  baseUrl: string,
  apiPath: string,
  init: { method: string; headers?: Record<string, string>; body?: string },
): Promise<JsonResponse<T>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    ACCOUNT_REQUEST_TIMEOUT_MS,
  );

  try {
    // Electron 的 net.fetch 走 session.defaultSession 代理；单元测试或非 Electron
    // 环境回退到标准 fetch。账号网络请求因此与应用代理设置保持一致。
    const fetchImpl =
      process.env.NODE_ENV === "test"
        ? globalThis.fetch
        : typeof net?.fetch === "function"
          ? net.fetch.bind(net)
          : globalThis.fetch;
    const response = await fetchImpl(`${baseUrl}${apiPath}`, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      signal: controller.signal,
    });

    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new AccountError(
        extractServerErrorCode(payload, response.status),
        extractServerErrorMessage(payload) ??
          `账号服务请求失败（HTTP ${response.status}）。`,
      );
    }

    if (!payload || typeof payload !== "object") {
      throw new AccountError(
        ACCOUNT_ERROR_CODES.NETWORK_ERROR,
        "账号服务返回了无法解析的数据。",
      );
    }

    return { payload: payload as T, status: response.status };
  } catch (error) {
    if (error instanceof AccountError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new AccountError(
        ACCOUNT_ERROR_CODES.NETWORK_ERROR,
        "账号服务请求超时，请稍后再试。",
      );
    }
    throw new AccountError(
      ACCOUNT_ERROR_CODES.NETWORK_ERROR,
      "无法连接账号服务，请检查网络与代理设置。",
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractServerErrorCode(
  payload: unknown,
  status: number,
): AccountErrorCode {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const error =
      record.error &&
      typeof record.error === "object" &&
      !Array.isArray(record.error)
        ? (record.error as Record<string, unknown>)
        : record;
    if (error.code === "EMAIL_NOT_CONFIGURED") {
      return ACCOUNT_ERROR_CODES.EMAIL_NOT_CONFIGURED;
    }
    if (error.code === "EMAIL_DELIVERY_FAILED") {
      return ACCOUNT_ERROR_CODES.EMAIL_DELIVERY_FAILED;
    }
    if (isAccountErrorCode(error.code)) {
      return error.code;
    }
  }
  if (status === 401) {
    return ACCOUNT_ERROR_CODES.INVALID_CREDENTIALS;
  }
  if (status === 400) {
    return ACCOUNT_ERROR_CODES.INPUT_INVALID;
  }
  return ACCOUNT_ERROR_CODES.NETWORK_ERROR;
}

function extractServerErrorMessage(payload: unknown): string | null {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const error =
      record.error &&
      typeof record.error === "object" &&
      !Array.isArray(record.error)
        ? (record.error as Record<string, unknown>)
        : record;
    if (typeof error.message === "string" && error.message.trim()) {
      return error.message;
    }
  }
  return null;
}

function parseAccountSession(input: unknown): AccountSession {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.NETWORK_ERROR,
      "账号服务返回的会话数据不完整。",
    );
  }

  const record = input as Record<string, unknown>;
  const user = parseAccountUser(record.user);

  if (
    typeof record.accessToken !== "string" ||
    !record.accessToken ||
    typeof record.refreshToken !== "string" ||
    !record.refreshToken ||
    typeof record.expiresAt !== "number" ||
    !Number.isFinite(record.expiresAt)
  ) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.NETWORK_ERROR,
      "账号服务返回的会话数据不完整。",
    );
  }

  return {
    user,
    accessToken: record.accessToken,
    refreshToken: record.refreshToken,
    expiresAt: record.expiresAt,
  };
}

function parseAccountUser(input: unknown): AccountUser {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.NETWORK_ERROR,
      "账号服务返回的用户数据不完整。",
    );
  }

  const record = input as Record<string, unknown>;
  if (
    typeof record.uid !== "string" ||
    !record.uid ||
    typeof record.username !== "string" ||
    !record.username
  ) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.NETWORK_ERROR,
      "账号服务返回的用户数据不完整。",
    );
  }

  return {
    uid: record.uid,
    username: record.username,
    ...(typeof record.avatarUrl === "string" && record.avatarUrl
      ? { avatarUrl: record.avatarUrl }
      : {}),
    ...(typeof record.email === "string" && record.email
      ? { email: record.email }
      : {}),
    ...(typeof record.createdAt === "string"
      ? { createdAt: record.createdAt }
      : {}),
    ...(typeof record.updatedAt === "string"
      ? { updatedAt: record.updatedAt }
      : {}),
    ...(Array.isArray(record.identities) && record.identities.length > 0
      ? { identities: parseIdentities(record.identities) }
      : {}),
  };
}

function parseIdentities(input: unknown[]): AccountIdentity[] {
  return input.flatMap((item): AccountIdentity[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }
    const record = item as Record<string, unknown>;
    if (
      typeof record.provider !== "string" ||
      typeof record.providerUserId !== "string"
    ) {
      return [];
    }
    if (record.provider === "wechat" || record.provider === "weixin") {
      return [];
    }
    if (!(ACCOUNT_IDENTITY_PROVIDER_IDS as readonly string[]).includes(record.provider)) {
      return [];
    }
    const provider = record.provider as AccountIdentityProviderId;
    return [
      {
        provider,
        providerUserId: record.providerUserId,
        ...(typeof record.issuer === "string" && record.issuer.trim()
          ? { issuer: record.issuer.trim() }
          : {}),
        ...(typeof record.linkedAt === "string"
          ? { linkedAt: record.linkedAt }
          : {}),
      },
    ];
  });
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "[::1]" ||
    normalized === "::1"
  );
}
