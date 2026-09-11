import { WebContentsView, shell, session, type BrowserWindow, type Rectangle } from "electron";
import type {
  AiImageGenerationData,
  AiImageGenerationPayload,
} from "../../../src/features/library/types/ai";
import type {
  DoubaoWebCanvasBounds,
  DoubaoWebCanvasStatus,
} from "../../../src/features/library/types/canvas";
import { AppError } from "../ipc/errors";
import { logger } from "../appLogger";
import { detectGeneratedImageExtension } from "../library/generatedImageData";
import { constrainWindowContentBounds } from "../window/windowContentBounds";
import { normalizeExternalUrl } from "../app/externalUrlPolicy";

const doubaoCreateImageUrl = "https://www.doubao.com/chat/create-image";
const doubaoPartition = "persist:suyan-doubao";
const pageReadyTimeoutMs = 30_000;
const resultWaitTimeoutMs = 320_000;
const pollIntervalMs = 1_000;

const allowedDoubaoHosts = [
  "doubao.com",
  "bytedance.com",
  "douyin.com",
  "feishu.cn",
] as const;

type DoubaoCanvasState = {
  ownerWindow: BrowserWindow | null;
  view: WebContentsView | null;
  pageReady: Promise<void> | null;
  bounds: Rectangle;
  /** view 是否被移到屏外（仍 visible=true，仅视觉上不可见，保证 DOM 正常渲染）。 */
  offscreen: boolean;
};

type PageImageCandidate = {
  src: string;
  width: number;
  height: number;
  alt: string;
};

/** 屏外偏移：把豆包 view 移到窗口左侧外，保持 visible=true 让页面继续渲染。 */
const offscreenX = -32000;

const state: DoubaoCanvasState = {
  ownerWindow: null,
  view: null,
  pageReady: null,
  bounds: { x: 0, y: 0, width: 640, height: 480 },
  offscreen: false,
};

export async function prepareDoubaoWebCanvas(ownerWindow: BrowserWindow): Promise<DoubaoWebCanvasStatus> {
  const view = ensureView(ownerWindow);
  await ensurePageReady(view);

  const authenticated = await isAuthenticated(view);
  if (authenticated) {
    // 已登录：豆包页移到屏外保持 visible（DOM 仍渲染），右侧恢复素言原生画布。
    // 不用 setVisible(false)——隐藏会导致下拉浮层点不开、结果图不渲染、抓图 0 候选。
    moveViewOffscreen(view);
  } else {
    // 未登录：在画布区域内显示豆包自身的登录弹窗，登录成功后由前端轮询隐藏。
    restoreViewBounds(view);
    await openLoginDialog(view);
  }

  logger.info("ai", "doubao-web:prepared", {
    authenticated,
    url: sanitizeUrl(view.webContents.getURL()),
  });

  return {
    ready: true,
    authenticated,
    loginRequired: !authenticated,
  };
}

/**
 * 轮询豆包登录态：前端在登录弹窗可见期间调用。一旦检测到已登录，
 * 立即隐藏豆包视图，让右侧恢复原生画布（后台生成流程的核心）。
 */
export async function refreshDoubaoWebCanvasAuth(ownerWindow: BrowserWindow): Promise<DoubaoWebCanvasStatus> {
  if (state.ownerWindow !== ownerWindow || !state.view || state.view.webContents.isDestroyed()) {
    return { ready: false, authenticated: false, loginRequired: true };
  }

  const view = state.view;
  const authenticated = await isAuthenticated(view);
  if (authenticated) {
    moveViewOffscreen(view);
  }

  return {
    ready: true,
    authenticated,
    loginRequired: !authenticated,
  };
}

