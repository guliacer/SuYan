# 图片超分双引擎模块设计

日期：2026-11-02
目标版本：0.4.1
状态：已确认，等待实施计划

## 1. 目标

在素言中新增独立的“图片超分”工作区，统一接入两类本地超分能力：

- Real-CUGAN：面向动漫、插画和线稿，使用 ONNX Runtime Web 在独立 Worker 中运行，优先 WebGPU，失败时回退 WASM。
- Real-ESRGAN：面向真实照片和通用图像，使用官方 Real-ESRGAN `v0.2.5.0` 的 Windows NCNN Vulkan 组件，由 Electron 主进程调度。

模块支持单张和批量队列、前后对比、可取消任务、按需安装模型/组件，以及以下可组合的结果去向：

- 保存到用户选择的目录；
- 加入素言素材库；
- 同时保存文件并加入素材库。

原始文件保持只读。只有用户在导出设置中明确选择“覆盖”时，才允许替换目标位置的同名结果文件。

## 2. 已确认的产品决策

1. 采用混合双引擎架构，不要求用户安装 Python、PyTorch 或 CUDA。
2. 模型和原生运行组件首次使用时按需下载，安装后可离线复用；不打进主安装包。
3. 图片超分作为独立侧边栏工作区，不塞入素材详情弹窗或批量管理弹窗。
4. 保存目录、加入素材库、输出格式、命名和冲突策略都由用户在页面中确认。
5. 页面不做不可解释的内容自动分类；提供“动漫插画”“真实照片”“手动选择”三个预设，最终引擎和模型始终可见、可改。
6. 已发布 `v0.4.0` 保持冻结，实现版本升级到 `0.4.1`。

## 3. 来源、版本与许可

### 3.1 Real-CUGAN

- 上游：`https://github.com/bilibili/ailab/tree/main/Real-CUGAN`
- 上游许可：MIT
- 推理运行时：`onnxruntime-web@1.20.0`，使用精确版本，不从网页 CDN 动态加载运行时代码。
- 页面 `https://real-cugan.webgpu.me/` 仅作为交互行为和兼容性参考，不复制其未公开仓库的实现代码。
- ONNX 模型作为独立按需组件维护。首选下载源固定为 `https://real-cugan.webgpu.me/models/<文件名>.onnx`，文件名只能来自内置模型清单；安装清单固定模型 ID、倍率、降噪等级、完整下载地址、文件大小和 SHA-256。模型组件附带 Real-CUGAN MIT 声明、上游地址及 ONNX 转换来源说明。若项目后续提供 GitHub Release 镜像，镜像必须使用相同 SHA-256，不能改变模型身份。

### 3.2 Real-ESRGAN

- 上游：`https://github.com/xinntao/Real-ESRGAN`
- 上游许可：BSD-3-Clause
- 固定版本：`v0.2.5.0`
- Windows 组件：`realesrgan-ncnn-vulkan-20220424-windows.zip`
- 组件来源：Real-ESRGAN 官方 GitHub Release
- 安装时校验固定 SHA-256，解压后只允许调用受管目录中的 `realesrgan-ncnn-vulkan.exe`。

### 3.3 第三方声明

新增第三方声明必须包含 Real-CUGAN、Real-ESRGAN、ONNX Runtime、NCNN 及原生组件内随附依赖的许可文本。模块安装面板提供来源、版本和许可入口。

## 4. 目录与模块边界

```text
src/features/upscale/
  components/              页面、队列、对比器、设置、安装状态
  store/                   跨页面切换仍存活的任务队列状态
  types/                   渲染层任务、模型、导出类型
  utils/                   纯函数：预设、命名、进度、尺寸预估
  worker/                  Real-CUGAN ONNX Worker 与切块算法
  index.ts                 功能公开入口

electron/main/upscale/
  componentManifest.ts     固定版本、下载地址、大小、SHA-256
  componentInstaller.ts    下载、校验、解压、原子安装、删除、修复
  inputRegistry.ts         会话 token 与绝对路径的主进程映射
  upscaleJobManager.ts     任务生命周期、取消、临时目录、进度事件
  realEsrganRunner.ts      NCNN 参数构造、子进程、stderr/退出码解析
  resultExporter.ts        保存目录、格式转换、原子替换、素材库回流
  cacheCleanup.ts          孤立任务缓存清理

electron/shared/
  ipcChannels.ts           图片超分白名单 channel

electron/preload/
  index.ts                 命名业务 API，不暴露通用 invoke/send

tests/unit/
  upscale*.test.ts         注册表、状态机、清单、命名、导出、Runner
```

不在渲染层引入 `node:fs`、`node:path`、`electron` 或原始 `ipcRenderer`。所有本地文件、原生进程和组件安装能力经 `preload + contextBridge + ipcMain` 暴露的命名 API 完成。

