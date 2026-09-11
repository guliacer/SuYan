import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

/**
 * 环境配置（全部可用环境变量覆盖）。默认值面向本地联调：
 * - 数据库落在仓库内 account-api/.data/suyan-account.db（可整体删除重置）；
 * - JWT_SECRET 未设置时随机生成（重启后旧 accessToken 失效，仅限开发）。
 */

export type Config = {
  port: number;
  dbPath: string;
  jwtSecret: string;
  accessTokenTtlMs: number;
  refreshTokenTtlMs: number;
  oauthCodeTtlMs: number;
  /** auto = 注册即视为已验证（默认，本地联调无邮件服务）；token = 走验证占位流程。 */
  emailVerifyMode: "auto" | "token";
  /** 开启后提供 /oauth/mock/:provider/* 模拟授权页（仅本地联调用）。 */
  mockOAuth: boolean;
  /** 联调提示信息（验证链接等）随响应返回，仅开发用。 */
  dev: boolean;
};

/**
 * 定位 account-api 包根目录（编译后 dist/src 或源码 src 布局都适用），
 * 默认数据库固定落在 <packageRoot>/.data/suyan-account.db。
 */
function findPackageRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 8; i += 1) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as { name?: string };
      if (pkg.name === "suyan-account-api") {
        return dir;
      }
    } catch {
      // 继续向上查找。
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return startDir;
}

const DEFAULT_DB_PATH = path.join(findPackageRoot(import.meta.dirname), ".data", "suyan-account.db");

function normalizePort(raw: string | undefined): number {
  const value = Number(raw ?? 8787);
  if (!Number.isInteger(value) || value <= 0 || value > 65535) {
    // 防御环境里残留的 PORT=0 等非法值（例如沙箱注入），回退默认端口。
    return 8787;
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const emailVerifyMode = env.EMAIL_VERIFY_MODE === "token" ? "token" : "auto";
  const mockOAuth = env.MOCK_OAUTH === "0" ? false : true;

  return {
    port: normalizePort(env.PORT),
    dbPath: env.DB_PATH ? path.resolve(env.DB_PATH) : DEFAULT_DB_PATH,
    jwtSecret: env.JWT_SECRET?.trim() || randomBytes(32).toString("hex"),
    accessTokenTtlMs: Number(env.ACCESS_TOKEN_TTL_MS ?? 15 * 60 * 1000),
    refreshTokenTtlMs: Number(env.REFRESH_TOKEN_TTL_MS ?? 30 * 24 * 60 * 60 * 1000),
    oauthCodeTtlMs: Number(env.OAUTH_CODE_TTL_MS ?? 10 * 60 * 1000),
    emailVerifyMode,
    mockOAuth,
    dev: env.NODE_ENV !== "production",
  };
}
