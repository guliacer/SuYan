import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Same isolated component harness as other UI checks: no real library or account access.
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ExportProgressPanel} from '/src/components/ui/ExportProgressPanel.tsx';
import '/src/styles/tokens.css';
window.suyanApi={onExportProgress:callback=>{window.reportProgress=callback;return()=>{delete window.reportProgress;}}};
function Fixture(){const [page,setPage]=useState('素材库');return React.createElement(React.Fragment,null,
  React.createElement('main',{className:'min-h-screen bg-background p-6 text-foreground'},
    React.createElement('h1',null,page),
    React.createElement('button',{onClick:()=>setPage('创意画布'),className:'my-4 block rounded-lg bg-primary px-4 py-2 text-white'},'切换页面'),
    React.createElement('input',{'aria-label':'提示词',className:'rounded-lg border border-border bg-panel p-3'})),
  React.createElement(ExportProgressPanel));}
createRoot(document.getElementById('root')).render(React.createElement(Fixture));
</script></body></html>`;
const server = await createServer({server:{host:'127.0.0.1',port:5199,strictPort:true},plugins:[{
  name:'export-progress-fixture',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
    if(req.url?.split('?')[0]!=='/__export-progress-qa')return next();
    res.setHeader('content-type','text/html; charset=utf-8');res.end(await vite.transformIndexHtml('/__export-progress-qa',html));
  });},
}]});
await server.listen();
await mkdir('output/export-progress',{recursive:true});
const browser = await chromium.launch({channel:'msedge',headless:true});
try {
  for(const width of [1100,390]){
    const context = await browser.newContext({viewport:{width,height:800},reducedMotion:'reduce'});
    await context.tracing.start({screenshots:true,snapshots:true});
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    try {
      await page.goto('http://127.0.0.1:5199/__export-progress-qa',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>typeof window.reportProgress==='function');
      const progress=async(status,percent,phase)=>page.evaluate(({status,percent,phase})=>window.reportProgress({id:'test-task',title:'导出提示词分享包',status,percent,phase}),{status,percent,phase});
      await progress('running',35,'正在压缩并写入文件…');
      await page.getByRole('progressbar').waitFor();
      assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'),'35');
      assert.equal(await page.getByRole('dialog').getAttribute('aria-modal'),'false');
      await page.getByLabel('提示词',{exact:true}).fill('导出期间可以继续编辑');
      await page.getByRole('button',{name:'切换页面',exact:true}).click();
      await page.getByRole('heading',{name:'创意画布',exact:true}).waitFor();
      await page.screenshot({path:'output/export-progress/expanded-'+width+'.png'});
      await page.getByRole('button',{name:'收起进度，继续后台导出',exact:true}).click();
      await page.getByRole('dialog').waitFor({state:'detached'});
      await progress('running',72,'正在压缩并写入文件…');
      await page.getByRole('button',{name:'展开导出进度',exact:true}).getByText('72%',{exact:true}).waitFor();
      await page.getByLabel('提示词',{exact:true}).fill('收起后继续使用');
      await page.getByRole('button',{name:'展开导出进度',exact:true}).click();
      await page.getByRole('progressbar').waitFor();
      assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'),'72');
      await progress('completed',100,'导出完成');
      await page.getByRole('status').getByText('导出完成',{exact:true}).waitFor();
      await page.getByRole('button',{name:'关闭导出进度',exact:true}).click();
      await page.getByRole('dialog').waitFor({state:'detached'});
      assert.equal(await page.getByLabel('提示词',{exact:true}).inputValue(),'收起后继续使用');
      assert.deepEqual(errors,[]);
      console.log('PASS: export progress, minimize/restore, page interaction, width='+width);
    } finally {
      await context.tracing.stop({path:'output/export-progress/trace-'+width+'.zip'});
      await context.close();
    }
  }
} finally { await browser.close(); await server.close(); }
