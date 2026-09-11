// Run against a development Electron instance started with --remote-debugging-port=9222.
// Pass an installed Playwright module path as argv[2]; no production dependency is needed.
const assert = require("node:assert/strict");
const { chromium } = require(process.argv[2] || "playwright");

(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const page = browser.contexts()[0].pages().find((candidate) => candidate.url().includes("index.html"));
  assert(page, "Application page missing");
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const originalViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  try {
    await page.waitForFunction(() => document.querySelector(".library-workspace-surface") && !document.querySelector(".app-window-overlay-host"));
    const showSidebar = page.getByRole("button", { name: "显示边栏", exact: true });
    if (await showSidebar.isVisible()) await showSidebar.click();
    for (const viewport of [originalViewport, { width: 1000, height: 720 }]) {
      await page.setViewportSize(viewport);
      for (const name of ["素材浏览", "分类浏览", "标签浏览", "资源推荐", "批量管理", "灵感创作", "待办事项", "素材浏览"]) {
        await page.getByRole("button", { name, exact: true }).click();
        await page.waitForFunction((home) => {
          const surface = document.querySelector(".library-workspace-surface");
          const gallery = surface?.querySelector(":scope > div[aria-hidden]");
          return gallery?.getAttribute("aria-hidden") === String(!home) &&
            (home || surface.querySelector(":scope > section")?.getBoundingClientRect().height > 100);
        }, name === "素材浏览");
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const result = await page.evaluate((home) => {
          const background = document.querySelector(".library-background-layer");
          const surface = document.querySelector(".library-workspace-surface");
          const viewport = background.parentElement;
          const gallery = surface.querySelector(":scope > div[aria-hidden]");
          const scroller = home ? gallery : viewport;
          scroller.scrollTop = scroller.scrollHeight;
          const bg = background.getBoundingClientRect();
          const panel = surface.getBoundingClientRect();
          return { viewport: viewport.clientHeight, background: bg.height, surface: panel.height,
            gallery: gallery.clientHeight, scrolled: scroller.scrollTop,
            bottomCovered: bg.bottom >= viewport.getBoundingClientRect().bottom - 1,
            panelCovered: Math.abs(bg.bottom - panel.bottom) < 2,
            contentFits: home || surface.scrollHeight <= surface.clientHeight + 2 };
        }, name === "素材浏览");
        assert(result.surface >= result.viewport - 2, `${name}: collapsed surface`);
        assert(result.bottomCovered && result.panelCovered && result.contentFits, `${name}: background gap`);
        if (name === "素材浏览") assert(result.gallery > 100, "Gallery collapsed");
        console.log(JSON.stringify({ name, width: viewport.width, ...result }));
      }
    }
    assert.deepEqual(errors, [], "Renderer errors");
  } finally {
    await page.setViewportSize(originalViewport);
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
