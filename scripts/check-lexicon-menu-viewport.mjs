import { createServer } from 'vite';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const source = await readFile('src/features/library/components/LibraryView.tsx', 'utf8');
const helpers = source.slice(source.indexOf('function getLexiconExplorerRootClassName'), source.indexOf('function getLexiconExplorerColumnClassName'))
  .replaceAll('layout: LexiconLayout', 'layout').replaceAll('): string', ')');
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module">
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{useLexiconMenuViewport}from'/src/features/library/hooks/useLexiconMenuViewport.ts';
import '/src/styles/tokens.css';
${helpers}
function App(){const[fixed,setFixed]=useState(false);window.setFixed=setFixed;
const ref=useLexiconMenuViewport(fixed);
let asideClass=getLexiconExplorerAsideClassName('page');
if(!fixed)asideClass=asideClass.replace('min-[960px]:max-h-[var(--lexicon-menu-available-height,calc(100dvh-9rem))]','min-[960px]:max-h-[calc(100dvh-9rem)]');
return React.createElement('div',{style:{height:'100dvh',display:'flex',flexDirection:'column',overflow:'hidden'}},
React.createElement('header',{style:{height:40,flexShrink:0}},'标题栏'),
React.createElement('main',{id:'pane',style:{flex:1,minHeight:0,overflowY:'auto',padding:'0 16px 16px'}},
React.createElement('div',{style:{height:180}},'标签浏览与搜索'),
React.createElement('div',{className:getLexiconExplorerRootClassName('page')},
React.createElement('aside',{ref,className:asideClass,'aria-label':'标签菜单'},
React.createElement('div',{className:'mb-3 shrink-0'},'标签菜单'),
React.createElement('div',{id:'tags',className:'grid min-h-0 gap-1 overflow-y-auto overscroll-contain pb-8 pr-1'},
Array.from({length:100},(_,i)=>React.createElement('button',{key:i,className:'min-h-9 px-3 py-2 text-left'},'标签 '+(i+1))))),
React.createElement('article',{style:{height:2600}},'素材区域'))));}
createRoot(document.getElementById('root')).render(React.createElement(App));
</script></body></html>`;
const server=await createServer({server:{host:'127.0.0.1',port:5198,strictPort:true},plugins:[{name:'lexicon-menu-qa',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(req.url!=='/__lexicon-qa')return next();res.setHeader('content-type','text/html;charset=utf-8');res.end(await vite.transformIndexHtml('/__lexicon-qa',html));});}}]});
await server.listen();await mkdir('output/lexicon-menu',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1500,height:1000}});
await context.tracing.start({screenshots:true,snapshots:true});
const page=await context.newPage();page.setDefaultTimeout(10000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5198/__lexicon-qa');
 await page.getByRole('button',{name:'标签 100',exact:true}).waitFor({state:'attached'});
 await page.locator('#pane').evaluate(el=>el.scrollTop=700);
 await page.waitForFunction(()=>document.querySelector('aside').getBoundingClientRect().top===56);
 const gap=()=>page.evaluate(()=>document.querySelector('#pane').getBoundingClientRect().bottom-document.querySelector('aside').getBoundingClientRect().bottom);
 const before=await gap();assert.ok(before>60,'reproduce wasted space under sticky menu');
 await page.screenshot({path:'output/lexicon-menu/before.png'});
 await page.evaluate(()=>window.setFixed(true));
 await page.waitForFunction(()=>Math.abs(document.querySelector('#pane').getBoundingClientRect().bottom-document.querySelector('aside').getBoundingClientRect().bottom-12)<2);
 await page.screenshot({path:'output/lexicon-menu/after.png'});
 for(const viewport of [{width:1500,height:1000},{width:1100,height:650},{width:960,height:480}]){
  await page.setViewportSize(viewport);
  for(const position of [0,700,1e6]){
   await page.locator('#pane').evaluate((el,y)=>el.scrollTop=y,position);
   await page.waitForFunction(()=>{const gap=document.querySelector('#pane').getBoundingClientRect().bottom-document.querySelector('aside').getBoundingClientRect().bottom;return gap>=11&&gap<=17;}).catch(async error=>{console.log({viewport,position,gap:await gap(),geometry:await page.locator('aside').evaluate(el=>({top:el.getBoundingClientRect().top,height:el.getBoundingClientRect().height,max:getComputedStyle(el).maxHeight}))});throw error;});
   const pageScroll=await page.locator('#pane').evaluate(el=>el.scrollTop);
   await page.locator('#tags').evaluate(el=>el.scrollTop=el.scrollHeight);
   const last=await page.getByRole('button',{name:'标签 100',exact:true}).boundingBox();
   const menu=await page.locator('#tags').boundingBox();
   assert.ok(last.y>=menu.y && last.y+last.height<=menu.y+menu.height+1,'last tag fully reachable');
   assert.equal(await page.locator('#pane').evaluate(el=>el.scrollTop),pageScroll,'menu scroll does not move page');
  }
 }
 await page.setViewportSize({width:600,height:700});
 await page.locator('#pane').evaluate(el=>el.scrollTop=0);
 await page.waitForFunction(()=>document.querySelector('aside').getBoundingClientRect().height<=360);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({beforeGap:before,afterGap:12,checked:'top/middle/bottom, resize, final tag, narrow layout'}));
}finally{await context.tracing.stop({path:'output/lexicon-menu/trace.zip'});await browser.close();await server.close();}
