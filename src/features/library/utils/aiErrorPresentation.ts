export type AiErrorPresentation = {
  code: string;
  title: string;
  summary: string;
  cause: string;
  actions: string[];
  targetLabel: string;
  retryable: boolean;
  shouldStopBackground: boolean;
};

const targetLabels: Record<string, string> = {
  "image-category": "\u56fe\u7247\u5206\u7c7b",
  "image-tags": "\u56fe\u7247\u6807\u7b7e",
  "image-safety": "\u56fe\u7247\u5b89\u5168\u5ba1\u6838",
  "image-reverse": "\u56fe\u50cf\u53cd\u63a8",
  "image-generation": "\u56fe\u50cf\u751f\u6210",
  "prompt-category": "\u63d0\u793a\u8bcd\u5206\u7c7b",
  "prompt-tags": "\u63d0\u793a\u8bcd\u6807\u7b7e",
  prompt: "\u63d0\u793a\u8bcd\u5206\u6790",
  "prompt-options": "\u63d0\u793a\u8bcd\u8bcd\u6761",
  "ai-connection": "AI \u8fde\u63a5\u6d4b\u8bd5",
};

export function buildAiErrorPresentation(
  code: string,
  fallbackMessage: string,
  target?: string,
): AiErrorPresentation {
  const targetLabel = targetLabels[target ?? ""] ?? "AI \u5206\u6790";
  const message = normalizeRemoteMessage(fallbackMessage);

  if (code === "TAG_KNOWLEDGE_SAVE_FAILED") {
    return {
      code, title: "标签归纳结果保存失败",
      summary: "标签已识别，但分组与依据保存失败，本次标签未应用。",
      cause: "本地词库写入未完成，可能是目录不可写、磁盘空间不足或保存连接中断。",
      actions: ["检查软件 data 目录是否可写及磁盘剩余空间", "恢复后重新分析，或在归纳整理中检查现有分组"],
      targetLabel, retryable: true, shouldStopBackground: true,
    };
  }

  if (code === "AI_IMAGE_REQUIRED") {
    return {
      code,
      title: `${targetLabel}\u9700\u8981\u53c2\u8003\u56fe`,
      summary: "\u5f53\u524d\u7d20\u6750\u6ca1\u6709\u53ef\u4f9b\u89c6\u89c9\u6a21\u578b\u8bfb\u53d6\u7684\u53c2\u8003\u56fe\u7247\uff0c\u56e0\u6b64\u65e0\u6cd5\u6267\u884c\u56fe\u7247\u5206\u6790\u3002",
      cause: "\u7d20\u6750\u53ef\u80fd\u5c1a\u672a\u751f\u6210\u7f29\u7565\u56fe\uff0c\u6216\u539f\u56fe\u8def\u5f84\u4e0d\u53ef\u8bbf\u95ee\uff1b\u56fe\u7247\u5927\u5c0f\u4e5f\u4e0d\u80fd\u8d85\u8fc7 8 MB\u3002",
      actions: ["\u5148\u786e\u8ba4\u7d20\u6750\u8be6\u60c5\u9875\u80fd\u6b63\u5e38\u663e\u793a\u539f\u56fe", "\u91cd\u65b0\u5bfc\u5165\u6216\u91cd\u65b0\u751f\u6210\u7f29\u7565\u56fe", "\u4f18\u5148\u4f7f\u7528 PNG \u6216 JPEG \u683c\u5f0f\u7684\u56fe\u7247"],
      targetLabel,
      retryable: false,
      shouldStopBackground: false,
    };
  }

  if (code === "AI_MODEL_CAPABILITY_MISMATCH") {
    const isVisionTask = /图像|image|vision|反推/i.test(targetLabel);
    return {
      code,
      title: `${targetLabel}模型能力不匹配`,
      summary: isVisionTask
        ? "当前选择的是文本模型，无法读取参考图；请选择 Ollama 视觉模型或带视觉输入能力的 API 模型。"
        : "当前选择的模型不支持这项文本分析，请切换到文本模型后重试。",
      cause: "本地模型的文本生成与图像理解能力是分开的。Ollama 只有带视觉模块的模型才能处理图片，普通文本模型不能替代它。",
      actions: ["打开 AI 设置，查询当前 Ollama 已安装的模型", "选择能力标记为“图像”的视觉模型用于图像分析", "文本分析请选择能力标记为“文本”的模型；画布生图仍需配置生图 API"],
      targetLabel,
      retryable: false,
      shouldStopBackground: false,
    };
  }

  if (code === "AI_PROVIDER_UNSUPPORTED") {
    return {
      code,
      title: `${targetLabel}暂不支持当前服务商`,
      summary: "Ollama 当前用于本地文本分析和图像理解，不能直接生成图片或视频。",
      cause: "画布生图需要服务商提供图像生成接口；Ollama 的本地聊天接口不提供本项目所需的生图协议。",
      actions: ["打开 AI 设置，为画布生图配置 OpenAI 兼容的生图 API", "保留 Ollama 用于提示词分析、标签整理和图像反推", "保存后重新选择画布中的生图模型"],
      targetLabel,
      retryable: false,
      shouldStopBackground: false,
    };
  }

  if (code === "AI_OLLAMA_UNAVAILABLE") {
    return {
      code,
      title: `${targetLabel}无法连接 Ollama`,
      summary: "软件没有连到本机 Ollama 服务，本次操作没有发送到模型。",
      cause: "Ollama 可能尚未启动，或服务地址、端口被修改；默认地址是 http://127.0.0.1:11434。",
      actions: ["启动 Ollama 桌面程序或运行 ollama serve", "确认 AI 设置中的地址能访问本机 Ollama 服务", "启动后点击“测试连接”或“查询模型”确认服务恢复"],
      targetLabel,
      retryable: true,
      shouldStopBackground: true,
    };
  }

  if (code === "AI_OLLAMA_TIMEOUT") {
    return {
      code,
      title: `${targetLabel}响应超时`,
      summary: "Ollama 已收到请求，但本地模型没有在限定时间内返回结果。",
      cause: "首次加载模型、模型参数较大或显存/内存不足时，本地推理可能需要更长时间。",
      actions: ["稍后重试，首次运行请等待模型加载完成", "关闭占用内存或显存较高的程序", "改用更轻量的文本或视觉模型，并在 AI 设置中重新测试"],
      targetLabel,
      retryable: true,
      shouldStopBackground: false,
    };
  }

  if (code === "AI_OLLAMA_MODEL_NOT_FOUND") {
    return {
      code,
      title: `${targetLabel}找不到本地模型`,
      summary: "Ollama 中没有找到当前选择的模型，本次操作没有完成。",
      cause: "模型可能尚未下载、模型名称已变更，或在软件查询模型后被 Ollama 删除。",
      actions: ["在终端运行 ollama list 查看已安装模型", "使用 ollama pull 模型名称安装模型", "回到 AI 设置重新查询模型并选择有效模型"],
      targetLabel,
      retryable: false,
      shouldStopBackground: true,
    };
  }

  if (code === "AI_OLLAMA_RESPONSE_INVALID") {
    return {
      code,
      title: `${targetLabel}返回格式异常`,
      summary: "Ollama 返回了内容，但不是软件可以识别的 JSON 或消息结构。",
      cause: "可能是 Ollama 版本过旧、服务被代理改写，或模型没有遵守结构化输出要求。",
      actions: ["升级 Ollama 到较新的稳定版本", "确认地址直接指向 Ollama，不要填写 OpenAI 兼容代理地址", "切换到支持 JSON 输出的模型后重试"],
      targetLabel,
      retryable: true,
      shouldStopBackground: false,
    };
  }

  if (code === "AI_OLLAMA_REQUEST_FAILED") {
    return {
      code,
      title: `${targetLabel}请求失败`,
      summary: message || "Ollama 拒绝了本次请求。",
      cause: "本地服务可能正在加载模型、模型名称不正确，或当前 Ollama 版本不支持请求参数。",
      actions: ["检查 Ollama 服务窗口和终端日志", "回到 AI 设置重新查询模型，确认模型仍然存在", "升级 Ollama 后再次测试连接"],
      targetLabel,
      retryable: true,
      shouldStopBackground: false,
    };
  }

  if (code === "AI_REMOTE_TIMEOUT") {
    return {
      code,
      title: `${targetLabel}\u8d85\u65f6`,
      summary: "AI \u670d\u52a1\u5728\u89c4\u5b9a\u65f6\u95f4\u5185\u6ca1\u6709\u8fd4\u56de\u7ed3\u679c\uff0c\u672c\u6b21\u5206\u6790\u672a\u5b8c\u6210\u3002",
      cause: "\u7f51\u7edc\u5ef6\u8fdf\u3001\u4ee3\u7406\u94fe\u8def\u6216\u6a21\u578b\u5904\u7406\u65f6\u95f4\u8fc7\u957f\u90fd\u53ef\u80fd\u5bfc\u81f4\u8bf7\u6c42\u8d85\u65f6\u3002",
      actions: ["\u7a0d\u540e\u91cd\u8bd5", "\u68c0\u67e5\u4ee3\u7406\u548c Base URL \u662f\u5426\u53ef\u8bbf\u95ee", "\u5fc5\u8981\u65f6\u5207\u6362\u54cd\u5e94\u66f4\u5feb\u7684\u6a21\u578b"],
      targetLabel,
      retryable: true,
      shouldStopBackground: false,
    };
  }

  if (code === "AI_REMOTE_RESPONSE_INVALID") {
    return {
      code,
      title: `${targetLabel}\u7ed3\u679c\u683c\u5f0f\u5f02\u5e38`,
      summary: "AI \u670d\u52a1\u5df2\u8fd4\u56de\u5185\u5bb9\uff0c\u4f46\u5185\u5bb9\u65e0\u6cd5\u89e3\u6790\u4e3a\u5e94\u7528\u9700\u8981\u7684\u7ed3\u6784\u3002",
      cause: "\u6a21\u578b\u53ef\u80fd\u6ca1\u6709\u9075\u5faa JSON \u8f93\u51fa\u8981\u6c42\uff0c\u6216\u4e2d\u8f6c\u670d\u52a1\u6539\u5199\u4e86\u8fd4\u56de\u5185\u5bb9\u3002",
      actions: ["\u91cd\u8bd5\u5f53\u524d\u5206\u6790", "\u68c0\u67e5\u6a21\u578b\u662f\u5426\u652f\u6301\u7ed3\u6784\u5316 JSON \u8f93\u51fa", "\u786e\u8ba4\u4e2d\u8f6c\u670d\u52a1\u6ca1\u6709\u6ce8\u5165 HTML \u6216\u989d\u5916\u6587\u672c"],
      targetLabel,
      retryable: true,
      shouldStopBackground: false,
    };
  }

  if (isQuotaError(code, message)) {
    const quota = extractQuotaMessage(message);
    return {
      code: "AI_QUOTA_EXCEEDED",
      title: `${targetLabel}\u56e0 AI \u989d\u5ea6\u4e0d\u8db3\u505c\u6b62`,
      summary: quota || "\u5f53\u524d AI \u8d26\u6237\u4f59\u989d\u6216\u9884\u4ed8\u989d\u5ea6\u4e0d\u8db3\uff0c\u670d\u52a1\u7aef\u62d2\u7edd\u4e86\u672c\u6b21\u8bf7\u6c42\u3002",
      cause: "\u8fd9\u662f\u670d\u52a1\u5546\u8d26\u6237\u8ba1\u8d39\u6216\u4f59\u989d\u95ee\u9898\uff0c\u4e0d\u662f\u672c\u5730\u7d20\u6750\u683c\u5f0f\u95ee\u9898\uff1b\u7ee7\u7eed\u91cd\u8bd5\u4e0d\u4f1a\u6062\u590d\u670d\u52a1\u3002",
      actions: ["\u6253\u5f00 AI \u8bbe\u7f6e\uff0c\u68c0\u67e5\u5f53\u524d Base URL\u3001\u6a21\u578b\u548c API Key", "\u767b\u5f55\u670d\u52a1\u5546\u63a7\u5236\u53f0\u5145\u503c\u6216\u63d0\u9ad8\u989d\u5ea6", "\u989d\u5ea6\u6062\u590d\u540e\u5148\u70b9\u51fb\u8fde\u63a5\u6d4b\u8bd5\uff0c\u518d\u91cd\u65b0\u6267\u884c\u5206\u7c7b"],
      targetLabel,
      retryable: false,
      shouldStopBackground: true,
    };
  }

  if (isAuthOrPermissionError(code, message)) {
    return {
      code,
      title: `${targetLabel}\u88ab API \u62d2\u7edd`,
      summary: "AI \u670d\u52a1\u62d2\u7edd\u4e86\u5f53\u524d\u8bf7\u6c42\uff0c\u901a\u5e38\u4e0e API Key\u3001\u6743\u9650\u6216\u63a5\u53e3\u5730\u5740\u6709\u5173\u3002",
      cause: "\u5f53\u524d API Key \u53ef\u80fd\u65e0\u6548\u3001\u5df2\u8fc7\u671f\u3001\u6ca1\u6709\u8bbf\u95ee\u8be5\u6a21\u578b\u7684\u6743\u9650\uff0c\u6216 Base URL \u6307\u5411\u4e86\u9274\u6743\u9875\u9762\u3002",
      actions: ["\u6253\u5f00 AI \u8bbe\u7f6e\uff0c\u91cd\u65b0\u6838\u5bf9 Base URL\u3001API Key \u548c\u6a21\u578b", "\u786e\u8ba4 API Key \u5177\u5907\u5f53\u524d\u6a21\u578b\u7684\u8bbf\u95ee\u6743\u9650", "\u5982\u679c\u8fd4\u56de Cloudflare \u9875\u9762\uff0c\u8bf7\u6539\u7528\u5b9e\u9645 API \u63a5\u53e3\u5730\u5740"],
      targetLabel,
      retryable: false,
      shouldStopBackground: true,
    };
  }

  if (isServiceUnavailableError(code, message)) {
    return {
      code,
      title: `${targetLabel}\u7684 AI \u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528`,
      summary: "AI \u670d\u52a1\u5f53\u524d\u4e0d\u53ef\u7528\uff08\u5e38\u89c1\u4e3a HTTP 503\uff09\uff0c\u672c\u6b21\u5206\u6790\u672a\u5b8c\u6210\u3002",
      cause: "\u4e0a\u6e38\u6a21\u578b\u670d\u52a1\u53ef\u80fd\u6b63\u5728\u7ef4\u62a4\u3001\u8fc7\u8f7d\uff0c\u6216\u4e2d\u8f6c\u670d\u52a1\u6682\u65f6\u6ca1\u6709\u53ef\u7528\u8282\u70b9\u3002",
      actions: ["\u7b49\u5f85\u51e0\u5206\u949f\u540e\u91cd\u8bd5", "\u68c0\u67e5\u670d\u52a1\u5546\u72b6\u6001\u9875\u6216\u5207\u6362\u53ef\u7528\u6a21\u578b", "\u540e\u53f0\u6279\u91cf\u5206\u7c7b\u5df2\u6682\u505c\uff0c\u907f\u514d\u6301\u7eed\u6d88\u8017\u8bf7\u6c42"],
      targetLabel,
      retryable: true,
      shouldStopBackground: true,
    };
  }

  if (isNetworkError(code, message)) {
    return {
      code,
      title: `${targetLabel}\u8fde\u63a5\u5931\u8d25`,
      summary: "\u5e94\u7528\u65e0\u6cd5\u7a33\u5b9a\u8fde\u63a5\u5230 AI \u670d\u52a1\uff0c\u672c\u6b21\u5206\u6790\u672a\u5b8c\u6210\u3002",
      cause: "\u53ef\u80fd\u662f\u7f51\u7edc\u4e2d\u65ad\u3001\u4ee3\u7406\u914d\u7f6e\u3001TLS \u8bc1\u4e66\u6216\u670d\u52a1\u5730\u5740\u4e0d\u53ef\u8fbe\u3002",
      actions: ["\u68c0\u67e5\u7f51\u7edc\u548c\u7cfb\u7edf\u4ee3\u7406", "\u6253\u5f00 AI \u8bbe\u7f6e\u6d4b\u8bd5\u8fde\u63a5", "\u786e\u8ba4 Base URL \u4f7f\u7528 HTTPS \u4e14\u6ca1\u6709\u88ab\u9632\u706b\u5899\u62e6\u622a"],
      targetLabel,
      retryable: true,
      shouldStopBackground: true,
    };
  }

  return {
    code,
    title: `${targetLabel}\u5931\u8d25`,
    summary: message || "AI \u670d\u52a1\u8fd4\u56de\u4e86\u65e0\u6cd5\u8bc6\u522b\u7684\u9519\u8bef\u3002",
    cause: "\u8bf7\u7ed3\u5408\u9519\u8bef\u7801\u548c\u670d\u52a1\u5546\u65e5\u5fd7\u7ee7\u7eed\u786e\u8ba4 API\u3001\u6a21\u578b\u6216\u6570\u636e\u9884\u5904\u7406\u72b6\u6001\u3002",
    actions: ["\u6253\u5f00 AI \u8bbe\u7f6e\u68c0\u67e5\u8fde\u63a5", "\u7a0d\u540e\u91cd\u8bd5", "\u5982\u679c\u6301\u7eed\u5931\u8d25\uff0c\u8bf7\u5bfc\u51fa\u65e5\u5fd7\u5e76\u8054\u7cfb\u670d\u52a1\u5546"],
    targetLabel,
    retryable: true,
    shouldStopBackground: false,
  };
}

