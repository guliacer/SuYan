# Guli Identity 真实授权适配

2026-09-08 后续实施：Guli Identity 已移除桌面自动 consent，展示当前账号、权限、允许/取消/切换账号，并部署 `guli-identity:consent-20260908` 补丁。Cloudflare 隧道已修复，公网 Discovery/health 为 200，真实浏览器已进入登录页。详细验收、临时隧道配置限制和回滚见 `W:\Guli Identity\docs\consent-20260908.md`。以下为原始需求与设备码模式的可选后续范围，不能据此误判为尚未实施或已支持设备码。

2026-09-08 核查：线上 Discovery 返回 HTTP 530 / Cloudflare 1033。先恢复 cloudflared 隧道及身份服务，确认 Discovery、授权页、token、JWKS 端点可用。

素言已使用系统浏览器、Authorization Code + PKCE S256、state、nonce 及 suyan://oauth/callback；这是真实 OAuth，不需要客户端保存 GitHub secret。现在请求 `prompt=login consent`，切换账号时请求 `select_account consent`，回调后继续由用户确认身份及头像昵称。

## 身份服务必须修复

`src/modules/oidc/interaction.routes.ts` 的 consent GET 分支，对 `isDesktopPublicClient(details)` 自动调用 saveConsentGrant / finishInteraction，并记录 outcome: automatic。移除桌面客户端自动同意分支，统一展示真实授权确认页：应用名称、当前账号、权限、允许、取消和切换账号。GET 不得创建授权 grant；只有带有效 CSRF 的用户允许 POST 才能保存 grant 并完成交互。取消不得签发授权码。

保留 provider 账号选择、OIDC state/nonce/PKCE、回调白名单和绑定 expectedUid 校验。不得硬编码开发者账号，不得把网站已有登录会话当作用户已同意本次授权。

测试：有/无现成会话、已有 grant + 显式 consent、换账号、拒绝授权、CSRF 无效、错误 state、回调重放、绑定另一账号。确认桌面客户端请求 consent 时 GET 只渲染页面，用户允许之后才回调。

## 若要和 GitHub CLI 一样输入设备码

这是另一种 OAuth Device Authorization Grant（RFC 8628），不是伪造一个验证码页面。服务端须先提供 device_authorization_endpoint、verification_uri、短期 user_code/device_code、授权页面和 token 轮询契约，并正确处理 authorization_pending、slow_down、access_denied、expired_token；设备码单次使用、限流，禁止记录原始代码及 token。当前客户端未实现此模式，不应宣称已支持。浏览器 PKCE 流程仍作为现有可用标准方案。

线上恢复并部署服务端修复后，使用两个不同用户实际验收完整授权流程；本地单元测试通过不代表线上登录已恢复。
