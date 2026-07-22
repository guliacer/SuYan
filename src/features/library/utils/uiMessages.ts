export const uiErrorMessage: Record<string, string> = {
  CLIPBOARD_EMPTY: "剪切板中没有可用图片或文本。",
  IMAGE_COPY_FAILED: "复制图片失败，请重试。",
  IMAGE_TYPE_UNSUPPORTED: "仅支持常见图片、视频和音频素材格式。",
  IMPORT_TIMEOUT: "导入素材超时，请检查网络或代理后重试。",
  INVALID_IMAGE_FILE_NAME: "图片文件名不合法。",
  LIBRARY_ITEM_NOT_FOUND: "没有找到这条提示词。",
  LIBRARY_SCHEMA_INVALID: "素材库文件结构不合法。",
  PROMPT_SHARE_IMAGE_IMPORT_FAILED: "已识别分享提示词，但效果图下载失败。",
  PROMPT_SHARE_IMPORT_FAILED: "分享链接解析失败，请检查网络后重试。",
  PROXY_SETTINGS_INVALID: "网络代理不合法，请检查代理地址。",
  PROXY_TEST_FAILED: "代理测试失败，请检查地址和网络。",
  VIEW_SETTINGS_INVALID: "视图设置结构不合法。",
  WORD_IMPORT_EMPTY: "Word 文档中没有可导入的图片与提示词。",
  WORD_IMPORT_INVALID: "Word 文档结构不完整，无法识别正文图片。",
  AI_ANALYZE_PAYLOAD_INVALID: "AI 分析参数不合法。",
  AI_BASE_URL_INVALID: "AI 接口地址不合法。",
  AI_IMAGE_REQUIRED: "需要可用参考图才能进行图像识别。",
  AI_API_KEY_MISSING: "当前 API 缺少 API Key，请先填写。",
  AI_BASE_URL_MISSING: "当前 API 缺少接口地址，请先填写。",
  AI_KEY_ENCRYPTION_UNAVAILABLE: "系统无法安全保存 API Key。",
  AI_MODEL_CAPABILITY_MISMATCH: "当前模型能力不匹配，请更换模型。",
  AI_MODEL_MISSING: "当前 API 没有可用模型，请添加或查询。",
  AI_OPTIMIZE_PAYLOAD_INVALID: "AI 优化参数不合法。",
  AI_PROFILE_DISABLED: "当前 API 未启用，请先启用。",
  AI_REMOTE_REQUEST_FAILED: "远程 AI 请求失败，请检查网络或接口。",
  AI_REMOTE_RESPONSE_INVALID: "远程 AI 返回的分析结果不合法。",
  AI_REMOTE_TIMEOUT: "远程 AI 响应超时，请稍后重试。",
  AI_SETTINGS_MISSING: "暂无 API 配置，请先添加地址、模型和 Key。",
  AI_SETTINGS_READ_FAILED: "模型配置读取失败，请稍后重试。",
  AI_REVERSE_IMAGE_PAYLOAD_INVALID: "图像反推参数不合法。",
  AI_SETTINGS_INCOMPLETE: "请先填写接口地址、模型和 API Key。",
  AI_SETTINGS_INVALID: "模型配置结构不合法。",
  AI_TRANSLATE_PAYLOAD_INVALID: "AI 翻译参数不合法。",
  EXTERNAL_URL_INVALID: "网页地址不合法，无法打开。",
  ZIP_DATA_MISSING: "分享包缺少 data.json。",
  ZIP_IMAGE_MISSING: "分享包缺少图片文件。",
  ZIP_SCHEMA_INVALID: "分享包数据结构不合法。",
  UNKNOWN_ERROR: "操作失败，请重试。",
};

const dynamicFallbackErrorCodes = new Set([
  "AI_MODELS_REQUEST_FAILED",
  "AI_REMOTE_REQUEST_FAILED",
  "AI_REMOTE_RESPONSE_INVALID",
  "AI_REMOTE_TIMEOUT",
]);

export function getUiErrorMessage(code: string, fallback: string): string {
  if (dynamicFallbackErrorCodes.has(code) && fallback.trim()) {
    return fallback;
  }

  return uiErrorMessage[code] ?? fallback;
}
