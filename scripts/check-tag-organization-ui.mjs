import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {TagOrganizationDialog} from '/src/features/library/components/TagOrganizationDialog.tsx';
import {useLibraryStore} from '/src/features/library/store/useLibraryStore.ts';
import {buildTagOrganizationRows,applyTagOrganizationChoices} from '/src/features/library/utils/tagOrganization.ts';
import '/src/styles/tokens.css';
const initialEntries=[
 {id:'tree',label:'胡杨树',group:'其他标签 Other',description:''},
 {id:'red',label:'红叶',group:'其他标签 Other',description:''},
 {id:'birch',label:'白桦树干',group:'空间环境 Environment',description:''},
 {id:'table',label:'矮几',group:'其他标签 Other',description:''},
 {id:'rose-window',label:'玫瑰窗',group:'其他标签 Other',description:''},
 {id:'sony',label:'SONY',group:'文本与补充',description:''},
 {id:'model',label:'α7C',group:'其他标签 Other',description:''},
 {id:'device-watermark',label:'HUAWEI',group:'其他标签 Other',description:''},
 {id:'fragment',label:'道',group:'其他标签 Other',description:''},
 {id:'camera',label:'相机',group:'物品/数码设备',description:'',groupLocked:true},
 {id:'clip',label:'蝴蝶发夹',group:'动物/动物与宠物',description:'用户封面',imageFileName:'clip.png',groupLocked:true},
 {id:'band',label:'蝴蝶结发带',group:'动物/动物与宠物',description:'',groupLocked:true},
 {id:'strap',label:'蝴蝶结肩带',group:'动物/动物与宠物',description:'',groupLocked:true},
 {id:'custom',label:'牛角扣',group:'我的收藏/衣扣',description:'保留自定义',groupLocked:true},
 {id:'unknown',label:'半透明异形装置',group:'待归纳',description:'',reviewStatus:'pending',analysis:{dimension:'other',confidence:0.61,evidence:['边缘轮廓不清晰']}},
 {id:'noise',label:'OPEN TODAY',group:'其他标签 Other',description:''},
];
let entries=structuredClone(initialEntries),revision=0,undo=null;
let items=[{id:'a',title:'秋日',prompt:'胡杨与红叶',negativePrompt:'',tags:['胡杨树','红叶'],category:null,imageFileName:'a.png',createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'}];
items.push({...items[0],id:'camera',prompt:'相机',imageFileName:'camera.png',tags:['SONY','α7C','相机']});
window.applyCount=0;window.undoCount=0;window.stale=false;
const result=()=>({ok:true,data:{library:{schemaVersion:2,items,updatedAt:''},settings:{promptLexicons:{categories:[],tags:entries}}}});
window.suyanApi={
 previewTagOrganization:async()=>({ok:true,data:{revision:String(revision),rows:buildTagOrganizationRows(items,entries),undoAvailable:!!undo}}),
 applyTagOrganization:async request=>{if(window.stale)return {ok:false,error:{code:'TAG_ORGANIZATION_STALE',message:'标签库已变化，请刷新预览后再应用。'}};undo=structuredClone({items,entries});const next=applyTagOrganizationChoices(items,entries,buildTagOrganizationRows(items,entries),request.choices);items=next.items;entries=next.entries;revision++;window.applyCount++;return result();},
 undoTagOrganization:async()=>{items=undo.items;entries=undo.entries;undo=null;revision++;window.undoCount++;return result();},
};
useLibraryStore.setState({items,promptLexicons:{categories:[],tags:entries}});
window.state=()=>useLibraryStore.getState();
function Fixture(){const [open,setOpen]=useState(true);return React.createElement('main',{style:{padding:24}},React.createElement('button',{onClick:()=>setOpen(true)},'打开标签整理'),open&&React.createElement(TagOrganizationDialog,{onClose:()=>setOpen(false)}));}
createRoot(document.getElementById('root')).render(React.createElement(Fixture));
</script></body></html>`;
const server=await createServer({server:{host:'127.0.0.1',port:0},plugins:[{name:'tag-organization-fixture',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(req.url?.split('?')[0]!=='/__tag-organization')return next();res.setHeader('content-type','text/html;charset=utf-8');res.end(await vite.transformIndexHtml('/__tag-organization',html));});}}]});
await server.listen();
await mkdir('output/tag-organization',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  for(const width of [1400,640]) {
    const context=await browser.newContext({viewport:{width,height:900}});
    await context.tracing.start({screenshots:true,snapshots:true});
    const page=await context.newPage();page.setDefaultTimeout(10000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    try {
      await page.goto(server.resolvedUrls.local[0]+'__tag-organization',{waitUntil:'domcontentloaded'});
      await page.getByLabel('胡杨树的标准名称').waitFor();
      assert.equal(await page.getByLabel('胡杨树的标准名称').inputValue(),'胡杨');
      await page.getByText('原有 11 个未细分标签，其中 7 个已有明确分组建议，4 个需人工复核。',{exact:false}).waitFor();
      await page.getByRole('button',{name:'原未归类',exact:true}).click();
      assert.equal(await page.getByLabel('白桦树干的所属分组').inputValue(),'自然环境/植物/树木');
      assert.equal(await page.getByLabel('矮几的所属分组').inputValue(),'建筑空间/家具陈设');
      assert.equal(await page.getByLabel('玫瑰窗的所属分组').inputValue(),'建筑空间/建筑与构件');
      assert.equal(await page.getByRole('checkbox',{name:'选择 OPEN TODAY',exact:true}).isChecked(),false);
      assert.equal(await page.getByLabel('SONY的所属分组').inputValue(),'物品/数码设备/相机品牌');
      assert.equal(await page.getByLabel('α7C的所属分组').inputValue(),'物品/数码设备/相机型号');
      assert.equal(await page.getByRole('checkbox',{name:'选择 HUAWEI',exact:true}).isChecked(),false);
      await page.getByRole('button',{name:'疑似噪音',exact:true}).click();
      await page.getByText('碎词、编号、来源水印等不再由新分析自动添加。',{exact:false}).waitFor();
      assert.equal(await page.getByRole('checkbox',{name:'选择 道',exact:true}).isChecked(),false);
      assert.equal(await page.getByLabel('SONY的所属分组').count(),0);
      await page.getByRole('button',{name:'原未归类',exact:true}).click();
      await page.getByLabel('搜索待整理标签').fill('矮几');
      assert.equal(await page.getByRole('checkbox').count(),1);
      await page.getByLabel('搜索待整理标签').fill('');
      await page.screenshot({path:'output/tag-organization/unorganized-'+width+'.png',fullPage:true});
      await page.getByRole('button',{name:'取消勾选',exact:true}).click();
      await page.getByRole('button',{name:'待归纳',exact:true}).click();
      await page.getByText('模型置信度 61%',{exact:false}).waitFor();
      await page.getByLabel('半透明异形装置的所属分组').fill('我的收藏/实验装置');
      await page.getByRole('button',{name:'应用勾选项（1）',exact:true}).click();
      await page.getByText('确认应用已勾选的 1 个标签调整？',{exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>window.applyCount),0);
      await page.getByRole('button',{name:'返回检查',exact:true}).click();
      assert.equal(await page.getByLabel('半透明异形装置的所属分组').inputValue(),'我的收藏/实验装置');
      await page.getByRole('button',{name:'应用勾选项（1）',exact:true}).click();
      await page.getByRole('button',{name:'确认执行',exact:true}).click();
      await page.getByText('已应用整理，原名称已保留为别名。',{exact:false}).waitFor();
      assert.equal(await page.evaluate(()=>window.state().promptLexicons.tags.find(e=>e.id==='unknown').group),'我的收藏/实验装置');
      assert.deepEqual(await page.evaluate(()=>window.state().items[0].tags),['胡杨树','红叶']);
      await page.getByRole('button',{name:'关闭',exact:true}).click();
      await page.getByRole('button',{name:'打开标签整理',exact:true}).click();
      await page.getByRole('button',{name:'撤销上次整理',exact:true}).click();
      await page.getByRole('button',{name:'确认执行',exact:true}).click();
      await page.getByText('已撤销上次整理，恢复原标签与分组。',{exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>window.state().promptLexicons.tags.find(e=>e.id==='unknown').group),'待归纳');
      await page.getByRole('button',{name:'建议整理',exact:true}).click();
      await page.getByRole('button',{name:'取消勾选',exact:true}).click();
      await page.getByRole('checkbox',{name:'选择 胡杨树',exact:true}).check();
      await page.getByRole('button',{name:'应用勾选项（1）',exact:true}).click();
      await page.evaluate(()=>window.stale=true);
      await page.getByRole('button',{name:'确认执行',exact:true}).click();
      await page.getByText('标签库已变化，请刷新预览后再应用。',{exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>window.applyCount),1);
      await page.evaluate(()=>window.stale=false);
      await page.getByRole('button',{name:'应用勾选项（1）',exact:true}).click();
      await page.getByRole('button',{name:'确认执行',exact:true}).click();
      await page.getByText('已应用整理，原名称已保留为别名。',{exact:false}).waitFor();
      assert.deepEqual(await page.evaluate(()=>window.state().items[0].tags),['胡杨','红叶']);
      assert.deepEqual(await page.evaluate(()=>window.state().promptLexicons.tags.find(e=>e.id==='tree').aliases),['胡杨树']);
      await page.getByRole('button',{name:'建议整理',exact:true}).click();
      await page.getByRole('button',{name:'取消勾选',exact:true}).click();
      await page.getByLabel('搜索待整理标签').fill('蝴蝶');
      await page.getByLabel('蝴蝶发夹的所属分组').waitFor();
      assert.equal(await page.getByRole('checkbox').count(),3);
      for(const label of ['蝴蝶发夹','蝴蝶结发带']) assert.equal(await page.getByLabel(label+'的所属分组').inputValue(),'服饰/配饰');
      assert.equal(await page.getByLabel('蝴蝶结肩带的所属分组').inputValue(),'服饰/结构与纹样');
      assert.equal(await page.getByRole('checkbox',{name:'选择 蝴蝶发夹',exact:true}).isChecked(),false);
      await page.screenshot({path:'output/tag-organization/corrections-'+width+'.png',fullPage:true});
      await page.getByRole('button',{name:'选择当前建议',exact:true}).click();
      await page.getByRole('button',{name:'应用勾选项（3）',exact:true}).click();
      await page.getByText('确认应用已勾选的 3 个标签调整？',{exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>window.state().promptLexicons.tags.find(e=>e.id==='clip').group),'动物/动物与宠物');
      await page.getByRole('button',{name:'返回检查',exact:true}).click();
      await page.getByRole('button',{name:'应用勾选项（3）',exact:true}).click();
      await page.getByRole('button',{name:'确认执行',exact:true}).click();
      await page.getByText('当前没有匹配的标签。',{exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>window.state().promptLexicons.tags.find(e=>e.id==='clip').group),'服饰/配饰');
      assert.equal(await page.evaluate(()=>window.state().promptLexicons.tags.find(e=>e.id==='clip').imageFileName),'clip.png');
      assert.equal(await page.evaluate(()=>window.state().promptLexicons.tags.find(e=>e.id==='custom').group),'我的收藏/衣扣');
      assert.deepEqual(await page.evaluate(()=>window.state().items[0].tags),['胡杨','红叶']);
      await page.getByRole('button',{name:'关闭',exact:true}).click();
      await page.getByRole('button',{name:'打开标签整理',exact:true}).click();
      await page.getByRole('button',{name:'全部标签',exact:true}).click();
      assert.equal(await page.getByLabel('蝴蝶发夹的所属分组').inputValue(),'服饰/配饰');
      await page.getByRole('button',{name:'撤销上次整理',exact:true}).click();
      await page.getByRole('button',{name:'确认执行',exact:true}).click();
      await page.getByText('已撤销上次整理，恢复原标签与分组。',{exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>window.state().promptLexicons.tags.find(e=>e.id==='clip').group),'动物/动物与宠物');
      await page.getByLabel('搜索待整理标签').fill('');
      await page.getByRole('button',{name:'全部标签',exact:true}).click();
      await page.screenshot({path:'output/tag-organization/dialog-'+width+'.png',fullPage:true});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const bounds=await page.getByRole('dialog').boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<=901);
      assert.deepEqual(errors,[]);
      console.log('Verified '+width+'px: existing suggestion flow includes locked corrections; search/select/confirm/cancel/reopen/undo; custom groups/covers preserved; unorganized, evidence, stale rejection and aliases.');
    } finally {await context.tracing.stop({path:'output/tag-organization/trace-'+width+'.zip'});await context.close();}
  }
  // Audit the current library through the pure proposal function only. Never apply it.
  const {buildTagOrganizationRows}=await server.ssrLoadModule('/src/features/library/utils/tagOrganization.ts');
  const library=JSON.parse(await readFile('release/win-unpacked/data/library/library.json','utf8'));
  const entries=JSON.parse(await readFile('release/win-unpacked/data/library/tag-lexicon.json','utf8'));
  const rows=buildTagOrganizationRows(library.items,entries);
  console.log('Read-only current-library preview:',JSON.stringify({works:library.items.length,tags:rows.length,suggested:rows.filter(r=>r.selected).length,pending:rows.filter(r=>r.status==='pending').length,noise:rows.filter(r=>r.status==='noise').length}));
} finally {await browser.close();await server.close();}
