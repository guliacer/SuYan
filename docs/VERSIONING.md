# 版本隔离策略

## 当前约定

| 版本 | 含义 | 代码位置 | 发布物 |
|------|------|----------|--------|
| **0.1.0** | 第一个正式版（已冻结） | 标签 `v0.1.0`、分支 `release/0.1.0` | GitHub Release `v0.1.0` |
| **0.2.0+** | 后续开发 | 默认分支 `master` 的 `package.json` | 新标签 / 新 Release |

## 铁律

1. **首版不可被覆盖**  
   - 禁止改写标签 `v0.1.0`、分支 `release/0.1.0` 的历史（勿 force-push）。  
   - 禁止删除或替换 GitHub Release `v0.1.0` 上的安装包 / 便携包。  
   - 本地归档建议：`release/archive/v0.1.0/`（若存在）只读保留。

2. **后续改动只进新版本**  
   - 在 `master` 上继续开发。  
   - `package.json` 的 `version` 必须 **高于** 已发布版本（当前开发线为 `0.2.0`）。  
   - 每次正式对外交付：升版本号 → 打新标签（如 `v0.2.0`）→ 新建 GitHub Release → 上传 **带新版本号文件名** 的产物。

3. **产物文件名必须带版本**  
   - 安装包 / 便携 ZIP 依赖 electron-builder 的 `${version}`，例如 `素言-Setup-0.2.0.exe`。  
   - 不得用新包覆盖旧版同名文件（若历史上存在无版本后缀的文件，后续一律改用带版本名）。

4. **热修复旧版（可选）**  
   - 仅修 0.1.x：在 `release/0.1.0` 上改 → 版本改为 `0.1.1` → 标签 `v0.1.1` → 新 Release。  
   - 不要把 0.2 的功能 cherry-pick 进 0.1 维护线，除非明确是兼容性补丁。

5. **检查更新**  
   - 应用通过 GitHub `releases/latest` 与 semver 比较；新版本必须发正式 Release（非 draft），用户端才会提示更新。

## 日常流程（新版本）

```text
1. master 开发 / 修 bug
2. 确认 package.json version 已 bump（如 0.2.0）
3. pnpm package:win
4. 生成便携 ZIP（文件名含版本）
5. git tag v0.2.0 && git push origin v0.2.0
6. gh release create v0.2.0 --latest 并上传新产物
```

## 分支关系

```text
release/0.1.0  ── 冻结首版（= v0.1.0）
       │
       └─（历史点）── master ── 0.2.0 开发线 → 未来 v0.2.0 / v0.3.0 …
```
