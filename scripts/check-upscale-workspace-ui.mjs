import assert from "node:assert/strict";
import { access, mkdir, readFile } from "node:fs/promises";
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
      // Stale Playwright cache links are expected after CLI upgrades.
    }
  }
  throw new Error("Playwright Core was not found. Pass its index.js path as the first argument.");
}

const playwrightModule = await import(pathToFileURL(await resolvePlaywrightCore()).href);
const { chromium } = playwrightModule.chromium ? playwrightModule : playwrightModule.default;
const sampleSvg = (start, end) => `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${start}"/><stop offset="1" stop-color="${end}"/></linearGradient></defs><rect width="960" height="640" fill="url(#g)"/><circle cx="690" cy="220" r="130" fill="#fff" fill-opacity=".7"/><path d="M0 530 Q280 310 520 500 T960 390 V640 H0Z" fill="#315c52"/></svg>`,
).toString("base64")}`;

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root" class="h-screen"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import {LocaleProvider} from '/src/components/LocaleProvider.tsx';
import {useLibraryStore} from '/src/features/library/store/useLibraryStore.ts';
import {UpscaleWorkspace} from '/src/features/upscale/components/UpscaleWorkspace.tsx';
import {upscaleStore} from '/src/features/upscale/store/useUpscaleStore.ts';
import '/src/styles/tokens.css';

const source=${JSON.stringify(sampleSvg("#d8e6df", "#f4d8b7"))};
const output=${JSON.stringify(sampleSvg("#a7d8c9", "#f4c28c"))};
const stamp='2026-11-02T08:00:00.000Z';
const input=(id,name,width=960,height=640)=>({token:'input-'+id,displayName:name,width,height,byteSize:345678,mediaType:'image/png',sourceItemId:id==='ready'?'source-item-1':null,sourceImageFileName:id==='ready'?'source.png':null,previewDataUrl:source});
const result=id=>({token:'result-'+id,previewDataUrl:output,width:1920,height:1280,byteSize:987654,mediaType:'image/png'});
const job=(id,name,status,progress,extra={})=>({id,input:input(id,name),modelId:'cugan-2x-conservative',status,progress,message:status==='failed'?'模型执行失败':status==='result-ready'?'结果待导出':status==='completed'?'已完成':'正在处理',result:status==='result-ready'||status==='completed'?result(id):null,errorCode:status==='failed'?'UPSCALE_WASM_FAILED':null,createdAt:stamp,updatedAt:stamp,...extra});
const jobs=[
 job('ready','这是一张用于验证超长文件名不会撑破任务队列布局的春日山野插画素材.png','result-ready',1),
 job('working','processing-photo.webp','processing',0.42),
 job('failed','failed-anime.png','failed',0.18),
  job('canceled','canceled-anime.png','canceled',0),
 job('done','completed-landscape.jpg','completed',1),
 job('queued','queued-reference.png','queued',0),
];
let installed=true;
let renderKey=0;
window.fixtureCalls={pickDirectory:0,install:0,export:0,replace:0,replaceFailure:false,sourceReplaced:null};
const status=engine=>({engine,installed,phase:installed?'ready':'not-installed',version:installed?'fixture-1':null,installedModelIds:installed?engine==='real-cugan'?['cugan-2x-conservative','cugan-3x-conservative','cugan-4x-conservative']:['esrgan-x4plus','esrgan-x4plus-anime','esrgan-animevideov3-2x','esrgan-animevideov3-3x','esrgan-animevideov3-4x']:[],bytesDownloaded:0,totalBytes:0,message:installed?'组件已就绪':'尚未安装'});
window.suyanApi={
 getUpscaleComponentStatus:async engine=>({ok:true,data:status(engine)}),
 onUpscaleProgress:()=>()=>{},
 pickUpscaleInputs:async()=>({ok:true,data:[]}),
 registerUpscaleFiles:async()=>({ok:true,data:[]}),
 pickUpscaleOutputDirectory:async()=>{window.fixtureCalls.pickDirectory++;return {ok:true,data:{token:'output-directory',displayName:'超分输出目录'}};},
 installUpscaleComponent:async engine=>{window.fixtureCalls.install++;installed=true;return {ok:true,data:status(engine)};},
 exportUpscaleResult:async()=>{window.fixtureCalls.export++;return {ok:true,data:{savedFileName:'fixture.png',importedItemIds:['library-item'],skipped:false}};},
 pickUpscaleExportTarget:async request=>{window.fixtureCalls.export++;return request.mode==='file'?{ok:true,data:{mode:'file',directoryToken:'output-directory',filePath:'C:/fixture.png'}}:{ok:true,data:{mode:request.mode,directoryToken:request.mode==='directory'?'output-directory':null,filePath:null}};},
 replaceUpscaleSource:async()=>{window.fixtureCalls.replace++;return window.fixtureCalls.replaceFailure?{ok:false,error:{code:'UPSCALE_SOURCE_REPLACE_FAILED',message:'来源图片已发生变化，请重新发送到超分。'}}:{ok:true,data:{sourceItemId:'source-item-1',imageFileName:'replacement.png'}};},
 saveLibraryViewSettings:async()=>({ok:true,data:true}),
 loadLibraryViewSettings:async()=>({ok:true,data:null}),
 checkModuleInstalled:async()=>({ok:true,data:true}),
 getUpscaleDropboxPath:async()=>({ok:true,data:{dropboxDir:'C:/fixture/data/model-dropbox'}}),
 scanUpscaleDropbox:async()=>({ok:true,data:{dropboxDir:'C:/fixture/data/model-dropbox',scanned:0,installedCount:0,alreadyCount:0,rejectedCount:0,entries:[],realCuganInstalledModelIds:['cugan-2x-conservative'],realEsrganInstalled:true}}),
 openUpscaleDropbox:async()=>({ok:true,data:{opened:true,path:'C:/fixture/data/model-dropbox'}}),
 onUpscaleDropboxChanged:()=>()=>{},
};
const root=createRoot(document.getElementById('root'));
function resetStore(){upscaleStore.setState({preset:'anime',engine:'real-cugan',modelId:'cugan-2x-conservative',tileSize:0,gpuId:-1,forceWasm:false,exportOptions:{saveToDirectory:true,addToLibrary:false,outputDirectoryToken:null,targetFilePath:null,format:'png',quality:92,conflictPolicy:'append-number',namingPattern:'{name}_{engine}_{scale}x',preserveMetadata:true,libraryMode:'new-group',title:'',categoryId:null,tags:[]},jobs:structuredClone(jobs),selectedJobId:'ready',activeJobId:'working',isRunning:false,cancelRequested:false});}
function render(){root.render(React.createElement(LocaleProvider,null,React.createElement(UpscaleWorkspace,{key:renderKey,onSourceReplaced:id=>{window.fixtureCalls.sourceReplaced=id;}})));}
window.setLanguage=language=>{useLibraryStore.setState({language});};
window.upscaleStore=upscaleStore;
window.setInstalled=value=>{installed=value;renderKey++;render();};
window.setReplaceFailure=value=>{window.fixtureCalls.replaceFailure=value;};
window.resetUpscale=()=>{resetStore();renderKey++;render();};
resetStore();render();
</script></body></html>`;

