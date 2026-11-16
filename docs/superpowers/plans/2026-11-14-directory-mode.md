# 素材目录模式实施与验收计划

**版本/分支：** 0.4.2 / codex/billfish-directory-042

**方案：** Electron + React + TypeScript + Vite + pnpm；复用本地素材库、Zustand、preload白名单和媒体协议。以用户最新修正为准：只浏览目录素材，独立图标控制，数量右置，退出左下到底。

## 约束

- UTF-8显式读取；修改保留备份并原子落盘。
- 保留已有无关改动；不提交、不推送、不改已发布版本。
- 目录调整只改元数据，不改变外部原图。
- 正式库保持 release/win-unpacked/data；QA隔离，不将夹具状态写入正式库。
- 所有源码更改验证后执行 pnpm package:win，检查程序及 app.asar 时间、版本和数据保护，启动正式程序。

## 1. 目录数据与组织

- [x] 稳定目录/settings类型，向后兼容默认设置。
- [x] 从外部索引和复制来源派生多级目录，手动归类优先。
- [x] 目录排序、嵌套、逻辑目录、素材批量归类，拒绝自身/子孙循环。
- [x] 目录专属素材范围；未归类和非目录素材不进入目录模式及其大图树。
- [x] 旧未归类/标签/分类/格式导航修复为目录概览，不删除数据。
- [x] 对应测试：libraryDirectory、libraryDirectoryOrganization、libraryDirectoryWorkflow、libraryDirectoryWorkspace。

## 2. 持久化与媒体

- [x] Zustand保存队列与版本回滚保留其他视图设置。
- [x] 视图设置复用唯一临时文件/Windows替换重试/滚动备份原子写入，保存失败有可见反馈。
- [x] 缩略图缺失/失败原图回退，外部PSD合并预览。
- [x] 图片复制按内容解码，原图第一/后续追加回归保持通过。
- [x] 对应测试：libraryDirectoryPersistence、libraryJson、directoryImport、photoshopImage以及既有媒体回归。

## 3. 默认目录页面

- [x] 根概览展示文件夹卡片，当前目录直接素材与包含后代开关。
- [x] 左侧目录树和最底部退出；结果列页脚最右侧数量。
- [x] 瀑布流/网格/列表独立图标，排序/筛选/信息面板独立入口，删除综合浏览设置面板。
- [x] 单一右上添加入口；批量操作仅选中后出现。
- [x] 八种排序/升降序、目录内分类和标签筛选、160–360px底部尺寸滑杆。
- [x] 柔和文件夹配色、父子继承、卡片与查看器一致。
- [x] 单击选择/双击详情、右侧选择框与左侧格式标识。
- [x] 对应测试：libraryDirectoryWorkspaceLayout、libraryDirectoryUiParity、libraryDirectoryBrowseParity、libraryDirectoryInteraction、libraryDirectoryAppearance、libraryDirectorySelection。

## 4. 大图与信息

- [x] 左目录/大图/底缩略图/右窄信息轨，按需惰性加载完整提示词面板。
- [x] 连续切图稳定会话，有界缩略图窗口与预取，缩放/平移/适应窗口。
- [x] 编辑按键边界和Tab焦点循环，退出恢复焦点。
- [x] 定位同步底层目录、展开祖先、清除冲突过滤条件。
- [x] 有界缓存主色解析、一击HEX/RGB/CSS复制及失败反馈。
- [x] 对应测试：libraryMediaViewer、libraryMediaViewerFocus、libraryMediaViewerIntegration、libraryAssetMetadata、imagePalette。

## 5. 最终验收与交付

- [x] 指定真实目录导入135个素材（134 WebP + 1 PSD）/16个子目录，保留原1277素材；正式库1412条，二次扫描零新增。
- [x] 目录/查看/排序/尺寸连续切换、筛选、颜色继承与刷新保留、主色复制成功/失败通过隔离UI验收。
- [x] 新鲜全量测试：249个文件 / 1889项通过。
- [x] pnpm typecheck:renderer 与 pnpm typecheck:electron通过。
- [x] pnpm build通过。
- [x] 正式包中验证PSD预览、单击选择/双击打开大图；1002×702 窄窗与 2560×1392 桌面布局均无横向溢出。
- [x] `git diff --check`通过；保留工作区既有改动，不清理、不提交、不推送。
- [x] 打包前后正式`library.json`均为1412项且SHA-256为`A52BC0FD2A400ECE12D4CC68F4BB57CFB91DB38E8E78C91E254284113D14E1D0`；指定源目录仍为135个文件、16个子目录（134 WebP、1 PSD）。
- [x] `SUYAN_PACKAGE_CONFIRMED=1 pnpm package:win`成功，产物同步至正式release目录；0.4.2版exe更新时间为2026-11-14 21:15:36，`app.asar`为21:15:33。
- [x] 启动正式`release/win-unpacked/素言.exe`并验证目录模式根概览可用；交付窗口保持在“全部目录”。

正式库实测：1412项中，135项来自指定外部目录，880项由85个连续编号系列归纳成逻辑目录；397项仍未归类，均不进入目录模式。“全部目录”1015为已归档素材数，不包含未归类素材。

> 就近测试应使用 pnpm exec vitest run tests/unit/具体文件.test.ts；最终全量使用 pnpm test，不使用会误转发的 pnpm test -- 文件路径。
