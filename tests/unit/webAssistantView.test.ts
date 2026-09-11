import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ASSISTANT_SITES } from "../../src/features/library/types/webAssistant";
import { IMAGE_GEN_SITE_RECOMMENDATIONS } from "../../src/features/library/types/recommendationSites";

const projectRoot = path.resolve(__dirname, "../..");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

describe("web assistant view surface", () => {
  it("registers LibraryMainView = webAssistant alongside home and canvas", () => {
    const source = readSource("src/features/library/components/LibraryView.tsx");
    const unionLine = source
      .split("\n")
      .find((line) => line.startsWith("type LibraryMainView ="));

    expect(unionLine).toBeDefined();
    expect(unionLine).toContain('"webAssistant"');
    expect(unionLine).toContain('"canvas"');
    expect(unionLine).toContain('"home"');
  });

  it("exposes the 5 web-assistant IPC channels in the const enum", () => {
    const source = readSource("electron/shared/ipcChannels.ts");
    expect(source).toContain('WebAssistantPrepare = "web-assistant:prepare"');
    expect(source).toContain('WebAssistantBounds = "web-assistant:bounds"');
    expect(source).toContain('WebAssistantShow = "web-assistant:show"');
    expect(source).toContain('WebAssistantVisibility = "web-assistant:visibility"');
    expect(source).toContain('WebAssistantCapture = "web-assistant:capture"');
    expect(source).toContain('WebAssistantHide = "web-assistant:hide"');
    expect(source).toContain('WebAssistantDispose = "web-assistant:dispose"');
    expect(source).toContain("webAssistantPrepare: IpcChannelName.WebAssistantPrepare");
    expect(source).toContain("webAssistantCapture: IpcChannelName.WebAssistantCapture");
    expect(source).toContain("webAssistantHide: IpcChannelName.WebAssistantHide");
  });

  it("registers five web-assistant IPC handlers with web-assistant: channel strings", () => {
    const source = readSource("electron/main/ipc/registerIpcHandlers.ts");
    expect(source).toContain('handleResult("web-assistant:prepare"');
    expect(source).toContain('handleResult("web-assistant:bounds"');
    expect(source).toContain('handleResult("web-assistant:show"');
    expect(source).toContain('handleResult("web-assistant:capture"');
    expect(source).toContain('handleResult("web-assistant:hide"');
    expect(source).toContain('handleResult("web-assistant:dispose"');
    expect(source).toContain("prepareWebAssistant(");
    expect(source).toContain("setWebAssistantBounds(");
    expect(source).toContain("showWebAssistant(");
    expect(source).toContain("setWebAssistantVisibility(");
    expect(source).toContain("captureWebAssistant(");
    expect(source).toContain("hideWebAssistant(");
    expect(source).toContain("disposeWebAssistant(");
  });

  it("exposes preload + renderer types for the five methods", () => {
    const preload = readSource("electron/preload/index.ts");
    expect(preload).toContain("prepareWebAssistant:");
    expect(preload).toContain("setWebAssistantBounds:");
    expect(preload).toContain("showWebAssistant:");
    expect(preload).toContain("setWebAssistantVisibility:");
    expect(preload).toContain("captureWebAssistant:");
    expect(preload).toContain("hideWebAssistant:");
    expect(preload).toContain("disposeWebAssistant:");
    expect(preload).toContain("IpcChannelName.WebAssistantPrepare");
    expect(preload).toContain("IpcChannelName.WebAssistantCapture");
    expect(preload).toContain("IpcChannelName.WebAssistantHide");

    const api = readSource("src/types/suyanApi.ts");
    expect(api).toContain("prepareWebAssistant:");
    expect(api).toContain("setWebAssistantBounds:");
    expect(api).toContain("showWebAssistant:");
    expect(api).toContain("setWebAssistantVisibility:");
    expect(api).toContain("captureWebAssistant:");
    expect(api).toContain("hideWebAssistant:");
    expect(api).toContain("disposeWebAssistant:");
  });

  it("main-process module declares a WebContentsView-backed independent state machine", () => {
    const source = readSource("electron/main/webAssistant/webAssistantView.ts");
    expect(source).toContain('import { WebContentsView');
    expect(source).toContain("prepareWebAssistant");
    expect(source).toContain("setWebAssistantBounds");
    expect(source).toContain("showWebAssistant");
    expect(source).toContain("captureWebAssistant");
    expect(source).toContain("view.webContents.capturePage()");
    expect(source).toContain("hideWebAssistant");
    expect(source).toContain("disposeWebAssistant");
    // 独立分区，避免与 doubaoWebCanvas 共用 persist:suyan-doubao。
    expect(source).toContain("persist:webassistant-");
    expect(source).not.toContain("persist:suyan-doubao");
    expect(source).toContain("addChildView");
    expect(source).toContain("removeChildView");
    expect(source).toContain("setWindowOpenHandler");
    expect(source).toContain("will-navigate");
    expect(source).toContain("shell.openExternal");
    // 与 doubaoWebCanvas 不同：不做后台 DOM 自动化，进入时直接可见。
    expect(source).toContain("backgroundThrottling: true");
  });

  it("uses a flat official-name catalog without extra suffixes", () => {
    const source = readSource("src/features/library/types/webAssistant.ts");
    expect(source).toContain('"chatgpt.com": "ChatGPT"');
    expect(source).toContain('"doubao.com": "豆包"');
    expect(source).toContain('"yiyan.baidu.com": "文心一言"');
    expect(source).toContain('"chatglm.cn": "智谱清言"');
    expect(source).toContain('"kimi.moonshot.cn": "Kimi"');
    expect(source).toContain('"jimeng.jianying.com": "即梦"');
    expect(source).not.toContain("ChatGPT Image");
    expect(source).not.toContain("豆包 Doubao");
    expect(source).not.toContain("文心一言 ERNIE");
    expect(source).toContain('"m365.cloud.microsoft"');
    expect(source).toContain('"gemini.google.com"');
    expect(source).toContain('"grok.com"');
    expect(source).toContain('"yige.baidu.com"');
    expect(source).toContain('"canva.com"');
    expect(source).toContain('"designer.microsoft.com"');
    expect(source).toContain('"firefly.adobe.com"');
    expect(source).toContain('"whee.com"');
    expect(source).toContain('"xinghuo.xfyun.cn"');
    expect(source).toContain('"klingai.com"');
  });

  it("removes the expired Nihaox site from recommendations and the 网页助手 catalog", () => {
    expect(WEB_ASSISTANT_SITES.map((site) => site.domain)).not.toContain("nsfw.nihaox.cc.cd");
    expect(IMAGE_GEN_SITE_RECOMMENDATIONS.some((site) => site.domain === "nsfw.nihaox.cc.cd")).toBe(false);
  });

  it("renders a WebAssistantView block and a 网页助手 sidebar action in LibraryView", () => {
    const source = readSource("src/features/library/components/LibraryView.tsx");
    expect(source).toContain('import("./WebAssistantView")');
    expect(source).toContain("<WebAssistantView");
    expect(source).toContain("isImportMenuOpen={isImportMenuOpen}");
    expect(source).toContain("onNotify={showStatusMessage}");
    expect(source).toContain('mainView === "webAssistant" ?');
    expect(source).toContain('active={activeView === "webAssistant"}');
    expect(source).toContain('label={t("网页助手")}');
    expect(source).toContain('<Compass size={17}');
    // 进入网页助手时主动隐藏豆包网页画布，避免两种 overlay 叠显。
    expect(source).toContain('mainView === "webAssistant"');
    expect(source).toContain("hideDoubaoWebCanvas()");
    // 切走网页助手时销毁站点 view，释放后台渲染进程。
    expect(source).toContain("hideWebAssistant()");
    expect(source).toContain("setWebAssistantVisibility(!hasBlockingOverlay)");
    expect(source).toContain("isAiSettingsOpen");
    expect(source).toContain("isNsfwSettingsOpen");
    expect(source).toContain("isSystemPreferencesOpen");
    expect(source).toContain("isLogExportOpen");
    // 导入素材菜单由 WebAssistantView 截图后隐藏原生视图，外层 effect 不得抢先把网页切成空白。
    const effectStart = source.indexOf("const hasBlockingOverlay = Boolean(");
    const effectEnd = source.indexOf("window.suyanApi.setWebAssistantVisibility(!hasBlockingOverlay)");
    expect(effectStart).toBeGreaterThan(-1);
    expect(effectEnd).toBeGreaterThan(effectStart);
    expect(source.slice(effectStart, effectEnd)).not.toContain("isImportMenuOpen");
  });

  it("keeps web-assistant toolbar tips below the buttons in a reserved top lane", () => {
    const source = readSource("src/features/library/components/WebAssistantView.tsx");
    expect(source).toContain('className="relative z-50 flex min-h-24');
    expect(source).not.toContain('tooltipPlacement="above"');
    expect(source).toContain('tooltipPlacement="below"');
    expect(source).toContain("tooltipFlip={false}");

    const tooltipButton = readSource("src/components/ui/IconTooltipButton.tsx");
    expect(tooltipButton).toContain("zIndex: 2147483647");
  });

  it("keeps the web page visible beneath the import menu", () => {
    const source = readSource("src/features/library/components/WebAssistantView.tsx");
    expect(source).toContain("const hasForegroundOverlay = isDirectoryOpen || isImportMenuOpen || isFeatureGuideOpen;");
    expect(source).toContain("captureWebAssistant(platform, customUrl)");
    expect(source).toContain("setWebSnapshot(result.data.dataUrl)");
    expect(source).toContain("setWebAssistantVisibility(false)");
    expect(source).toContain("captured || isFeatureGuideOpen");
    expect(source).toContain("isImportMenuOpen");
    expect(source).toContain("isFeatureGuideOpen");

    const librarySource = readSource("src/features/library/components/LibraryView.tsx");
    expect(librarySource).toContain("zIndex: 10000");
    expect(librarySource).toContain("isImportMenuOpen={isImportMenuOpen}");
    expect(librarySource).toContain('isFeatureGuideOpen={shouldShowFeatureGuide && activeFeatureGuideId === "webAssistant"}');
  });

  it("places canvas and web assistant in the 灵感 navigation group", () => {
    const source = readSource("src/features/library/components/LibraryView.tsx");
    const materialStart = source.indexOf('{t("素材")}</SidebarSectionLabel>');
    const inspirationStart = source.indexOf('{t("灵感")}</SidebarSectionLabel>');
    const resourceStart = source.indexOf('{t("资源")}</SidebarSectionLabel>');
    const systemStart = source.indexOf('{t("系统")}</SidebarSectionLabel>');

    expect(materialStart).toBeGreaterThan(-1);
    expect(inspirationStart).toBeGreaterThan(materialStart);
    expect(resourceStart).toBeGreaterThan(inspirationStart);
    expect(systemStart).toBeGreaterThan(resourceStart);

    const materialSection = source.slice(materialStart, inspirationStart);
    const inspirationSection = source.slice(inspirationStart, resourceStart);
    expect(materialSection).not.toContain('active={activeView === "canvas"}');
    expect(materialSection).not.toContain('active={activeView === "webAssistant"}');
    expect(inspirationSection).toContain('active={activeView === "canvas"}');
    expect(inspirationSection).toContain('active={activeView === "webAssistant"}');
    expect(inspirationSection).toContain('label={t("灵感创作")}');
  });

  it("gives the web assistant a wide workspace shell instead of the gallery width cap", () => {
    const source = readSource("src/features/library/components/LibraryView.tsx");
    expect(source).toContain('const webAssistantShellClassName = "mx-auto h-full min-h-0 w-full max-w-[1760px]"');
    expect(source).toContain('<div className={webAssistantShellClassName}>');
    expect(source).not.toContain('<div className={`${contentShellClassName} h-full min-h-0`}>');
  });

  it("WebAssistantView forwards bounds via suyanApi and hides on unmount", () => {
    const source = readSource("src/features/library/components/WebAssistantView.tsx");
    expect(source).toContain(".prepareWebAssistant(");
    expect(source).toContain(".setWebAssistantBounds(");
    expect(source).toContain(".showWebAssistant(");
    expect(source).toContain(".hideWebAssistant()");
    // DOM rect 与 Electron bounds 都使用 DIP/CSS 像素，不能额外乘 devicePixelRatio。
    expect(source).toContain("getBoundingClientRect()");
    expect(source).toContain("x: rect.left");
    expect(source).not.toContain("window.devicePixelRatio");
    expect(source).toContain("ResizeObserver(syncBounds)");
    expect(source).toContain('window.addEventListener("scroll", syncBounds, true)');
    // 创建 view 后先同步 bounds，再显示，避免首次使用 640×480 fallback 尺寸闪现。
    expect(source.indexOf("syncBounds();")).toBeLessThan(
      source.indexOf("await window.suyanApi.showWebAssistant("),
    );
  });

  it("showWebAssistant disposes other platforms before restoring target, to drop idle renderer memory", () => {
    const source = readSource("electron/main/webAssistant/webAssistantView.ts");
    const showFn = source.slice(source.indexOf("export function showWebAssistant"));
    expect(showFn).toContain("disposePlatform(entryKey);");
    expect(showFn).toContain("restoreViewBounds(state.view, state);");
    expect(showFn.indexOf("disposePlatform(entryKey);")).toBeLessThan(
      showFn.indexOf("restoreViewBounds(state.view, state);"),
    );
    const hideFn = source.slice(source.indexOf("export function hideWebAssistant"));
    expect(hideFn).toContain("disposePlatform(registryKeyFor(platform))");
    expect(hideFn).toContain("disposePlatform(entryKey);");
  });

  it("registers one owner close handler and disposes all views for that window", () => {
    const source = readSource("electron/main/webAssistant/webAssistantView.ts");
    expect(source).toContain("const ownersWithCloseHandler = new WeakSet<BrowserWindow>()");
    expect(source).toContain('ownerWindow.once("closed", () => disposeWebAssistant(ownerWindow))');
    expect(source).toContain("if (state.ownerWindow === ownerWindow)");
  });

  it("supports explicit refresh without reloading an unchanged URL during normal prepare", () => {
    const source = readSource("electron/main/webAssistant/webAssistantView.ts");
    // 刷新优先于「同地址不重复加载」：reload() 保留会话 cookie，OAuth 后回到原 URL 不丢登录态。
    expect(source.indexOf("if (input.reload)")).toBeGreaterThan(-1);
    expect(source.indexOf("view.webContents.reload()")).toBeGreaterThan(-1);
    expect(source.indexOf("else if (state.currentUrl !== targetUrl)")).toBeGreaterThan(-1);
    expect(source.indexOf("if (input.reload)")).toBeLessThan(source.indexOf("else if (state.currentUrl !== targetUrl)"));
    expect(source).toContain("view.webContents.loadURL(targetUrl)");
  });

  it("all platforms and sites allow cross-origin navigation so OAuth login stays in-view", () => {
    const source = readSource("electron/main/webAssistant/webAssistantView.ts");
    const allowedFn = source.slice(source.indexOf("function isAllowedPlatformUrl"));
    // 所有站点按嵌入式浏览器放行任意 http(s) 同窗导航，否则 chatgpt/m365 等登录流程
    // 跨域跳 OAuth 域名会被 will-navigate 拦到系统浏览器，登录态回不到软件。
    expect(allowedFn).toContain("return true;");
    expect(allowedFn).not.toContain("url.origin === start.origin");
    expect(allowedFn).not.toContain("platformAllowedHosts");
    expect(allowedFn).not.toContain("siteAllowedHosts");
  });

  it("dedupes catalog sites by domain and uses ascii partition slugs", () => {
    const source = readSource("src/features/library/types/webAssistant.ts");
    expect(source).toContain("if (REMOVED_SITE_DOMAINS.has(domain) || seen.has(domain))");
    expect(source).toContain('"chatgpt.com": "chatgpt"');
    expect(source).toContain('"doubao.com": "doubao"');
    expect(source).toContain('"jimeng.jianying.com": "jimeng"');
    expect(source).toContain('"yige.baidu.com": "yige"');
    expect(source).toContain("export function partitionSlugForTarget");
  });

  it("persists webAssistantCustomUrls through the settings chain", () => {
    const libraryType = readSource("src/features/library/types/library.ts");
    expect(libraryType).toContain("webAssistantCustomUrls: string[]");

    const store = readSource("src/features/library/store/useLibraryStore.ts");
    expect(store).toContain("webAssistantCustomUrls: state.webAssistantCustomUrls");
    expect(store).toContain("webAssistantCustomUrls: settings.webAssistantCustomUrls");
    expect(store).toContain("addWebAssistantCustomUrl: async (url)");
    expect(store).toContain("removeWebAssistantCustomUrl: async (url)");
    expect(store).toContain("webAssistantCustomUrls: next");
    expect(store).toContain("slice(0, 50)");

    const settingsStore = readSource("electron/main/library/viewSettingsStore.ts");
    expect(settingsStore).toContain("webAssistantCustomUrls: Array.isArray(input.webAssistantCustomUrls) ? uniqueStrings(input.webAssistantCustomUrls) : []");
    expect(settingsStore).toContain("input.webAssistantCustomUrls === undefined");
    expect(settingsStore).toContain("webAssistantCustomUrls: []");
  });

  it("directory UI is a flat official-name list plus saved URLs", () => {
    const source = readSource("src/features/library/components/WebAssistantView.tsx");
    expect(source).not.toContain("常用平台");
    expect(source).not.toContain("生图网站");
    expect(source).toContain("WEB_ASSISTANT_SITES.filter");
    expect(source).toContain('placeholder={t("搜索站点…")}');
    expect(source).toContain("removeWebAssistantCustomUrl(url)");
    expect(source).toContain("addWebAssistantCustomUrl(normalized)");
    expect(source).toContain("reload: true");
    expect(source).not.toContain("hostnameOf(url)");
    // 保留 bounds 同步与显示顺序，避免首开闪现。
    expect(source.indexOf("syncBounds();")).toBeLessThan(
      source.indexOf("await window.suyanApi.showWebAssistant("),
    );
  });

  it("keeps site selection in one header row without a duplicate quick-site bar", () => {
    const source = readSource("src/features/library/components/WebAssistantView.tsx");
    expect(source).toContain("function SiteChip(");
    expect(source).toContain("CAPSULE_TONES[tone].selected");
    expect(source).toContain("siteMark(title)");
    expect(source).not.toContain("快捷站点");
    expect(source).not.toContain("isDirectoryCollapsed");
    expect(source).not.toContain("w-60 shrink-0");
  });

  it("keeps the full directory in a fixed portal and exposes recovery controls", () => {
    const source = readSource("src/features/library/components/WebAssistantView.tsx");
    expect(source).toContain("createPortal(");
    expect(source).toContain('className="fixed z-[200]');
    expect(source).toContain('loadState === "loading"');
    expect(source).toContain('loadState === "error"');
    expect(source).toContain("网页助手暂时无法打开");
    expect(source).toContain("handleOpenExternal");
    expect(source).toContain("isFocusMode");
    // 目录浮层打开时先截屏垫底再隐藏原生视图，网页块不再消失。
    expect(source).toContain(".captureWebAssistant(platform, customUrl)");
    expect(source).toContain("setWebAssistantVisibility(false)");
    expect(source).toContain("setWebSnapshot(result.data.dataUrl)");
    expect(source).toContain('className="pointer-events-none absolute inset-0 z-0 h-full w-full select-none object-fill"');
    expect(source).toContain('height: "auto"');
    expect(source).toContain("maxHeight: Math.max(160, directoryPosition.maxHeight - 100)");
    expect(source).not.toContain("Math.min(560, directoryPosition.maxHeight) + 8");
  });

  it("uses ascii partition slugs for persistent login state", () => {
    const source = readSource("electron/main/webAssistant/webAssistantView.ts");
    expect(source).toContain("partitionSlugForTarget");
    expect(source).toContain("`persist:webassistant-${registryKeyFor(platform, customUrl)}`");
    expect(source).toContain("const key = registryKeyFor(platform, customUrl)");
    expect(source).toContain("registry.set(key, state)");
  });

  it("looks up registry by the same customUrl-aware key in show/setBounds as in prepare", () => {
    // prepare 用 registryKeyFor(platform, input.customUrl) 注册；show/setBounds 若省略
    // customUrl，自定义平台的 key 会从 slugFromDomain(域) 掉回 "custom"，导致已加载的
    // 自定义视图永远留在屏外、bounds 不生效。以下断言锁定两处必须带 customUrl 查 key。
    const source = readSource("electron/main/webAssistant/webAssistantView.ts");
    const setBoundsFn = source.slice(source.indexOf("export function setWebAssistantBounds"));
    expect(setBoundsFn).toContain("registry.get(registryKeyFor(platform, customUrl))");
    const showFn = source.slice(source.indexOf("export function showWebAssistant"));
    expect(showFn).toContain("const targetKey = registryKeyFor(platform, customUrl)");
    expect(showFn).not.toContain("const targetKey = registryKeyFor(platform);");
  });

  it("passes the custom url through show/bounds IPC for the 自定义 platform", () => {
    const api = readSource("src/types/suyanApi.ts");
    expect(api).not.toContain("showWebAssistant: (platform?: WebAssistantTargetId) => Promise");
    const preload = readSource("electron/preload/index.ts");
    expect(preload).toContain(
      "showWebAssistant: (platform, customUrl) => invoke(IpcChannelName.WebAssistantShow, platform, customUrl)",
    );
    const renderer = readSource("src/features/library/components/WebAssistantView.tsx");
    expect(renderer).toContain(
      "customUrl: platform === CUSTOM_PLATFORM ? committedCustomUrl : null,",
    );
    expect(renderer.indexOf("showWebAssistant(")).toBeGreaterThan(-1);
    expect(renderer).toContain("await window.suyanApi.showWebAssistant(");
  });

  it("migrates leftover local rebuild partitions before creating views", () => {
    const boot = readSource("electron/main/index.ts");
    expect(boot).toContain("migrateWebAssistantPartitions(");
    expect(boot).toContain("listLeftoverLocalIterationDataDirs(");
    expect(boot).toContain("isLocalPackageIterationRoot");

    const migration = readSource("electron/main/webAssistant/webAssistantPartitionMigration.ts");
    expect(migration).toContain('chatgpt-image": "chatgpt"');
    expect(migration).toContain("webassistant-");
  });
});