export function setDoubaoWebCanvasBounds(ownerWindow: BrowserWindow, bounds: DoubaoWebCanvasBounds): { updated: true } {
  const view = ensureView(ownerWindow);
  const [contentWidth, contentHeight] = ownerWindow.getContentSize();
  const nextBounds = constrainWindowContentBounds(
    { width: contentWidth, height: contentHeight },
    normalizeBounds(bounds),
  );
  state.bounds = nextBounds;
  // 只在非屏外（即登录弹窗可见、view 显示在画布宿主）时实时定位；屏外时保留真实 bounds 供恢复用。
  if (!state.offscreen) {
    view.setBounds(nextBounds);
  }
  return { updated: true };
}

export function showDoubaoWebCanvas(ownerWindow: BrowserWindow): { visible: true } {
  const view = ensureView(ownerWindow);
  restoreViewBounds(view);
  return { visible: true };
}

export function hideDoubaoWebCanvas(ownerWindow: BrowserWindow): { visible: false } {
  if (state.ownerWindow === ownerWindow && state.view && !state.view.webContents.isDestroyed()) {
    moveViewOffscreen(state.view);
  }
  return { visible: false };
}

/**
 * 把 view 移到屏外，但保持 visible=true。页面仍正常渲染（backgroundThrottling 已关闭），
 * DOM 自动化（下拉点击、提示词提交、结果图渲染）能照常工作，而用户在素言主界面看不到它。
 * 这是「后台生成」与「页面可见才能 DOM 自动化」之间不破坏对方的关键。
 */
function moveViewOffscreen(view: WebContentsView): void {
  if (state.offscreen) {
    return;
  }
  state.offscreen = true;
  view.setBounds({ ...state.bounds, x: offscreenX });
  view.setVisible(true);
}

/** 恢复 view 到画布宿主的真实 bounds（登录弹窗可见时用）。 */
function restoreViewBounds(view: WebContentsView): void {
  state.offscreen = false;
  view.setBounds(state.bounds);
  view.setVisible(true);
}

export async function generateImagesWithDoubaoWeb(
  ownerWindow: BrowserWindow,
  payload: AiImageGenerationPayload,
): Promise<AiImageGenerationData> {
  const prompt = payload.prompt.trim();
  if (!prompt) {
    throw new AppError("DOUBAO_PROMPT_EMPTY", "请输入图像提示词。");
  }

  const view = ensureView(ownerWindow);
  await ensurePageReady(view);

  if (!(await isAuthenticated(view))) {
    // 会话过期或从未登录：把登录弹窗显示在画布区域，让前端切回登录态。
    restoreViewBounds(view);
    await openLoginDialog(view);
    throw new AppError("DOUBAO_LOGIN_REQUIRED", "请先在画布内完成豆包登录，再开始生成。");
  }
  // 已登录：生成期间把豆包页显示在画布宿主上，DOM 自动化（下拉点击、提交、结果渲染）才可靠。
  // 屏外 / setVisible(false) 会导致下拉点不开、提示词写不进、结果图不渲染（08:49 复现 seenCandidates:0）。
  // 生成完拿到结果后由前端把 view 移回屏外（见 generate-done 后的 hide 调用）。
  restoreViewBounds(view);
  logger.info("ai", "doubao-web:generate-start", {
    authenticated: true,
    url: sanitizeUrl(view.webContents.getURL()),
    size: payload.size,
    doubaoModel: payload.doubaoModel ?? "",
    doubaoStyle: payload.doubaoStyle ?? "",
  });

  await applyDoubaoCanvasOptions(view, payload.size);
  await selectDoubaoDropdown(view, "model", payload.doubaoModel);
  await selectDoubaoDropdown(view, "style", payload.doubaoStyle);
  const before = await readPageImageCandidates(view);
  logger.info("ai", "doubao-web:before-images", { count: before.length });

  try {
    const submitted = await submitPrompt(view, buildDoubaoPrompt(prompt, payload.negativePrompt));
    if (!submitted) {
      throw new AppError("DOUBAO_PROMPT_INPUT_NOT_FOUND", "没有找到豆包画布输入框或生成按钮，请刷新网页后重试。");
    }

    const candidates = await waitForNewImages(view, before, Math.max(1, Math.min(4, Math.floor(payload.n ?? 1))));
    const images = (await Promise.all(candidates.map(async (candidate) => ({
      dataUrl: await readPageImageAsDataUrl(view, candidate.src),
      revisedPrompt: null,
    })))).filter((image) => image.dataUrl);

    if (images.length === 0) {
      throw new AppError("DOUBAO_IMAGE_RESULT_NOT_FOUND", "豆包网页未返回可导入的图片，请稍后重试。");
    }

    logger.info("ai", "doubao-web:generation-done", {
      imageCount: images.length,
      promptLength: prompt.length,
    });

    return {
      images,
      model: "豆包网页画布（免费）",
    };
  } finally {
    // 生成结束（成功或失败）后把豆包页移回屏外，右侧恢复素言原生画布。
    moveViewOffscreen(view);
  }
}

