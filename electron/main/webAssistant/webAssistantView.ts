import { WebContentsView, shell, session, type BrowserWindow, type Rectangle } from "electron";
import { importImageBuffers } from "../library/imageFiles";
import type { ImportImageBuffersResult } from "../library/imageFiles";
import type {
  WebAssistantBounds,
  WebAssistantPrepareInput,
  WebAssistantTargetId,
} from "../../../src/features/library/types/webAssistant";
import {
  WEB_ASSISTANT_CUSTOM_ID,
  findWebAssistantSite,
  partitionSlugForTarget,
} from "../../../src/features/library/types/webAssistant";
import { AppError } from "../ipc/errors";
import { normalizeExternalUrl } from "../app/externalUrlPolicy";
import { logger } from "../appLogger";
import { constrainWindowContentBounds } from "../window/windowContentBounds";

/**
 * 网页助手主进程模块。
 *
 * 与 `electron/main/ai/doubaoWebCanvas.ts` 使用的 `WebContentsView` 能力同源，
 * 但状态机、分区、白名单完全独立：本模块**只为「网页助手」视图存在**，
 * 让用户在素言里直接打开豆包 / 元宝 / Kimi 等平台网页做提示词优化与图像反推，
 * 绕开 `<iframe>` 被平台 X-Frame-Options / CSP 拦死的限制。
 *
 * 与 doubaoWebCanvas 的核心差别：
 * - 不做"后台生成"——进入网页助手时 view 直接可见，用户在网页里自行操作；
 * - 不做登录态轮询/隐藏——平台需要登录就在 view 区里登，cookie 落到独立 partition；
 * - 每个平台一个独立 `persist:webassistant-<platform>` 分区，互不串登录态。
 * - 同时只保留当前站点的 WebContentsView。切走或退出时销毁后台页，避免
 *   每个 AI 站再挂一个 150–400MB 渲染进程；cookie 仍落在 persist 分区。
 *
 * 目标 id：具名平台名（豆包/元宝/…/自定义）、生图网站目录 id（`WEB_ASSISTANT_SITES`）
 * 或自定义网址（跟随 customUrl 传入）。registry 以目标 id 为 key。
 *
 * 本期范围：仅"在素言里打开平台网页"，不做与素材的双向桥
 * （注入 prompt / 抓回结果留下一期）。
 */

const fallbackBounds: Rectangle = { x: 0, y: 0, width: 640, height: 480 };
const offscreenX = -32000;

type PlatformState = {
  view: WebContentsView | null;
  bounds: Rectangle;
  /** 创建该 view 的主窗；销毁时用 contentView.removeChildView 分离。 */
  ownerWindow: BrowserWindow | null;
  /** 当前已加载的 URL，用于「同地址不重复 loadURL」。 */
  currentUrl: string;
  /** bounds 同步期间是否临时屏外（避免视图 0×0 闪烁，与 doubaoCanvas 思路一致）。 */
  offscreen: boolean;
};

/** 全局单例：以稳定分区 slug 为 key，同域站点（含自定义同域网址）共用 view 与登录态。 */
const registry = new Map<string, PlatformState>();
const ownersWithCloseHandler = new WeakSet<BrowserWindow>();

function registryKeyFor(platform: WebAssistantTargetId, customUrl?: string | null): string {
  return partitionSlugForTarget(platform, customUrl);
}

function partitionFor(platform: WebAssistantTargetId, customUrl?: string | null): string {
  return `persist:webassistant-${registryKeyFor(platform, customUrl)}`;
}

function resolveTargetUrl(platform: WebAssistantTargetId, customUrl: string | null | undefined): string {
  if (platform === WEB_ASSISTANT_CUSTOM_ID) {
    const trimmed = String(customUrl ?? "").trim();
    if (!trimmed) {
      throw new AppError("WEB_ASSISTANT_CUSTOM_URL_EMPTY", "自定义平台需要填写网址。");
    }
    return normalizeExternalUrl(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  }
  const site = findWebAssistantSite(platform);
  if (site) {
    return site.url;
  }
  throw new AppError("WEB_ASSISTANT_SITE_NOT_FOUND", "网页助手站点不存在，请重新选择。");
}

function isAllowedPlatformUrl(_platform: WebAssistantTargetId, value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return false;
    }
    // 所有站点（平台、生图网站、自定义）都按嵌入式浏览器对待：允许任意 http(s)
    // 同窗导航。这些平台的登录流程都会跨域跳到 OAuth 域名（如 chatgpt →
    // auth.openai.com、m365 → login.microsoftonline.com）再跳回来；若只允许
    // 同 origin，登录页会被 will-navigate 拦到系统浏览器，cookie 落在浏览器
    // profile，应用侧永远登不上。放行后登录留在本 view 分区内，登录态才能回到软件。
    return true;
  } catch {
    return false;
  }
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}

