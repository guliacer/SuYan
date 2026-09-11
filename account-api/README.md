# SuYan Account API（本地参考实现）

供历史版本 **素言 Electron 客户端** 本地联调的账号后端参考实现（方案 §四 / docs/账号登录实施总方案.md）。当前 Electron 已切换为 Guli Identity OIDC 客户端，生产登录不依赖本服务。

**零运行时依赖**：仅用 Node 内置模块（`node:http` + `node:sqlite` + `node:crypto`），
不需要 npm install，不受 Electron 工程 node_modules 原生构建问题影响。需要 **Node ≥ 22.5**（本机为 Node 24）。

> ⚠️ 这是**参考实现/联调后端**，不是生产服务：本地 Mock OAuth、验证链接回显响应、
> 随机 JWT 密钥等均只适合开发环境。生产部署需替换为带 SMTP、真实 OAuth client_secret、
> 密钥管理与审计的正式服务。

## 快速开始

```bash
# 在项目根目录（复用仓库的 typescript）
node node_modules/typescript/bin/tsc -p account-api/tsconfig.account-api.json

# 启动（默认 127.0.0.1:8787，内存外为 account-api/.data/suyan-account.db）
node account-api/dist/src/server.js

# 或
cd account-api && pnpm dev   # build + start
```

验证：

```bash
curl http://127.0.0.1:8787/health
# {"ok":true,"service":"suyan-account-api"}
```

跑冒烟测试（真实 HTTP + 内存 SQLite，覆盖邮箱全链路与 OAuth Mock 全流程）：

```bash
node node_modules/vitest/vitest.mjs run --config account-api/vitest.config.ts
```

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `8787` | 监听端口（仅绑定 127.0.0.1） |
| `DB_PATH` | `account-api/.data/suyan-account.db` | SQLite 文件；`:memory:` 用内存库 |
| `JWT_SECRET` | 随机生成 | accessToken 签名密钥（**生产必须显式配置**） |
| `ACCESS_TOKEN_TTL_MS` | 15 分钟 | accessToken 有效期 |
| `REFRESH_TOKEN_TTL_MS` | 30 天 | refreshToken 有效期（轮换制） |
| `EMAIL_VERIFY_MODE` | `auto` | `auto`=注册即已验证；`token`=走验证占位流程（见下） |
| `MOCK_OAUTH` | `1` | `0` 关闭本地 Mock 授权页 |
| `NODE_ENV` | – | `production` 时不回显验证链接 |

## 接口契约（与 Electron 客户端对齐）

错误统一为 `{ code: "ACCOUNT_*", message }`（客户端按 `code` 处理，不按 message 猜测）；
成功返回 `{ session }` 或 `{ user }`；`expiresAt` 为**毫秒时间戳**（客户端 `tokenManager` 直接比较）。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/register` | `{email,password}` → `{session}` 或 `{verificationRequired, devVerifyUrl}` |
| POST | `/auth/login` | `{email,password}` → `{session}`；未验证 403 `EMAIL_NOT_VERIFIED` |
| POST | `/auth/refresh` | `{refreshToken}` → `{session}`（**轮换**，旧 token 立即失效） |
| POST | `/auth/logout` | Bearer + `{refreshToken?}`，吊销该用户全部 refresh token |
| GET | `/auth/me` | Bearer → `{user}` |
| POST | `/auth/verify-email` | `{token}` → `{user}`（`EMAIL_VERIFY_MODE=token` 时用） |
| GET | `/auth/verify-email?token=` | 浏览器点开验证链接的落页 |
| POST | `/auth/oauth/exchange` | `{provider,code,verifier,redirectUri,state}` → `{session}`（PKCE S256 校验） |
| POST | `/auth/link` | Bearer + 同 exchange 参数 → 绑定到当前用户；已属他人 409 `LINK_CONFIRM_REQUIRED` |
| POST | `/auth/unlink` | Bearer + `{provider}` → 解绑 |
| GET | `/oauth/mock/:provider/authorize` | **仅联调**：模拟授权页（MOCK_OAUTH=1） |
| POST | `/oauth/mock/:provider/confirm` | 确认授权 → 302 回跳 `suyan://oauth/callback?state&code` |
| POST | `/oauth/mock/:provider/deny` | 拒绝 → 302 回跳 `?state&error=access_denied` |
| GET | `/health` | 存活检查 |

Provider 白名单：`google | linuxdo`（仅旧 Mock 联调兼容，不是当前 Electron 登录入口）。

### 统一 User + 多 Identity（方案 §三）

- `user.uid` 是 SuYan 自己的用户 ID；
- 第三方 ID 只存在于 `user.identities[]`（`provider` + `providerUserId`）；
- 同一 mock 账号（如 `user-1`）反复登录返回**同一个 uid**；换一个 mock 账号即「账号切换」。

### 邮件验证占位（方案 §十四）

无 SMTP 服务，`EMAIL_VERIFY_MODE=token` 时：
- 注册返回 `verificationRequired: true`，开发环境附带 `devVerifyUrl`；
- 验证链接同时打印到服务端控制台；
- 未验证登录被拒（403 `ACCOUNT_EMAIL_NOT_VERIFIED`）。

## 用 Mock OAuth 联调 Electron 客户端

后端提供与真实 OAuth 完全相同的 **Authorization Code + PKCE + state** 流程，
让客户端在没有任何开放平台凭证的情况下端到端跑通。Electron 侧**没有**任何 mock——
仍是真实 PKCE 生成、`suyan://oauth/callback` 协议回调、state 单次校验与后端代交换。

给素言主进程设置环境变量后启动（`pnpm dev`）：

```text
SUYAN_ACCOUNT_API_URL=http://127.0.0.1:8787
SUYAN_GOOGLE_CLIENT_ID=mock-client
SUYAN_GOOGLE_AUTHORIZE_URL=http://127.0.0.1:8787/oauth/mock/google/authorize
SUYAN_LINUXDO_CLIENT_ID=mock-client
SUYAN_LINUXDO_AUTHORIZE_URL=http://127.0.0.1:8787/oauth/mock/linuxdo/authorize
```

流程：侧边栏底部「登录 / 注册」→ 点 Google/Linux.do → 系统浏览器打开
模拟授权页 → 输入模拟账号 ID（默认 `user-1`，换 ID 测试账号切换）→ 确认授权 →
回跳 `suyan://oauth/callback` → 主进程校验 state → 代交换 → 落盘 → UI 显示头像用户名。
点「拒绝」可测试 `ACCOUNT_OAUTH_CANCELLED`。

邮件验证占位（`EMAIL_VERIFY_MODE=token`）时，注册响应中的 `devVerifyUrl` 可直接
粘贴到浏览器完成验证。

## 已知边界（诚实清单）

- Mock Provider 的「用户」是稳定派生的（`mock_user` 参数 → `providerUserId`），
  仅用于联调，不代表真实平台语义；
- `/auth/link` 的绑定确认（方案 §十五 情况 C）当前以 409 拒绝收尾，未实现
  「先验证已有账号再确认绑定」的交互式确认流；
- 无速率限制 / 审计日志 / 密钥轮换（参考实现范围外，生产需另行建设）。