function ensureView(ownerWindow: BrowserWindow): WebContentsView {
  if (state.ownerWindow && state.ownerWindow !== ownerWindow) {
    disposeView();
  }

  if (state.view && !state.view.webContents.isDestroyed()) {
    return state.view;
  }

  const doubaoSession = session.fromPartition(doubaoPartition);
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition: doubaoPartition,
      sandbox: true,
      spellcheck: true,
      // 后台生成流程：登录后视图被隐藏，但仍需在后台向豆包写入提示词、
      // 触发生成并轮询结果图片，因此必须关闭隐藏时的定时器/渲染节流。
      backgroundThrottling: false,
    },
  });

  state.ownerWindow = ownerWindow;
  state.view = view;
  state.pageReady = null;
  state.offscreen = true;
  ownerWindow.contentView.addChildView(view);
  view.setBounds({ ...state.bounds, x: offscreenX });
  view.setVisible(true);
  view.setBorderRadius(16);
  view.setBackgroundColor("#ffffff");

  view.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedDoubaoUrl(url)) {
      void view.webContents.loadURL(url);
      return { action: "deny" };
    }
    void openAllowedExternalUrl(url);
    return { action: "deny" };
  });
  view.webContents.on("will-navigate", (event, url) => {
    if (isAllowedDoubaoUrl(url)) {
      return;
    }
    event.preventDefault();
    void openAllowedExternalUrl(url);
  });
  view.webContents.on("render-process-gone", (_event, details) => {
    logger.warn("ai", "doubao-web:render-process-gone", { reason: details.reason });
  });

  ownerWindow.once("closed", disposeView);
  void doubaoSession.clearHostResolverCache().catch(() => undefined);
  return view;
}

async function ensurePageReady(view: WebContentsView): Promise<void> {
  if (view.webContents.isDestroyed()) {
    throw new AppError("DOUBAO_WEBVIEW_DESTROYED", "豆包网页画布已关闭，请重新选择。");
  }

  const currentUrl = view.webContents.getURL();
  if (currentUrl.startsWith("https://www.doubao.com/chat/create-image")) {
    return;
  }

  if (!state.pageReady) {
    state.pageReady = withTimeout(
      view.webContents.loadURL(doubaoCreateImageUrl),
      pageReadyTimeoutMs,
      new AppError("DOUBAO_WEB_LOAD_TIMEOUT", "豆包网页加载超时，请检查网络后重试。"),
    ).catch((error) => {
      state.pageReady = null;
      throw error;
    });
  }

  await state.pageReady;
}

async function openLoginDialog(view: WebContentsView): Promise<void> {
  if (view.webContents.isDestroyed()) {
    return;
  }

  await executePageScript(view, `(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const loginButton = buttons.find((button) => {
      const text = (button.innerText || button.textContent || "").trim();
      const label = button.getAttribute("aria-label") || button.getAttribute("title") || "";
      return /^登录$/.test(text) || /登录/.test(label);
    });
    if (loginButton && !loginButton.disabled) {
      loginButton.click();
      return true;
    }
    return false;
  })()`);
}