function openExternalWebUrl(value: string): void {
  try {
    void shell.openExternal(normalizeExternalUrl(value));
  } catch {
    // Ignore non-web schemes from third-party pages.
  }
}

function ensureState(
  ownerWindow: BrowserWindow,
  platform: WebAssistantTargetId,
  startUrl: string,
  customUrl?: string | null,
): PlatformState {
  const key = registryKeyFor(platform, customUrl);
  const existing = registry.get(key);
  if (existing && existing.view && !existing.view.webContents.isDestroyed()) {
    return existing;
  }

  if (existing?.view && existing.view.webContents.isDestroyed()) {
    registry.delete(key);
  }

  const partition = partitionFor(platform, customUrl);
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition,
      sandbox: true,
      spellcheck: true,
      // 主区可见的网页助手：用户直接操作，不靠后台 DOM 自动化；保持节流避免抢占资源。
      backgroundThrottling: true,
    },
  });

  const state: PlatformState = {
    view,
    bounds: { ...fallbackBounds },
    ownerWindow,
    currentUrl: "",
    offscreen: true,
  };

  ownerWindow.contentView.addChildView(view);
  if (!ownersWithCloseHandler.has(ownerWindow)) {
    ownersWithCloseHandler.add(ownerWindow);
    ownerWindow.once("closed", () => disposeWebAssistant(ownerWindow));
  }
  view.setBounds({ ...state.bounds, x: offscreenX });
  view.setVisible(true);
  view.setBorderRadius(8);
  view.setBackgroundColor("#ffffff");

  view.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedPlatformUrl(platform, url)) {
      void view.webContents.loadURL(url);
      return { action: "deny" };
    }
    openExternalWebUrl(url);
    return { action: "deny" };
  });

  view.webContents.on("will-navigate", (event, url) => {
    if (isAllowedPlatformUrl(platform, url)) {
      return;
    }
    event.preventDefault();
    openExternalWebUrl(url);
  });

  view.webContents.on("render-process-gone", (_event, details) => {
    logger.warn("web-assistant", "render-process-gone", {
      platform,
      reason: details.reason,
    });
  });

  void session.fromPartition(partition).clearHostResolverCache().catch(() => undefined);

  registry.set(key, state);
  logger.info("web-assistant", "view-created", { platform, partition, url: sanitizeUrl(startUrl) });
  return state;
}

function moveViewOffscreen(view: WebContentsView, state: PlatformState): void {
  if (state.offscreen) {
    return;
  }
  state.offscreen = true;
  view.setBounds({ ...state.bounds, x: offscreenX });
  view.setVisible(true);
}

function restoreViewBounds(view: WebContentsView, state: PlatformState): void {
  state.offscreen = false;
  view.setBounds(state.bounds);
  view.setVisible(true);
}

