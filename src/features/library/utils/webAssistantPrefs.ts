import {
  WEB_ASSISTANT_CUSTOM_ID,
  WEB_ASSISTANT_SITES,
  type WebAssistantTargetId,
} from "../types/webAssistant";

const platformStorageKey = "web-assistant:last-platform";
const customUrlStorageKey = "web-assistant:last-custom-url";

const KNOWN_SITE_IDS = new Set(WEB_ASSISTANT_SITES.map((site) => site.id));

/** 读取上次选择的站点 id；未知值或缺失时回退到默认站点。 */
export function getStoredWebAssistantPlatform(fallback: WebAssistantTargetId): WebAssistantTargetId {
  if (typeof window === "undefined") {
    return fallback;
  }

  const raw = window.localStorage.getItem(platformStorageKey);

  if (raw === null) {
    return fallback;
  }

  if (raw === WEB_ASSISTANT_CUSTOM_ID || KNOWN_SITE_IDS.has(raw)) {
    return raw;
  }

  return fallback;
}

export function storeWebAssistantPlatform(platform: WebAssistantTargetId): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(platformStorageKey, platform);
}

/** 读取上次使用的自定义网址；未保存过时返回 null。 */
export function getStoredWebAssistantCustomUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(customUrlStorageKey);
}

export function storeWebAssistantCustomUrl(url: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(customUrlStorageKey, url);
}
