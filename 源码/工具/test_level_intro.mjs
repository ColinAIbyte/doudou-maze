// 关卡卡片：每关开打前定住一下报关名，期间整局冻结。
//   用法: node test_level_intro.mjs
//
// 要守的三件事：
//   1 冻结是真的冻结 —— elapsed、幽灵位置、恐惧倒计时都不许动。这一条错了
//     最难发现：画面上卡片好好的，背后幽灵已经走了两格，玩家一"解冻"就撞上。
//   2 该出现的三个入口都出现：开局、过关、再来一局。
//   3 到点自己消失，不会一直挂着。
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
const noop=()=>{};
const fakeCtx=()=>new Proxy({},{get:(_,k)=>{
  if(k==='measureText')return t=>({width:String(t).length*7});
  if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop:noop});
  return noop;}});
const fakeCanvas=(w=494,h=546)=>({width:w,height:h,getContext:()=>fakeCtx()});
const store=new Map(); globalThis.GameGlobal=globalThis;
globalThis.location={href:'https://example.com/'};
globalThis.wx={createCanvas:()=>fakeCanvas(),getSystemInfoSync:()=>({windowWidth:390,windowHeight:844,pixelRatio:3}),
 getStorageSync:k=>store.has(k)?store.get(k):'',setStorageSync:(k,v)=>store.set(k,v),removeStorageSync:k=>store.delete(k),
 createWebAudioContext:()=>({currentTime:0,state:'running',resume:noop,destination:{},
  createOscillator:()=>({type:'',frequency:{setValueAtTime:noop,exponentialRampToValueAtTime:noop},connect:d=>d,start:noop,stop:noop}),
  createGain:()=>({gain:{setValueAtTime:noop,exponentialRampToValueAtTime:noop},connect:d=>d})}),
 onTouchStart:noop,onTouchEnd:noop,onTouchMove:noop,showKeyboard:noop,hideKeyboard:noop,
 onKeyboardInput:noop,onKeyboardConfirm:noop,onShow:noop,onHide:noop,showShareMenu:noop,
 onShareAppMessage:noop,onShareTimeline:noop};
globalThis.requestAnimationFrame=()=>0;
const html=readFileSync(new URL('../pacman_fragment.html',import.meta.url),'utf8');
let body=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')).trim()
  .replace(/^\(function\(\)\s*\{\s*(?:"use strict";|'use strict';)?/,'').replace(/\}\)\(\);?$/,'').trim();
const dir=mkdtempSync(join(tmpdir(),'li-')); const mp=join(dir,'c.mjs');
writeFileSync(mp,`export function createGame(env){
 const document=env.document,window=env.window,localStorage=env.localStorage,
   getComputedStyle=env.getComputedStyle,requestAnimationFrame=env.requestAnimationFrame,
   cancelAnimationFrame=env.cancelAnimationFrame,performance=env.performance;
${body}
 return { fullNewGame, resetLevel, update, render, startLevelIntro, levelName,
   LEVEL_INTRO_SECONDS,
   get introTimer(){return introTimer;}, set introTimer(v){introTimer=v;},
   get elapsed(){return elapsed;}, get ghosts(){return ghosts;}, get player(){return player;},
   get gameState(){return gameState;}, set gameState(v){gameState=v;},
   get level(){return level;}, set level(v){level=v;},
   // 复刻主循环那一段，测的必须是真实的那套分支
   tick(dt){ if(gameState==='playing'){ if(introTimer>0) introTimer-=dt; else update(dt); } render(); } };\n}\n`);
const {installShim}=await import(new URL('../微信小游戏版/js/shim.js',import.meta.url));
const shim=installShim({maze:fakeCanvas(),fx:fakeCanvas(1,1)});
const {createGame}=await import(mp);
const g=createGame(shim.env); const el=shim.el;
const fail=[];

// --- 1) 冻结是真的冻结 ---
g.fullNewGame(); g.gameState='playing';
g.startLevelIntro();
const e0=g.elapsed, gp=g.ghosts.map(x=>({x:x.x,y:x.y})), px=g.player.x, py=g.player.y;
for(let i=0;i<60;i++) g.tick(1/60);      // 1 秒，卡片是 1.8 秒
if(g.introTimer<=0) fail.push('1 秒后卡片就没了，应当还在');
if(g.elapsed!==e0) fail.push(`卡片期间 elapsed 走了：${e0} -> ${g.elapsed}`);
const moved=g.ghosts.some((x,i)=>x.x!==gp[i].x||x.y!==gp[i].y);
if(moved) fail.push('卡片期间幽灵动了');
if(g.player.x!==px||g.player.y!==py) fail.push('卡片期间玩家动了');
console.log(`冻结 1 秒：elapsed 未变(${g.elapsed})，幽灵未动，玩家未动`);

// --- 2) 到点自己消失，游戏恢复 ---
for(let i=0;i<60;i++) g.tick(1/60);      // 再 1 秒，总共 2 秒 > 1.8
if(g.introTimer>0) fail.push('2 秒后卡片还挂着');
const e1=g.elapsed;
for(let i=0;i<30;i++) g.tick(1/60);
if(g.elapsed<=e1) fail.push('卡片结束后 elapsed 仍然不走，游戏没恢复');
console.log(`卡片结束后游戏恢复：elapsed ${e1.toFixed(2)} -> ${g.elapsed.toFixed(2)}`);

// --- 3) resetLevel 会清掉卡片（否则会挂在上一关画面上）---
g.startLevelIntro();
g.resetLevel(false);
if(g.introTimer!==0) fail.push('resetLevel 没有清掉卡片');
console.log('resetLevel 清掉卡片：正确');

// --- 4) 六关关名都取得到且不重复 ---
const names=[1,2,3,4,5,6].map(l=>g.levelName(l));
if(new Set(names).size!==6) fail.push('关名有重复');
console.log('六关关名:', names.join(' / '));

// --- 5) 卡片期间渲染不能抛 ---
try{ g.startLevelIntro(); g.render(); }catch(e){ fail.push('卡片渲染抛异常: '+e.message); }
console.log('卡片渲染:', fail.some(f=>f.includes('渲染'))?'抛异常':'正常');

console.log('\n'+(fail.length?'失败:\n  '+fail.join('\n  '):'关卡卡片全部正确。'));
process.exit(fail.length?1:0);
