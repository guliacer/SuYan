import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { LoginDialog } from '/src/features/account/components/LoginDialog.tsx';
import { useAccountStore } from '/src/features/account/store/useAccountStore.ts';
import '/src/styles/tokens.css';
window.suyanApi = {
  accountStartOAuth: async () => ({ok:true,data:{started:true,expiresAt:Date.now()+600000,device:{userCode:'BCDF-GHJK',verificationUri:'https://auth.example.test/device',browserOpened:true}}}),
  accountCancelOAuth: async () => ({ok:true,data:{cancelled:true}}),
  writeClipboardText: async value => {window.copiedCode=value;return {ok:true,data:{copied:true}}},
  openExternalUrl: async value => {window.openedUri=value;return {ok:true,data:{opened:true}}}
};
useAccountStore.setState({status:'unauthenticated'});
createRoot(document.getElementById('root')).render(React.createElement(LoginDialog,{onClose:()=>{},onSwitchToRegister:()=>{}}));
</script></body></html>`;
const server = await createServer({
  server: { host: '127.0.0.1', port: 5197, strictPort: true },
  plugins: [{ name: 'device-qa-fixture', configureServer(vite) { vite.middlewares.use(async (request, response, next) => {
  if (request.url?.split('?')[0] !== '/__device-qa') return next();
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(await vite.transformIndexHtml('/__device-qa', html));
  }); } }],
});
await server.listen();
await mkdir('output/device-ui', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const width of [900, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5197/__device-qa');
    await page.getByRole('button', { name: '设备验证码登录', exact: true }).click();
    await page.getByText('BCDF-GHJK', { exact: true }).waitFor();
    await page.getByRole('button', { name: '复制验证码', exact: true }).click();
    await page.getByText('验证码已复制', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.copiedCode), 'BCDF-GHJK');
    await page.getByRole('button', { name: '打开授权页', exact: true }).click();
    assert.equal(await page.evaluate(() => window.openedUri), 'https://auth.example.test/device');
    const dialog = page.getByRole('dialog');
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true);
    await dialog.screenshot({ path: `output/device-ui/login-${width}.png`, animations: 'disabled' });
    await page.getByRole('button', { name: '取消并重新选择', exact: true }).click();
    await page.getByText('BCDF-GHJK', { exact: true }).waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    await page.close();
  }
  process.stdout.write('设备登录界面：900/390 宽度、复制、重新打开、取消和无渲染异常检查通过（IPC 使用测试替身）。\n');
} finally { await browser.close(); await server.close(); }
