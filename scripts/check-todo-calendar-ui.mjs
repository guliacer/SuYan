import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root" style="height:100vh;display:flex"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { TodoPlannerView } from '/src/features/prompts/todos/components/TodoPlannerView.tsx';
import { defaultTodoCalendar } from '/src/features/prompts/todos/utils/todoWorkCalendar.ts';
import '/src/styles/tokens.css';
let settings = defaultTodoCalendar();
window.suyanApi = {
 readTodoCalendar: async()=>({ok:true,data:structuredClone(settings)}),
 updateTodoCalendar: async(change)=>{
   if(window.failSave) return {ok:false,error:{code:'TEST',message:'日历设置保存失败，请重试。'}};
   if(change.kind==='settings') settings={...change.settings,overrides:settings.overrides};
   else if(change.value==='default') delete settings.overrides[change.date];
   else settings.overrides[change.date]=change.value;
   return {ok:true,data:structuredClone(settings)};
 },
 getTodoHolidayYear: async(year)=>({ok:true,data:year===2026?{calendar:{year,days:[{date:'2026-01-04',name:'元旦',isOffDay:false},{date:'2026-01-02',name:'元旦',isOffDay:true}],fetchedAt:'2026-09-09T00:00:00Z'},status:'online',message:'节假日与调休已更新'}:{calendar:null,status:'unavailable',message:year+' 年节假日数据尚不可用，按工作模式和个人调整显示'}})
};
let tasks=[{id:'unplanned',title:'待安排任务'},{id:'outside',title:'外月任务',plannedDate:'2026-12-12'},{id:'finished',title:'已完成未规划',status:'completed'}].map(t=>({status:'todo',priority:'normal',progress:0,linkedPromptIds:[],tagIds:[],orderKey:'0',createdAt:'2026-01-01',updatedAt:'2026-01-01',...t}));
const root=createRoot(document.getElementById('root'));
const render=()=>root.render(React.createElement(TodoPlannerView,{tasks,projects:[],isBusy:false,onCompleteTask:async()=>{},onEditTask:()=>{},onUpdateTask:async(id,patch)=>{tasks=tasks.map(t=>t.id===id?{...t,...patch}:t);render();}}));
window.remount=()=>{root.render(null);setTimeout(render,0);};
render();
</script></body></html>`;
const server=await createServer({server:{host:'127.0.0.1',port:5198,strictPort:true},plugins:[{name:'calendar-qa',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(req.url?.split('?')[0]!=='/__calendar-qa')return next();res.setHeader('content-type','text/html; charset=utf-8');res.end(await vite.transformIndexHtml('/__calendar-qa',html));});}}]});
await server.listen();
await mkdir('output/todo-calendar',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 for(const width of [1100,390]) {
  const context=await browser.newContext({viewport:{width,height:1080}});
  await context.tracing.start({screenshots:true,snapshots:true});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try {
   await page.goto('http://127.0.0.1:5198/__calendar-qa',{waitUntil:'domcontentloaded'});
   await page.getByText('节假日与调休已更新',{exact:false}).waitFor();
   await page.getByLabel('规划月份').fill('2026-01');
   await page.getByRole('button',{name:'2026-01-04 元旦·补班 0项',exact:true}).click();
   const daily=page.getByLabel('当天工作休息安排');
   await daily.selectOption('rest');
   await page.getByRole('button',{name:'2026-01-04 自定休息 0项',exact:true}).waitFor();
   await page.getByLabel('工作模式',{exact:true}).selectOption('single-rest');
   await page.getByLabel('每周休息',{exact:true}).selectOption('3');
   await page.getByRole('button',{name:'2026-01-07 休息日 0项',exact:true}).waitFor();
   await daily.selectOption('default');
   await page.getByRole('button',{name:'2026-01-04 元旦·补班 0项',exact:true}).waitFor();
   await page.getByLabel('工作模式',{exact:true}).selectOption('alternate-rest');
   await page.getByLabel('双休基准周日期').fill('2026-01-05');
   await page.getByRole('button',{name:'2026-01-10 休息日 0项',exact:true}).waitFor();
   await page.getByRole('button',{name:'2026-01-17 工作日 0项',exact:true}).waitFor();
   const backlog=page.locator('section').filter({has:page.getByRole('heading',{name:'待规划事项',exact:true})}).last();
   assert.equal(await backlog.getByRole('button',{name:'外月任务',exact:true}).count(),0);
   assert.equal(await backlog.getByRole('button',{name:'已完成未规划',exact:true}).count(),0);
   await page.getByRole('button',{name:'安排到所选日期',exact:true}).click();
   await page.getByRole('region',{name:'所选日期安排'}).getByRole('button',{name:'待安排任务',exact:true}).waitFor();
   await page.getByRole('button',{name:'下个月',exact:true}).click();
   assert.equal(await page.getByLabel('规划月份').inputValue(),'2026-02');
   assert.equal(await page.getByRole('button',{name:/^2026-02-\d{2} /}).count(),28);
   await page.getByRole('button',{name:'上个月',exact:true}).click();
   const first=await page.getByRole('button',{name:/^2026-01-01 /}).boundingBox();
   const heading=await page.getByText('周四',{exact:true}).boundingBox();
   assert.ok(Math.abs(first.x-heading.x)<2,'first day aligns with Thursday');
   await page.evaluate(()=>{window.failSave=true;});
   await daily.selectOption('rest');
   await page.getByRole('alert').getByText('日历设置保存失败，请重试。',{exact:true}).waitFor();
   assert.equal(await daily.inputValue(),'default');
   await page.evaluate(()=>{window.failSave=false;});
   await daily.selectOption('work');
   await page.getByRole('button',{name:'2026-01-01 自定工作 0项',exact:true}).waitFor();
   await page.evaluate(()=>window.remount());
   await page.getByText('节假日与调休已更新',{exact:false}).waitFor();
   await page.getByLabel('规划月份').fill('2026-01');
   await page.getByRole('button',{name:'2026-01-01 自定工作 0项',exact:true}).waitFor();
   assert.equal(await page.getByLabel('工作模式',{exact:true}).inputValue(),'alternate-rest');
   await page.screenshot({path:'output/todo-calendar/month-'+width+'.png',fullPage:true});
   const overflow=await page.getByRole('region',{name:'待办规划视图'}).evaluate(el=>el.scrollWidth>el.clientWidth || el.querySelector(':scope > div').scrollWidth>el.querySelector(':scope > div').clientWidth);
   assert.equal(overflow,false,'calendar fits viewport');
   await page.getByLabel('规划月份').fill('2099-01');
   await page.getByText('2099 年节假日数据尚不可用，按工作模式和个人调整显示',{exact:true}).waitFor();
   assert.deepEqual(errors,[]);
  } finally {await context.tracing.stop({path:'output/todo-calendar/trace-'+width+'.zip'});await context.close();}
 }
 process.stdout.write('Calendar UI passed at 1100/390px: month alignment, modes, override/default, backlog, task planning, save errors, remount and unavailable year. IPC fixtures only.\n');
} finally {await browser.close();await server.close();}
