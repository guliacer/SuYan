import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root" class="flex h-screen flex-col overflow-auto bg-panel p-4"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import {ThemeRoleColors} from '/src/features/library/components/ThemeRoleColors.tsx';
import {Button} from '/src/components/ui/Button.tsx';
import {TodoPlannerView} from '/src/features/prompts/todos/components/TodoPlannerView.tsx';
import {normalizeThemeCustomTheme,applyThemeModeToRoot,getDefaultThemeAccentForPreset} from '/src/features/library/utils/themeMode.ts';
import {defaultTodoCalendar} from '/src/features/prompts/todos/utils/todoWorkCalendar.ts';
import '/src/styles/tokens.css';
let settings=normalizeThemeCustomTheme({}),mode='light',preset='proof';
let cal=defaultTodoCalendar();
window.suyanApi={readTodoCalendar:async()=>({ok:true,data:cal}),getTodoHolidayYear:async()=>({ok:true,data:{calendar:null,status:'unavailable',message:'测试日期，不应用在线节假日'}}),updateTodoCalendar:async()=>({ok:true,data:cal})};
const root=createRoot(document.getElementById('root'));
window.showTheme=(p,m)=>{preset=p;mode=m;render();};
function render(){
 applyThemeModeToRoot(mode,document.documentElement,{suppressTransitions:true,themePreset:preset,themeAccent:getDefaultThemeAccentForPreset(preset),customTheme:settings});
 root.render(React.createElement(React.Fragment,null,
  React.createElement(ThemeRoleColors,{customTheme:settings,themeMode:mode,themePreset:preset,disabled:false,onChange:async patch=>{settings=normalizeThemeCustomTheme({...settings,...patch});render();}}),
  React.createElement('div',{className:'my-4 flex flex-wrap gap-3'},React.createElement('aside',null,React.createElement('button',{className:'bg-primary text-primary-foreground rounded-lg p-3'},'导航示例')),React.createElement(Button,{variant:'primary'},'保存设置'),React.createElement(Button,{variant:'secondary'},'取消操作'),React.createElement('button',{className:'bg-primary text-primary-foreground rounded-lg p-3'},'原有页面操作'),React.createElement(Button,{variant:'danger'},'删除示例')),
  React.createElement(TodoPlannerView,{tasks:[],projects:[],isBusy:false,onCompleteTask:async()=>{},onUpdateTask:async()=>{},onEditTask:()=>{}})
 ));
}
render();
</script></body></html>`;
const server=await createServer({server:{host:'127.0.0.1',port:5197,strictPort:true},plugins:[{name:'theme-role-qa',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(req.url?.split('?')[0]!=='/__theme-qa')return next();res.setHeader('content-type','text/html; charset=utf-8');res.end(await vite.transformIndexHtml('/__theme-qa',html));});}}]});
await server.listen();await mkdir('output/theme-roles',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 for(const width of [1100,390]) {
  const context=await browser.newContext({viewport:{width,height:1200}});
  await context.tracing.start({screenshots:true,snapshots:true});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try {
   await page.goto('http://127.0.0.1:5197/__theme-qa',{waitUntil:'domcontentloaded'});
   await page.getByLabel('规划月份').fill('2026-09');
   const rgb=async(name)=>page.getByRole('button',{name,exact:true}).evaluate(el=>getComputedStyle(el).backgroundColor);
   for(const preset of ['raycast','notion','one','proof','rose-pine','solarized','vercel','vs-code-plus','xcode','custom']) {
    for(const mode of ['light','dark']) {
     await page.evaluate(([p,m])=>window.showTheme(p,m),[preset,mode]);
     await page.waitForFunction(m=>document.documentElement.dataset.theme===m,mode);
     const nav=await rgb('导航示例');const action=await rgb('保存设置');
     assert.notEqual(nav,action,preset+' '+mode+' navigation vs action');
     assert.equal(await rgb('原有页面操作'),action,'legacy actions share secondary color');
     assert.notEqual(await rgb('删除示例'),action,'danger stays independent');
     const rest=page.getByRole('button',{name:'2026-09-05 休息日 0项',exact:true});
     const work=page.getByRole('button',{name:'2026-09-04 工作日 0项',exact:true});
     assert.notEqual(await rest.evaluate(el=>getComputedStyle(el).backgroundColor),await work.evaluate(el=>getComputedStyle(el).backgroundColor));
     const contrast=await rest.evaluate(el=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
      function lum(color){ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const rgb=[...ctx.getImageData(0,0,1,1).data].slice(0,3).map(n=>{const c=n/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
      const css=getComputedStyle(el);const a=lum(css.color),b=lum(css.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
     });
     assert.ok(contrast>=4.5,preset+' '+mode+' rest contrast '+contrast);
    }
   }
   await page.evaluate(()=>window.showTheme('proof','light'));
   await page.screenshot({path:'output/theme-roles/light-'+width+'.png'});
   await page.getByLabel('次要色',{exact:true}).fill('#f1e2cc');
   await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--theme-role-secondary')==='#f1e2cc');
   assert.equal(await page.getByRole('button',{name:'保存设置',exact:true}).evaluate(el=>getComputedStyle(el).color),'rgb(23, 23, 23)');
   await page.getByLabel('第三色',{exact:true}).fill('#9771bb');
   await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--theme-role-tertiary')==='#9771bb');
   await page.evaluate(()=>window.showTheme('one','dark'));
   assert.equal(await page.getByLabel('次要色',{exact:true}).inputValue(),'#f1e2cc');
   await page.getByRole('button',{name:'恢复次要色与第三色自动配色',exact:true}).click();
   await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--theme-role-secondary')==='initial');
   await page.evaluate(()=>window.showTheme('proof','dark'));
   await page.screenshot({path:'output/theme-roles/dark-'+width+'.png'});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
   assert.deepEqual(errors,[]);
  } finally {await context.tracing.stop({path:'output/theme-roles/trace-'+width+'.zip'});await context.close();}
 }
 process.stdout.write('Theme role UI passed: 10 presets in light/dark at 1100/390px, shared and legacy actions, navigation, rest/work separation, rest contrast >=4.5, custom colors and reset.\n');
} finally {await browser.close();await server.close();}
