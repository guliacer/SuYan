import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import {TodoWorkspace} from '/src/features/prompts/todos/components/TodoWorkspace.tsx';
import {ExportProgressPanel} from '/src/components/ui/ExportProgressPanel.tsx';
import '/src/styles/tokens.css';
const now='2026-09-10T00:00:00.000Z';
const tasks=['设计封面','整理素材'].map((title,index)=>({id:'task-'+index,title,projectId:'project',status:'todo',priority:'normal',progress:0,linkedPromptIds:[],tagIds:[],orderKey:String(index),createdAt:now,updatedAt:now}));
const file={kind:'suyan-todo-library',schemaVersion:1,updatedAt:now,tasks,projects:[{id:'project',name:'测试项目',archived:false,orderKey:'0',createdAt:now,updatedAt:now}],widgets:[]};
window.suyanApi={
 listPrompts:async()=>({ok:true,data:{schemaVersion:2,updatedAt:now,entries:[],categories:[]}}),
 readLibraryViewSettings:async()=>({ok:false,error:{message:'fixture'}}),
 listTodos:async()=>({ok:true,data:file}),
 onExportProgress:callback=>{window.reportProgress=callback;return()=>{delete window.reportProgress;}},
 exportTodoLibrary:options=>{window.lastExportOptions=options;window.reportProgress({id:'todo-task',title:'导出待办事项',status:'running',phase:'正在保存待办事项…',percent:null});return new Promise(resolve=>{window.finishExport=()=>{window.reportProgress({id:'todo-task',title:'导出待办事项',status:'completed',phase:'导出完成',percent:100});resolve({ok:true,data:{canceled:false,exportedCount:2,filePath:'测试.json'}});};});},
 importTodoFiles:async()=>({ok:true,data:{canceled:false,files:[{fileName:'待办.json',format:'json',candidateCount:2,warnings:[]}],candidates:[],warnings:[],libraries:[file]}}),
 importTodoLibraries:async libraries=>{window.importedLibraries=libraries;return {ok:true,data:file};},
};
createRoot(document.getElementById('root')).render(React.createElement(React.Fragment,null,React.createElement('div',{className:'h-screen bg-panel p-6 text-foreground'},React.createElement(TodoWorkspace)),React.createElement(ExportProgressPanel)));
</script></body></html>`;
const server=await createServer({server:{host:'127.0.0.1',port:5199,strictPort:true},plugins:[{name:'todo-export-fixture',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
 if(req.url?.split('?')[0]!=='/__todo-export-qa')return next();
 res.setHeader('content-type','text/html; charset=utf-8');res.end(await vite.transformIndexHtml('/__todo-export-qa',html));
});}}]});
await server.listen();await mkdir('output/todo-export',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 for(const width of [1280,750]){
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.tracing.start({snapshots:true,screenshots:true});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try {
   await page.goto('http://127.0.0.1:5199/__todo-export-qa',{waitUntil:'domcontentloaded'});
   await page.getByText('设计封面',{exact:true}).waitFor();
   await page.getByRole('checkbox',{name:'全选当前事项',exact:true}).check();
   await page.getByRole('button',{name:'导出所选',exact:true}).click();
   const exportDialog=page.getByRole('dialog',{name:'导出待办事项',exact:true});
   await exportDialog.waitFor();
   assert.equal(await exportDialog.getByRole('radio',{name:'所选事项（2 项）',exact:true}).isChecked(),true);
   await exportDialog.screenshot({path:'output/todo-export/export-'+width+'.png'});
   await exportDialog.getByRole('button',{name:'选择位置并导出',exact:true}).click();
   await page.waitForFunction(()=>typeof window.finishExport==='function');
   assert.deepEqual(await page.evaluate(()=>window.lastExportOptions),{taskIds:['task-0','task-1']});
   await page.getByLabel('快速新增事项',{exact:true}).fill('后台导出时仍可输入');
   await page.getByRole('tab',{name:/进度视图/}).click();
   await page.getByRole('heading',{name:'待办事项',exact:true}).waitFor();
   await page.evaluate(()=>window.finishExport());
   await page.getByRole('button',{name:'关闭导出进度',exact:true}).click();
   await page.getByRole('button',{name:'更多待办操作',exact:true}).click();
   await page.getByRole('button',{name:'导出事项',exact:true}).click();
   await exportDialog.getByRole('radio',{name:'全部事项（2 项，含归档）',exact:true}).waitFor();
   await exportDialog.getByRole('button',{name:'取消',exact:true}).click();
   await page.getByRole('button',{name:'更多待办操作',exact:true}).click();
   await page.getByRole('button',{name:'导入事项',exact:true}).click();
   const importDialog=page.getByRole('dialog',{name:/导入待办事项/});
   await importDialog.getByRole('button',{name:'选择文档',exact:true}).click();
   await importDialog.getByText('已识别素言待办文件：2 项事项、1 个项目',{exact:true}).waitFor();
   await importDialog.getByRole('button',{name:'确认导入',exact:true}).click();
   await importDialog.getByText('已创建 2 项。',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>window.importedLibraries[0].tasks.length),2);
   assert.deepEqual(errors,[]);
   console.log('PASS: todo export selection/menu, background interaction, native import, width='+width);
  }finally{await context.tracing.stop({path:'output/todo-export/trace-'+width+'.zip'});await context.close();}
 }
}finally{await browser.close();await server.close();}
