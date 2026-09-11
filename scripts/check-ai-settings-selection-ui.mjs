import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AiRulesSection } from '/src/features/library/components/AiRulesSection.tsx';
import { useAiSettings } from '/src/features/library/components/useAiSettings.ts';
import { aiFeatureActions } from '/src/features/library/types/ai.ts';
import '/src/styles/tokens.css';
const capabilities=['text','vision','image-generation'];
const profiles=Array.from({length:12},(_,i)=>({id:'p'+i,name:'测试服务商 '+i,enabled:true,baseUrl:'https://example.invalid/v1',hasApiKey:true,apiKeyPreview:'***',model:'default-'+i,models:[{id:'first-'+i,label:'首个模型 '+i,capabilities},{id:'default-'+i,label:'默认模型 '+i,capabilities},{id:'chosen-'+i,label:'已选模型 '+i,capabilities}]}));
const actionPreferences=Object.fromEntries(aiFeatureActions.map((action,i)=>[action,{profileId:'p'+(i%12),modelId:'chosen-'+(i%12),rules:[{id:'rule-'+action,label:'专用规则 '+action,instructions:'仅用于测试 '+action}],rulePresetIds:['rule-'+action]}]));
actionPreferences['image-category'].profileId='p11';
actionPreferences['image-category'].modelId='chosen-11';
let saved=JSON.parse(JSON.stringify({activeProfileId:'p0',actionPreferences,recognitionSourcePreferences:{category:'image',tags:'prompt'},profiles}));
window.expectedPreferences=actionPreferences;
window.saveCount=0;
window.failSourceSave=false;
function Rules({settings,onUpdate}) {
  const api=useAiSettings({settings,isBusy:false,onClose:()=>{},onSave:async payload=>{window.saveCount++;saved={...saved,...payload,profiles:payload.profiles.map(p=>({...p,hasApiKey:true,apiKeyPreview:'***'}))};onUpdate(saved);return true;},onSaveAiRecognitionSourcePreferences:async preferences=>{if(window.failSourceSave)return false;saved={...saved,recognitionSourcePreferences:preferences};onUpdate(saved);return true;},onTest:async()=>({ok:true,message:''}),onListModels:async()=>[],onCopyApiKey:async()=>false,onReadApiKey:async()=>null});
  return React.createElement(AiRulesSection,{api});
}
function Fixture(){
  const [settings,setSettings]=useState(saved);
  const [epoch,setEpoch]=useState(0);
  window.reopen=()=>{setSettings(JSON.parse(JSON.stringify(saved)));setEpoch(v=>v+1);};
  return React.createElement('main',{style:{padding:24}},React.createElement(Rules,{key:epoch,settings,onUpdate:setSettings}));
}
createRoot(document.getElementById('root')).render(React.createElement(Fixture));
</script></body></html>`;
const server = await createServer({ server:{host:'127.0.0.1',port:0}, plugins:[{name:'ai-selection-fixture',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(req.url?.split('?')[0]!=='/__ai-selection')return next();res.setHeader('content-type','text/html; charset=utf-8');res.end(await vite.transformIndexHtml('/__ai-selection',html));});}}] });
await server.listen();
await mkdir('output/ai-settings-selection',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  for(const width of [1400,640]) {
    const context=await browser.newContext({viewport:{width,height:1000}});
    await context.tracing.start({screenshots:true,snapshots:true});
    const page=await context.newPage();
    page.setDefaultTimeout(10000);
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    try {
      await page.goto(server.resolvedUrls.local[0]+'__ai-selection',{waitUntil:'domcontentloaded'});
      const entry=id=>page.locator('[data-ai-action-entry-id="'+id+'"]');
      const provider=page.locator('button[aria-haspopup="listbox"]');
      const activeSource=name=>page.getByRole('button',{name:name+' '+(name==='从效果图分析'?'图片':'文本'),exact:true,pressed:true});
      const verifyAction=async action=>{
        const expected=await page.evaluate(action=>window.expectedPreferences[action],action);
        await page.waitForFunction(value=>document.querySelector('select')?.value===value,expected.modelId);
        await page.getByRole('button',{name:'停用规则 专用规则 '+action,exact:true,pressed:true}).waitFor();
        assert.equal(await provider.innerText(),'测试服务商 '+expected.profileId.slice(1));
      };
      await entry('category-recognition').click();
      await activeSource('从效果图分析').waitFor();
      await verifyAction('image-category');
      // Opening a long provider menu must put its saved selection in the visible scroll region.
      for(let open=0;open<2;open++) {
        await provider.click();
        const selected=page.getByRole('listbox').getByRole('option',{selected:true});
        await selected.waitFor();
        await page.waitForFunction(()=>{const menu=document.querySelector('[role="listbox"]');const option=menu?.querySelector('[aria-selected="true"]');if(!option)return false;const a=menu.getBoundingClientRect(),b=option.getBoundingClientRect();return menu.scrollTop>0&&b.top>=a.top&&b.bottom<=a.bottom;});
        await selected.click();
        await verifyAction('image-category');
      }
      await entry('tag-recognition').click();
      await activeSource('从提示词分析').waitFor();
      await verifyAction('prompt-tags');
      await page.getByRole('button',{name:'将从效果图分析设为默认识别来源',exact:true}).click();
      await activeSource('从效果图分析').waitFor();
      await verifyAction('image-tags');
      // Browsing an alternate source must not rewrite the saved default.
      await page.getByRole('button',{name:'从提示词分析 文本',exact:true}).click();
      await verifyAction('prompt-tags');
      await page.getByRole('button',{name:'从效果图分析已是默认识别来源',exact:true}).click();
      await activeSource('从效果图分析').waitFor();
      for(const id of ['prompt-optimization','prompt-translation','image-reverse','image-generation']) {
        await entry(id).click();
        await verifyAction(id);
        await entry('tag-recognition').click();
        await activeSource('从效果图分析').waitFor();
        await verifyAction('image-tags');
      }
      // Close/reopen uses a fresh hook and a JSON round-trip of the saved fixture.
      await page.evaluate(()=>window.reopen());
      await entry('category-recognition').click();
      await activeSource('从效果图分析').waitFor();
      await verifyAction('image-category');
      await entry('tag-recognition').click();
      await activeSource('从效果图分析').waitFor();
      await verifyAction('image-tags');
      // Failed default saves roll back the star and the next entry's source.
      await page.evaluate(()=>{window.failSourceSave=true;});
      await page.getByRole('button',{name:'将从提示词分析设为默认识别来源',exact:true}).click();
      await page.getByRole('button',{name:'从效果图分析已是默认识别来源',exact:true}).waitFor();
      await entry('image-reverse').click();
      await entry('tag-recognition').click();
      await activeSource('从效果图分析').waitFor();
      assert.equal(await page.evaluate(()=>window.saveCount),0,'Navigation must not alter model settings');
      // Switching providers chooses that provider's compatible default, not its first model.
      await provider.click();
      await page.getByRole('option',{name:'测试服务商 10 3 个适用模型',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('select')?.value==='default-10');
      await page.waitForFunction(()=>window.saveCount>0);
      await page.evaluate(()=>window.reopen());
      await entry('tag-recognition').click();
      await page.waitForFunction(()=>document.querySelector('select')?.value==='default-10');
      await page.screenshot({path:'output/ai-settings-selection/settings-'+width+'.png',fullPage:true});
      assert.deepEqual(errors,[]);
      console.log('Verified '+width+'px: source defaults, every action, models/rules, menu position, remount and save rollback.');
    } finally {
      await context.tracing.stop({path:'output/ai-settings-selection/trace-'+width+'.zip'});
      await context.close();
    }
  }
} finally {await browser.close();await server.close();}
