// 乱序压力测试：随机操作几万帧，检查有没有任何时刻违反基本约束。
//   用法: node test_chaos.mjs [种子]
//
// 前面那些测试都是"走正常流程看结果对不对"。这个反过来：不管结果，只盯**不变量**
// ——分数不该倒退、坐标不该变成 NaN、状态只能是那几个、幽灵不该跑出地图。
// 玩家真实的操作序列是没有章法的（暂停到一半开说明、结算页乱点、连着重开
// 十局），这类顺序组合手工是穷举不完的，只能靠随机跑量。
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

let __seed = Number(process.argv[2]) || 424242;
Math.random = () => { __seed = (__seed*1103515245 + 12345) & 0x7fffffff; return __seed/0x7fffffff; };
const rnd = n => Math.floor(Math.random()*n);

const html=readFileSync(new URL('../pacman_fragment.html',import.meta.url),'utf8');
let body=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')).trim()
  .replace(/^\(function\(\)\s*\{\s*(?:"use strict";|'use strict';)?/,'').replace(/\}\)\(\);?$/,'').trim();
const dir=mkdtempSync(join(tmpdir(),'ch-')); const mp=join(dir,'c.mjs');
writeFileSync(mp,`export function createGame(env){
 const document=env.document,window=env.window,localStorage=env.localStorage,
   getComputedStyle=env.getComputedStyle,requestAnimationFrame=env.requestAnimationFrame,
   cancelAnimationFrame=env.cancelAnimationFrame,performance=env.performance;
${body}
 return { fullNewGame, endGame, update, render, requestDir, togglePause, openHelp, closeHelp,
   startPowerMode, handleGhostCollisions, resetLevel, commitName,
   COLS, ROWS, MAX_LEVEL,
   get score(){return score;}, get lives(){return lives;}, get level(){return level;},
   get gameState(){return gameState;}, set gameState(v){gameState=v;},
   set level(v){level=v;},
   get ghosts(){return ghosts;}, get player(){return player;},
   get pelletsLeft(){return pelletsLeft;}, get combo(){return combo;},
   get frightTimer(){return frightTimer;} };\n}\n`);
const {installShim}=await import(new URL('../../微信小游戏版/js/shim.js',import.meta.url));
const shim=installShim({maze:fakeCanvas(),fx:fakeCanvas(1,1)});
const {createGame}=await import(mp);
const g=createGame(shim.env); const el=shim.el;

const VALID_STATE = new Set(['ready','playing','paused','over']);
const VALID_GHOST = new Set(['chase','scatter','frightened','eaten','house','exiting','fused-hidden']);
const dirs=['left','right','up','down'];
const problems=[];
const seen=new Set();
function flag(msg){ if(seen.has(msg)) return; seen.add(msg); problems.push(msg); }

g.fullNewGame(); g.gameState='playing';
let prevScore = g.score, prevLevel = g.level, restarts = 0;
const levelsSeen = new Set();

const FRAMES = 120000;
for(let t=0; t<FRAMES; t++){
  const r = rnd(1000);
  if (r < 40) g.requestDir(dirs[rnd(4)]);
  else if (r === 100) { try{ g.togglePause(); }catch(e){ flag('togglePause 抛异常: '+e.message); } }
  else if (r === 101) { try{ g.openHelp(); }catch(e){ flag('openHelp 抛异常: '+e.message); } }
  else if (r === 102) { try{ g.closeHelp(); }catch(e){ flag('closeHelp 抛异常: '+e.message); } }
  else if (r === 103) { try{ g.startPowerMode(); }catch(e){ flag('startPowerMode 抛异常: '+e.message); } }
  else if (r === 104) {
    // 随机撞一只可吃的幽灵
    const v=g.ghosts.find(x=>x.state==='frightened');
    if(v){ g.player.x=v.x; g.player.y=v.y; try{ g.handleGhostCollisions(); }catch(e){ flag('吃幽灵抛异常: '+e.message); } }
  }
  else if (r === 106){
    /* 随机跳关。不加这条的话，随机乱走的"玩家"永远清不掉第一关的 175 颗豆子，
       后五关和通关那条路一帧都跑不到 —— 而地图不同、幽灵数不同、恐惧时长不同，
       恰恰是这些差异最容易藏问题。 */
    try{ g.level = 1 + rnd(g.MAX_LEVEL); g.resetLevel(false); g.gameState='playing'; prevScore=g.score; prevLevel=g.level; }
    catch(e){ flag('跳关抛异常: '+e.message); }
  }
  else if (r === 107){
    try{ g.endGame(rnd(2)===0); }catch(e){ flag('endGame 抛异常: '+e.message); }
  }
  else if (r === 105 && g.gameState==='over'){
    try{ g.fullNewGame(); g.gameState='playing'; restarts++; prevScore=0; prevLevel=1; }
    catch(e){ flag('重开抛异常: '+e.message); }
  }

  if (g.gameState==='playing'){
    try { g.update(1/60); } catch(e){ flag('update 抛异常: '+e.message+' @frame '+t); break; }
  }
  try { g.render(); } catch(e){ flag('render 抛异常: '+e.message+' @frame '+t); break; }

  // ---- 不变量 ----
  if (!VALID_STATE.has(g.gameState)) flag('非法 gameState: '+g.gameState);
  if (!Number.isFinite(g.score)) flag('score 变成了 '+g.score);
  if (!Number.isFinite(g.player.x)||!Number.isFinite(g.player.y)) flag('玩家坐标 NaN');
  if (!Number.isFinite(g.combo)) flag('combo NaN');
  if (g.pelletsLeft < 0) flag('pelletsLeft 变负: '+g.pelletsLeft);
  if (g.lives < 0) flag('lives 变负: '+g.lives);
  if (g.player.x < -1 || g.player.x > g.COLS || g.player.y < -1 || g.player.y > g.ROWS)
    flag(`玩家跑出地图 (${g.player.x.toFixed(1)},${g.player.y.toFixed(1)})`);
  if (g.gameState==='playing' && g.level===prevLevel && g.score < prevScore)
    flag(`分数倒退 ${prevScore} -> ${g.score}`);
  if (g.gameState==='playing'){ prevScore = g.score; prevLevel = g.level; levelsSeen.add(g.level); }
  for (const gh of g.ghosts){
    if (!VALID_GHOST.has(gh.state)) flag('非法幽灵状态: '+gh.state);
    if (!Number.isFinite(gh.x)||!Number.isFinite(gh.y)) flag('幽灵坐标 NaN ('+gh.id+' '+gh.state+')');
    if (gh.x < -1 || gh.x > g.COLS || gh.y < -1 || gh.y > g.ROWS)
      flag(`幽灵跑出地图 ${gh.id} (${gh.x.toFixed(1)},${gh.y.toFixed(1)}) ${gh.state}`);
  }
}

console.log(`种子 ${Number(process.argv[2])||424242}：跑了 ${FRAMES} 帧，重开 ${restarts} 局，覆盖关卡 ${[...levelsSeen].sort().join(',')}`);
if(problems.length){ console.log('\n发现问题:'); problems.forEach(p=>console.log('  ✗ '+p)); }
else console.log('所有不变量都成立。');
process.exit(problems.length?1:0);