## 5. 模块注册与导航

### 5.1 内置模块

模块注册表新增：

- `real-cugan-runtime`
  - 类别：`runtime`
  - 默认安装：否
  - 默认启用：否
  - 能力：`real-cugan-upscale-runtime`
  - 管理 Real-CUGAN ONNX 模型组件；至少一个内置模型通过校验时视为已安装。
- `real-esrgan-runtime`
  - 类别：`runtime`
  - 默认安装：否
  - 默认启用：否
  - 能力：`real-esrgan-upscale-runtime`
  - 管理 Real-ESRGAN NCNN 可执行文件和随附模型。
- `image-upscale`
  - 类别：`batch`
  - 默认安装：是
  - 默认启用：是
  - 依赖：`core-library`
  - 能力：`image-upscale`

`image-upscale` 页面本身可以在两个运行组件都未安装时打开，并在页面内分别完成按需安装。不得因为 `real-cugan-runtime` 或 `real-esrgan-runtime` 未安装而隐藏整个入口。

### 5.2 侧边栏

- 新增侧边栏 ID：`imageUpscale`
- 中文标签：`图片超分`
- 英文标签：`Image Upscale`
- 分组：`素材`
- 位置：`批量管理`之后
- 默认显示，可在系统设置的侧边栏管理中关闭
- 图标：使用 Lucide 图标，不添加手绘 SVG

页面通过 `lazy` 和 `Suspense` 挂载。未进入页面时不创建 ONNX Worker、不加载 ONNX Runtime、不探测 WebGPU。

## 6. 输入模型

### 6.1 选择与拖入

支持：

- 选择一张或多张 PNG/JPEG/WebP；
- 选择目录并读取其中受支持图片；
- 从系统文件管理器拖入图片或目录；
- 从素材详情将当前效果图发送到图片超分工作区。

主进程为每个输入创建只在当前应用会话有效的 token。渲染层只持有：

```ts
type UpscaleInputDescriptor = {
  token: string;
  displayName: string;
  width: number;
  height: number;
  byteSize: number;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  sourceItemId: string | null;
  previewUrl: string;
};
```

绝对路径不返回渲染层。拖入文件由 preload 使用 Electron `webUtils.getPathForFile` 解析后直接交给主进程注册，React 组件不接触路径。

### 6.2 队列规则

- 队列按添加顺序处理，支持拖动排序、批量选择、移除和清空已完成项。
- 同一时间只运行一个 GPU 推理任务，避免两个引擎争抢显存。
- 单张失败不阻断后续队列。
- 切换页面不取消任务；任务状态存放在独立 feature store 和模块级 Worker client 中。
- 退出应用时取消运行任务，不恢复未完成任务。

## 7. 引擎与模型

### 7.1 预设

#### 动漫插画

- 默认引擎：Real-CUGAN
- 倍率：2x / 3x / 4x
- 模型：无降噪、保守降噪和上游实际提供的降噪等级
- 页面显示模型大小、倍率、降噪说明和安装状态

#### 真实照片

- 默认引擎：Real-ESRGAN
- 默认模型：`realesr-general-x4v3`
- 可选模型：以官方 NCNN 组件实际附带模型为准，至少暴露通用模型和动漫模型
- 倍率、tile 和 GPU 参数只提供组件真实支持的取值

#### 手动选择

- 显示完整引擎与模型选择
- Real-CUGAN 显示降噪模型和倍率
- Real-ESRGAN 显示模型、输出倍率、tile 大小和 GPU ID；高级参数默认折叠

### 7.2 Real-CUGAN Worker

- Vite 使用模块 Worker 打包，禁止运行时拼接远程脚本。
- 会话初始化顺序：WebGPU，然后 WASM。
- WebGPU 会话或推理失败后，只自动重建一次 WASM 会话并重试当前图片。
- 输入以 512x512 切块，重叠 32px，步长 448px；边缘使用钳制采样，拼接时裁去重叠区。
- Worker 消息使用可转移的 `ArrayBuffer`，避免复制完整像素缓冲。
- 保留 alpha 通道；RGB 送入模型，结果 alpha 按目标倍率重采样并合并。
- 输出预估超过 120MP 时禁止开始，并提示降低倍率或切换原生引擎。

### 7.3 Real-ESRGAN Runner

- 主进程使用 `spawn` 参数数组，不通过 shell 拼接命令。
- 输入和输出均为受管临时路径；Runner 不接受渲染层传入的任意可执行文件或任意输出路径。
- 执行前重新校验组件关键文件。
- 解析标准输出和标准错误为结构化进度；无法获得精确百分比时显示当前文件和阶段，不伪造进度。
- 取消任务时终止完整进程树。
- 退出码、超时、Vulkan 初始化失败、模型缺失和输出缺失分别映射错误码。