export function prepareWebAssistant(
  ownerWindow: BrowserWindow,
  input: WebAssistantPrepareInput,
): { platform: WebAssistantTargetId } {
  const platform = input.platform;
  const targetUrl = resolveTargetUrl(platform, input.customUrl);
  const state = ensureState(ownerWindow, platform, targetUrl, input.customUrl);

  const view = state.view;
  if (!view) {
    throw new AppError("WEB_ASSISTANT_VIEW_UNAVAILABLE", "网页助手视图未就绪，请重试。");
  }
  if (view.webContents.isDestroyed()) {
    registry.delete(registryKeyFor(platform, input.customUrl));
    throw new AppError("WEB_ASSISTANT_VIEW_DESTROYED", "网页助手视图已销毁，请重新打开。");
  }

  // 显式刷新优先于「同地址不重复加载」：OAuth 场景登录后回到原 URL，若走 loadURL
  // 会整页重载丢登录态，reload() 保留会话 cookie。
  if (input.reload) {
    state.currentUrl = targetUrl;
    Promise.resolve(view.webContents.reload()).catch((error: unknown) => {
      logger.warn("web-assistant", "reload-failed", {
        platform,
        url: sanitizeUrl(targetUrl),
        message: error instanceof Error ? error.message : String(error),
      });
    });
  } else if (state.currentUrl !== targetUrl) {
    state.currentUrl = targetUrl;
    Promise.resolve(view.webContents.loadURL(targetUrl)).catch((error: unknown) => {
      logger.warn("web-assistant", "load-url-failed", {
        platform,
        url: sanitizeUrl(targetUrl),
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }

  logger.info("web-assistant", "prepared", {
    platform,
    url: sanitizeUrl(targetUrl),
  });

  return { platform };
}

export function setWebAssistantBounds(
  _ownerWindow: BrowserWindow,
  platform: WebAssistantTargetId | undefined,
  bounds: WebAssistantBounds,
  customUrl?: string | null,
): { updated: true } {
  if (!platform) {
    return { updated: true };
  }
  const state = registry.get(registryKeyFor(platform, customUrl));
  if (!state?.view || state.view.webContents.isDestroyed()) {
    return { updated: true };
  }
  const requestedBounds: Rectangle = {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height)),
  };
  const [contentWidth, contentHeight] = _ownerWindow.getContentSize();
  const next = constrainWindowContentBounds(
    { width: contentWidth, height: contentHeight },
    requestedBounds,
  );
  state.bounds = next;
  if (!state.offscreen) {
    state.view.setBounds(next);
  }
  return { updated: true };
}

export function showWebAssistant(
  _ownerWindow: BrowserWindow,
  platform: WebAssistantTargetId | undefined,
  customUrl?: string | null,
): { visible: true } {
  if (!platform) {
    return { visible: true };
  }
  // 同时只保留当前站点的渲染进程。切走立刻销毁其它 view，避免豆包/Kimi/ChatGPT
  // 各挂一个 150–400MB Chromium renderer 在后台继续跑脚本和缓存。
  // persist 分区里的 cookie 不受影响，下次打开仍保持登录。
  const targetKey = registryKeyFor(platform, customUrl);
  for (const entryKey of [...registry.keys()]) {
    if (entryKey === targetKey) continue;
    disposePlatform(entryKey);
  }
  const state = registry.get(targetKey);
  if (state?.view && !state.view.webContents.isDestroyed()) {
    restoreViewBounds(state.view, state);
  }
  return { visible: true };
}

export function setWebAssistantVisibility(
  _ownerWindow: BrowserWindow,
  visible: boolean,
): { visible: boolean } {
  for (const state of registry.values()) {
    if (state.view && !state.view.webContents.isDestroyed()) {
      state.view.setVisible(visible);
    }
  }
  return { visible };
}

/**
 * 截取当前网页视图的可见画面，供渲染层在目录浮层下垫底。
 *
 * 原生 WebContentsView 永远渲染在 DOM 之上，目录面板（DOM 浮层）无法盖住网页；
 * 旧实现只能在目录打开时把网页视图整体隐藏，导致「网页块消失」。这里在隐藏前
 * 先截一帧，隐藏视图后用这张截图在 DOM 里撑住网页块区域，目录浮层就"浮在网页
 * 块上面"。返回 JPEG data URL（截图为临时垫底，JPEG 比 PNG 小一个数量级）。
 */
export async function captureWebAssistant(
  _ownerWindow: BrowserWindow,
  platform: WebAssistantTargetId | undefined,
  customUrl?: string | null,
): Promise<{ dataUrl: string; width: number; height: number }> {
  if (!platform) {
    throw new AppError("WEB_ASSISTANT_VIEW_UNAVAILABLE", "网页助手视图未就绪。");
  }
  const state = registry.get(registryKeyFor(platform, customUrl));
  const view = state?.view;
  if (!view || view.webContents.isDestroyed()) {
    throw new AppError("WEB_ASSISTANT_VIEW_UNAVAILABLE", "网页助手视图未就绪，请重试。");
  }
  const image = await view.webContents.capturePage();
  if (image.isEmpty()) {
    throw new AppError("WEB_ASSISTANT_CAPTURE_EMPTY", "网页截图失败，请重试。");
  }
  const { width, height } = image.getSize();
  return { dataUrl: `data:image/jpeg;base64,${image.toJPEG(82).toString("base64")}`, width, height };
}

/**
 * 保存当前网页：截取可见画面 + 读取文本框内容，并写入素材库。
 *
 * 供「网页助手」顶部的保存按钮使用（适配带 #prompt 文本框的站点）。
 * 设备素颜不使用 importReceiver 桥：截图的 data URL 直接从主进程写入素材库，
 * 提示词作为 fallbackDraft 落盘，与 AI 生成/拖拽导入的落盘路径完全一致。
 */
export async function importWebAssistantCapture(
  ownerWindow: BrowserWindow,
  platform: WebAssistantTargetId | undefined,
  options: { title?: string | null; prompt?: string | null; customUrl?: string | null } | null,
): Promise<{ result: ImportImageBuffersResult }> {
  const { dataUrl } = await captureWebAssistant(ownerWindow, platform, options?.customUrl);
  const buffer = Buffer.from(dataUrl.split(",")[1] ?? "", "base64");
  const prompt = options?.prompt?.trim() || "";
  const images = [
    {
      name: `web-assistant-capture-${Date.now()}.png`,
      data: new Uint8Array(buffer),
    },
  ];
  const fallbackDraft = prompt
    ? {
        title: options?.title?.trim() || "网页助手截图",
        prompt,
        negativePrompt: "",
        tags: [],
        generationMethod: null,
        sourceUrl: null,
        sourceImageUrl: null,
        authorName: null,
        authorUrl: null,
        authorAvatarUrl: null,
      }
    : undefined;
  const result = await importImageBuffers(images, { fallbackDraft });
  return { result };
}

export async function executeWebAssistantScript(
  _ownerWindow: BrowserWindow,
  platform: WebAssistantTargetId | undefined,
  script: string,
  customUrl?: string | null,
): Promise<{ value: unknown }> {
  if (!platform) {
    throw new AppError("WEB_ASSISTANT_VIEW_UNAVAILABLE", "网页助手视图未就绪。");
  }
  const state = registry.get(registryKeyFor(platform, customUrl));
  const view = state?.view;
  if (!view || view.webContents.isDestroyed()) {
    throw new AppError("WEB_ASSISTANT_VIEW_UNAVAILABLE", "网页助手视图未就绪，请重试。");
  }
  const value = await view.webContents.executeJavaScript(script, true);
  return { value };
}

export function hideWebAssistant(_ownerWindow: BrowserWindow, platform?: WebAssistantTargetId): { visible: false } {
  if (platform) {
    disposePlatform(registryKeyFor(platform));
    return { visible: false };
  }
  // 退出网页助手时拆掉全部站点 view，避免后台网页继续占内存。
  for (const entryKey of [...registry.keys()]) {
    disposePlatform(entryKey);
  }
  return { visible: false };
}

export function disposeWebAssistant(ownerWindow: BrowserWindow): { disposed: true } {
  for (const [entryKey, state] of [...registry.entries()]) {
    if (state.ownerWindow === ownerWindow) {
      disposePlatform(entryKey);
    }
  }
  return { disposed: true };
}

function disposePlatform(entryKey: string): void {
  const state = registry.get(entryKey);
  if (!state) {
    return;
  }
  const view = state.view;
  const ownerWindow = state.ownerWindow;
  if (view && ownerWindow && !ownerWindow.isDestroyed()) {
    try {
      ownerWindow.contentView.removeChildView(view);
    } catch {
      // ignore
    }
  }
  if (view && !view.webContents.isDestroyed()) {
    view.webContents.close({ waitForBeforeUnload: false });
  }
  registry.delete(entryKey);
  logger.info("web-assistant", "view-disposed", { platform: entryKey });
}

export function __webAssistantRegistrySizeForTest(): number {
  return registry.size;
}
