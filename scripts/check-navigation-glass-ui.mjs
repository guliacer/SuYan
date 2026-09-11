import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const html=`<!doctype html><html lang="zh-CN" data-window-material="acrylic" data-window-floating="true" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React,{useState,useRef} from 'react';import{createRoot}from'react-dom/client';
import{AppTitleBar}from'/src/features/library/components/shell/AppTitleBar.tsx';
import{LibrarySidebar}from'/src/features/library/components/LibraryView.tsx';
import{sidebarEntryGroups,sidebarFooterEntryIds}from'/src/features/library/utils/sidebarEntries.ts';
import '/src/styles/tokens.css';
window.suyanApi={isWindowMaximized:async()=>({ok:true,data:{maximized:false}}),onWindowMaximizeChange:()=>()=>{},isWindowAlwaysOnTop:async()=>({ok:true,data:{alwaysOnTop:false}}),toggleAlwaysOnTopWindow:async()=>({ok:true,data:{alwaysOnTop:true}}),minimizeWindow:async()=>{},toggleMaximizeWindow:async()=>{},closeWindow:async()=>{}};
function Fixture(){const[open,setOpen]=useState(true),[view,setView]=useState('素材浏览'),[menu,setMenu]=useState(false);const ref=useRef(null),menuRef=useRef(null),contentRef=useRef(null);
const visibility=Object.fromEntries([...sidebarEntryGroups.flatMap(g=>g.entries),...sidebarFooterEntryIds].map(id=>[id,true]));
const actions={onOpenHome:()=>setView('素材浏览'),onOpenCategoryLexicon:()=>setView('分类浏览'),onOpenTagLexicon:()=>setView('标签浏览'),onOpenManager:()=>setView('批量管理'),onOpenTextPrompts:()=>setView('灵感创作'),onOpenTodo:()=>setView('待办事项'),onOpenCanvas:()=>setView('创作画布'),onOpenWebAssistant:()=>setView('网页助手'),onOpenPromptSites:()=>setView('资源推荐'),onOpenAiSettings:()=>setView('模型配置'),onOpenNsfwSettings:()=>setView('内容分级'),onOpenSystemPreferences:()=>setView('系统设置'),onOpenAbout:()=>setView('关于'),onOpenLogExport:()=>{},onOpenLibraryRoots:()=>{},onImportClipboardImage:()=>{},onImportImages:()=>{},onAddLibraryDirectory:()=>{},onImportZip:()=>{},onImportWordDocument:()=>{},onResizeBy:()=>{},onResizeStart:()=>{},onToggleImportMenu:()=>setMenu(v=>!v)};
return React.createElement('main',{className:'app-shell relative flex h-full flex-col text-foreground',style:{backgroundImage:'linear-gradient(130deg, var(--color-atmosphere-start), var(--color-atmosphere-end))'}},
React.createElement(AppTitleBar,{isSidebarOpen:open,onToggleSidebar:()=>setOpen(v=>!v)}),
React.createElement('div',{className:'library-content-frame relative flex min-h-0 flex-1'},open?React.createElement(LibrarySidebar,{...actions,activeView:'home',width:innerWidth<800?72:204,isCompact:innerWidth<800,isBusy:false,isImportMenuOpen:menu,sidebarEntryVisibility:visibility,sidebarRef:ref,importMenuRef:menuRef,importMenuContentRef:contentRef}):null,
React.createElement('section',{className:'relative z-10 min-w-0 flex-1 overflow-auto bg-background p-6'},React.createElement('h1',null,view),React.createElement('p',null,'内容区保持清晰，导航独立使用毛玻璃。'))));}
createRoot(document.getElementById('root')).render(React.createElement(Fixture));
</script></body></html>`;
const server=await createServer({server:{host:'127.0.0.1',port:5197,strictPort:true},plugins:[
{name:'export-navigation-fixture',enforce:'pre',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/features/library/components/LibraryView.tsx'))return code+'\nexport { LibrarySidebar };';}},
{name:'navigation-fixture',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(req.url?.split('?')[0]!=='/__navigation-qa')return next();res.setHeader('content-type','text/html; charset=utf-8');res.end(await vite.transformIndexHtml('/__navigation-qa',html));});}}]});
await server.listen();await mkdir('output/navigation-glass',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{for(const width of [1100,740])for(const theme of ['light','dark']){
const context=await browser.newContext({viewport:{width,height:800},colorScheme:theme});await context.tracing.start({screenshots:true,snapshots:true});
const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
await page.goto('http://127.0.0.1:5197/__navigation-qa',{waitUntil:'domcontentloaded'});
await page.getByRole('navigation',{name:'主导航'}).waitFor();await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
const computed=await page.evaluate(()=>{const title=document.querySelector('.app-titlebar'),sidebar=document.querySelector('aside.app-chrome-surface'),root=document.getElementById('root');return{titleFilter:getComputedStyle(title).backdropFilter,sideFilter:getComputedStyle(sidebar).backdropFilter,padding:getComputedStyle(root).padding,overflow:document.documentElement.scrollWidth>innerWidth,drag:getComputedStyle(title).getPropertyValue('-webkit-app-region')};});
assert.equal(computed.titleFilter,computed.sideFilter);assert.match(computed.titleFilter,/blur\(24px\)/);assert.equal(computed.padding,'0px');assert.equal(computed.drag,'drag');assert.equal(computed.overflow,false);
await page.getByRole('button',{name:'分类浏览',exact:true}).click();await page.getByRole('heading',{name:'分类浏览',exact:true}).waitFor();
await page.getByRole('button',{name:'导入素材',exact:true}).click();await page.getByRole('menuitem',{name:'导入分享',exact:true}).waitFor();
await page.getByRole('button',{name:'导入素材',exact:true}).click();
await page.getByRole('button',{name:'隐藏边栏',exact:true}).click();await page.getByRole('navigation',{name:'主导航'}).waitFor({state:'hidden'});
await page.getByRole('button',{name:'显示边栏',exact:true}).click();await page.getByRole('navigation',{name:'主导航'}).waitFor();
await page.getByRole('button',{name:'置顶',exact:true}).click();await page.getByRole('button',{name:'取消置顶',exact:true}).waitFor();
await page.screenshot({path:'output/navigation-glass/'+theme+'-'+width+'.png'});
assert.deepEqual(errors,[]);
}finally{await context.tracing.stop({path:'output/navigation-glass/trace-'+theme+'-'+width+'.zip'});await context.close();}}
process.stdout.write('Navigation glass passed: light/dark, 1100/740px, expand/collapse, navigation, import menu, pin, zero overflow and native gutter removal. CSS fixture only; desktop backdrop checked separately.\n');
}finally{await browser.close();await server.close();}
