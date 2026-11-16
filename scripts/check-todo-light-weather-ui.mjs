import { createServer } from "vite";
import { pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const output = "output/playwright/todo-light-weather";
const cities = [
  { id: "1816670", name: "北京市", englishName: "Beijing", countryCode: "CN", region: "Beijing" },
  { id: "1808926", name: "杭州市", englishName: "Hangzhou", countryCode: "CN", region: "Zhejiang" },
  { id: "1811103", name: "佛山市", englishName: "Foshan", countryCode: "CN", region: "Guangdong" },
  { id: "3621889", name: "圣伊西德罗德埃尔赫内拉尔区", englishName: "San Isidro", countryCode: "CR", region: "San José" },
];
let weather;
let file;
let weatherCalls;
function reset() {
  weather = { schemaVersion: 1, promptHandled: false, enabled: false, city: null };
  weatherCalls = 0;
  const now = new Date();
  const day = [now.getFullYear(), String(now.getMonth()+1).padStart(2,"0"), String(now.getDate()).padStart(2,"0")].join("-");
  file = { kind: "suyan-todo-library", schemaVersion: 1, updatedAt: now.toISOString(), tasks: [
    { id: "task-0", title: "设计一张新的封面", projectId: "project", plannedDate: day, status: "in-progress", priority: "normal", progress: 25, linkedPromptIds: [], tagIds: ["创作"], orderKey: "0", createdAt: now.toISOString(), updatedAt: now.toISOString() },
  ], projects: [{ id: "project", name: "灵感实验室", archived: false, orderKey: "0", createdAt: now.toISOString(), updatedAt: now.toISOString() }], widgets: [] };
}
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {TodoWorkspace} from '/src/features/prompts/todos/components/TodoWorkspace.tsx';
import {WeatherSettingsDialog} from '/src/features/weather/components/WeatherSettingsPanel.tsx';
import {LocaleProvider} from '/src/components/LocaleProvider.tsx';
import {useLibraryStore} from '/src/features/library/store/useLibraryStore.ts';
import '/src/styles/tokens.css';
const invoke = (op, data) => fetch('/__qa/api', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op,data})}).then(r=>r.json());
window.suyanApi = {
 listPrompts: async()=>({ok:true,data:{schemaVersion:2,updatedAt:'',entries:[],categories:[]}}),
 readLibraryViewSettings: async()=>({ok:false,error:{message:'fixture'}}),
 listTodos: ()=>invoke('todos'), createTodoTask:input=>invoke('create',input), completeTodoTask:id=>invoke('complete',id), updateTodoTask:(id,patch)=>invoke('update',{id,patch}),replaceTodoLibrary:data=>invoke('replace',data),
 readWeatherSettings:()=>invoke('readWeather'), claimWeatherPrompt:()=>invoke('claimWeather'), saveWeatherSettings:data=>invoke('saveWeather',data), searchWeatherCities:query=>invoke('cities',query), readWeatherForecast:()=>invoke('forecast'),
 openExternalUrl:async()=>({ok:true,data:{opened:true}}),
};
function Fixture(){ const [settings,setSettings]=useState(false);return React.createElement(LocaleProvider,null,React.createElement('div',{className:'h-screen bg-background p-5 text-foreground'},React.createElement('div',{className:'flex h-full flex-col gap-4 rounded-2xl border border-border bg-panel p-6'},React.createElement('div',{className:'flex justify-end gap-3 text-xs'},React.createElement('button',{onClick:()=>setSettings(true)},'打开系统天气设置'),React.createElement('button',{onClick:()=>useLibraryStore.setState({language:'en-US'})},'English')),React.createElement('div',{className:'min-h-0 flex-1'},React.createElement(TodoWorkspace))),settings?React.createElement(WeatherSettingsDialog,{onClose:()=>setSettings(false)}):null));}
createRoot(document.getElementById('root')).render(React.createElement(Fixture));
</script></body></html>`;
const server = await createServer({server:{host:"127.0.0.1",port:5197,strictPort:true},plugins:[{name:"todo-weather-fixture",configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
  if(req.url === "/__qa/api"){
    let text="";for await(const chunk of req)text+=chunk;
    const {op,data}=JSON.parse(text);let result;
    if(op==="todos")result=file;
    else if(op==="readWeather")result=weather;
    else if(op==="claimWeather"){const showPrompt=!weather.promptHandled;weather={...weather,promptHandled:true};result={showPrompt,settings:weather};}
    else if(op==="saveWeather"){weather={schemaVersion:1,promptHandled:true,enabled:data.enabled,city:cities.find(c=>c.id===data.cityId)??null};result=weather;}
    else if(op==="cities")result=cities.filter(c=>!data||[c.name,c.englishName].some(v=>v.toLowerCase().includes(data.toLowerCase())));
    else if(op==="forecast"){weatherCalls++;result=weather.enabled?{cityId:weather.city.id,temperatureC:19,symbolCode:"partlycloudy_day",forecastAt:new Date().toISOString(),updatedAt:new Date().toISOString(),fetchedAt:new Date().toISOString(),nextRefreshAt:new Date(Date.now()+10800000).toISOString(),stale:false}:null;}
    else if(op==="replace"){file=data;result=file;}
    else if(op==="create"){const task={id:"task-"+file.tasks.length,status:"todo",priority:"normal",progress:0,linkedPromptIds:[],tagIds:[],orderKey:String(file.tasks.length),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),...data};file.tasks.push(task);result={task,library:file};}
    else if(op==="complete"||op==="update"){const id=op==="complete"?data:data.id;const index=file.tasks.findIndex(t=>t.id===id);file.tasks[index]={...file.tasks[index],...(op==="complete"?{status:"completed",progress:100,completedAt:new Date().toISOString()}:data.patch)};result={task:file.tasks[index],library:file};}
    else throw new Error("Unknown fixture API: "+op);
    res.setHeader("content-type","application/json");res.end(JSON.stringify({ok:true,data:result}));return;
  }
  if(req.url?.split("?")[0]!=="/__todo-weather")return next();
  res.setHeader("content-type","text/html;charset=utf-8");res.end(await vite.transformIndexHtml("/__todo-weather",html));
});}}]});
reset();await server.listen();await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.SUYAN_QA_BROWSER??"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",headless:true});
let checks=0;
try{
	for(const width of [1440,750,390]){
  reset();const context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(60000);const errors=[];page.on("pageerror",e=>errors.push(e.message));
  try{
   await page.goto("http://127.0.0.1:5197/__todo-weather",{waitUntil:"domcontentloaded"});
   await page.getByRole("dialog",{name:"设置天气提醒",exact:true}).waitFor();
   await page.getByRole("button",{name:"暂不设置",exact:true}).click();
   await page.reload();await page.getByRole("heading",{name:"今天，做点喜欢的事。",exact:true}).waitFor();
   assert.equal(await page.getByRole("dialog",{name:"设置天气提醒",exact:true}).count(),0);assert.equal(await page.getByRole("button",{name:"地区与天气",exact:true}).count(),0);assert.equal(weatherCalls,0);checks+=3;
   const quick=page.getByRole("textbox",{name:"快速新增事项",exact:true});await quick.fill("周末出去拍一组照片");await quick.press("Enter");await page.getByRole("button",{name:"周末出去拍一组照片",exact:true}).waitFor();assert.equal(file.tasks[1].plannedDate,file.tasks[0].plannedDate);checks++;
   await page.getByRole("button",{name:"完成事项：周末出去拍一组照片",exact:true}).click();await page.getByRole("button",{name:"撤销上一步待办操作",exact:true}).click();await page.getByRole("button",{name:"周末出去拍一组照片",exact:true}).waitFor();checks++;
   await page.getByRole("tab",{name:/全部事项/}).click();await page.getByRole("checkbox",{name:"全选当前事项",exact:true}).check();await page.getByRole("button",{name:"导出所选",exact:true}).waitFor();checks++;
   await page.getByRole("tab",{name:/今天/}).click();
   await page.getByRole("button",{name:"打开系统天气设置",exact:true}).click();let dialog=page.getByRole("dialog",{name:"设置地区与天气",exact:true});await dialog.waitFor();
   await dialog.getByRole("textbox",{name:"选择所在城市",exact:true}).fill("hangzhou");await dialog.getByRole("button",{name:/杭州市 Hangzhou/}).click();await dialog.getByRole("button",{name:"保存设置",exact:true}).click();
   await page.getByRole("button",{name:"地区与天气",exact:true}).getByText("杭州市",{exact:true}).waitFor();await page.getByText("19°C · 晴间多云",{exact:true}).waitFor();assert.equal(weather.city.id,"1808926");checks+=2;
   await page.getByRole("button",{name:"地区与天气",exact:true}).click();await page.getByRole("dialog",{name:"天气详情",exact:true}).getByText("MET Norway",{exact:true}).waitFor();checks++;await page.getByRole("button",{name:"地区与天气",exact:true}).click();
   await page.getByRole("button",{name:"打开系统天气设置",exact:true}).click();dialog=page.getByRole("dialog",{name:"设置地区与天气",exact:true});await dialog.getByRole("textbox",{name:"选择所在城市",exact:true}).fill("佛山");await dialog.getByRole("button",{name:/佛山市 Foshan/}).waitFor();await dialog.getByRole("button",{name:/佛山市 Foshan/}).click();await dialog.getByRole("button",{name:"保存设置",exact:true}).click();await page.getByRole("button",{name:"地区与天气",exact:true}).getByText("佛山市",{exact:true}).waitFor();assert.equal(weather.city.id,"1811103");checks++;
   await page.getByRole("button",{name:"打开系统天气设置",exact:true}).click();dialog=page.getByRole("dialog",{name:"设置地区与天气",exact:true});await dialog.getByRole("textbox",{name:"选择所在城市",exact:true}).fill("圣伊西德罗德埃尔赫内拉尔区");const longCity="圣伊西德罗德埃尔赫内拉尔区";const longOption=dialog.getByRole("button",{name:/圣伊西德罗德埃尔赫内拉尔区 San Isidro/});await longOption.waitFor();const resultLabel=await longOption.getByText(longCity,{exact:true}).evaluate(element=>{const style=getComputedStyle(element);return {whiteSpace:style.whiteSpace,textOverflow:style.textOverflow,scrollWidth:element.scrollWidth,clientWidth:element.clientWidth};});assert.notEqual(resultLabel.whiteSpace,"nowrap");assert.notEqual(resultLabel.textOverflow,"ellipsis");assert.ok(resultLabel.scrollWidth<=resultLabel.clientWidth);await longOption.click();await dialog.getByRole("button",{name:"保存设置",exact:true}).click();const weatherButton=page.getByRole("button",{name:"地区与天气",exact:true});const chipLabel=weatherButton.getByText(longCity,{exact:true});await chipLabel.waitFor();const chipStyle=await chipLabel.evaluate(element=>{const style=getComputedStyle(element);return {whiteSpace:style.whiteSpace,textOverflow:style.textOverflow,scrollWidth:element.scrollWidth,clientWidth:element.clientWidth};});assert.notEqual(chipStyle.whiteSpace,"nowrap");assert.notEqual(chipStyle.textOverflow,"ellipsis");assert.ok(chipStyle.scrollWidth<=chipStyle.clientWidth);assert.equal(weather.city.id,"3621889");checks+=2;
   await page.getByRole("button",{name:"地区与天气",exact:true}).click();
   await page.getByRole("button",{name:"更改地区与天气",exact:true}).click();dialog=page.getByRole("dialog",{name:"设置地区与天气",exact:true});await dialog.getByRole("textbox",{name:"选择所在城市",exact:true}).fill("beijing");await dialog.getByRole("button",{name:/北京市 Beijing/}).click();await dialog.getByRole("button",{name:"保存设置",exact:true}).click();await page.getByRole("button",{name:"地区与天气",exact:true}).getByText("北京市",{exact:true}).waitFor();checks++;
   await page.getByRole("button",{name:"打开系统天气设置",exact:true}).click();dialog=page.getByRole("dialog",{name:"设置地区与天气",exact:true});await dialog.getByRole("checkbox",{name:/在待办页显示天气/}).uncheck();await dialog.getByRole("button",{name:"保存设置",exact:true}).click();await page.getByRole("button",{name:"地区与天气",exact:true}).waitFor({state:"detached"});assert.equal(weather.city.id,"1816670");checks++;
   await page.getByRole("button",{name:"打开系统天气设置",exact:true}).click();dialog=page.getByRole("dialog",{name:"设置地区与天气",exact:true});await dialog.getByRole("checkbox",{name:/在待办页显示天气/}).check();await dialog.getByRole("button",{name:"保存设置",exact:true}).click();await page.getByRole("button",{name:"地区与天气",exact:true}).waitFor();checks++;
   await page.screenshot({path:output+"/todo-"+width+".png",fullPage:true,timeout:15000});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);checks++;
   await page.getByRole("button",{name:"English",exact:true}).click();await page.getByRole("heading",{name:"Make room for what you love.",exact:true}).waitFor();await page.getByRole("button",{name:"Location & Weather",exact:true}).waitFor();checks++;
   assert.deepEqual(errors,[]);checks++;
   console.log("PASS: today capture/completion/undo/batch, weather skip/reload/global settings/city change/toggle/attribution, English, overflow; width="+width);
  }finally{await context.close();}
 }
 reset();
 const firstContext=await browser.newContext({viewport:{width:900,height:900}});const firstPage=await firstContext.newPage();firstPage.setDefaultTimeout(15000);
 try {
  await firstPage.goto("http://127.0.0.1:5197/__todo-weather",{waitUntil:"domcontentloaded",timeout:60000});
  await firstPage.getByRole("button",{name:"选择城市",exact:true}).click();
  await firstPage.getByRole("dialog",{name:"设置地区与天气",exact:true}).getByRole("button",{name:"取消",exact:true}).click();
  await firstPage.reload();await firstPage.getByRole("heading",{name:"今天，做点喜欢的事。",exact:true}).waitFor();
  assert.equal(await firstPage.getByRole("dialog",{name:"设置天气提醒",exact:true}).count(),0);assert.equal(weather.enabled,false);assert.equal(weatherCalls,0);checks+=3;
 }finally{await firstContext.close();}
 reset();
 const escapeContext=await browser.newContext({viewport:{width:900,height:900}});const escapePage=await escapeContext.newPage();
 try {
  await escapePage.goto("http://127.0.0.1:5197/__todo-weather",{waitUntil:"domcontentloaded",timeout:60000});
  await escapePage.getByRole("dialog",{name:"设置天气提醒",exact:true}).waitFor();await escapePage.keyboard.press("Escape");
  await escapePage.reload();await escapePage.getByRole("heading",{name:"今天，做点喜欢的事。",exact:true}).waitFor();
  assert.equal(await escapePage.getByRole("dialog",{name:"设置天气提醒",exact:true}).count(),0);checks++;
 }finally{await escapeContext.close();}
 console.log("PASS: "+checks+" UI checks");
}finally{await browser.close();await server.close();}