async function isAuthenticated(view: WebContentsView): Promise<boolean> {
  const doubaoCookies = await session.fromPartition(doubaoPartition).cookies.get({ url: doubaoCreateImageUrl });
  const hasAuthCookie = doubaoCookies.some((cookie) => /^(sessionid|sessionid_ss|sid_guard|uid_tt|uid_tt_ss|login_user|user_id|sso_state)$/i.test(cookie.name));
  if (hasAuthCookie) {
    return true;
  }

  const pageState = await executePageScript<{ loginButtonVisible: boolean; hasCanvasInput: boolean }>(view, `(() => {
    const bodyText = document.body?.innerText || "";
    const loginButtonVisible = Array.from(document.querySelectorAll("button")).some((button) => {
      const text = (button.innerText || button.textContent || "").trim();
      return text === "登录" && getComputedStyle(button).display !== "none";
    });
    const hasCanvasInput = /描述你想要的图片/.test(bodyText) || Boolean(document.querySelector("[contenteditable='true'], textarea"));
    return { loginButtonVisible, hasCanvasInput };
  })()`);

  return Boolean(pageState?.hasCanvasInput && !pageState.loginButtonVisible);
}

/**
 * 把正向提示词写进豆包创作页的输入框并触发生成。
 *
 * 真实结构（playwright 快照）：输入框是 role=textbox 的 contenteditable 富文本容器，
 * 内部第一个 <p> 显示「描述你想要的图片」占位文字。豆包用 Lexical/ProseMirror 类框架，
 * 直接设 textContent / DOM 事件都会被框架丢弃。
 *
 * 可靠做法：脚本只负责「定位输入框 + 聚焦 + 全选清空」，真正的文字输入与提交用
 * Electron 主进程的 webContents.sendInputEvent 模拟真实键盘——框架 100% 识别
 * （和真人打字、按 Enter 完全一致）。这比 DOM InputEvent / execCommand 可靠得多，
 * 是文本「没写进 / 写进没发送」的根治方案。
 *
 * 每步都记日志（find-input / focus / typed / submitted），便于真机定位。
 */
