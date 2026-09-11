# 素言 × ComfyUI 适配说明：提示词解析规则

> 本文档说明素言（SuYan）桌面应用如何接收 ComfyUI 推送的图片，并从图片内嵌元数据中解析出**正向提示词（positive prompt）**与负向提示词，供其他 AI 智能体 / 自动化流程对接时参考。

---

## 一、总体链路

```
ComfyUI（或其他本机工具）
   │  ① 通过本地回环接口 POST 图片 + 可选文本字段
   ▼
素言本地收件服务 127.0.0.1:9477  POST /guli/suyan/import  (multipart/form-data)
   │  ② 图片落盘 + 读取 PNG 内嵌元数据（tEXt / iTXt 块）
   ▼
promptImportParser
   │  ③ 解析 ComfyUI 的「prompt 块」（API 执行图）与「workflow 块」（UI 工作流）
   │  ④ 定位采样器节点 → 沿 positive / negative 连线反向回溯 → 得到正/负向文本
   ▼
素材库条目（prompt / negativePrompt / generationMethod / tags / 模型名）
   │  ⑤ 相同 prompt 的图片自动归为同一提示词组
   ▼
素言素材库
```

---

## 二、接收协议（POST /guli/suyan/import）

- **监听地址**：`127.0.0.1:9477`（仅本机回环，不暴露局域网）。
- **健康检查**：`GET /guli/suyan/health` → `{ "ok": true, "data": { "listening": true } }`。
- **导入接口**：`POST /guli/suyan/import`，`Content-Type: multipart/form-data`，**64 MiB 上限**。
- **CORS**：仅放行本机回环来源（`127.0.0.1` / `localhost` / `[::1]`），避免任意网页调用。

**表单字段**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `<file>` 若干 | 文件 | 是 | PNG / JPG / WEBP 图像二进制；字段名即文件名 |
| `prompt` | 文本 | 否 | 正向提示词（作为 PNG 内嵌元数据未覆盖时的兜底） |
| `negativePrompt` | 文本 | 否 | 负向提示词兜底 |
| `title` | 文本 | 否 | 标题兜底 |
| `tags` | 文本 | 否 | JSON 字符串数组（如 `["tag1","tag2"]`） |
| `generationMethod` | 文本 | 否 | 生成方式，缺省按 `comfyui` 处理 |

**响应**：`{ "ok": true, "data": { "importedCount": n, "importedPromptCount": n, ... } }`

> **关键点**：图片内嵌元数据 **优先**；外置文本字段仅在 PNG **未嵌入**对应字段时才补全。

---

## 三、PNG 内嵌元数据提取

ComfyUI 保存 PNG 时会在文件内写入多个文本块（chunk），素言按 PNG 规范遍历 `tEXt` / `iTXt` 块，得到若干 `{ keyword, text }` 对。与解析相关的块：

- `prompt` 块：ComfyUI 的 **API 执行图**（可执行的 JSON，节点 id → `{ class_type, inputs }`）。
- `workflow` 块：ComfyUI 的 **UI 工作流**（`{ nodes: [...], links: [...] }` 形式）。

同一张 PNG 可能包含**多个同名块**（自定义节点或二次保存工具追加元数据），素言会**全部解析**，不会只取第一个。

---

## 四、正向 / 负向提示词解析规则（核心）

### 4.1 两种图结构 → 统一成节点图

| 来源 | 结构 | 解包方式 |
|---|---|---|
| `prompt` 块 | 根对象就是 API prompt：`{ "6": { "class_type": "CLIPTextEncode", "inputs": {...} }, ... }`，或外层再包 `prompt/workflow/data/extra_pnginfo` | 递归解包 `findComfyApiGraph`，找到「子节点含 `class_type` 字符串」的那层 |
| `workflow` 块 | `{ nodes: [{ id, type, inputs: [{name, link}], widgets_values }], links: [ [linkId, srcId, srcSlot, dstId, dstSlot, linkType] ] }` | 通过 `links` 数组构建「输入 → 上游节点」的连线表，把 UI 节点还原成 `{ class_type, inputs }` 节点图 |

### 4.2 采样器节点识别（不依赖类名）

第三方节点的类名五花八门，素言**不靠类名**判断，而是用「输入契约」识别采样器：节点 inputs 必须**同时**具备

1. **扩散状态输入**：`latent_image` / `latent` / `samples` / `latent_samples`，或 `noise` / `sigmas`；
2. **条件输入**：`positive` / `negative` / `conditioning` / `guider` / `guide` 之一；
3. **执行参数输入**：`model` / `unet` / `noise` / `sigmas` / `sampler` / `steps` / `cfg` / `denoise` / `seed` 之一。

`BasicGuider`、`KSamplerSelect` 等辅助节点缺少运行契约，不会被误识别。

### 4.3 沿连线反向回溯文本（positive / negative）

对每个采样器：

- **正向**：查 `positive` → `positive_conditioning` → `conditioning` → `guider`/`guide` 输入；
- **负向**：查 `negative` → `negative_conditioning` 输入；若正/负向被封装在 `guider` 内（如 `SamplerCustom(Advanced)` + `CFGGuider`），则**沿 guider 的 `negative` / `positive` 输入继续倒查**。

回溯算法（`resolveComfyTextFromLink`）沿输入 link `[节点id, 槽位]` 递归查上游节点，规则如下：

- **ShowText 类节点**（`showtext` / `displaytext` / `promptoutput`）：其 `widgets_values` 是该节点**实际显示/输出的运行时文本**，直接采用；
- 否则递归处理上游节点 inputs 中所有**实际 link**，取**最长**文本；
- 再查 `text` / `prompt` / `value` / `string` / `content` 等直填字符串；
- 最后兼容 `source`、`value_in` 等自定义输入名，但**仍然只沿当前 CLIP 文本路径上的实际 link 倒查**；
- **绝不扫描工作流中未连线的其它文本节点**。

