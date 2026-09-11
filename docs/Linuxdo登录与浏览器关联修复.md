# 2026-09-08 Linux.do 登录与浏览器关联

Identity 对 Linux.do 首次用户增加明确注册确认，使用 provider/subject 创建无邮箱独立账户，不伪造邮箱验证。客户端只允许已校验签名的 ID Token 包含 guli_account_kind=external_subject、email_verified=false 且缺少 email 的账户登录；用户资料接口和平台提示不能替代签名凭据。

账户设置的关联入口改用当前会话令牌创建 /v1/account/link/:provider/start 浏览器事务，授权并确认后轮询当前账户资料，核对 uid 后只更新 identities，保留昵称头像。令牌、链接事务和轮询均留在主进程；响应给 renderer 只有 started/expiresAt。绑定完成于浏览器，桌面取消仅停止等待；用户可刷新资料查看已确认结果。

服务端配套实现、测试和回滚见 W:/Guli Identity/docs/subject-account-20260908.md。当前版本仍是未发布 0.3.6，只更新快速包，不创建 Release。
