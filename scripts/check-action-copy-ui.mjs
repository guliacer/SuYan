import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AccountDialog } from '/src/features/account/components/AccountDialog.tsx';
import { LoginDialog } from '/src/features/account/components/LoginDialog.tsx';
import { AiSettingsExportDialog } from '/src/features/library/components/AiSettingsExportDialog.tsx';
import { AiSettingsImportDialog } from '/src/features/library/components/AiSettingsImportDialog.tsx';
import { useAccountStore } from '/src/features/account/store/useAccountStore.ts';
import '/src/styles/tokens.css';
const root=createRoot(document.getElementById('root'));
const wait=()=>new Promise(resolve=>{window.finishRequest=resolve});
window.suyanApi={ accountStartOAuthLink:wait, accountCancelOAuth:wait, accountLogout:wait, accountRefresh:wait, accountUpdateProfile:wait, accountChooseAvatar:wait, accountRemoveAvatar:wait, accountConfirmOAuth:wait, accountSelectOAuthAvatar:wait };
const user={uid:'fixture-user',username:'测试用户',identities:[{provider:'guli',providerUserId:'fixture-user'},{provider:'github',providerUserId:'fixture-github'},{provider:'google',providerUserId:'fixture-google'}]};
window.showFixture=(kind,busy=false)=>{
useAccountStore.setState({user,status:'authenticated',provider:'guli',loginProvider:'github',isSubmitting:false,submittingAction:null,oauthConfirmation:null,oauthPendingProvider:null,oauthPurpose:null,activeOAuthProvider:null,error:null});
if(kind==='confirm')useAccountStore.setState({oauthConfirmation:{user,provider:'guli',loginProvider:'google',purpose:'login',expiresAt:Date.now()+600000}});
const props={onClose:()=>{},onSwitchAccount:()=>{},onSwitchToRegister:()=>{},isBusy:busy,onExport:wait,onPickFile:wait,onApply:wait};
root.render(React.createElement(kind==='export'?AiSettingsExportDialog:kind==='import'?AiSettingsImportDialog:kind==='confirm'?LoginDialog:AccountDialog,props));
};
window.showFixture('account');
</script></body></html>`;
const server = await createServer({ server: { host: '127.0.0.1', port: 5198, strictPort: true }, plugins: [{ name:'action-copy-fixture',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(req.url?.split('?')[0]!=='/__action-qa')return next();res.setHeader('content-type','text/html; charset=utf-8');res.end(await vite.transformIndexHtml('/__action-qa',html));});} }] });
await server.listen();
await mkdir('output/action-copy',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  for(const width of [974,390]) {
    const page=await browser.newPage({viewport:{width,height:1024}});
    page.setDefaultTimeout(10000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:5198/__action-qa', { waitUntil: 'domcontentloaded' });
    const show=async(kind,busy=false)=>page.evaluate(({kind,busy})=>window.showFixture(kind,busy),{kind,busy});
    const finish=async()=>page.evaluate(()=>window.finishRequest({ok:false,error:{code:'ACCOUNT_NETWORK_ERROR',message:'测试请求失败'}}));
    const logout=page.getByRole('button',{name:'退出登录',exact:true});
    await page.getByText('2 种',{exact:true}).waitFor();
    assert.equal(await page.getByText('Guli Identity',{exact:true}).count(),0);
    await page.getByRole('button',{name:'Linux.do',exact:true}).click();
    await page.getByRole('button',{name:'正在打开授权页...',exact:true}).waitFor();
    assert.equal(await logout.isDisabled(),true);
    assert.equal(await page.getByRole('button',{name:'正在退出...',exact:true}).count(),0);
    await page.getByRole('dialog').screenshot({path:'output/action-copy/link-'+width+'.png'});
    await page.evaluate(()=>window.finishRequest({ok:true,data:{started:true,expiresAt:Date.now()+600000}}));
    await page.getByRole('button',{name:'等待关联确认...',exact:true}).waitFor();
    await page.getByRole('button',{name:'停止等待',exact:true}).click();
    await page.getByRole('button',{name:'正在停止等待...',exact:true}).waitFor();
    assert.equal(await logout.count(),1);
    await finish();
    await show('account');
    await logout.click();
    await page.getByRole('button',{name:'正在退出...',exact:true}).waitFor();
    await finish();
    await show('confirm');
    await page.getByRole('button',{name:'取消',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'确认中...',exact:true}).count(),0);
    await finish();
    await show('export',true);
    await page.getByRole('button',{name:'选择保存位置',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'选择保存位置',exact:true}).isDisabled(),true);
    await show('export');
    await page.getByRole('button',{name:'选择保存位置',exact:true}).click();
    await page.getByRole('button',{name:'选择位置并导出中…',exact:true}).waitFor();
    await page.evaluate(()=>window.finishRequest('测试导出失败'));
    await page.getByText('测试导出失败',{exact:true}).waitFor();
    await show('import');
    await page.getByRole('button',{name:'选择备份文件',exact:true}).click();
    await page.getByRole('button',{name:'选择并读取中…',exact:true}).waitFor();
    await page.evaluate(()=>window.finishRequest({error:'测试读取失败'}));
    await page.getByRole('alert').getByText('测试读取失败',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    await page.close();
  }
  process.stdout.write('Action text verified at 974/390px: link/start/wait/cancel/logout/confirmation/export/import; delayed IPC fixtures.\n');
} finally {await browser.close();await server.close();}