### 4.4 候选选择与排序

工作流中可能同时存在多个采样器（基础模型 / refiner / 最终输出），每个采样器产生一组 `{positive, negative}` 候选，最终按以下规则选一个：

1. **workflow 块候选优先于 prompt 块候选**——连续/批量生图时 API 图可能沿用上一轮内容，而 workflow 的 `widgets_values` 保存的是**当前图片实际使用的文本**；
2. 同优先级内按**信息量评分**降序：`prompt 长度 × 4 + negative 长度`；
3. 过滤掉正向文本为空或不像提示词的候选。

### 4.5 模型名提取（generationMethod）

遍历节点图中类名含 `loader` 的节点，取其 `ckpt_name` / `unet_name` / `model_name` / `model` 字符串，去掉扩展名（`.safetensors` / `.ckpt` / `.pt` / `.pth` / `.bin` / `.gguf`）和路径前缀，得到模型名；找不到时降级为 `ComfyUI`。

### 4.6 输出 draft

```ts
{
  title: 由 prompt 自动生成（截断 42 字符）,
  prompt: 正向提示词（归一化文本）,
  negativePrompt: 负向提示词,
  tags: ["ComfyUI", 模型名],
  generationMethod: 模型名 ?? "ComfyUI"
}
```

---

## 五、解析优先级与避坑

| 场景 | 处理 |
|---|---|
| ComfyUI 图存在但**回溯不到可用文本** | **放弃该图**，不按节点顺序猜测（否则负向词会被误当正向词） |
| 已识别的 ComfyUI prompt/workflow 块 | 不再落入通用 JSON 解析器，防止任意 `text` 字段被误当正向提示词 |
| 已接线的文本控件还残留旧 `widgets_values` | **连线优先于控件值**，旧值绝不覆盖真实连线数据 |
| 同一节点带 `preset_prompt`（生成器配置） | 不覆盖 ShowText 已生成的完整运行时文本 |
| PNG 无 ComfyUI 元数据 | 按 `parameters` → `prompt` → `positive` → `description` → `comment` → `workflow` 优先级逐个尝试通用解析 |

---

## 六、典型样例

### 6.1 prompt 块（API 执行图）

```json
{
  "6": {
    "class_type": "CLIPTextEncode",
    "inputs": { "text": "一位古风发髻美女，灰色长发，仰拍视角，面部特写", "clip": ["4", 1] }
  },
  "7": {
    "class_type": "CLIPTextEncode",
    "inputs": { "text": "low quality, bad anatomy, extra digits", "clip": ["4", 1] }
  },
  "4": {
    "class_type": "CheckpointLoaderSimple",
    "inputs": { "ckpt_name": "models/myCustomModel_v1.safetensors" }
  },
  "3": {
    "class_type": "KSampler",
    "inputs": {
      "seed": 123, "steps": 20,
      "model": ["4", 0],
      "positive": ["6", 0],
      "negative": ["7", 0],
      "latent_image": ["5", 0]
    }
  }
}
```

解析结果：
- `prompt` = `一位古风发髻美女，灰色长发，仰拍视角，面部特写`
- `negativePrompt` = `low quality, bad anatomy, extra digits`
- `generationMethod` = `myCustomModel_v1`
- `tags` = `["ComfyUI", "myCustomModel_v1"]`

### 6.2 workflow 块（UI 工作流）

```json
{
  "last_node_id": 6,
  "nodes": [
    { "id": 1, "type": "CheckpointLoaderSimple", "inputs": [], "widgets_values": ["models/myModel.safetensors"] },
    { "id": 2, "type": "CLIPTextEncode", "inputs": [{ "name": "clip", "link": 1 }], "widgets_values": ["正向提示词内容"] },
    { "id": 3, "type": "CLIPTextEncode", "inputs": [{ "name": "clip", "link": 1 }], "widgets_values": ["negative prompt"] },
    { "id": 4, "type": "KSampler",
      "inputs": [
        { "name": "model", "link": 2 },
        { "name": "positive", "link": 3 },
        { "name": "negative", "link": 4 },
        { "name": "latent_image", "link": 5 }
      ],
      "widgets_values": [123, 20, 8, "euler", "normal", 1] }
  ],
  "links": [
    [1, 1, 1, 2, 0, "MODEL"],
    [2, 1, 2, 4, 0, "MODEL"],
    [3, 2, 0, 4, 1, "CONDITIONING"],
    [4, 3, 0, 4, 2, "CONDITIONING"],
    [5, 5, 0, 4, 3, "LATENT"]
  ]
}
```

解析时通过 `links` 还原连线：KSampler 的 `positive` 连到节点 2（CLIPTextEncode，文本为「正向提示词内容」），`negative` 连到节点 3（文本为「negative prompt」）。

---

## 七、对接建议（给调用方）

1. 想省事：**直接把 ComfyUI 输出的 PNG 原文件 POST 给素言**，正向/负向提示词、模型名全部由素言从 PNG 内嵌元数据自动解析，无需额外传参。
2. 想兜底：同时附带 `prompt` / `negativePrompt` 文本字段，PNG 解析不到时才会用到它们。
3. 触发场景：批量生图、工作流跑完自动归档、ComfyUI 自定义节点调用素言收件服务等，均可复用同一协议。

---

*规则实现位置：`electron/shared/promptImportParser.ts`（解析）、`electron/main/library/importReceiver.ts`（收件服务）、`electron/main/library/imageFiles.ts`（导入落盘与元数据合并）。*
