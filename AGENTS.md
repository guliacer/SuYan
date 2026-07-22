# Project Rules Entry

## 适用范围
本文件适用于 `W:\提示词` 工作区内的全部后续 AI Coder、脚本生成和人工协作修改。

## 强制读取
在修改或创建任何项目文件前，必须先读取并遵守以下规则目录：

```text
W:\提示词\.codex\rules\
```

当前规则文件清单：

```text
W:\提示词\.codex\rules\01-人设与开发准则.md
W:\提示词\.codex\rules\02-技术栈与核心库.md
W:\提示词\.codex\rules\03-目录与架构规范.md
W:\提示词\.codex\rules\04-核心铁律与避坑.md
W:\提示词\.codex\rules\05-UI与组件规范.md
W:\提示词\.codex\rules\06-通信与数据获取规范.md
W:\提示词\.codex\rules\07-打包与交付规范.md
W:\提示词\.codex\rules\08-数据库与状态管理规范.md
W:\提示词\.codex\rules\09-日志管理规范.md
W:\提示词\.codex\rules\10-问题与解决方案记录.md
```

读取项目文件时必须显式使用 UTF-8 编码，避免 PowerShell 或脚本运行时使用默认编码导致中文分类、词库、提示词或规则文案乱码。例如 PowerShell 使用 `Get-Content -Encoding UTF8`，Node.js 使用 `encoding: "utf8"`，Python 使用 `encoding="utf-8"`。

## 不可绕过边界
后续实现必须以 `Electron + React + TypeScript + Vite + pnpm` 为唯一桌面端方案。渲染进程不得直接访问 Node.js、文件系统或系统剪切板；所有桌面能力必须经由 `preload + contextBridge + ipcRenderer/ipcMain` 暴露的白名单 API。

## 第一版非目标
第一版不得引入账号系统、云同步、远程后端、数据库服务、多语言系统或复杂插件体系。素材库必须使用本地 `library.json + images/` 目录完成。

## 版本隔离
首版 `v0.1.0`（标签 / 分支 `release/0.1.0` / GitHub Release 资产）已冻结，后续改动只在 `master` 以更高版本号进行，详见 `docs/VERSIONING.md` 与 `.codex/rules/07-打包与交付规范.md` 的 R5。

## 交付打包要求
后续每次修改项目代码后，必须在完成就近验证后自动执行 `pnpm package:win`，确保 `release\win-unpacked\素言.exe` 与 `resources\app.asar` 更新到最新版本；交付说明中必须明确报告打包是否成功以及打包产物的更新时间。若打包失败，必须说明失败原因和下一步处理方式，不得只停留在 `pnpm build`。打包前确认 `package.json` version 高于已发布版本，产物不得覆盖旧版 Release 附件。
