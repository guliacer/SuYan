import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PromptLibraryManagerView } from '/src/features/library/components/PromptLibraryManagerDialog.tsx';
import { AiSettingsExportDialog } from '/src/features/library/components/AiSettingsExportDialog.tsx';
import { useLibraryStore } from '/src/features/library/store/useLibraryStore.ts';
import { useAccountStore } from '/src/features/account/store/useAccountStore.ts';
import { toPromptCardData } from '/src/features/library/utils/promptFilters.ts';
import '/src/styles/tokens.css';
const root=createRoot(document.getElementById('root'));
const user={uid:'issuer#alice',username:'测试甲',identities:[]};
const items=[{id:'old',title:'未关联作品'}, {id:'own',title:'我的作品',accountOwnerUid:user.uid,authorName:user.username}, {id:'other',title:'他人的作品',accountOwnerUid:'issuer#bob',authorName:'测试乙'}, {id:'web',title:'网络作者作品',authorName:'原作者'}].map(i=>({prompt:'测试提示词',negativePrompt:'',tags:[],imageFileName:'',createdAt:'2026-09-08',updatedAt:'2026-09-08',...i}));
const wait=()=>new Promise(resolve=>{window.finishRequest=resolve});
window.suyanApi={syncWorksToAccount: async input=>{window.syncInput=input;return wait();}};
window.accountChange=(next)=>useAccountStore.setState({user:next==='none'?null:{...user,uid:'issuer#bob',username:'测试乙'},status:next==='none'?'anonymous':'authenticated'});
window.showFixture=(kind)=>{
useAccountStore.setState({user,status:'authenticated'});
useLibraryStore.setState({items,isBusy:false,checkVideoRuntime:async()=>false});
const props={key:kind,onClose:()=>{window.closed=true},isBusy:false,onExport:async(type)=>{window.exportType=type;return null;},items:items.map(toPromptCardData),blurNsfwImages:false,onCopy:()=>{},onDelete:async()=>{},onImport:()=>{},onOpenDetail:()=>{}};
root.render(React.createElement(kind==='export'?AiSettingsExportDialog:PromptLibraryManagerView,props));
};
window.showFixture('manager');
</script></body></html>`;
const server=await createServer({server:{host:'127.0.0.1',port:5199,strictPort:true},plugins:[{name:'work-account-fixture',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(req.url?.split('?')[0]!=='/__work-qa')return next();res.setHeader('content-type','text/html; charset=utf-8');res.end(await vite.transformIndexHtml('/__work-qa',html));});}}]});
await server.listen();
await mkdir('output/work-account',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  for(const width of [974,390]) {
    const context=await browser.newContext({viewport:{width,height:1024}});
    await context.tracing.start({screenshots:true,snapshots:true});
    const page=await context.newPage(); page.setDefaultTimeout(10000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    try {
      await page.goto('http://127.0.0.1:5199/__work-qa',{waitUntil:'domcontentloaded'});
      await page.getByRole('button',{name:'仅选未关联作品',exact:true}).click();
      await page.getByRole('button',{name:'同步作品',exact:true}).click();
      const dialog=page.getByRole('dialog',{name:'同步为当前账户的作品？'});
      await dialog.getByText(/将所选 1 张素材关联到「测试甲」/).waitFor();
      await dialog.getByRole('checkbox').check();
      await dialog.screenshot({path:'output/work-account/sync-'+width+'.png'});
      await dialog.getByRole('button',{name:'同步作品',exact:true}).click();
      await dialog.getByRole('button',{name:'正在同步作品…',exact:true}).waitFor();
      assert.deepEqual(await page.evaluate(()=>window.syncInput),{itemIds:['old'],expectedUid:'issuer#alice',force:true});
      await page.evaluate(()=>window.finishRequest({ok:true,data:{canceled:false,library:null,changedCount:1,skippedCount:0}}));
      await dialog.waitFor({state:'hidden'});
      await page.getByRole('button',{name:'同步作品',exact:true}).click();
      await dialog.waitFor();
      await page.evaluate(()=>window.accountChange('bob'));
      await dialog.getByRole('alert').getByText('账户已变化，请关闭后重新选择。').waitFor();
      assert.equal(await dialog.getByRole('button',{name:'同步作品',exact:true}).isDisabled(),true);
      await dialog.getByRole('button',{name:'取消',exact:true}).click();
      await dialog.waitFor({state:'hidden'});
      await page.evaluate(()=>window.showFixture('export'));
      const exportDialog=page.getByRole('dialog',{name:'导出 AI 设置'});
      await exportDialog.getByRole('radio',{name:'普通导出（不含密钥）',exact:true}).waitFor();
      assert.equal(await exportDialog.getByRole('radio').count(),3);
      assert.equal(await exportDialog.getByRole('radio',{name:'普通导出（不含密钥）',exact:true}).isChecked(),true);
      await exportDialog.getByRole('radio',{name:/账户验证加密备份/}).check();
      await exportDialog.getByText(/仅同一账户联网验证后可导入/).waitFor();
      await exportDialog.screenshot({path:'output/work-account/export-'+width+'.png'});
      await exportDialog.getByRole('button',{name:'选择保存位置',exact:true}).click();
      await page.waitForFunction(()=>window.exportType==='account');
      await page.evaluate(()=>window.accountChange('none'));
      await exportDialog.getByText('请先登录账户。',{exact:true}).waitFor();
      assert.equal(await exportDialog.getByRole('button',{name:'选择保存位置',exact:true}).isDisabled(),true);
      const bounds=await exportDialog.boundingBox(); assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width);
      assert.deepEqual(errors,[]);
    } finally {
      await context.tracing.stop({path:'output/work-account/trace-'+width+'.zip'});
      await context.close();
    }
  }
  process.stdout.write('Work account UI passed at 974/390px: unowned selection, force confirmation, account change/cancel, three export modes and logout guard. Local IPC fixtures only.\n');
} finally {await browser.close();await server.close();}
