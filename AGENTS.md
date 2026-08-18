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

## 正式包数据落盘
安装版 / 便携版的用户数据必须在软件目录 `data\`（库为 `data\library\`），日志在 `logs\`。本地开发（`electron .`）与 `release\win-unpacked` 共用便携目录 `release\win-unpacked\data`，**不得**切到 `%APPDATA%\SuYan`（那是另一份旧库）。正式包升级若本地 `data\` 尚无库，才从旧 AppData 迁入；不得把 AppData 合并进已有便携 `data\`。见 `.codex/rules/08` R3、`07` R6、`09` R1。

## 版本隔离
首版 `v0.1.0`（标签 / 分支 `release/0.1.0` / GitHub Release 资产）已冻结，后续改动只在 `master` 以更高版本号进行，详见 `docs/VERSIONING.md` 与 `.codex/rules/07-打包与交付规范.md` 的 R5。

## 交付打包要求
后续每次修改项目代码后，必须在完成就近验证后自动执行 `pnpm package:win`，确保 `release\win-unpacked\素言.exe` 与 `resources\app.asar` 更新到最新版本；交付说明中必须明确报告打包是否成功以及打包产物的更新时间。若打包失败，必须说明失败原因和下一步处理方式，不得只停留在 `pnpm build`。打包前确认 `package.json` version 高于已发布版本，产物不得覆盖旧版 Release 附件。


## 本地收件服务（ComfyUI 发送到素言）

- 主进程启动 `http` 服务，仅监听 `127.0.0.1:9477`：
  - `GET /guli/suyan/health` → `{ok:true,data:{listening:true}}`
  - `POST /guli/suyan/import`（multipart/form-data，64MB 上限）字段：多个 `images` 文件（png/jpg/webp）+ 文本 `prompt` / `negativePrompt` / `title` / `generationMethod`。
- 实现位于 `electron/main/library/importReceiver.ts`，在 `index.ts` 的 `app.whenReady` 中调用 `startImportReceiver()`，`before-quit` 中 `stopImportReceiver()`。
- 图片经由 `importImageBuffers()` 复用「粘贴导入」同一落盘路径，直接进入 `data\library\images\`；PNG 内嵌的 ComfyUI prompt/workflow 元数据会被 `promptImportParser` 自动解析建组。
- 修改该服务后须跑 `npx tsc --noEmit -p tsconfig.electron.json` 验证。

## 缩略图显示强制规则

- 分类浏览、启动图库和详情页的媒体显示必须覆盖“缩略图缓存缺失、过期、生成中、生成失败”四种状态；列表不得只依赖后台预热。
- 外部素材缩略图必须从其 mediaStorage 解析出的原图生成，协议请求发现缓存缺失时必须等待生成任务或回退到存在的原图。
- 缩略图失败后切换原图时，不得把失败的缩略图 URL 写入会话缓存；必须为“外部原图存在但缩略图缓存缺失”和“缩略图失败回退原图”保留回归测试。

## 剪贴板与效果图顺序强制规则

- 复制图片到系统剪贴板必须按文件内容解码，不得只依赖文件扩展名；外部素材可能出现扩展名与真实格式不一致的情况。
- 剪贴板写入前必须具备可解码的 `nativeImage`，优先统一转换为 PNG；读取、解码或写入失败必须写入脱敏日志并返回明确错误。
- 同一提示词组的原始效果图必须固定为第一张，后续新增效果图按加入时间排在其后；不得用“最新导入置顶”、收藏状态或缺失状态覆盖原始图顺序。
- 任何图片导入、复制和提示词组排序改动，都必须有针对“扩展名与真实格式不一致”和“原图第一、后续图追加”的回归测试。