async function submitPrompt(view: WebContentsView, prompt: string): Promise<boolean> {
  const promptJson = JSON.stringify(prompt);
  // 1) 页面内：定位输入框、聚焦、全选清空。返回输入框是否找到。
  const prep = await executePageScript<{ step: string; ok: boolean; detail?: string }>(view, `(async () => {
    const editables = Array.from(document.querySelectorAll("[contenteditable='true']"));
    let input = editables.find((el) => /描述你想要的图片/.test((el.innerText || el.textContent || "").trim()));
    if (!input) {
      input = document.querySelector("[role='textbox'][contenteditable='true']") || editables[editables.length - 1];
    }
    if (!input) {
      return { step: "find-input", ok: false };
    }
    input.focus();
    // 全选清空占位文字和残留内容。
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(input);
      sel.addRange(range);
    }
    document.execCommand("delete", false);
    return { step: "focus", ok: true };
  })()`);

  if (!prep?.ok) {
    logger.info("ai", "doubao-web:submit-result", { submitted: false, step: prep?.step ?? "no-result", detail: prep?.detail ?? "" });
    return false;
  }

  // 2) 用 sendInputEvent 逐字符真实键入文本。每字符发 keyDown/char/keyUp，
  //    与真人键盘输入一致，Lexical 等富文本框架必然识别并更新内部状态。
  const wc = view.webContents;
  for (const ch of prompt) {
    wc.sendInputEvent({ type: "keyDown", keyCode: ch });
    wc.sendInputEvent({ type: "char", keyCode: ch });
    wc.sendInputEvent({ type: "keyUp", keyCode: ch });
  }
  // 短暂等待框架把输入框状态更新为「非空」、发送按钮启用。
  await delay(300);

  // 3) 提交：优先点发送按钮；找不到则用 sendInputEvent 真实按 Enter。
  const submitResult = await executePageScript<{ step: string; ok: boolean }>(view, `(() => {
    const isSubmit = (button) => {
      if (button.disabled) {
        return false;
      }
      const text = (button.innerText || button.textContent || "").trim();
      const label = [button.getAttribute("aria-label") || "", button.getAttribute("title") || ""].join(" ");
      return /生成|发送|提交|create|generate|send/i.test(text + " " + label);
    };
    const allButtons = Array.from(document.querySelectorAll("button"));
    let submitButton = allButtons.find(isSubmit);
    if (!submitButton) {
      // 豆包发送键是紧挨输入框的图标按钮：从输入框向上找输入区容器里的可点击按钮，
      // 排除工具栏的「参考图/模型/比例/风格」等。
      const editables = Array.from(document.querySelectorAll("[contenteditable='true']"));
      const input = editables.find((el) => el === document.activeElement) || editables[editables.length - 1];
      let scope = input ? input.parentElement : null;
      for (let i = 0; i < 4 && scope; i++) {
        const local = Array.from(scope.querySelectorAll("button")).filter((b) => !b.disabled && getComputedStyle(b).display !== "none");
        const candidate = local.reverse().find((b) => {
          const t = (b.innerText || b.textContent || "").trim();
          return !/参考图|模型|比例|风格|抠图|擦除|标记|扩图|变清晰/.test(t);
        });
        if (candidate) {
          submitButton = candidate;
          break;
        }
        scope = scope.parentElement;
      }
    }
    if (submitButton) {
      submitButton.click();
      return { step: "submit-button", ok: true };
    }
    return { step: "no-button", ok: false };
  })()`);

  if (submitResult?.ok) {
    logger.info("ai", "doubao-web:submit-result", { submitted: true, step: submitResult.step });
    return true;
  }

  // 没找到发送按钮：用 sendInputEvent 真实按 Enter 提交（豆包主推方式）。
  wc.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
  wc.sendInputEvent({ type: "char", keyCode: "Enter" });
  wc.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
  logger.info("ai", "doubao-web:submit-result", { submitted: true, step: "submit-enter" });
  return true;
}

async function applyDoubaoCanvasOptions(view: WebContentsView, size: string | undefined): Promise<void> {
  const ratio = resolveDoubaoRatio(size);
  if (!ratio) {
    return;
  }
  const ratioJson = JSON.stringify(ratio);
  const result = await executePageScript<{ hit: boolean }>(view, `(async () => {
    const desired = ${ratioJson};
    // 真实触发器文本「比例 自动」以「比例」开头，用 startsWith 精确定位避免误匹配。
    const buttons = Array.from(document.querySelectorAll("button, [role='button']"));
    const ratioButton = buttons.find((button) => (button.innerText || button.textContent || "").trim().startsWith("比例"));
    if (!ratioButton) {
      return { hit: false };
    }
    ratioButton.click();
    for (const waitMs of [120, 220]) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      const options = Array.from(document.querySelectorAll("[role='option'], li, button"));
      const option = options.find((candidate) => {
        const text = (candidate.innerText || candidate.textContent || "").trim();
        return text === desired || text.startsWith(desired + " ") || text.includes(desired);
      });
      if (option) {
        option.click();
        return { hit: true };
      }
    }
    // miss：Escape 收起，不 body.click。
    ratioButton.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape", code: "Escape" }));
    return { hit: false };
  })()`);

  if (!result?.hit) {
    logger.warn("ai", "doubao-web:ratio-miss", { size, ratio });
  } else {
    logger.info("ai", "doubao-web:ratio-hit", { ratio });
  }
}