function isQuotaError(code: string, message: string): boolean {
  return /quota|credit|billing|\u4f59\u989d|\u989d\u5ea6|\u9884\u6263\u8d39|insufficient/i.test(message) || code === "AI_QUOTA_EXCEEDED";
}

function isAuthOrPermissionError(code: string, message: string): boolean {
  return /401|403|unauthorized|forbidden|permission|api key|cloudflare|just a moment|\u9274\u6743|\u6743\u9650|\u62d2\u7edd/i.test(
    `${code} ${message}`,
  );
}

function isServiceUnavailableError(code: string, message: string): boolean {
  return /503|temporarily unavailable|service unavailable|\u670d\u52a1\u4e0d\u53ef\u7528|\u4e0a\u6e38\u8fc7\u8f7d/i.test(`${code} ${message}`);
}

function isNetworkError(code: string, message: string): boolean {
  return /network|socket|tls|econn|fetch failed|\u7f51\u7edc|\u8fde\u63a5\u5931\u8d25/i.test(`${code} ${message}`);
}

function extractQuotaMessage(message: string): string {
  const balance = message.match(/\u7528\u6237\u5269\u4f59\u989d\u5ea6\s*[:\uff1a]\s*([$\u20ac\u00a5]?\s*[0-9.]+)/u)?.[1];
  const required = message.match(/\u672c\u6b21\u8bf7\u6c42\u9700\u8981\u989d\u5ea6\s*[:\uff1a]\s*([$\u20ac\u00a5]?\s*[0-9.]+)/u)?.[1];
  if (balance && required) {
    return `\u5f53\u524d\u4f59\u989d ${balance}\uff0c\u672c\u6b21\u8bf7\u6c42\u9700\u8981 ${required}\uff0c\u670d\u52a1\u5546\u5df2\u62d2\u7edd\u8bf7\u6c42\u3002`;
  }
  return "\u5f53\u524d AI \u8d26\u6237\u4f59\u989d\u6216\u9884\u4ed8\u989d\u5ea6\u4e0d\u8db3\uff0c\u670d\u52a1\u5546\u5df2\u62d2\u7edd\u8bf7\u6c42\u3002";
}

function normalizeRemoteMessage(message: string): string {
  return message
    .replace(/<[^>]*>/g, " ")
    .replace(/request id\s*:\s*[^)\s]+/gi, "request id: <redacted>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
}
