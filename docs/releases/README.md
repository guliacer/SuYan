# Release 文案

每个正式版本必须新增 `v<version>.md`，作为 GitHub Release 正文的唯一来源。

首次配置仓库时启用推送前检查：

```powershell
git config core.hooksPath .githooks
```

文案要求：

- 默认展示中文版本，包含版本标题、主要更新、下载说明和升级提醒。
- 顶部使用 `<details>` / `<summary>` 提供 `English description` 展开入口。
- 英文版本必须包含 Highlights、Downloads 和 Upgrade notes，并与中文内容保持一致。
- 不得把 JSON 数组、命令行转义字符或待补充占位符写入 Release 正文。

发布前检查：

```powershell
pnpm check:release-notes
```

启用 `.githooks/pre-push` 后，该检查会在每次 `git push` 时自动执行。

对应 GitHub Release 已创建后，再检查远程正文是否与本地文件一致：

```powershell
pnpm check:release-notes:remote
```

创建或更新 Release 时，使用当前版本文件作为 `--notes-file`，不要在 GitHub 页面单独维护另一份正文。
