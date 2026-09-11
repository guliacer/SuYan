# Windows 四版本打包

`pnpm package:win:editions` 同时生成当前版本的无数据 / 无依赖、无数据 / 完整依赖两种便携 ZIP 与安装 EXE。此模式由用户明确授权；默认 `package:win:release` 仍按需安装可选组件。

先准备签名组件备份目录，其中包含 `6.0-suyan.1/` 与 `nsfw-1.0.0-signed/`，每个目录都有 manifest.json、manifest.json.sig 和对应 ZIP。

```powershell
$env:SUYAN_COMPONENT_RELEASE_DIR = '完整签名组件备份目录的绝对路径'
pnpm package:win:editions
```

输出位于 `release/素言-v版本-四版本-时间/`，附版本说明和 SHA256SUMS.txt。四个文件均采用 `素言-v版本-便携版或安装版-无依赖或完整依赖` 命名；构建中间目录使用唯一目录，不覆盖已有交付物或日常软件数据。

完整依赖从已签名公共备份解压，校验签名、平台、版本、归档和所有文件哈希，仅打入 `data/components`；不读取整个日常 data 目录。FFmpeg 执行与 ONNX 模型 CPU 推理都须通过。用户数据与非白名单组件混入时中止。

“无依赖”指无可选扩展组件，仍含启动必需的 Electron、Sharp 和 Rust Core；“完整依赖”指 FFmpeg、NSFW 模型和 ONNX Runtime，不包括在线 AI 生图服务、个人 API 设置。第三方组件保留签名原始内容（包括许可文件），应用源码仍混淆并移除 source map。

交付前需解包 ZIP 与 NSIS 内部应用归档，检查组件清单和哈希、无用户数据及完整依赖离线推理。无数据描述的是发行包内容，覆盖安装仍保留用户原有 data/logs。

脚本自动完成上述归档验证并输出 `verification.json`。安装程序独有的 `resources/elevate.exe` 不要求出现在便携 ZIP 中，其他应用文件均逐一核对 SHA-256；ASAR 内部路径按 Windows 分隔符解析。

已完成两个版本构建但尚未汇总时，可执行 `pnpm package:win:editions --collect release-next/对应的editions目录` 重新验证并汇总四个包；该模式不会重建或覆盖已有包。