function resolveDoubaoRatio(size: string | undefined): string | null {
  const match = /^([1-9]\d*)x([1-9]\d*)$/i.exec(size ?? "");
  if (!match) {
    return null;
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  const ratio = width / height;
  // 覆盖豆包创作页常见比例，按数值最接近映射；素言侧的 3:2 / 2:3 / 21:9 会落到最近的可选项。
  const candidates = [
    { value: "1:1", ratio: 1 },
    { value: "3:2", ratio: 3 / 2 },
    { value: "2:3", ratio: 2 / 3 },
    { value: "4:3", ratio: 4 / 3 },
    { value: "3:4", ratio: 3 / 4 },
    { value: "16:9", ratio: 16 / 9 },
    { value: "9:16", ratio: 9 / 16 },
  ];
  return candidates.sort((a, b) => Math.abs(a.ratio - ratio) - Math.abs(b.ratio - ratio))[0]?.value ?? null;
}

/**
 * 在豆包创作页上选择模型 / 风格下拉项。kind 决定按哪个标签定位触发器
 * （"model" -> 文本以「模型」开头的按钮，"style" -> 文本以「风格」开头的按钮），
 * desired 是目标选项的可见文本（模型如「Seedream 4.5」）。
 *
 * 真实结构（playwright 快照）：模型按钮文本是「模型 Seedream 4.5」、风格按钮文本是「风格」，
 * 均以关键词开头，故用 startsWith 精确定位触发器，避免误匹配侧栏 / 历史项。
 *
 * 重要：豆包页面结构可能随平台改版。这里只做尽力匹配——点不中触发器或选项时不报错，
 * 让生成继续按网页默认进行，并在日志里记录 kind/desired 的命中结果，便于真机排查。
 * miss 时绝不点击页面 body（会打散输入框焦点导致后续提交失败），
 * 改用 Escape 键收起下拉。
 */
async function selectDoubaoDropdown(
  view: WebContentsView,
  kind: "model" | "style",
  desired: string | undefined,
): Promise<void> {
  const target = desired?.trim();
  if (!target) {
    return;
  }
  const triggerKeyword = kind === "model" ? "模型" : "风格";
  const triggerKeywordJson = JSON.stringify(triggerKeyword);
  const targetJson = JSON.stringify(target);
  const result = await executePageScript<{ hit: boolean }>(view, `(async () => {
    const triggerKeyword = ${triggerKeywordJson};
    const target = ${targetJson};

    // 触发器：button 文本以「模型」/「风格」开头（真实按钮文本「模型 Seedream 4.5」「风格」）。
    const triggerCandidates = Array.from(document.querySelectorAll("button, [role='button'], [role='combobox']"));
    const trigger = triggerCandidates.find((el) => {
      const text = (el.innerText || el.textContent || "").trim();
      return text.startsWith(triggerKeyword) && getComputedStyle(el).display !== "none";
    });
    if (!trigger) {
      return { hit: false };
    }
    trigger.click();

    // 下拉用 portal 渲染、需等其挂载；找不到则再等一次。
    for (const waitMs of [180, 260]) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      const options = Array.from(document.querySelectorAll("[role='option'], [role='menuitem'], li, button"));
      const option = options.find((candidate) => {
        const text = (candidate.innerText || candidate.textContent || "").trim();
        if (!text || getComputedStyle(candidate).display === "none") {
          return false;
        }
        return text === target || text.startsWith(target + " ") || text.includes(target);
      });
      if (option) {
        option.click();
        return { hit: true };
      }
    }

    // 没点中选项：用 Escape 收起下拉，绝不 body.click（避免打散输入框焦点）。
    trigger.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape", code: "Escape" }));
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape", code: "Escape" }));
    return { hit: false };
  })()`);

  if (result?.hit) {
    logger.info("ai", "doubao-web:dropdown-hit", { kind, target });
  } else {
    logger.warn("ai", "doubao-web:dropdown-miss", { kind, target });
  }
}

/**
 * 抓取豆包页面上的结果图候选。只扫「结果区」内的大图，避免把侧栏 / 历史缩略图 / 占位图当成结果。
 *
 * 豆包创作页结构（playwright 快照）：输入框 textbox 在 main 内，结果图出现在其下方的消息流里。
 * 这里先尝试定位结果消息容器（含「做同款」按钮或可滚动消息区的区域），在其内查 <img>；
 * 找不到容器时回退到全 main 区域。要求 naturalWidth >= 512，排除小占位图与图标。
 */
async function readPageImageCandidates(view: WebContentsView): Promise<PageImageCandidate[]> {
  return (await executePageScript<PageImageCandidate[]>(view, `(() => {
    const collect = (root) => Array.from(root.querySelectorAll("img"))
      .filter((image) => image.complete && image.naturalWidth >= 512 && image.naturalHeight >= 512)
      .map((image) => ({ src: image.currentSrc || image.src, width: image.naturalWidth, height: image.naturalHeight, alt: image.alt || "" }))
      .filter((image) => image.src && !image.src.startsWith("data:image/svg"));

    // 优先：含「做同款」按钮的结果消息容器（快照里每条结果带「做同款」按钮）。
    const resultBlocks = Array.from(document.querySelectorAll("[class*='message'], [class*='result'], [class*='answer'], article"));
    for (const block of resultBlocks) {
      if (Array.from(block.querySelectorAll("button")).some((b) => /做同款/.test((b.innerText || b.textContent || "")))) {
        const imgs = collect(block);
        if (imgs.length > 0) {
          return imgs;
        }
      }
    }
    // 回退：main 区域内所有大图。
    const main = document.querySelector("main");
    return main ? collect(main) : collect(document);
  })()`)) ?? [];
}

/**
 * 等待新生成的结果图。关键改进：拿到候选后逐张下载并用文件签名校验是真实 PNG/JPEG/WEBP，
 * 无效（占位图 / 空数据 / 非图片）则丢弃继续轮询，而不是把无效 data URL 当结果返回。
 * 这修复了 04:01「生成图片内容无法识别」与 08:04 等不到有效图的超时。
 */
async function waitForNewImages(
  view: WebContentsView,
  before: PageImageCandidate[],
  requestedCount: number,
): Promise<PageImageCandidate[]> {
  const beforeSources = new Set(before.map((candidate) => candidate.src));
  const deadline = Date.now() + resultWaitTimeoutMs;
  let lastAttemptCount = 0;

  while (Date.now() < deadline) {
    const current = await readPageImageCandidates(view);
    const fresh = uniqueImageCandidates(current.filter((candidate) => !beforeSources.has(candidate.src)));
    if (fresh.length > 0) {
      lastAttemptCount = fresh.length;
      // 逐张下载并校验真实格式；只保留能解码为 PNG/JPEG/WEBP 的候选。
      const validated = await validateCandidates(view, fresh);
      if (validated.length > 0) {
        return validated.slice(-requestedCount);
      }
    }
    await delay(pollIntervalMs);
  }

  logger.warn("ai", "doubao-web:result-timeout", {
    seenCandidates: lastAttemptCount,
    requestedCount,
  });
  throw new AppError("DOUBAO_IMAGE_RESULT_TIMEOUT", "等待豆包网页图片超时，请检查网页状态后重试。");
}

/** 下载候选并按文件签名校验，只保留真实 PNG/JPEG/WEBP，丢弃占位 / 无效数据。 */
async function validateCandidates(
  view: WebContentsView,
  candidates: PageImageCandidate[],
): Promise<PageImageCandidate[]> {
  const results = await Promise.all(candidates.map(async (candidate) => {
    const dataUrl = await readPageImageAsDataUrl(view, candidate.src);
    return dataUrl ? { candidate, dataUrl } : null;
  }));
  return results.filter((r): r is { candidate: PageImageCandidate; dataUrl: string } => r !== null).map((r) => r.candidate);
}

/**
 * 把单个图片 src 转成 data URL。blob: 走页面上下文 fetch，其它走主进程持久 session fetch。
 * 下载后用 detectGeneratedImageExtension 按文件签名校验；无效则返回空串（让调用方继续轮询），
 * 不再抛错——抛错会让一次抓到占位图就终止整个生成。
 */
async function readPageImageAsDataUrl(view: WebContentsView, source: string): Promise<string> {
  let bytes: Buffer | null = null;

  if (source.startsWith("data:image/")) {
    return source;
  }

  if (source.startsWith("blob:")) {
    // blob: 只能从页面上下文读取（主进程 session 拿不到 renderer 的 blob）。
    const sourceJson = JSON.stringify(source);
    const dataUrl = await executePageScript<string>(view, `(async () => {
      const source = ${sourceJson};
      const response = await fetch(source, { credentials: "include" });
      if (!response.ok) {
        return "";
      }
      const blob = await response.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => resolve("");
        reader.readAsDataURL(blob);
      });
    })()`);
    if (!dataUrl?.startsWith("data:image/")) {
      return "";
    }
    return dataUrl;
  }

  // 非 blob：主进程持久 session 下载，再按签名校验。
  try {
    const response = await session.fromPartition(doubaoPartition).fetch(source, { credentials: "include" });
    if (response.ok) {
      const buf = Buffer.from(await response.arrayBuffer());
      if (buf.byteLength > 0 && buf.byteLength <= 50 * 1024 * 1024) {
        bytes = buf;
      }
    }
  } catch (error) {
    logger.warn("ai", "doubao-web:image-fetch-fallback", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  if (!bytes || !detectGeneratedImageExtension(bytes)) {
    // 非图片内容（占位 / 空数据 / SVG 假图）：返回空，让轮询继续等真结果。
    return "";
  }
  const mimeType = bytesStartsWith(bytes, [0x89, 0x50, 0x4e, 0x47]) ? "image/png"
    : bytesStartsWith(bytes, [0xff, 0xd8, 0xff]) ? "image/jpeg"
    : "image/webp";
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

function bytesStartsWith(buf: Buffer, prefix: number[]): boolean {
  if (buf.length < prefix.length) {
    return false;
  }
  return prefix.every((byte, index) => buf[index] === byte);
}

function uniqueImageCandidates(candidates: PageImageCandidate[]): PageImageCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.src)) {
      return false;
    }
    seen.add(candidate.src);
    return true;
  });
}

