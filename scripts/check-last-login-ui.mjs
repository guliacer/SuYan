import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Isolated IPC fixtures: never read or change the user's real account cache.
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { LoginDialog } from '/src/features/account/components/LoginDialog.tsx';
import { useAccountStore } from '/src/features/account/store/useAccountStore.ts';
import '/src/styles/tokens.css';
window.loginCalls = [];
window.suyanApi = {
  accountStartOAuth: async (...args) => { window.loginCalls.push(args); return {ok:true,data:{started:true,expiresAt:Date.now()+600000}}; },
  accountCancelOAuth: async () => ({ok:true,data:{cancelled:true}}),
};
const method = new URLSearchParams(location.search).get('method');
useAccountStore.setState({status:'unauthenticated', lastLoginMethod:method});
createRoot(document.getElementById('root')).render(React.createElement(LoginDialog,{onClose:()=>{},onSwitchToRegister:()=>{}}));
</script></body></html>`;
const server = await createServer({
  server: { host: '127.0.0.1', port: 5199, strictPort: true },
  plugins: [{ name: 'last-login-qa', configureServer(vite) { vite.middlewares.use(async (request, response, next) => {
    if (request.url?.split('?')[0] !== '/__last-login-qa') return next();
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(await vite.transformIndexHtml('/__last-login-qa', html));
  }); } }],
});
await server.listen();
await mkdir('output/last-login-ui', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const width of [900, 640, 390]) {
    for (const method of [null, 'email', 'google', 'linuxdo', 'github', 'device']) {
      const context = await browser.newContext({ viewport: { width, height: 950 } });
      await context.tracing.start({ screenshots: true, snapshots: true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(`http://127.0.0.1:5199/__last-login-qa${method ? `?method=${method}` : ''}`);
        const dialog = page.getByRole('dialog');
        await dialog.waitFor();
        const badge = dialog.getByText('上次登录', { exact: true });
        if (method) {
          await badge.waitFor();
          assert.equal(await badge.count(), 1);
          const label = { email: '登录', google: 'Google', linuxdo: 'Linux.do', github: 'GitHub', device: '设备验证码登录' }[method];
          const button = dialog.getByRole('button', { name: `${label} 上次登录`, exact: true });
          await button.waitFor();
          assert.equal(await badge.evaluate(el => {
            const box = el.getBoundingClientRect();
            const parent = el.closest('button').getBoundingClientRect();
            return box.left >= parent.left && box.right <= parent.right && box.top >= parent.top && box.bottom <= parent.bottom;
          }), true, `badge clipped: ${method}/${width}`);
          assert.equal(await page.evaluate(() => window.loginCalls.length), 0, 'history must never start authorization');
          if (method === 'email') await page.getByLabel('电子邮件地址').fill('fixture@example.test');
          await button.click();
          await page.getByRole('button', { name: '取消并重新选择', exact: true }).waitFor();
          await page.getByRole('button', { name: '取消并重新选择', exact: true }).click();
          await button.waitFor();
          await badge.waitFor();
        } else {
          assert.equal(await badge.count(), 0);
        }
        assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true);
        assert.deepEqual(errors, []);
        if (method === 'github' || method === 'email') {
          await dialog.screenshot({ path: `output/last-login-ui/${method}-${width}.png`, animations: 'disabled' });
        }
        await context.tracing.stop();
      } catch (error) {
        await context.tracing.stop({ path: `output/last-login-ui/failure-${method}-${width}.zip` });
        throw error;
      } finally { await context.close(); }
    }
  }
  process.stdout.write('上次登录 UI：18 个入口/宽度组合、标记归属、无自动授权、取消后保留、无溢出检查通过（隔离 IPC）。\n');
} finally { await browser.close(); await server.close(); }
