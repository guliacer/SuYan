// Real components with local, synthetic results; never calls a paid generation API.
import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root" class="h-screen bg-background p-4"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import {LocaleProvider} from '/src/components/LocaleProvider.tsx';
import {CreativeCanvas,CanvasView} from '/src/features/library/components/CanvasView.tsx';
import {CanvasPageAtmosphere} from '/src/features/library/components/CanvasPageAtmosphere.tsx';
import {CanvasPageBackground} from '/src/features/library/components/CanvasPageBackground.tsx';
import {CanvasBackgroundSettingsPanel} from '/src/features/library/components/CanvasBackgroundSettingsPanel.tsx';
import {useLibraryStore} from '/src/features/library/store/useLibraryStore.ts';
import {defaultCanvasDraftSettings} from '/src/features/library/utils/canvasGeneration.ts';
import {applyThemeModeToRoot,themePresetOptions} from '/src/features/library/utils/themeMode.ts';
import '/src/styles/tokens.css';
function sample(w,h){return 'data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 800 1000"><defs><linearGradient id="sky" x2="0.4" y2="1"><stop stop-color="#d0dfd8"/><stop offset="1" stop-color="#f7e3c5"/></linearGradient></defs><rect width="800" height="1000" fill="url(#sky)"/><circle cx="590" cy="300" r="100" fill="#fdf5db"/><path d="M0 700Q250 400 500 730T1000 600V1000H0Z" fill="#8ca698"/><path d="M0 850Q300 570 800 850V1000H0Z" fill="#527d70"/></svg>');}
window.samples=[{dataUrl:sample(768,1024),saved:false,requestPrompt:'春日山野，让光影慢慢落下'},{dataUrl:sample(1536,864),saved:true,imageFileName:'fixture.png',requestPrompt:'山间的一场日落'}];
window.fitSamples=[[320,320],[4096,1024],[768,3072]].map(([w,h])=>({dataUrl:sample(w,h),saved:false,requestPrompt:'尺寸适配测试'}));
window.calls={open:[],download:[],copy:[],archive:[]};
window.suyanApi={setDoubaoWebCanvasVisible:async()=>({ok:true}),hideDoubaoWebCanvas:async()=>({ok:true})};
let props={webCanvasEnabled:false,webCanvasLoginVisible:false,webCanvasLoading:false,webCanvasHostRef:{current:null},phase:'empty',lastModel:'gpt-image-1',results:[],thinkingKeywords:['春日','山野','柔光','留白'],generationElapsedMs:42000,lockedHeight:null,archivingIndex:null,archivingBatch:false,onOpenPreview:i=>window.calls.open.push(i),onDownload:(_,i)=>window.calls.download.push(i),onCopyImage:async s=>window.calls.copy.push(s),onArchive:(_,i)=>window.calls.archive.push(i)};
let full=false,pageView='canvas',draft={...defaultCanvasDraftSettings,prompt:'春日山野，让光影慢慢落下'};
let showChrome=false;
const root=createRoot(document.getElementById('root'));
window.showCanvas=(patch={},mode='light',fullView=false)=>{props={...props,...patch};full=fullView;applyThemeModeToRoot(mode,document.documentElement,{suppressTransitions:true});render();};
window.showCanvasPage=view=>{pageView=view;render();};
window.setCanvasTheme=(mode,options)=>applyThemeModeToRoot(mode,document.documentElement,{...options,suppressTransitions:true});
window.canvasThemePresets=themePresetOptions.map(option=>option.value);
window.mountBackgroundSettings=()=>{
 const host=document.createElement('div');host.id='background-settings-panel';host.className='fixed left-2 top-14 z-50 flex max-h-[90vh] w-96 flex-col overflow-hidden rounded-xl border border-border bg-panel p-4 shadow-xl';document.body.append(host);
 createRoot(host).render(React.createElement(LocaleProvider,null,React.createElement(CanvasBackgroundSettingsPanel)));
 window.suyanApi.saveLibraryViewSettings=async settings=>{window.savedBackground=structuredClone(settings.canvasBackground);return window.failBackgroundSave?{ok:false,error:{code:'TEST_FAILURE',message:'保存失败'}}:{ok:true,data:settings};};
 window.suyanApi.chooseThemeBackgroundImage=async()=>window.backgroundImageSelection??{ok:true,data:{canceled:true,imageFileName:null}};
};
window.setCanvasBackground=background=>useLibraryStore.setState({canvasBackground:background});
window.getCanvasDraft=()=>structuredClone(draft);
window.showCanvasChrome=()=>{showChrome=true;document.getElementById('root').className='h-screen';document.getElementById('root').style.background='#6092c0';render();};
function render(){
 if(!full){root.render(React.createElement(LocaleProvider,null,React.createElement(CreativeCanvas,props)));return;}
 useLibraryStore.setState({canvasPhase:props.phase,canvasThinkingKeywords:props.thinkingKeywords,canvasIsGenerating:['thinking','generating'].includes(props.phase)});
 const canvas=React.createElement(CanvasView,{aiSettings:useLibraryStore.getState().aiSettings,canvasDraft:draft,isBusy:false,generationResults:props.results,lastGenerationModel:props.lastModel,onDraftChange:p=>{draft={...draft,...p};render();},onGenerationResultsChange:r=>{props.results=r;render();},onLastGenerationModelChange:m=>{props.lastModel=m;render();},onCopyImage:props.onCopyImage,onGenerate:async()=>null,onPrepareDoubaoWebCanvas:async()=>null,onRefreshDoubaoWebCanvasAuth:async()=>null,onImportGeneratedImages:async()=>[],onOpenAiSettings:()=>{},onOptimizePrompt:async()=>null,onSaveAiActionModelPreference:async()=>true,onFullscreenPreviewChange:()=>{},onNotify:()=>{}});
 // Match LibraryView's real scroll/background/surface hierarchy, including wide margins.
 const content=React.createElement('div',{id:'canvas-page-scroll',className:'relative z-10 h-full min-h-0 flex-1 overflow-y-auto',style:{scrollbarGutter:'stable'}},
  React.createElement(CanvasPageBackground,{className:'library-background-layer min-h-full w-full bg-background',currentView:pageView},
   pageView==='canvas'?React.createElement(CanvasPageAtmosphere):null,
   React.createElement('div',{className:'library-workspace-surface relative mx-auto min-h-0 min-w-0 border-x border-border/60 bg-panel shadow-sm',style:{'--library-workspace-width':'100%'}},pageView==='canvas'?canvas:React.createElement('h2',null,'素材浏览（测试）'))));
 root.render(React.createElement(LocaleProvider,null,showChrome?React.createElement('div',{className:'relative flex h-full flex-col'},
  React.createElement('header',{className:'app-chrome-surface flex h-11 shrink-0 items-center px-5'},'素言 · 创意画布'),
  React.createElement('div',{className:'library-content-frame relative flex min-h-0 flex-1'},
   React.createElement('aside',{className:'app-chrome-surface w-48 shrink-0 p-5'},'素材浏览 · 创意画布'),content)):content));
}
window.showCanvas();
</script></body></html>`;
const server=await createServer({server:{host:'127.0.0.1',port:5198,strictPort:true},plugins:[{name:'canvas-workspace-qa',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(req.url?.split('?')[0]!=='/__canvas-qa')return next();res.setHeader('content-type','text/html; charset=utf-8');res.end(await vite.transformIndexHtml('/__canvas-qa',html));});}}]});
await server.listen();
await mkdir('output/canvas-workspace',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 // Compare the actual chrome and canvas layers over one simulated desktop, not just color tokens.
 const materialPage=await browser.newPage({viewport:{width:1600,height:1000}});
 await materialPage.goto('http://127.0.0.1:5198/__canvas-qa',{waitUntil:'domcontentloaded'});
 await materialPage.evaluate(()=>{window.showCanvas({},'light',true);window.showCanvasChrome();});
 await materialPage.getByText('等待灵感生成').waitFor();
 const assertGlass=async label=>{
  const materials=await materialPage.evaluate(()=>{
   const properties=['backgroundColor','backgroundImage','backdropFilter'];
   const read=selector=>{const el=document.querySelector(selector),s=getComputedStyle(el);return [...properties.map(p=>s[p]),getComputedStyle(el,'::before').backgroundImage];};
   return {header:read('header'),sidebar:read('aside'),page:read('.library-background-layer'),inner:['.library-workspace-surface','.canvas-workspace','.canvas-studio-surface'].map(selector=>{const style=getComputedStyle(document.querySelector(selector));return {backgroundColor:style.backgroundColor,backgroundImage:style.backgroundImage};})};
  });
  assert.deepEqual(materials.header,materials.sidebar,label+' titlebar and sidebar use identical glass');
  assert.notDeepEqual(materials.page,materials.header,label+' canvas keeps its dedicated mist atmosphere');
  assert.match(materials.page[1],/radial-gradient/i,label+' canvas page keeps soft mist gradients');
  assert.equal(materials.inner[0].backgroundColor,'rgba(0, 0, 0, 0)',label+' outer workspace keeps desktop color');
  assert.ok(materials.inner.slice(1).every(({backgroundColor,backgroundImage})=>backgroundColor!=='rgba(0, 0, 0, 0)'||backgroundImage!=='none'),label+' artwork card restores its separate studio surface');
 };
 for(const mode of ['light','dark']) for(const preset of await materialPage.evaluate(()=>window.canvasThemePresets)) {
  await materialPage.evaluate(({mode,preset})=>window.setCanvasTheme(mode,{themePreset:preset}),{mode,preset});
  await assertGlass(mode+'/'+preset);
 }
 for(const mode of ['light','dark']) {
  await materialPage.evaluate(mode=>window.setCanvasTheme(mode,{themePreset:'custom',customTheme:{navigationColor:'#dcece4',workspaceColor:'#ffffff',backgroundColor:'#ffffff',accentColor:'#dc2266'}}),mode);
  await assertGlass('custom/'+mode);
  await materialPage.screenshot({path:'output/canvas-workspace/shared-glass-'+mode+'.png'});
 }
 await materialPage.evaluate(()=>window.setCanvasTheme('light',{themePreset:'raycast',themeAccent:'rose',customTheme:{navigationColor:'#ffffff',secondaryColor:'#aab2bb',backgroundColor:'#ffffff',workspaceColor:'#ffffff',accentColor:'#cdcbcb'},themeNavigationOpacity:100,themeAccentOpacity:45}));
 await assertGlass('reported user settings');
 await materialPage.screenshot({path:'output/canvas-workspace/shared-glass-user.png'});
 await materialPage.close();
 process.stdout.write('Canvas/chrome material passed: every preset in light/dark, custom navigation with white workspace, shared outer glass and restored artwork studio surface.\n');
 const settingsPage=await browser.newPage({viewport:{width:1600,height:1000}});
 await settingsPage.route('app-theme://local/theme-background-test.png',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')}));
 await settingsPage.goto('http://127.0.0.1:5198/__canvas-qa',{waitUntil:'domcontentloaded'});
 await settingsPage.evaluate(()=>{window.showCanvas({},'light',true);window.showCanvasChrome();window.mountBackgroundSettings();});
 await settingsPage.getByRole('radio',{name:'柔雾渐变（默认）',exact:false}).waitFor();
 const externalMaterial=()=>settingsPage.locator('header,aside,.canvas-workspace,.canvas-studio-surface').evaluateAll(els=>els.map(el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.backgroundImage,s.backdropFilter];}));
 const beforeMaterials=await externalMaterial();
 await settingsPage.getByRole('radio',{name:'经典白色',exact:false}).click();
 await settingsPage.locator('.library-background-layer[data-background-mode="white"]').waitFor();
 assert.equal(await settingsPage.locator('.library-background-layer').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
 assert.equal(await settingsPage.evaluate(()=>window.savedBackground.mode),'white');
 await settingsPage.getByRole('radio',{name:'自定义颜色',exact:false}).click();
 await settingsPage.getByRole('textbox',{name:'页面背景颜色',exact:true}).fill('#173754');
 await settingsPage.getByRole('button',{name:'应用颜色'}).click();
 await settingsPage.locator('.library-background-layer[data-background-dark="true"]').waitFor();
 assert.equal(await settingsPage.locator('.library-background-layer').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(23, 55, 84)');
 assert.equal(await settingsPage.locator('.canvas-page-heading h1').evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)');
 assert.deepEqual(await externalMaterial(),beforeMaterials,'page background options leave navigation and artwork card untouched');
 await settingsPage.screenshot({path:'output/canvas-workspace/background-settings-color.png'});
 await settingsPage.evaluate(()=>window.failBackgroundSave=true);
 await settingsPage.getByRole('radio',{name:'经典白色',exact:false}).click();
 await settingsPage.getByText('保存失败，请重试。原设置已保留。',{exact:true}).waitFor();
 await settingsPage.locator('.library-background-layer[data-background-mode="color"]').waitFor();
 await settingsPage.evaluate(()=>window.failBackgroundSave=false);
 await settingsPage.getByRole('radio',{name:'自定义图片',exact:false}).click();
 assert.equal(await settingsPage.getByRole('radio',{name:'自定义颜色',exact:false}).getAttribute('aria-checked'),'true','cancel preserves previous selection');
 await settingsPage.evaluate(()=>window.backgroundImageSelection={ok:true,data:{canceled:false,imageFileName:'theme-background-test.png'}});
 await settingsPage.getByRole('radio',{name:'自定义图片',exact:false}).click();
 await settingsPage.locator('.library-background-layer[data-background-mode="image"]').waitFor();
 assert.equal(await settingsPage.evaluate(()=>window.savedBackground.imageFileName),'theme-background-test.png');
 await settingsPage.screenshot({path:'output/canvas-workspace/background-settings-image.png'});
 await settingsPage.evaluate(()=>document.getElementById('canvas-page-scroll').scrollTop=10000);
 assert.equal(await settingsPage.locator('.library-background-layer').evaluate(el=>el.getBoundingClientRect().bottom>=document.getElementById('canvas-page-scroll').getBoundingClientRect().bottom-1),true,'custom page image covers the bottom of the scrolled page');
 assert.deepEqual(await externalMaterial(),beforeMaterials,'image mode preserves artwork and chrome');
 await settingsPage.evaluate(()=>window.showCanvasPage('home'));
 await settingsPage.getByRole('heading',{name:'素材浏览（测试）'}).waitFor();
 assert.equal(await settingsPage.locator('.library-background-layer').getAttribute('data-background-mode'),null,'other pages do not inherit the custom canvas page background');
 await settingsPage.evaluate(()=>window.showCanvasPage('canvas'));
 await settingsPage.locator('.library-background-layer[data-background-mode="image"]').waitFor();
 await settingsPage.evaluate(()=>window.setCanvasBackground({mode:'image',color:null,imageFileName:'missing.png'}));
 await settingsPage.getByText('页面背景图片无法读取，已使用默认背景。请在系统设置中重新选择。',{exact:true}).waitFor();
 await settingsPage.locator('.library-background-layer[data-background-mode="mist"]').waitFor();
 await settingsPage.getByRole('button',{name:'移除图片并恢复默认'}).click();
 assert.equal(await settingsPage.evaluate(()=>window.savedBackground.imageFileName),null);
 await settingsPage.close();
 process.stdout.write('Canvas background settings passed: white/color/image/default, scoped styles, readable text, save failure rollback, canceled image selection and missing-image fallback.\n');
 for(const width of (process.argv.includes('--pointer-only')?[]:[2171,1400,1100,390])) {
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.tracing.start({screenshots:true,snapshots:true});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const shot=async name=>page.screenshot({path:'output/canvas-workspace/'+name+'-'+width+'.png',animations:'allow',fullPage:true});
  const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'horizontal overflow at '+width);
  const imageFits=async()=>{
   await page.waitForFunction(()=>document.querySelector('.canvas-artwork-media')?.naturalWidth>0);
   const boxes=await page.locator('.canvas-artwork-media').evaluate(el=>{
    const m=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect(),style=getComputedStyle(el.parentElement);
    const availableWidth=p.width-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
    const availableHeight=p.height-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
    const scale=Math.min(availableWidth/el.naturalWidth,availableHeight/el.naturalHeight);
    return {m:{x:m.x,y:m.y,right:m.right,bottom:m.bottom,width:m.width,height:m.height},p:{x:p.x,y:p.y,right:p.right,bottom:p.bottom},expected:{width:el.naturalWidth*scale,height:el.naturalHeight*scale}};
   });
   assert.ok(boxes.m.height>60,JSON.stringify(boxes));
   assert.ok(boxes.m.x>=boxes.p.x-1&&boxes.m.right<=boxes.p.right+1&&boxes.m.y>=boxes.p.y-1&&boxes.m.bottom<=boxes.p.bottom+1,'media must fit: '+JSON.stringify(boxes));
   assert.ok(Math.abs(boxes.m.width-boxes.expected.width)<2&&Math.abs(boxes.m.height-boxes.expected.height)<2,'image must fill the largest uncropped area: '+JSON.stringify(boxes));
  };
  try {
   await page.goto('http://127.0.0.1:5198/__canvas-qa',{waitUntil:'domcontentloaded'});
   await page.getByText('等待灵感生成').waitFor();await noOverflow();await shot('empty');
   await page.evaluate(()=>window.showCanvas({phase:'thinking'}));
   await page.getByRole('status').filter({hasText:'灵感汇集ing'}).waitFor();
   assert.equal(await page.locator('.canvas-prompt-particle-field').count(),1,'thinking shows prompt particles');
   assert.equal(await page.locator('.canvas-backdrop[data-canvas-mode="thinking"]').count(),1,'thinking keeps the shared canvas');
   await page.evaluate(()=>window.showCanvas({phase:'generating'}));
   await page.getByRole('status').filter({hasText:'灵感汇集ing'}).waitFor();
   await page.locator('.canvas-background-layers').evaluate(el=>{for(const a of el.getAnimations({subtree:true})){a.pause();a.currentTime=1600;}});
   await shot('generating');
   assert.equal(await page.locator('.canvas-prism-sweep').count(),0);
   assert.equal(await page.locator('.canvas-formation-block').count(),9);
   assert.equal(await page.locator('.canvas-prompt-particle').count(),12);
   assert.equal(await page.locator('.canvas-ai-scan').count(),1);
   assert.equal(await page.locator('.canvas-background-layers').evaluate(el=>getComputedStyle(el).pointerEvents),'none');
   await page.evaluate(()=>window.showCanvas({phase:'created',results:window.samples}));
   await page.getByText('768 × 1024 · 3:4',{exact:false}).waitFor();await imageFits();await shot('portrait');
   assert.equal(await page.locator('.canvas-formation-field,.canvas-ai-scan').count(),0,'results stop reveal effects');
   assert.equal(await page.locator('.canvas-focus-halo').evaluate(el=>getComputedStyle(el).animationDuration),'12s');
   await page.getByRole('button',{name:'复制',exact:true}).focus();
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('.canvas-result-actions')).opacity==='1');
   await page.keyboard.press('Enter');
   assert.equal(await page.evaluate(()=>window.calls.copy[0]===window.samples[0].dataUrl),true,'unarchived image copy uses original bytes');
   for(const [label,call] of [['大图','open'],['导出','download'],['收录','archive']]){
    await page.getByRole('button',{name:label,exact:true}).click();assert.deepEqual(await page.evaluate(c=>window.calls[c],call),[0]);
   }
   await shot('actions');
   await page.getByRole('button',{name:'下一张',exact:true}).click();
   await page.getByText('1536 × 864 · 16:9',{exact:false}).waitFor();await imageFits();
   assert.equal(await page.getByRole('button',{name:'已收录',exact:true}).isDisabled(),true);
   await page.evaluate(()=>window.showCanvas({},'dark'));await shot('landscape-dark');await noOverflow();
   await page.getByRole('button',{name:'上一张',exact:true}).click();await page.getByText('768 × 1024 · 3:4',{exact:false}).waitFor();
   await page.evaluate(()=>window.showCanvas({phase:'reveal'}));await page.getByRole('status').waitFor();await shot('reveal');
   await page.evaluate(()=>window.showCanvas({phase:'created',lastModel:'provider/model-with-a-very-long-version-and-deployment-name-'.repeat(3),lockedHeight:420}));
   await imageFits();await noOverflow();await shot('compact');
   for(let i=0;i<3;i++) {
    await page.evaluate(i=>window.showCanvas({phase:'created',results:[window.fitSamples[i]]}),i);
    await page.getByText('尺寸适配测试',{exact:true}).waitFor();await imageFits();await noOverflow();await shot('fit-'+i);
   }
   await page.evaluate(()=>window.showCanvas({results:window.samples}));
   await page.evaluate(()=>window.showCanvas({lockedHeight:null,lastModel:'gpt-image-1'},'light',true));
   await page.getByPlaceholder('描述主体、场景、光线、镜头和风格…').waitFor();await noOverflow();await imageFits();await shot('full');
   const coversPage=async()=>{
    const bounds=await page.evaluate(()=>{
     const host=document.getElementById('canvas-page-scroll').getBoundingClientRect();
     const background=document.querySelector('.canvas-page-atmosphere').getBoundingClientRect();
     const surface=document.querySelector('.library-workspace-surface');
     return {top:background.top<=host.top+1,bottom:background.bottom>=host.bottom-1,width:background.width>=host.width-20,surface:getComputedStyle(surface).backgroundColor,pointer:getComputedStyle(document.querySelector('.canvas-page-atmosphere')).pointerEvents};
    });
    assert.equal(bounds.top&&bounds.bottom&&bounds.width,true,'page coverage '+JSON.stringify(bounds));
    assert.equal(bounds.surface,'rgba(0, 0, 0, 0)','white surface must not cover the atmosphere');
    assert.equal(bounds.pointer,'none');
   };
   await coversPage();
   assert.equal(await page.locator('.canvas-page-grid,.canvas-page-circuits,.canvas-grid').count(),0,'neither background uses the old grid or circuit motif');
   assert.equal(await page.locator('.canvas-page-atmosphere .canvas-mist-node').count(),12);
   assert.equal(await page.locator('.canvas-page-atmosphere .canvas-mist-node').evaluateAll(els=>els.every(el=>el.getAnimations().length===1)),true,'twelve independently positioned mist patches animate');
   await page.getByPlaceholder('描述主体、场景、光线、镜头和风格…').click();
   await page.getByPlaceholder('描述主体、场景、光线、镜头和风格…').fill('玻璃杯里的清新果汁，柔和光影，商业摄影。');
   assert.equal(await page.getByPlaceholder('描述主体、场景、光线、镜头和风格…').inputValue(),'玻璃杯里的清新果汁，柔和光影，商业摄影。');
   await page.getByRole('button',{name:'更多提示词操作',exact:true}).click();
   assert.equal(await page.getByRole('button',{name:'更多提示词操作',exact:true}).getAttribute('aria-expanded'),'true');
   await page.getByRole('button',{name:'更多提示词操作',exact:true}).click();
   const generationSettingsButton=page.getByRole('button',{name:/图像参数/});
   await generationSettingsButton.waitFor();
   assert.equal(await page.getByRole('button',{name:/质量/}).count(),0,'generation controls stay inside the dialog');
   await generationSettingsButton.click();
   const generationDialog=page.getByRole('dialog',{name:'生成设置'});
   await generationDialog.waitFor();
   const dialogBounds=await generationDialog.boundingBox();
   assert.ok(dialogBounds && dialogBounds.x>=0 && dialogBounds.y>=0 && dialogBounds.x+dialogBounds.width<=width+1 && dialogBounds.y+dialogBounds.height<=900+1,'generation settings dialog fits the viewport');
   await generationDialog.getByLabel('质量').selectOption('high');
   await generationDialog.getByRole('button',{name:'9:16',exact:true}).click();
   await generationDialog.getByLabel('张数').selectOption('3');
   await page.getByRole('button',{name:/图像参数.*高.*1K.*9:16.*3张/}).waitFor();
   await generationDialog.getByRole('button',{name:'完成',exact:true}).click();
   await generationDialog.waitFor({state:'hidden'});
   assert.equal(await page.getByRole('dialog',{name:'生成设置'}).count(),0,'generation settings dialog closes cleanly');
   const draftBeforeCollapse=await page.evaluate(()=>window.getCanvasDraft());
   const expandedPanel=await page.locator('#canvas-creation-panel').boundingBox();
   const expandedCanvas=await page.locator('.canvas-workspace').boundingBox();
   await page.getByRole('button',{name:'收起创作侧栏',exact:true}).click();
   await page.getByRole('button',{name:'展开创作侧栏',exact:true}).waitFor();
   assert.equal(await page.getByRole('region',{name:'创作参数'}).count(),0,'hidden settings leave the accessibility tree');
   assert.equal(await page.getByPlaceholder('描述主体、场景、光线、镜头和风格…').isVisible(),false);
   assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'展开创作侧栏','keyboard focus stays on the toggle');
   await page.waitForFunction(()=>document.querySelector('.canvas-workspace').getAnimations().every(a=>a.playState==='finished'));
   const collapsedCanvas=await page.locator('.canvas-workspace').boundingBox();
   const layout=await page.locator('.canvas-layout').boundingBox();
   const resultsPanel=await page.locator('#canvas-results-panel').boundingBox();
   const resultsPanelSharesRow = Boolean(resultsPanel && collapsedCanvas && Math.abs(resultsPanel.y-collapsedCanvas.y)<2);
   const expectedCollapsedWidth = resultsPanelSharesRow ? resultsPanel.x-layout.x-16 : layout.width;
   assert.ok(Math.abs(collapsedCanvas.width-expectedCollapsedWidth)<2,'collapsed mode leaves no creation sidebar strip while preserving the results panel');
   if(width>=1024) assert.ok(collapsedCanvas.width>expandedCanvas.width+350,'canvas uses the freed sidebar width');
   await noOverflow();await imageFits();await coversPage();await shot('sidebar-collapsed-light');
   if(width===2171) {
    await page.setViewportSize({width:1280,height:720});await imageFits();await noOverflow();
    await page.setViewportSize({width,height:900});await imageFits();
   }
   await page.keyboard.press('Enter');
   await page.getByRole('button',{name:'收起创作侧栏',exact:true}).waitFor();
   await page.getByPlaceholder('描述主体、场景、光线、镜头和风格…').waitFor();
   assert.deepEqual(await page.evaluate(()=>window.getCanvasDraft()),draftBeforeCollapse,'restore all draft values and individual panel expansion settings');
   const restoredPanel=await page.locator('#canvas-creation-panel').boundingBox();
   assert.ok(Math.abs(restoredPanel.width-expandedPanel.width)<2&&Math.abs(restoredPanel.height-expandedPanel.height)<2,'restore the expanded layout');
   await page.getByRole('button',{name:'收起创作侧栏',exact:true}).click();
   await page.evaluate(()=>window.showCanvasPage('home'));
   await page.getByRole('heading',{name:'素材浏览（测试）'}).waitFor();
   await page.evaluate(()=>window.showCanvasPage('canvas'));
   await page.getByRole('button',{name:'展开创作侧栏',exact:true}).waitFor();
   await page.getByRole('button',{name:'展开创作侧栏',exact:true}).click();
   await page.evaluate(()=>{const el=document.getElementById('canvas-page-scroll');el.scrollTop=el.scrollHeight;});
   await coversPage();await shot('page-bottom');
   await page.evaluate(()=>window.showCanvasPage('home'));
   await page.getByRole('heading',{name:'素材浏览（测试）'}).waitFor();
   assert.equal(await page.locator('.canvas-page-atmosphere').count(),0,'other pages have no canvas decoration');
   assert.notEqual(await page.locator('.library-workspace-surface').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
   await page.evaluate(()=>{window.showCanvasPage('canvas');window.showCanvas({phase:'empty',results:[]},'light',true);});
   await page.getByText('等待灵感生成').waitFor();
   await page.evaluate(()=>document.getElementById('canvas-page-scroll').scrollTop=0);await coversPage();await shot('page-empty-light');
   await page.evaluate(()=>window.showCanvas({phase:'generating',results:[]},'dark',true));await page.getByRole('status').filter({hasText:'灵感汇集ing'}).waitFor();await noOverflow();await shot('full-generating-dark');
   assert.equal(await page.locator('.canvas-page-atmosphere').getAttribute('data-generating'),'true');
   await page.getByRole('button',{name:'收起创作侧栏',exact:true}).click();
   await page.getByRole('button',{name:'展开创作侧栏',exact:true}).waitFor();
   await page.waitForFunction(()=>document.querySelector('.canvas-workspace').getAnimations().every(a=>a.playState==='finished'));
   assert.equal(await page.getByRole('status').filter({hasText:'灵感汇集ing'}).isVisible(),true,'collapsing leaves generation running');
   await noOverflow();await shot('sidebar-collapsed-generating-dark');
   await page.emulateMedia({reducedMotion:'reduce'});
   assert.equal(await page.locator('.canvas-focus-halo').evaluate(el=>getComputedStyle(el).animationName),'none');
   assert.equal(await page.locator('.canvas-formation-block').evaluateAll(els=>els.every(el=>getComputedStyle(el).animationName==='none')),true);
   assert.equal(await page.locator('.canvas-ai-scan').evaluate(el=>getComputedStyle(el).display),'none');
   assert.equal(await page.locator('.canvas-prompt-particle').evaluateAll(els=>els.every(el=>getComputedStyle(el).animationName==='none')),true);
   assert.equal(await page.locator('.canvas-mist-node').evaluateAll(els=>els.every(el=>el.getAnimations().every(a=>a.playState==='paused'))),true);
   assert.deepEqual(errors,[]);
  } catch(error) {await shot('failure');throw error;}
  finally {await context.tracing.stop({path:'output/canvas-workspace/trace-'+width+'.zip'});await context.close();}
 }
 // Pointer trajectories run on a real Canvas2D surface; observe drawing, not just DOM presence.
 const pointerContext=await browser.newContext({viewport:{width:2171,height:1282}});
 await pointerContext.tracing.start({screenshots:true,snapshots:true});
 const pointerPage=await pointerContext.newPage();
 const pointerErrors=[];pointerPage.on('pageerror',e=>pointerErrors.push(e.message));
 await pointerPage.addInitScript(()=>{
  window.pointerProbe={draws:0,points:0,maxPoints:0,edges:[],nearest:Infinity,color:''};
  window.pagePointerProbe={draws:0,points:0,maxPoints:0,edges:[],nearest:Infinity,color:''};
  const probeFor=canvas=>canvas.parentElement.dataset.pointerScope==='page'?window.pagePointerProbe:window.pointerProbe;
  const originalArc=CanvasRenderingContext2D.prototype.arc;
  const originalClear=CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect=function(...args){
   if(this.canvas.classList.contains('canvas-pointer-particles'))probeFor(this.canvas).points=0;
   return originalClear.apply(this,args);
  };
  CanvasRenderingContext2D.prototype.arc=function(...args){
   if(this.canvas.classList.contains('canvas-pointer-particles')){
    const p=probeFor(this.canvas),[x,y]=args,b=this.canvas.getBoundingClientRect();
    p.draws++;p.points++;p.maxPoints=Math.max(p.maxPoints,p.points);p.color=this.fillStyle;
    for(const [edge,outside] of [['left',x<0],['right',x>b.width],['top',y<0],['bottom',y>b.height]])if(outside&&!p.edges.includes(edge))p.edges.push(edge);
    if(window.pointerTarget)p.nearest=Math.min(p.nearest,Math.hypot(x-window.pointerTarget.x,y-window.pointerTarget.y));
   }
   return originalArc.apply(this,args);
  };
 });
 try {
  await pointerPage.goto('http://127.0.0.1:5198/__canvas-qa',{waitUntil:'domcontentloaded'});
  await pointerPage.evaluate(()=>window.showCanvas({},'light',true));
  await pointerPage.getByText('等待灵感生成').waitFor();
  await pointerPage.clock.install();await pointerPage.clock.pauseAt(new Date());
  await pointerPage.evaluate(()=>{let seed=19;Math.random=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};});
  const enter=async(x=.68,y=.42)=>{
   await pointerPage.locator('.canvas-backdrop').scrollIntoViewIfNeeded();
   await pointerPage.clock.runFor(100);
   const b=await pointerPage.locator('.canvas-backdrop').boundingBox();
   await pointerPage.evaluate(t=>window.pointerTarget=t,{x:b.width*x,y:b.height*y});
   await pointerPage.mouse.move(b.x+b.width*x,b.y+b.height*y);
   await pointerPage.clock.runFor(50);
   assert.equal(await pointerPage.locator('.canvas-backdrop .canvas-pointer-field').getAttribute('data-active'),'true');
   const orb=await pointerPage.locator('.canvas-backdrop .canvas-pointer-glow').boundingBox();
   assert.ok(Math.abs(orb.x+orb.width/2-(b.x+b.width*x))<2&&Math.abs(orb.y+orb.height/2-(b.y+b.height*y))<2,'orb follows the actual cursor');
  };
  const quiet=async()=>{
   const before=await pointerPage.evaluate(()=>[window.pointerProbe.draws,window.pagePointerProbe.draws]);
   await pointerPage.clock.runFor(1500);
   assert.deepEqual(await pointerPage.evaluate(()=>[window.pointerProbe.draws,window.pagePointerProbe.draws]),before,'both inactive canvases stop rendering');
   assert.equal(await pointerPage.locator('.canvas-pointer-particles').evaluateAll(els=>els.every(el=>!el.getContext('2d').getImageData(0,0,el.width,el.height).data.some((n,i)=>i%4===3&&n>0))),true,'both inactive canvases clear their bitmaps');
  };
  // Reproduce the user's preset and opacity: the old accent-derived ink was gray.
  await pointerPage.evaluate(()=>window.setCanvasTheme('light',{themePreset:'xcode',themeAccent:'mist',themeAccentOpacity:45,themeWorkspaceOpacity:85}));
  await enter();await pointerPage.clock.runFor(8000);
  const trajectories=await pointerPage.evaluate(()=>window.pointerProbe);
  assert.deepEqual(trajectories.edges.sort(),['bottom','left','right','top'],'particles originate beyond all four edges');
  assert.ok(trajectories.maxPoints>8&&trajectories.maxPoints<=32,'particle population is bounded over many lifetimes');
  assert.ok(trajectories.nearest<12,'particles reach and disappear at the cursor');
  assert.equal(await pointerPage.locator('.canvas-backdrop .canvas-pointer-field').evaluate(el=>getComputedStyle(el).pointerEvents),'none');
  assert.equal(await pointerPage.locator('[data-pointer-scope="page"]').getAttribute('data-active'),'true','inner hover also drives the outer atmosphere');
  assert.ok(await pointerPage.evaluate(()=>window.pagePointerProbe.draws)>100,'page field actually draws');
  assert.equal(await pointerPage.evaluate(()=>window.pagePointerProbe.color===window.pointerProbe.color),true,'both fields use the same ink');
  assert.equal(await pointerPage.locator('.canvas-workspace').evaluate(el=>getComputedStyle(el).getPropertyValue('--canvas-theme-color').trim()),'#e1e9f4','use the Xcode navigation surface, not either accent');
  await pointerPage.screenshot({path:'output/canvas-workspace/pointer-theme-mist.png'});
  await pointerPage.mouse.move(70,400);await pointerPage.clock.runFor(2600);
  assert.equal(await pointerPage.locator('.canvas-backdrop .canvas-pointer-field').getAttribute('data-active'),'false');
  assert.equal(await pointerPage.locator('[data-pointer-scope="page"]').getAttribute('data-active'),'true','outer margin has its own pointer effect');
  const outsideOrb=await pointerPage.locator('[data-pointer-scope="page"] .canvas-pointer-glow').boundingBox();
  assert.ok(Math.abs(outsideOrb.x+outsideOrb.width/2-70)<2&&Math.abs(outsideOrb.y+outsideOrb.height/2-400)<2,'outer orb is correctly positioned');
  assert.equal(await pointerPage.locator('[data-pointer-scope="page"] canvas').evaluate(el=>el.getContext('2d').getImageData(0,0,el.width,el.height).data.some((n,i)=>i%4===3&&n>0)),true,'outer particles have visible pixels');
  await pointerPage.screenshot({path:'output/canvas-workspace/pointer-outer-xcode.png'});
  await enter(.7,.4);await pointerPage.clock.runFor(1000);
  const destinations=()=>pointerPage.locator('.canvas-page-atmosphere .canvas-mist-node').evaluateAll(els=>els.map(el=>el.getAnimations()[0].effect.getKeyframes().at(-1).transform));
  const firstDestinations=await destinations();
  const regions=firstDestinations.map(transform=>{const [,x,y]=transform.match(/translate3d\(([-\d.]+)%, ([-\d.]+)%/);return Math.floor((Number(x)+50)*.48/33.333)+3*Math.floor((Number(y)+50)*.52/50);});
  assert.ok(new Set(regions).size >= 8,'destinations occupy at least eight different regions');
  await pointerPage.clock.runFor(19000);
  assert.notDeepEqual(await destinations(),firstDestinations,'each cycle generates new destinations instead of replaying a fixed path');
  for(const mode of ['light','dark']) for(const preset of await pointerPage.evaluate(()=>window.canvasThemePresets)) {
   const palette=await pointerPage.evaluate(({mode,preset})=>{
    window.setCanvasTheme(mode,{themePreset:preset});
    const root=getComputedStyle(document.documentElement);
    const host=getComputedStyle(document.querySelector('.canvas-workspace'));
    return {expected:root.getPropertyValue('--theme-'+mode+'-chrome-end').trim(),actual:host.getPropertyValue('--canvas-theme-color').trim(),ink:[...document.querySelectorAll('.canvas-pointer-particles')].map(el=>getComputedStyle(el).color)};
   },{mode,preset});
   assert.equal(palette.actual,palette.expected,mode+'/'+preset+' follows its navigation surface');
   assert.equal(palette.ink[0],palette.ink[1],'both regions stay in sync');
  }
  await pointerPage.evaluate(()=>window.setCanvasTheme('light',{themePreset:'solarized',themeAccent:'sand'}));
  assert.equal(await pointerPage.locator('.canvas-workspace').evaluate(el=>getComputedStyle(el).getPropertyValue('--canvas-theme-color').trim()),'#f1e7c9','Solarized uses warm sand instead of its blue emphasis color');
  await pointerPage.screenshot({path:'output/canvas-workspace/flow-solarized.png'});
  await pointerPage.evaluate(()=>window.setCanvasTheme('light',{themePreset:'rose-pine',themeAccent:'rose'}));
  await pointerPage.screenshot({path:'output/canvas-workspace/flow-rose-pine.png'});
  const oldBackground=await pointerPage.locator('.canvas-page-atmosphere .canvas-mist-field').evaluate(el=>getComputedStyle(el.children[0]).backgroundImage);
  const oldInner=await pointerPage.locator('.canvas-background-layers .canvas-mist-field').evaluate(el=>getComputedStyle(el.children[0]).backgroundImage);
  await pointerPage.evaluate(()=>{window.pointerElement=document.querySelector('.canvas-backdrop .canvas-pointer-particles');window.setCanvasTheme('light',{themePreset:'custom',themeAccent:'custom',customTheme:{navigationColor:'#dcece4',accentColor:'#168d74',backgroundColor:'#f5faf8',workspaceColor:'#ffffff'}});});
  await pointerPage.clock.runFor(100);
  assert.equal(await pointerPage.evaluate(()=>window.pointerElement===document.querySelector('.canvas-backdrop .canvas-pointer-particles')),true,'theme changes do not remount the effect');
  assert.notEqual(await pointerPage.locator('.canvas-page-atmosphere .canvas-mist-field').evaluate(el=>getComputedStyle(el.children[0]).backgroundImage),oldBackground,'outer gradient follows theme');
  assert.notEqual(await pointerPage.locator('.canvas-background-layers .canvas-mist-field').evaluate(el=>getComputedStyle(el.children[0]).backgroundImage),oldInner,'inner gradient follows theme');
  assert.notEqual(await pointerPage.evaluate(()=>window.pointerProbe.color),trajectories.color,'already-flying particles change color');
  assert.equal(await pointerPage.locator('.canvas-workspace').evaluate(el=>getComputedStyle(el).getPropertyValue('--canvas-theme-color').trim()),'#dcece4','custom themes follow navigationColor independently from accentColor');
  assert.equal(await pointerPage.evaluate(()=>{const ctx=document.createElement('canvas').getContext('2d');ctx.fillStyle=getComputedStyle(window.pointerElement).color;return ctx.fillStyle===window.pointerProbe.color;}),true,'particle drawing uses the current theme ink');
  await enter(.34,.6);await pointerPage.clock.runFor(1200);
  await pointerPage.screenshot({path:'output/canvas-workspace/pointer-theme-custom.png'});
  await pointerPage.evaluate(()=>window.setCanvasTheme('dark',{themePreset:'proof',themeAccent:'sage'}));
  await pointerPage.clock.runFor(1200);await pointerPage.screenshot({path:'output/canvas-workspace/pointer-theme-dark.png'});
  await pointerPage.mouse.move(-10,-10);await quiet();
  await pointerPage.locator('.canvas-backdrop').dispatchEvent('pointermove',{pointerType:'touch',clientX:800,clientY:300});await quiet();
  assert.equal(await pointerPage.locator('.canvas-backdrop .canvas-pointer-field').getAttribute('data-active'),'false','touch does not leave a floating orb');
  await enter(.6,.4);await pointerPage.emulateMedia({reducedMotion:'reduce'});await quiet();
  assert.equal(await pointerPage.locator('.canvas-mist-node').evaluateAll(els=>els.every(el=>el.getAnimations().every(a=>a.playState==='paused'))),true);
  const reducedDestinations=await destinations();await pointerPage.clock.runFor(20000);
  assert.deepEqual(await destinations(),reducedDestinations,'reduced motion stops random destination timers too');
  assert.equal(await pointerPage.locator('.canvas-backdrop .canvas-pointer-glow').evaluate(el=>getComputedStyle(el,'::before').animationName),'none','reduced motion also disables refraction waves');
  await enter(.65,.45);await quiet();
  await pointerPage.emulateMedia({reducedMotion:'no-preference'});await pointerPage.clock.runFor(200);
  await pointerPage.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await quiet();
  await pointerPage.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await enter(.7,.4);await pointerPage.evaluate(()=>window.dispatchEvent(new Event('blur')));await quiet();
  await enter(.7,.5);await pointerPage.evaluate(()=>document.getElementById('canvas-page-scroll').dispatchEvent(new Event('scroll')));await quiet();
  await pointerPage.evaluate(()=>document.getElementById('canvas-page-scroll').scrollTop=10000);await pointerPage.clock.runFor(50);
  await pointerPage.mouse.move(75,500);await pointerPage.clock.runFor(1000);
  const bottomOrb=await pointerPage.locator('[data-pointer-scope="page"] .canvas-pointer-glow').boundingBox();
  assert.ok(Math.abs(bottomOrb.y+bottomOrb.height/2-500)<2,'page scroll offset does not shift the orb');
  assert.ok(await pointerPage.locator('[data-pointer-scope="page"] canvas').evaluate(el=>el.getBoundingClientRect().height)<=1282,'page bitmap is limited to visible height');
  await pointerPage.screenshot({path:'output/canvas-workspace/pointer-outer-scrolled.png'});
  await enter(.6,.6);await pointerPage.setViewportSize({width:1100,height:850});await pointerPage.clock.runFor(50);await quiet();
  assert.equal(await pointerPage.locator('.canvas-backdrop .canvas-pointer-field').getAttribute('data-active'),'false');
  await pointerPage.evaluate(()=>window.showCanvasPage('home'));await pointerPage.getByRole('heading',{name:'素材浏览（测试）'}).waitFor();
  const beforeUnmount=await pointerPage.evaluate(()=>[window.pointerProbe.draws,window.pagePointerProbe.draws]);await pointerPage.clock.runFor(2000);
  assert.deepEqual(await pointerPage.evaluate(()=>[window.pointerProbe.draws,window.pagePointerProbe.draws]),beforeUnmount,'unmounted fields have no animation loops');
  assert.deepEqual(pointerErrors,[]);
 } catch(error) {
  console.error(JSON.stringify(await pointerPage.evaluate(()=>({hitAtOrigin:document.elementFromPoint(1,1)?.className,fields:[...document.querySelectorAll('.canvas-pointer-field')].map(el=>({scope:el.dataset.pointerScope,active:el.dataset.active,bounds:el.getBoundingClientRect().toJSON()}))}))));
  await pointerPage.screenshot({path:'output/canvas-workspace/pointer-failure.png'});throw error;
 }
 finally {await pointerContext.tracing.stop({path:'output/canvas-workspace/trace-pointer.zip'});await pointerContext.close();}
 // Virtual time verifies cadence and phase cleanup without slow sleeps.
 const page=await browser.newPage({viewport:{width:1000,height:800}});
 await page.goto('http://127.0.0.1:5198/__canvas-qa',{waitUntil:'domcontentloaded'});
 await page.getByText('等待灵感生成').waitFor();
 await page.clock.install();
 await page.evaluate(()=>{Math.random=()=>0.5;window.showCanvas({phase:'generating'});});
 await page.getByRole('status').filter({hasText:'灵感汇集ing'}).waitFor();
 let previous=await page.locator('.canvas-waiting-message').textContent();
 for(let i=0;i<4;i++){
  await page.clock.runFor(4799);assert.equal(await page.locator('.canvas-waiting-message').textContent(),previous);
  await page.clock.runFor(1);assert.ok(await page.locator('.canvas-waiting-message--leaving').count());
  await page.clock.runFor(200);const current=await page.locator('.canvas-waiting-message').textContent();assert.notEqual(current,previous);previous=current;
 }
 await page.evaluate(()=>window.showCanvas({phase:'created',results:window.samples}));
 await page.getByText('春日山野，让光影慢慢落下',{exact:true}).waitFor();await page.clock.runFor(20000);
 assert.equal(await page.locator('.canvas-waiting-message').count(),0);
 await page.close();
 // Decode can finish after the provider's reveal phase. The work must still get
 // its single 1500ms reveal, and remain immediately usable under reduced motion.
 const revealPage=await browser.newPage({viewport:{width:1100,height:800}});
 await revealPage.goto('http://127.0.0.1:5198/__canvas-qa',{waitUntil:'domcontentloaded'});
 await revealPage.getByText('等待灵感生成').waitFor();
 await revealPage.clock.install();
 await revealPage.clock.pauseAt(new Date());
 let releaseImage;
 const imageRequested=new Promise(resolve=>{releaseImage={resolve};});
 await revealPage.route('**/__slow-work.svg',async route=>{
  await new Promise(resolve=>{releaseImage.fulfill=resolve;releaseImage.resolve();});
  await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024"><rect width="768" height="1024" fill="#a9bdc7"/><circle cx="400" cy="400" r="190" fill="#eadbc5"/></svg>'});
 });
 await revealPage.evaluate(()=>window.showCanvas({phase:'reveal',results:[{...window.samples[0],dataUrl:location.origin+'/__slow-work.svg'}]}));
 await imageRequested;
 await revealPage.clock.runFor(900);
 await revealPage.evaluate(()=>window.showCanvas({phase:'created'}));
 assert.equal(await revealPage.locator('.canvas-image-reconstruction').count(),0,'never scans undecoded work');
 releaseImage.fulfill();
 await revealPage.waitForFunction(()=>document.querySelector('.canvas-artwork-media')?.naturalWidth===768);
 await revealPage.locator('[data-canvas-mode="reveal"]').waitFor();
 await revealPage.locator('.canvas-reconstruction-frost').evaluate(el=>{const a=el.getAnimations()[0];a.pause();a.currentTime=300;});
 await revealPage.screenshot({path:'output/canvas-workspace/reconstruction.png'});
 await revealPage.clock.runFor(1500);
 await revealPage.locator('[data-canvas-mode="result"]').waitFor();
 assert.equal(await revealPage.locator('.canvas-image-reconstruction,.canvas-ai-scan,.canvas-formation-field').count(),0);
 await revealPage.evaluate(()=>window.showCanvas({phase:'generating',results:[]}));
 await revealPage.getByRole('status').filter({hasText:'灵感汇集ing'}).waitFor();
 await revealPage.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await revealPage.waitForFunction(()=>getComputedStyle(document.querySelector('.canvas-ai-scan')).animationPlayState==='paused');
 await revealPage.emulateMedia({reducedMotion:'reduce'});
 await revealPage.evaluate(()=>window.showCanvas({phase:'reveal',results:window.samples}));
 await revealPage.getByText('768 × 1024 · 3:4',{exact:false}).waitFor();
 assert.equal(await revealPage.locator('.canvas-image-reconstruction').count(),0);
 assert.equal(await revealPage.locator('.canvas-formation-field').count(),0);
 await revealPage.close();
 process.stdout.write('Canvas pointer UI passed: all light/dark theme presets, Solarized warm surface, twelve dispersed random destinations renewed each cycle, shared inner/outer colors, cursor refraction waves, bounded bitmaps/particles, scrolled orb position, cleanup and reduced-motion timer pause; delayed reveal and timer cadence passed.\n');
 if(!process.argv.includes('--pointer-only')) process.stdout.write('Canvas workspace UI passed: five phases, light/dark, 2171/1400/1100/390px, maximum uncropped image fit (portrait/landscape/small/square/panorama/tall), live window resizing, sidebar collapse/restore, preserved drafts and focus, full-page atmosphere and bottom scroll coverage, input/menu interactions, dimensions/actions/carousel.\n');
} finally {await browser.close();await server.close();}
