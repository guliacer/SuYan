import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (filePath: string) => readFileSync(filePath, "utf8");

describe("window chrome contract", () => {
  it("gives window controls to the renderer instead of native overlay controls", () => {
    const mainSource = read("electron/main/index.ts");
    const titleBarSource = read("src/features/library/components/shell/AppTitleBar.tsx");
    const accountEntrySource = read("src/features/account/components/AccountSidebarEntry.tsx");
    const loginDialogSource = read("src/features/account/components/LoginDialog.tsx");
    const registerDialogSource = read("src/features/account/components/RegisterDialog.tsx");
    const statusToastSource = read("src/features/library/components/shell/StatusToast.tsx");
    const libraryViewSource = read("src/features/library/components/LibraryView.tsx");
    const bootstrapSource = read("index.html");
    const tokenSource = read("src/styles/tokens.css");
    const entrySource = read("src/main.tsx");

    expect(mainSource).toContain("frame: false");
    expect(mainSource).toContain("transparent: !nativeAcrylic");
    expect(mainSource).toContain('backgroundMaterial: "acrylic"');
    expect(mainSource).toContain('backgroundColor: "#00000000"');
    expect(mainSource).not.toContain('titleBarStyle: "hidden"');
    expect(titleBarSource).toContain('data-app-titlebar="true"');
    expect(titleBarSource).toContain("z-[10000]");
    expect(titleBarSource).toContain('variant="close"');
    expect(titleBarSource).toContain("hover:bg-danger-strong hover:text-danger-foreground");
    expect(titleBarSource).toContain("toggleAlwaysOnTopWindow");
    expect(titleBarSource).toContain("Pin");
    expect(titleBarSource).toContain("app-chrome-surface");
    expect(titleBarSource).toContain("text-chrome-foreground");
    expect(libraryViewSource).toContain("app-chrome-surface");
    expect(accountEntrySource).toContain("text-chrome-muted");
    expect(accountEntrySource).toContain("bg-chrome-control/55");
    expect(accountEntrySource).toContain("createPortal(");
    expect(accountEntrySource).toContain("document.body");
    const authenticatedAccountBranch =
      accountEntrySource.match(/if \(status === "authenticated"[\s\S]*?\n  }\n\n  return/)?.[0] ?? "";
    expect(authenticatedAccountBranch).toContain('setDialog("login")');
    expect(authenticatedAccountBranch).toContain('dialog === "login"');
    expect(authenticatedAccountBranch).toContain("<LoginDialog");
    expect(authenticatedAccountBranch).toContain(
      "forceReauthentication={forceReauthentication}",
    );
    expect(loginDialogSource).toContain("电子邮件地址");
    expect(loginDialogSource).toContain('id="account-login-email"');
    expect(loginDialogSource).toContain('type="email"');
    expect(loginDialogSource).toContain("emailHint");
    expect(loginDialogSource).toContain("确认登录");
    expect(registerDialogSource).toContain('id="account-register-email"');
    expect(registerDialogSource).toContain('id="account-register-password"');
    expect(registerDialogSource).toContain('id="account-register-confirm"');
    expect(registerDialogSource).toContain('aria-label={showPassword ? t("隐藏密码") : t("显示密码")}');
    expect(registerDialogSource).toContain('disabled={isSubmitting}');
    expect(tokenSource).toContain("--color-chrome-start: #edf7f5");
    expect(tokenSource).toContain("--color-chrome-underlay: #ffffff");
    expect(tokenSource).toContain("--color-primary: #0f766e");
    expect(tokenSource).toContain(".app-chrome-surface");
    expect(tokenSource).toContain("background: transparent;");
    expect(tokenSource).toContain(".library-atmosphere");
    expect(tokenSource).toContain("var(--theme-custom-background-image)");
    expect(tokenSource).toContain(".library-background-layer");
    const backgroundLayerBlock = tokenSource.match(/\.library-background-layer\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    const workspaceSurfaceBlock = tokenSource.match(/^\.library-workspace-surface\s*\{[\s\S]*?\n\}/m)?.[0] ?? "";
    expect(backgroundLayerBlock).toContain("min-height: 100%;");
    expect(backgroundLayerBlock).not.toMatch(/(^|\n)\s*height:\s*100%;/);
    expect(backgroundLayerBlock).toContain("background-attachment: scroll;");
    expect(workspaceSurfaceBlock).toContain("min-height: 0;");
    expect(workspaceSurfaceBlock).not.toMatch(/(^|\n)\s*height:\s*100%;/);
    expect(tokenSource).toContain("backdrop-filter: blur(24px) saturate(1.15)");
    expect(tokenSource).toContain(".theme-accent-option__label");
    expect(tokenSource).toContain("flex: 0 0 2.75rem");
    expect(tokenSource).toContain("border-radius: 999px");
    expect(tokenSource).toContain("background: var(--color-primary);");
    expect(tokenSource).toContain(
      "--color-chrome-mid: color-mix(in srgb, var(--theme-light-chrome-mid) 90%, var(--theme-light-primary) 10%)",
    );
    expect(tokenSource).toContain(
      "background-color: color-mix(in srgb, var(--color-chrome-underlay) var(--chrome-glass-underlay-opacity), transparent)",
    );
    expect(tokenSource).toContain("background-image:");
    expect(tokenSource).toContain("var(--color-chrome-start) var(--chrome-glass-tint-opacity), transparent");
    expect(tokenSource).toContain("var(--color-chrome-mid) 80%, transparent) 48%");
    expect(tokenSource).toContain("var(--color-chrome-start) 84%, transparent");
    expect(tokenSource).toContain("backdrop-filter: blur(12px)");
    expect(tokenSource).toContain(".app-loading-titlebar");
    expect(tokenSource).toContain("border-bottom: 1px solid color-mix(in srgb, var(--color-chrome-border) 78%, transparent)");
    expect(bootstrapSource).toContain("data-theme-preset=\"proof\"");
    expect(bootstrapSource).toContain("--app-loading-chrome-start: #edf7f5");
    expect(bootstrapSource).toContain("var(--app-loading-chrome-mid) 80%, transparent) 48%");
    expect(bootstrapSource).toContain("var(--app-loading-chrome-start) 84%, transparent");
    expect(statusToastSource).toContain("top-[calc(var(--app-window-content-top)+1rem)]");
    expect(statusToastSource).toContain("z-[2147483646]");
    expect(statusToastSource).toContain("createPortal(");
    expect(statusToastSource).toContain("document.body");
    expect(statusToastSource).not.toContain("top-5 z-[100]");
    expect(libraryViewSource).toContain("library-background-layer min-h-full w-full bg-background");
    expect(libraryViewSource).not.toContain("library-background-layer h-full min-h-full");
    expect(libraryViewSource).toContain("library-content-frame relative flex min-h-0 flex-1");
    expect(libraryViewSource).toContain('scrollbarGutter: "stable",');
    expect(libraryViewSource).toContain("className=\"library-atmosphere\"");
    expect(libraryViewSource).toContain("relative z-10 min-h-0 flex-1 overflow-y-auto");
    expect(libraryViewSource).toContain("library-workspace-surface relative mx-auto min-h-0");
    expect(libraryViewSource).not.toContain("library-workspace-surface relative mx-auto h-full min-h-full");
    expect(libraryViewSource).toContain('isEntryVisible("account")');
    expect(libraryViewSource).toContain('isEntryVisible("appearance")');
    expect(libraryViewSource).toContain('isEntryVisible("about")');
    expect(libraryViewSource).toContain("sidebarEntryVisibility");
    expect(mainSource).toContain("setAlwaysOnTop");
    expect(titleBarSource).not.toContain("hover:bg-danger hover:text-primary-foreground");
    expect(bootstrapSource).toContain('data-window-control="close"');
    expect(entrySource).toContain("bindBootstrapWindowControls");
  });

  it("keeps the title bar and sidebar frosted so the color underneath stays readable", () => {
    const tokenSource = read("src/styles/tokens.css");
    const chromeBlock = tokenSource.match(/^\.app-chrome-surface\s*,\s*\.library-background-layer\[data-current-view="canvas"\]\s*\{[\s\S]*?\n}/m)?.[0] ?? "";
    const shellBackdrop = tokenSource.match(/\.app-shell::before\s*\{[\s\S]*?\n}/)?.[0] ?? "";
    const atmosphereBlock = tokenSource.match(/\n\.library-atmosphere\s*\{[\s\S]*?\n}/)?.[0] ?? "";

    // 毛玻璃靠"填充留出透光余量"实现：两层不透明度都必须严格低于导航不透明度，
    // 否则 backdrop-filter 被完全遮住，又会退回不透明导航条。
    const ratios = [...chromeBlock.matchAll(/var\(--theme-navigation-opacity\) \* (0\.\d+)\)/g)].map(
      (match) => Number(match[1]),
    );
    expect(ratios).toHaveLength(2);
    for (const ratio of ratios) {
      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThan(1);
    }
    expect(ratios.reduce((sum, ratio) => sum + ratio, 0)).toBeLessThan(0.6);
    expect(chromeBlock).toContain("backdrop-filter: blur(24px) saturate(1.15)");
    const nativeBlock = tokenSource.match(/html\[data-window-material="acrylic"\] \{[\s\S]*?\n}/)?.[0] ?? "";
    expect(nativeBlock).toContain("--app-window-gutter: 0px");
    expect(nativeBlock).toContain("--app-window-shadow: none");
    expect(tokenSource).toContain('html[data-window-material="acrylic"] .library-atmosphere {\n  background-image: none;');

    // 标题栏是内容区的兄弟节点，下面必须垫一层氛围底图才有颜色可以模糊；
    // 与内容区共用同一份变量 + fixed 贴附，色带才对得上。
    expect(shellBackdrop).toContain("height: var(--app-titlebar-height)");
    expect(shellBackdrop).toContain("background-image: var(--app-atmosphere-image)");
    expect(shellBackdrop).toContain("background-attachment: fixed");
    expect(atmosphereBlock).toContain("background-image: var(--app-atmosphere-image)");
    expect(atmosphereBlock).toContain("background-attachment: fixed");
    expect(tokenSource).toContain("--app-atmosphere-image:");
  });

  it("draws its own shadow and rounds all four corners when the window floats", () => {
    // frame: false + transparent: true 的窗口拿不到系统投影，也没有系统圆角裁切：
    // 阴影得自己 box-shadow 画，而阴影要有落脚处，所以 #root 四周留一圈透明 gutter。
    // 这圈留边同时让下面两个圆角露出来（原先贴着窗口边缘，看起来是直角，和上面不统一）。
    const tokenSource = read("src/styles/tokens.css");
    const bootstrapSource = read("index.html");
    const entrySource = read("src/main.tsx");
    const libraryViewSource = read("src/features/library/components/LibraryView.tsx");

    // 默认是「最大化」形态：留边与圆角都为 0，否则最大化时四周会露出桌面。
    expect(tokenSource).toContain("--app-window-gutter: 0px;");
    expect(tokenSource).toContain("--app-window-radius: 0px;");
    expect(tokenSource).toContain(
      "--app-window-content-top: calc(var(--app-titlebar-height) + var(--app-window-gutter));",
    );

    const floatingBlock = tokenSource.match(/html\[data-window-floating="true"\]\s*\{[\s\S]*?\n}/)?.[0] ?? "";
    const gutter = Number(floatingBlock.match(/--app-window-gutter: (\d+)px/)?.[1] ?? "0");
    expect(gutter).toBeGreaterThan(0);
    expect(floatingBlock).toContain("--app-window-radius: 18px");

    // 投影必须是多层叠加、模糊半径逐层放大，才会「由浓到淡慢慢散出去」；
    // 且每层的扩散量都要落在 gutter 之内，否则会被窗口边缘裁断，看着又贴回边上。
    const shadowDeclarations = [...tokenSource.matchAll(/--app-window-shadow:([^;]+);/g)].map((match) => match[1]).filter(value => value.trim() !== "none");
    expect(shadowDeclarations.length).toBeGreaterThanOrEqual(3);
    for (const declaration of shadowDeclarations) {
      const layers = [...declaration.matchAll(/0 (\d+)px (\d+)px rgb\([^)]*\/ (\d+)%\)/g)].map((layer) => ({
        y: Number(layer[1]),
        blur: Number(layer[2]),
        opacity: Number(layer[3]),
      }));
      expect(layers.length).toBeGreaterThanOrEqual(4);
      for (const [index, layer] of layers.entries()) {
        if (index > 0) {
          expect(layer.blur).toBeGreaterThan(layers[index - 1].blur);
        }
        // 向下 y + blur/2、向上 blur/2 - y、左右 blur/2 都不能超出 gutter。
        expect(layer.y + layer.blur / 2).toBeLessThanOrEqual(gutter);
        expect(layer.blur / 2).toBeLessThanOrEqual(gutter);
        // 单层保持低不透明度，靠叠加出层次，不靠某一层压出硬边。
        expect(layer.opacity).toBeLessThanOrEqual(34);
      }
    }

    const rootPadding = tokenSource.match(/\n#root \{[^}]*box-sizing[^}]*\n}/)?.[0] ?? "";
    expect(rootPadding).toContain("box-sizing: border-box");
    expect(rootPadding).toContain("padding: var(--app-window-gutter)");

    const shellBlock = tokenSource.match(/\.app-shell,\n\.app-loading-shell \{[\s\S]*?\n}/)?.[0] ?? "";
    expect(shellBlock).toContain("border-radius: var(--app-window-radius)");
    expect(shellBlock).toContain("box-shadow: var(--app-window-shadow)");
    expect(shellBlock).not.toContain("border-radius: 18px");

    // 视口浮层与 fixed 元素都要让开 gutter，否则会压到圆角外壳外面。
    const overlayBlock = tokenSource.match(/\.app-window-overlay \{[\s\S]*?\n}/)?.[0] ?? "";
    expect(overlayBlock).toContain("position: fixed");
    expect(overlayBlock).toContain(
      "inset: var(--app-window-content-top) var(--app-window-gutter) var(--app-window-gutter)",
    );
    expect(libraryViewSource).toContain("bottom-[calc(1.5rem+var(--app-window-gutter))]");
    // 外壳被 gutter 内缩后不能再按视口高度撑满，否则溢出 2×gutter。
    expect(libraryViewSource).toContain("app-shell relative flex h-full max-h-full min-h-0 flex-col");
    expect(libraryViewSource).not.toContain("h-[100dvh] max-h-[100dvh]");
    expect(tokenSource).not.toContain("height: 100vh;");

    // bootstrap 外壳与 React 外壳必须同形，否则接管瞬间窗体轮廓会跳一下。
    expect(bootstrapSource).toContain("--app-window-gutter: 0px;");
    expect(bootstrapSource).toContain("--app-window-radius: 0px;");
    expect(bootstrapSource).toContain("padding: var(--app-window-gutter);");
    expect(bootstrapSource).toContain("border-radius: var(--app-window-radius);");
    expect(bootstrapSource).toContain("box-shadow: var(--app-window-shadow);");
    expect(bootstrapSource).toContain('html[data-window-floating="true"]');
    expect(bootstrapSource).toContain(`--app-window-gutter: ${gutter}px`);

    // 留边只在非最大化时存在，跟随主进程的 maximize/unmaximize 广播切换。
    expect(entrySource).toContain("bindWindowFloatingState");
    expect(entrySource).toContain('document.documentElement.dataset.windowFloating = String(!maximized)');
    expect(entrySource).toContain("window.suyanApi.onWindowMaximizeChange(apply)");
    expect(entrySource).toContain("window.suyanApi\n    .isWindowMaximized()");
  });

  it("keeps every viewport overlay below the title bar safe area", () => {
    const overlayFiles = [
      "src/components/ui/AppDialog.tsx",
      "src/features/library/components/CanvasView.tsx",
      "src/features/library/components/MediaFullscreenOverlay.tsx",
      "src/features/library/components/PromptDetailDialog.tsx",
      "src/features/library/components/StartupGallerySettingsDialog.tsx",
      "src/features/library/components/shell/DeferredFallbacks.tsx",
      "src/features/library/components/recommendations/PromptSiteRecommendations.tsx",
      "src/features/library/components/WebAssistantView.tsx",
      "src/features/library/components/video/VideoDetailSection.tsx",
    ];

    for (const filePath of overlayFiles) {
      const source = read(filePath);
      expect(source, filePath).toContain("app-window-overlay");
      expect(source, filePath).not.toContain("fixed inset-0");
    }
  });

  it("clamps native WebContentsView bounds in the main process", () => {
    expect(read("electron/main/webAssistant/webAssistantView.ts")).toContain("constrainWindowContentBounds");
    expect(read("electron/main/ai/doubaoWebCanvas.ts")).toContain("constrainWindowContentBounds");
  });
});