## 8. 页面设计

### 8.1 桌面布局

页面使用三栏工作台，不使用营销式 hero 或装饰性卡片堆叠：

1. 左侧“任务队列”
   - 添加文件、添加目录、拖入区域
   - 缩略图、名称、尺寸、状态、进度
   - 排序、移除、重试
2. 中间“前后对比”
   - 原图/结果拖动分割
   - 缩放、平移、适应窗口、1:1、全屏
   - 尺寸、倍率、耗时、实际后端
3. 右侧“处理与导出”
   - 预设、引擎、模型、倍率、降噪
   - 高级性能设置
   - 输出格式、保存目标、命名、冲突策略、素材库回流设置

底部固定操作条显示当前模型安装状态、当前任务、总进度和主操作。空闲时主操作为“开始处理”，运行时为“取消任务”。

### 8.2 窄窗口

窄窗口使用 `队列 / 对比 / 设置` 三个标签页。底部操作条保持可见；固定尺寸按钮、计数器和滑杆不得因动态文本发生位移。

### 8.3 安装状态

首次使用未安装的引擎时，页面内显示安装面板：

- 组件名称、来源、版本和大小；
- 许可入口；
- 下载、校验、解压、完成阶段；
- 暂停不可用时的重试；
- 从本地选择官方组件包进行安装；
- 删除或修复已安装组件。

不打开独立安装器，不要求用户手工复制文件。

### 8.4 语言与主题

- 所有用户可见文案进入统一 `t()` 语言层。
- 默认简体中文，English 完整覆盖。
- 不翻译用户文件名、标题、分类、标签和提示词。
- 颜色只使用现有语义令牌；新增令牌只能写入 `src/styles/tokens.css`。
- 按钮使用 Lucide 图标；不为熟悉的工具操作使用文字胶囊替代图标。

## 9. 任务状态机

任务状态：

```text
queued
  -> preparing
  -> installing
  -> loading-model
  -> processing
  -> result-ready
  -> exporting
  -> completed

任意运行状态 -> canceling -> canceled
任意运行状态 -> failed
failed -> queued（用户重试）
```

规则：

- 每次状态迁移记录时间和结构化原因。
- `result-ready` 表示临时结果已存在，但尚未按用户策略提交。
- `completed` 表示所有启用的导出目标均完成；部分导出失败时保持 `result-ready` 并列出失败目标，允许只重试失败部分。
- 已取消和失败任务不得产生素材库条目。

## 10. 导出设计

### 10.1 目标组合

以下开关可独立组合：

- 保存到目录
- 加入素材库

至少启用一个目标后才能提交导出。

### 10.2 文件导出

- 格式：PNG / JPEG / WebP
- JPEG/WebP 显示质量设置；PNG 不显示无意义的质量滑杆
- 命名模板使用受控变量选择器，不允许任意路径片段
- 默认名称：`原文件名_引擎_倍率`
- 冲突策略：追加序号、覆盖、跳过
- 覆盖使用同目录临时文件写入后原子替换
- 可迁移时保留 ICC/EXIF 基本元数据；方向信息在像素归一化后同步修正

### 10.3 素材库回流

有 `sourceItemId` 时提供：

- 追加到来源提示词组；
- 新建提示词组。

无来源素材时只提供新建提示词组，并允许用户设置标题、分类和标签。图片写入复用现有 `importImageBuffers()` / 生成图导入链路，保持原图第一、后续效果图按加入时间追加的现有规则。

## 11. 存储位置

```text
<software-root>/data/components/upscale-cugan/
  manifest.json
  models/

<software-root>/data/components/upscale-realesrgan/
  manifest.json
  bin/
  models/
  licenses/

<software-root>/data/cache/upscale/<jobId>/
  input/
  output/
  job.json
```

模型和组件不得写入 `%APPDATA%`。日志继续写入软件目录 `logs/`。超过 24 小时的孤立任务缓存由启动清理任务删除。

## 12. 下载与安装可靠性

1. 下载到 `.partial` 文件。
2. 支持现有代理设置。
3. 校验 Content-Length 上限与固定 SHA-256。
4. 解压到同目录临时文件夹。
5. 校验必需文件、相对路径和可执行文件名称，拒绝 ZIP 路径穿越。
6. 写入组件 manifest。
7. 原子提升为正式组件目录。
8. 安装失败时保留旧的可用版本，不留下半安装状态。

组件状态：`not-installed / downloading / verifying / installing / ready / corrupted / failed`。

## 13. 错误模型

至少包含以下错误码：

