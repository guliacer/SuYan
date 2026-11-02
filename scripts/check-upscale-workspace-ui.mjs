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
const input=(id,name,width=960,height=640)=>({token:'input-'+id,displayName:name,width,height,byteSize:345678,mediaType:'image/png',sourceItemId:id==='ready'?'source-item-1':null,previewDataUrl:source});
const result=id=>({token:'result-'+id,previewDataUrl:output,width:1920,height:1280,byteSize:987654,mediaType:'image/png'});
const job=(id,name,status,progress,extra={})=>({id,input:input(id,name),modelId:'cugan-2x-conservative',status,progress,message:status==='failed'?'模型执行失败':status==='result-ready'?'结果待导出':status==='completed'?'已完成':'正在处理',result:status==='result-ready'||status==='completed'?result(id):null,errorCode:status==='failed'?'UPSCALE_WASM_FAILED':null,createdAt:stamp,updatedAt:stamp,...extra});
const jobs=[
 job('ready','这是一张用于验证超长文件名不会撑破任务队列布局的春日山野插画素材.png','result-ready',1),
 job('working','processing-photo.webp','processing',0.42),
 job('failed','failed-anime.png','failed',0.18),
 job('done','completed-landscape.jpg','completed',1),
 job('queued','queued-reference.png','queued',0),
];
let installed=true;
let renderKey=0;
window.fixtureCalls={pickDirectory:0,install:0,export:0};
const status=engine=>({engine,installed,phase:installed?'ready':'not-installed',version:installed?'fixture-1':null,installedModelIds:installed?engine==='real-cugan'?['cugan-2x-conservative','cugan-3x-conservative','cugan-4x-conservative']:['esrgan-x4plus','esrgan-x4plus-anime','esrgan-animevideov3-2x','esrgan-animevideov3-3x','esrgan-animevideov3-4x']:[],bytesDownloaded:0,totalBytes:0,message:installed?'组件已就绪':'尚未安装'});
window.suyanApi={
 getUpscaleComponentStatus:async engine=>({ok:true,data:status(engine)}),
 onUpscaleProgress:()=>()=>{},
 pickUpscaleInputs:async()=>({ok:true,data:[]}),
 registerUpscaleFiles:async()=>({ok:true,data:[]}),
 pickUpscaleOutputDirectory:async()=>{window.fixtureCalls.pickDirectory++;return {ok:true,data:{token:'output-directory',displayName:'超分输出目录'}};},
 installUpscaleComponent:async engine=>{window.fixtureCalls.install++;installed=true;return {ok:true,data:status(engine)};},
 exportUpscaleResult:async()=>{window.fixtureCalls.export++;return {ok:true,data:{savedFileName:'fixture.png',importedItemIds:['library-item'],skipped:false}};},
};
const root=createRoot(document.getElementById('root'));
function resetStore(){upscaleStore.setState({preset:'anime',engine:'real-cugan',modelId:'cugan-2x-conservative',tileSize:0,gpuId:-1,forceWasm:false,exportOptions:{saveToDirectory:true,addToLibrary:false,outputDirectoryToken:null,format:'png',quality:92,conflictPolicy:'append-number',namingPattern:'{name}_{engine}_{scale}x',preserveMetadata:true,libraryMode:'new-group',title:'',categoryId:null,tags:[]},jobs:structuredClone(jobs),selectedJobId:'ready',activeJobId:'working',isRunning:false,cancelRequested:false});}
function render(){root.render(React.createElement(LocaleProvider,null,React.createElement(UpscaleWorkspace,{key:renderKey})));}
window.setLanguage=language=>{useLibraryStore.setState({language});};
window.setInstalled=value=>{installed=value;renderKey++;render();};
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
  }));
  assert.ok(overflow.document <= 0, `${label}: document overflows by ${overflow.document}px`);
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
  for (const status of ["待导出", "正在处理", "处理失败", "已完成", "等待处理"]) {
    await page.getByText(status, { exact: true }).first().waitFor();
  }
  await page.getByLabel("对比分割位置").fill("68");
  assert.equal(await page.getByLabel("对比分割位置").inputValue(), "68");
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await page.getByText("125%", { exact: true }).waitFor();
  await page.getByRole("checkbox", { name: "加入素材库", exact: true }).check();
  await page.getByText("素材库回流", { exact: true }).waitFor();
  await page.getByRole("button", { name: "WEBP", exact: true }).click();
  await page.getByLabel("输出质量").fill("86");
  await page.getByRole("button", { name: "选择保存目录", exact: true }).click();
  await page.getByRole("button", { name: "超分输出目录", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.fixtureCalls.pickDirectory), 1);
  await assertNoOverflow(page, "desktop zh-CN");
  await page.screenshot({ path: "output/upscale-workspace/desktop-zh.png", fullPage: true });

  await page.evaluate(() => window.setLanguage("en-US"));
  await page.getByRole("region", { name: "Task Queue" }).waitFor();
  await page.getByRole("complementary", { name: "Process & Export" }).waitFor();
  await page.getByRole("button", { name: "Export Results · 1", exact: true }).waitFor();
  await assertNoOverflow(page, "desktop en-US");
  await page.screenshot({ path: "output/upscale-workspace/desktop-en.png", fullPage: true });

  await page.evaluate(() => { window.setLanguage("zh-CN"); window.setInstalled(false); });
  await page.getByText("首次使用需下载组件", { exact: true }).waitFor();
  await page.getByRole("button", { name: "下载并安装", exact: true }).click();
  await page.getByText("Real-CUGAN · 2x 保守降噪", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.fixtureCalls.install), 1);
  await page.screenshot({ path: "output/upscale-workspace/desktop-installed.png", fullPage: true });
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
