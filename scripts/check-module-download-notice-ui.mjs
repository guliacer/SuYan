// 模块管理弹窗里「网盘手动下载」提示的 UI 校验。
// 真组件 + 本地假数据，不联网。
import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";

async function resolvePlaywrightCore() {
  const explicitPath = process.argv[2];
  if (explicitPath) return explicitPath;

  const linksRoot = path.join(
    process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
    "ms-playwright",
    ".links",
  );
  const { readdir } = await import("node:fs/promises");
  for (const linkName of await readdir(linksRoot).catch(() => [])) {
    const candidate = (await readFile(path.join(linksRoot, linkName), "utf8")).trim();
    if (!candidate) continue;
    const entry = path.join(candidate, "index.js");
    try {
      await access(entry);
      return entry;
    } catch {
      // Playwright 缓存里有失效链接是正常的。
    }
  }
  throw new Error("Playwright Core was not found. Pass its index.js path as the first argument.");
}

const playwrightModule = await import(pathToFileURL(await resolvePlaywrightCore()).href);
const { chromium } = playwrightModule.chromium ? playwrightModule : playwrightModule.default;

const PAN_URL = "https://pan.quark.cn/s/6b2fd0d256f5";

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root" class="h-screen bg-background p-4"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import {LocaleProvider} from '/src/components/LocaleProvider.tsx';
import {ModuleManagementDialog} from '/src/features/library/components/ModuleManagementDialog.tsx';
import {useLibraryStore} from '/src/features/library/store/useLibraryStore.ts';
import '/src/styles/tokens.css';

// 组件和 store 只用到 suyanApi 的一小撮方法，其余一律返回 ok，
// 避免为了一个提示条把整个 IPC 面都抄一遍。
window.fixtureCalls = { openExternalUrl: [] };
const ok = (data) => ({ ok: true, data });
window.suyanApi = new Proxy({
  openExternalUrl: async (url) => { window.fixtureCalls.openExternalUrl.push(url); return ok({ opened: true }); },
  onUpscaleProgress: () => () => {},
  onUpscaleDropboxChanged: () => () => {},
}, {
  get(target, key) {
    if (key in target) return target[key];
    return async () => ok({ installed: false, status: null, ok: true });
  },
});

useLibraryStore.setState({
  moduleState: {
    'core-library': { installed: true, enabled: true },
    'image-prompt': { installed: true, enabled: true },
    'video-prompt': { installed: true, enabled: true },
    'video-runtime': { installed: true, enabled: true },
    'image-runtime': { installed: true, enabled: true },
    'nsfw-runtime': { installed: true, enabled: true },
    'real-cugan-runtime': { installed: true, enabled: true },
    'real-esrgan-runtime': { installed: true, enabled: true },
    'image-compression': { installed: true, enabled: true },
    'video-compression': { installed: true, enabled: true },
  },
});

const root = createRoot(document.getElementById('root'));
function render() {
  root.render(React.createElement(LocaleProvider, null,
    React.createElement(ModuleManagementDialog, { embedded: true, isBusy: false })));
}
window.setLanguage = (language) => { useLibraryStore.setState({ language }); render(); };
render();
</script></body></html>`;

// 复用项目自己的 vite.config.ts：`@/` 别名、react、tailwind 都要生效，
// configFile:false 会让别名丢失、组件里的 `@/components/...` 解析失败。
const server = await createServer({
  server: { host: "127.0.0.1", port: 5199, strictPort: true },
  plugins: [
    {
      name: "module-download-notice-qa",
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (req.url?.split("?")[0] !== "/__notice-qa") return next();
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.end(await vite.transformIndexHtml("/__notice-qa", html));
        });
      },
    },
  ],
});

try {
  await server.listen();
  const qaUrl = "http://127.0.0.1:5199/__notice-qa";
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(qaUrl);
    await page.getByText("核心素材库", { exact: true }).waitFor();

    // 1) 提示条存在，文案是用户要的那句。
    await page.getByText("点击这里可以手动到网盘下载全部依赖文件", { exact: true }).waitFor();

    // 2) 位置正确：必须排在「提示词」组之后、「依赖」组之前。
    const order = await page.evaluate(() => {
      const sections = [...document.querySelectorAll("section")];
      const labels = sections.map((node) => node.querySelector("p")?.textContent?.trim() ?? "");
      return labels;
    });
    const promptIndex = order.findIndex((label) => label === "提示词");
    const runtimeIndex = order.findIndex((label) => label === "依赖");
    const noticeIndex = order.findIndex((label) => label === "手动下载全部依赖文件");
    assert.ok(promptIndex >= 0, "提示词 group is rendered");
    assert.ok(runtimeIndex >= 0, "依赖 group is rendered");
    assert.ok(noticeIndex >= 0, "download notice is rendered");
    assert.equal(
      noticeIndex > promptIndex && noticeIndex < runtimeIndex,
      true,
      `notice sits between 提示词 and 依赖 (got ${promptIndex} / ${noticeIndex} / ${runtimeIndex})`,
    );

    // 3) 超链接：点击必须把完整地址交给系统浏览器打开。
    await page.getByRole("button", { name: /点击这里可以手动到网盘下载全部依赖文件/u }).click();
    await page.waitForFunction(() => window.fixtureCalls.openExternalUrl.length > 0);
    const opened = await page.evaluate(() => window.fixtureCalls.openExternalUrl);
    assert.deepEqual(opened, [PAN_URL], "click opens the exact pan.quark.cn link");

    // 4) 地址本身也明文可见，方便用户手抄。
    await page.getByText(PAN_URL, { exact: true }).waitFor();

    await mkdir("output/module-download-notice", { recursive: true });
    await page.screenshot({ path: "output/module-download-notice/zh.png", fullPage: true });

    // 5) 英文模式也要有翻译。
    await page.evaluate(() => window.setLanguage("en-US"));
    await page.getByText("Click here to download all dependency files from the cloud drive", { exact: true }).waitFor();
    await page.screenshot({ path: "output/module-download-notice/en.png", fullPage: true });
    process.stdout.write("Module download notice UI passed: placement between 提示词 and 依赖, exact pan.quark.cn link, visible URL, zh-CN/en-US.\n");
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}