function buildDoubaoPrompt(prompt: string, negativePrompt?: string): string {
  const negative = negativePrompt?.trim() ?? "";
  const cleanOutputRequirement = "请输出干净的原始画面，不要出现文字、Logo、签名、平台标识或任何水印。";
  return negative
    ? `${prompt}\n\n反向约束：${negative}\n${cleanOutputRequirement}`
    : `${prompt}\n\n${cleanOutputRequirement}`;
}

function normalizeBounds(input: DoubaoWebCanvasBounds): Rectangle {
  return {
    x: Math.round(input.x),
    y: Math.round(input.y),
    width: Math.max(1, Math.round(input.width)),
    height: Math.max(1, Math.round(input.height)),
  };
}

function isAllowedDoubaoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      return false;
    }
    return allowedDoubaoHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

async function openAllowedExternalUrl(value: string): Promise<void> {
  try {
    await shell.openExternal(normalizeExternalUrl(value));
  } catch (error) {
    logger.warn("ai", "doubao-web:external-url-rejected", {
      message: error instanceof Error ? error.message : String(error),
    });
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

async function executePageScript<T>(view: WebContentsView, script: string): Promise<T | null> {
  try {
    return (await view.webContents.executeJavaScript(script, true)) as T;
  } catch (error) {
    logger.warn("ai", "doubao-web:script-failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutError: Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(timeoutError), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function disposeView(): void {
  const view = state.view;
  const ownerWindow = state.ownerWindow;
  if (view && ownerWindow && !ownerWindow.isDestroyed()) {
    ownerWindow.contentView.removeChildView(view);
  }
  if (view && !view.webContents.isDestroyed()) {
    view.webContents.close({ waitForBeforeUnload: false });
  }
  state.ownerWindow = null;
  state.view = null;
  state.pageReady = null;
  state.offscreen = false;
}