```text
UPSCALE_INPUT_UNSUPPORTED
UPSCALE_INPUT_MISSING
UPSCALE_OUTPUT_TOO_LARGE
UPSCALE_MODEL_NOT_INSTALLED
UPSCALE_MODEL_DOWNLOAD_FAILED
UPSCALE_MODEL_HASH_MISMATCH
UPSCALE_COMPONENT_CORRUPTED
UPSCALE_WEBGPU_UNAVAILABLE
UPSCALE_WEBGPU_FAILED
UPSCALE_WASM_FAILED
UPSCALE_VULKAN_UNAVAILABLE
UPSCALE_NATIVE_TIMEOUT
UPSCALE_NATIVE_EXIT_FAILED
UPSCALE_RESULT_MISSING
UPSCALE_EXPORT_FAILED
UPSCALE_LIBRARY_IMPORT_FAILED
UPSCALE_CANCELED
```

UI 只展示语言层映射后的可操作信息，不展示原始堆栈。日志记录模型 ID、倍率、后端、耗时、退出码和脱敏文件名，不记录完整本地路径。

## 14. 清理与生命周期

- 页面切换：任务继续，UI 重新订阅状态。
- 用户取消：终止 Worker 当前任务或原生进程树，删除未完成输出。
- 应用退出：取消运行任务并等待有限清理窗口。
- 应用启动：清理超过 24 小时的孤立缓存；不恢复半成品任务。
- 删除组件：只删除 `data/components/` 下受管目录，不触碰系统安装的软件或用户图片。

## 15. 测试设计

### 15.1 单元测试

- 模型/组件 manifest 解析与 SHA-256 校验
- ZIP 路径穿越拒绝
- 模块注册、依赖状态和旧设置迁移
- 侧边栏可见性旧设置迁移
- 任务状态机合法与非法迁移
- 取消、失败、重试和部分导出失败
- Real-ESRGAN 参数数组构造，确保不使用 shell
- 输出命名、格式、冲突策略和受控模板变量
- 保存目录/素材库/双目标三种导出组合
- 来源提示词组追加与新建提示词组
- 原图第一、效果图按时间追加
- 120MP 输出上限
- 24 小时缓存清理
- 错误码到中英文文案映射

### 15.2 Worker 测试

- 512 切块、32px 重叠、448px 步长
- 小图、边缘块、非整倍尺寸拼接
- 倍率检测
- 透明通道缩放与合并
- WebGPU 初始化失败后 WASM 回退
- 推理阶段失败后只重试一次
- 取消时忽略迟到消息

### 15.3 主进程测试

- 测试子进程的进度解析
- 超时与进程树终止
- 非零退出码和输出缺失
- 临时结果原子提升
- 导出失败不污染素材库

### 15.4 实机冒烟

使用仓库内小型 PNG 测试夹具分别验证：

- Real-CUGAN WebGPU；
- 强制 Real-CUGAN WASM；
- Real-ESRGAN NCNN；
- 输出尺寸与倍率一致；
- 输出图存在非空像素且可解码；
- 保存目录导出；
- 加入素材库；
- 同时执行两个导出目标。

### 15.5 UI 验证

- 桌面和窄窗口布局
- 空队列、安装中、模型加载、运行、取消、失败、完成状态
- 对比滑杆、缩放、平移和全屏
- 长文件名、中英文切换、按钮和状态文本不重叠
- 页面切换后任务进度可恢复

## 16. 验收命令

实现完成后依次执行：

```powershell
pnpm test
pnpm typecheck
npx tsc --noEmit -p tsconfig.electron.json
node scripts/check-upscale-workspace-ui.mjs
pnpm package:win
```

最终交付报告必须包含：

- 每条命令的退出状态和测试数量；
- Real-CUGAN 与 Real-ESRGAN 实机冒烟结果；
- `release\win-unpacked\素言.exe` 更新时间；
- `release\win-unpacked\resources\app.asar` 更新时间；
- 未触碰的用户原有未提交改动清单。

## 17. 实施顺序

1. 版本升级、类型和纯函数测试。
2. 模块注册与侧边栏入口。
3. 输入 token、组件 manifest 和安装器。
4. Real-ESRGAN Runner 与主进程任务管理。
5. Real-CUGAN Worker 与回退逻辑。
6. 队列、对比器和设置页面。
7. 文件导出与素材库回流。
8. 语言层、日志、错误状态和模块管理。
9. 单元、实机、UI、类型和打包验证。

## 18. 非目标

- 视频超分；
- 云端推理；
- 账号同步超分任务；
- 自建远程模型服务；
- 自动上传用户图片；
- 后台插件市场；
- 修改或覆盖已发布 `v0.4.0` 的代码标签和 Release 附件。