const server = await createServer({
  server: { host: "127.0.0.1", port: 0 },
  plugins: [{
    name: "upscale-workspace-qa",
    configureServer(vite) {
      vite.middlewares.use(async (request, response, next) => {
        if (request.url?.split("?")[0] !== "/__upscale-qa") return next();
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(await vite.transformIndexHtml("/__upscale-qa", html));
      });
    },
  }],
});

await server.listen();
await mkdir("output/upscale-workspace", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - innerWidth,
    workspace: document.querySelector("[data-upscale-workspace]").scrollWidth
      - document.querySelector("[data-upscale-workspace]").clientWidth,
    // 找出最靠右的元素，失败时能直接指出是谁撑破了布局。
    worst: (() => {
      let worst = null;
      for (const element of document.querySelectorAll("body *")) {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.right <= innerWidth + 0.5) continue;
        const candidate = {
          tag: element.tagName,
          className: String(element.className || "").slice(0, 140),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
        if (!worst || candidate.right > worst.right) worst = candidate;
      }
      return worst;
    })(),
  }));
  assert.ok(
    overflow.document <= 0,
    `${label}: document overflows by ${overflow.document}px${overflow.worst ? ` — ${overflow.worst.tag}.${overflow.worst.className} right=${overflow.worst.right} w=${overflow.worst.width}` : ""}`,
  );
  assert.ok(overflow.workspace <= 0, `${label}: workspace overflows by ${overflow.workspace}px`);
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await desktop.tracing.start({ screenshots: true, snapshots: true });
  const page = await desktop.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(15_000);
  await page.goto(`${server.resolvedUrls.local[0]}__upscale-qa`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await page.getByRole("region", { name: "任务队列" }).waitFor();
  await page.getByRole("region", { name: "前后对比" }).waitFor();
  await page.getByRole("complementary", { name: "处理与导出" }).waitFor();
  assert.equal(await page.locator("main > div").count(), 3, "desktop renders exactly three work panes");
  assert.equal(await page.getByText("这是一张用于验证超长文件名不会撑破任务队列布局的春日山野插画素材.png", { exact: true }).getAttribute("title"), "这是一张用于验证超长文件名不会撑破任务队列布局的春日山野插画素材.png");
  for (const status of ["待导出", "正在处理", "处理失败", "已取消", "已完成", "等待处理"]) {
    await page.getByText(status, { exact: true }).first().waitFor();
  }
  const footerButtons = page.locator("footer button");
  const footerButtonLabels = (await footerButtons.allTextContents()).map((label) => label.trim());
  assert.deepEqual(footerButtonLabels.slice(-2), ["重新处理 · 1", "开始处理 · 1"], "cancelled jobs get a dedicated action immediately beside start");
  await page.getByLabel("对比分割位置").fill("68");
  assert.equal(await page.getByLabel("对比分割位置").inputValue(), "68");

  // 拖动对比：未放大时在画布上左右拖 = 调整前后对比分割线。
  const canvas = page.locator("[data-upscale-comparison]");
  const canvasBox = await canvas.boundingBox();
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.5, canvasBox.y + canvasBox.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.8, canvasBox.y + canvasBox.height * 0.5, { steps: 10 });
  await page.mouse.up();
  const draggedSplit = Number(await page.getByLabel("对比分割位置").inputValue());
  assert.ok(draggedSplit > 70, `dragging the canvas moves the comparison split (got ${draggedSplit})`);

  // 滚轮缩放：以光标为锚点，放大后提示语切换成「拖动平移」。
  const zoomLabel = page.locator("[data-upscale-zoom]");
  const zoomBefore = Number((await zoomLabel.textContent()).replace("%", ""));
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.5, canvasBox.y + canvasBox.height * 0.5);
  await page.mouse.wheel(0, -200);
  await page.waitForFunction((before) => {
    const element = document.querySelector("[data-upscale-zoom]");
    return Boolean(element) && Number(element.textContent.replace("%", "")) > before;
  }, zoomBefore);
  const zoomAfter = Number((await zoomLabel.textContent()).replace("%", ""));
  assert.ok(zoomAfter > zoomBefore, `scrolling over the preview zooms in (${zoomBefore}% → ${zoomAfter}%)`);
  await page.getByText("滚轮缩放 · 拖动平移", { exact: true }).waitFor();

  // 还原缩放，后续断言都基于 100% 基准。
  await page.getByRole("button", { name: "原始比例" }).click();
  await page.getByText("100%", { exact: true }).waitFor();

  await page.getByRole("button", { name: "放大", exact: true }).click();
  await page.getByText("125%", { exact: true }).waitFor();

  // 设置区分「处理 / 导出」两页，导出项默认不渲染，先切过去。
  const settingsAside = page.getByRole("complementary", { name: "处理与导出" });
  assert.equal(await settingsAside.getByRole("button", { name: "WEBP", exact: true }).count(), 0, "export settings are not rendered on the process tab");
  // 处理页必须一屏放得下，否则右栏又变成一根竖条滚不到头。
  const processTabScrolls = await settingsAside.evaluate((element) => ({
    overflow: element.scrollHeight > element.clientHeight + 1,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  if (processTabScrolls.overflow) {
    process.stderr.write(`process tab overflow: ${processTabScrolls.scrollHeight} > ${processTabScrolls.clientHeight}\n`);
  }
  assert.equal(processTabScrolls.overflow, false, "process tab fits without scrolling");

  // 模型页签：收件目录要露出来，路径和扫描按钮都在。
  await settingsAside.getByRole("button", { name: "模型", exact: true }).click();
  await settingsAside.getByText("模型收件目录", { exact: true }).waitFor();
  await settingsAside.getByText("C:/fixture/data/model-dropbox", { exact: true }).waitFor();
  await settingsAside.getByRole("button", { name: "立即扫描", exact: true }).click();
  await settingsAside.getByText("Real-CUGAN 模型 1 / 11", { exact: true }).waitFor();
  await settingsAside.getByText("Real-ESRGAN 已就绪", { exact: true }).waitFor();

  await settingsAside.getByRole("button", { name: "导出", exact: true }).click();
  await settingsAside.getByRole("button", { name: "WEBP", exact: true }).waitFor();
  await page.getByRole("checkbox", { name: "同时保存到目录", exact: true }).check();
  await page.getByText("素材库回流", { exact: true }).waitFor();
  await page.getByRole("button", { name: "WEBP", exact: true }).click();
  await page.getByLabel("输出质量").fill("86");
  await page.getByText("超分输出目录", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.fixtureCalls.pickDirectory), 1);
  await page.getByRole("button", { name: "导出 · 1", exact: true }).click();
  assert.equal(await page.evaluate(() => window.fixtureCalls.export), 1, "export archives results to the library");
  // 底栏必须把「处理在做什么」写出来，不能只给一个百分比。
  await page.getByText("已导出 1 项", { exact: true }).waitFor();
  // 导出会把任务推进到 completed，重置回初始状态再继续后面的断言。
  await page.evaluate(() => { window.resetUpscale(); });
  await page.getByRole("button", { name: "导出 · 1", exact: true }).waitFor();
  // 重置后设置区必须回到「处理」页，否则后面的截图会误导。
  assert.equal(
    await settingsAside.getByRole("button", { name: "处理", exact: true }).getAttribute("data-active"),
    "true",
    "reset returns the settings panel to the process tab",
  );

  // 右栏折叠：收起后设置面板从布局里消失，只留一条窄边和展开按钮。
  await page.getByRole("button", { name: "收起设置" }).click();
  await page.getByRole("button", { name: "展开设置" }).waitFor();
  assert.equal(await settingsAside.isVisible(), false, "collapsed settings panel leaves the layout");
  await assertNoOverflow(page, "desktop collapsed settings");
  await page.screenshot({ path: "output/upscale-workspace/desktop-collapsed.png", fullPage: true });
  await page.getByRole("button", { name: "展开设置" }).click();
  await settingsAside.waitFor();

  await assertNoOverflow(page, "desktop zh-CN");
  await page.screenshot({ path: "output/upscale-workspace/desktop-zh.png", fullPage: true });

  await page.evaluate(() => window.setLanguage("en-US"));
  await page.getByRole("region", { name: "Task Queue" }).waitFor();
  await page.getByRole("complementary", { name: "Process & Export" }).waitFor();
  await page.getByRole("button", { name: "Export · 1", exact: true }).waitFor();
  await assertNoOverflow(page, "desktop en-US");
  await page.screenshot({ path: "output/upscale-workspace/desktop-en.png", fullPage: true });

  await page.evaluate(() => { window.setLanguage("zh-CN"); window.resetUpscale(); });
  await page.getByRole("button", { name: "替换原图并返回详情", exact: true }).click();
  await page.getByRole("heading", { name: "替换原图？", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "取消", "confirmation focuses the safe action");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "确认替换", "Shift+Tab wraps inside the dialog");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "取消", "Tab stays inside the dialog");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  assert.equal(await page.evaluate(() => window.fixtureCalls.replace), 0, "cancel must not replace the source image");
  await page.evaluate(() => window.setReplaceFailure(true));
  await page.getByRole("button", { name: "替换原图并返回详情", exact: true }).click();
  await page.getByRole("button", { name: "确认替换", exact: true }).click();
  await page.getByText("来源图片已发生变化，请重新发送到超分。", { exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "替换原图？", exact: true }).count(), 0, "replacement failure closes the modal so its error stays visible");
  assert.equal(await page.getByText("这是一张用于验证超长文件名不会撑破任务队列布局的春日山野插画素材.png", { exact: true }).count(), 1, "failed replacement keeps the result job");
  await page.evaluate(() => window.setReplaceFailure(false));
  await page.getByRole("button", { name: "替换原图并返回详情", exact: true }).click();
  await page.getByRole("button", { name: "确认替换", exact: true }).click();
  await page.getByText("这是一张用于验证超长文件名不会撑破任务队列布局的春日山野插画素材.png", { exact: true }).waitFor({ state: "detached" });
  assert.deepEqual(await page.evaluate(() => ({ replace: window.fixtureCalls.replace, sourceReplaced: window.fixtureCalls.sourceReplaced })), {
    replace: 2,
    sourceReplaced: "source-item-1",
  });

  await page.evaluate(() => { window.setLanguage("zh-CN"); window.setInstalled(false); });
  await page.getByText("首次使用需下载组件", { exact: true }).waitFor();
  await page.getByRole("button", { name: "下载并安装", exact: true }).click();
  await page.getByText("Real-CUGAN · 2x", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.fixtureCalls.install), 1);
  await page.screenshot({ path: "output/upscale-workspace/desktop-installed.png", fullPage: true });

  // 重新处理：换模型后对不满意的结果必须能再跑一次（之前换完模型就没得再跑）。
  await page.evaluate(() => {
    window.setLanguage("zh-CN");
    window.resetUpscale();
    window.upscaleStore.getState().setModelId("cugan-4x-conservative");
  });
  const comparePane = page.getByRole("region", { name: "前后对比" });
  await comparePane.getByRole("button", { name: "重新处理" }).click();
  await page.getByText("已按当前模型重新入队，点「开始处理」执行。", { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => {
    const state = window.upscaleStore.getState();
    const job = state.jobs.find((entry) => entry.id === "ready");
    return {
      status: job.status,
      modelId: job.modelId,
      hasResult: Boolean(job.result),
      queued: state.jobs.filter((entry) => entry.status === "queued").length,
    };
  }), {
    status: "queued",
    modelId: "cugan-4x-conservative",
    hasResult: false,
    queued: 2,
  });
  assert.equal(
    await comparePane.getByRole("button", { name: "重新处理" }).count(),
    0,
    "re-queued job drops its stale result",
  );

  assert.deepEqual(errors, [], `desktop page errors: ${errors.join("; ")}`);
  await desktop.tracing.stop({ path: "output/upscale-workspace/trace-desktop.zip" });
  await desktop.close();

  const narrow = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await narrow.tracing.start({ screenshots: true, snapshots: true });
  const mobile = await narrow.newPage();
  const mobileErrors = [];
  mobile.on("pageerror", (error) => mobileErrors.push(error.message));
  mobile.setDefaultTimeout(15_000);
  await mobile.goto(`${server.resolvedUrls.local[0]}__upscale-qa`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await mobile.getByRole("navigation", { name: "图片超分视图" }).waitFor();
  await mobile.getByRole("button", { name: "队列", exact: true }).click();
  await mobile.getByRole("region", { name: "任务队列" }).waitFor();
  await assertNoOverflow(mobile, "mobile queue");
  await mobile.screenshot({ path: "output/upscale-workspace/mobile-queue.png", fullPage: true });
  await mobile.getByRole("button", { name: "对比", exact: true }).click();
  await mobile.getByRole("region", { name: "前后对比" }).waitFor();
  await mobile.screenshot({ path: "output/upscale-workspace/mobile-compare.png", fullPage: true });
  await mobile.getByRole("button", { name: "设置", exact: true }).click();
  await mobile.getByRole("complementary", { name: "处理与导出" }).waitFor();
  assert.equal(
    await mobile.getByRole("button", { name: "收起设置" }).count(),
    0,
    "narrow layout keeps the full settings panel without a collapse button",
  );
  await mobile.getByRole("button", { name: "Real-ESRGAN", exact: true }).click();
  assert.equal(await mobile.locator("aside select").first().inputValue(), "esrgan-x4plus");
  await assertNoOverflow(mobile, "mobile settings");
  await mobile.screenshot({ path: "output/upscale-workspace/mobile-settings.png", fullPage: true });
  assert.deepEqual(mobileErrors, [], `mobile page errors: ${mobileErrors.join("; ")}`);
  await narrow.tracing.stop({ path: "output/upscale-workspace/trace-mobile.zip" });
  await narrow.close();

  process.stdout.write("Upscale workspace UI passed: desktop three-pane and 390px tab layouts, long names, queue states, compare controls, install flow, dual export settings, and zh-CN/en-US.\n");
} finally {
  await browser.close();
  await server.close();
}
