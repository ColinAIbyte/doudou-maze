// 暂停必须冻住**一切**倒计时；死亡必须给出可感知的停顿。
//   用法: node test_pause_death.mjs
//
// 暂停这条最容易假成立：画面停了不代表状态停了。恐惧倒计时、连击窗口、
// 幽灵复活计时只要有一个还在偷偷走，玩家回来就会发现"能量豆没了"或者
// "连击断了"，而他全程不在场。切标签自动暂停更是如此——不能指望浏览器
// 节流 rAF，各家策略不一致，有的只降到 1Hz，游戏会在后台慢动作前进。
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
const dir=mkdtempSync(join(tmpdir(),'pd-')); const mp=join(dir,'c.mjs');
writeFileSync(mp,`export function createGame(env){
 const document=env.document,window=env.window,localStorage=env.localStorage,
   getComputedStyle=env.getComputedStyle,requestAnimationFrame=env.requestAnimationFrame,
   cancelAnimationFrame=env.cancelAnimationFrame,performance=env.performance;
${body}
 return { fullNewGame, resetLevel, update, render, togglePause, startPowerMode, addPelletScore,
   loseLife, DEATH_PAUSE_SECONDS,
   get deathPause(){return deathPause;}, get deathFlash(){return deathFlash;},
   get elapsed(){return elapsed;}, get frightTimer(){return frightTimer;},
   get comboTimer(){return comboTimer;}, get combo(){return combo;},
   get ghosts(){return ghosts;}, get player(){return player;}, get lives(){return lives;},
   get gameState(){return gameState;}, set gameState(v){gameState=v;}, set level(v){level=v;},
   // 直接用游戏自己的帧函数，**不再手抄一份** —— 抄件测不出真实分支被删。
   tick: stepFrame };\n}\n`);
const {installShim}=await import(new URL('../微信小游戏版/js/shim.js',import.meta.url));
const shim=installShim({maze:fakeCanvas(),fx:fakeCanvas(1,1)});
const {createGame}=await import(mp);
const g=createGame(shim.env); const el=shim.el; const fail=[];

// —— 暂停要冻住一切 ——
g.fullNewGame(); g.level=1; g.resetLevel(false); g.gameState='playing';
for(let i=0;i<180;i++) g.tick(1/60);          // 跑三秒，让各种状态活起来
g.startPowerMode();
for(let i=0;i<8;i++) g.addPelletScore(15);
for(let i=0;i<30;i++) g.tick(1/60);
const snap = { elapsed:g.elapsed, fright:g.frightTimer, comboT:g.comboTimer, combo:g.combo,
               ghosts:g.ghosts.map(x=>x.x+','+x.y), px:g.player.x, py:g.player.y };
g.togglePause();
for(let i=0;i<60*5;i++) g.tick(1/60);         // 暂停中干等五秒
const drift = {
  elapsed:+(g.elapsed-snap.elapsed).toFixed(4),
  恐惧:+(g.frightTimer-snap.fright).toFixed(4),
  连击窗口:+(g.comboTimer-snap.comboT).toFixed(4),
  连击:g.combo-snap.combo,
  幽灵移动:g.ghosts.filter((x,i)=>x.x+','+x.y!==snap.ghosts[i]).length,
  玩家移动:+(Math.abs(g.player.x-snap.px)+Math.abs(g.player.y-snap.py)).toFixed(4),
};
console.log('暂停 5 秒后各项漂移：', JSON.stringify(drift));
for(const [k,v] of Object.entries(drift)) if(v!==0) fail.push(`暂停期间「${k}」还在走（${v}）`);
g.togglePause();
const before=g.elapsed;
for(let i=0;i<30;i++) g.tick(1/60);
if(g.elapsed<=before) fail.push('恢复之后游戏没有继续');
else console.log('恢复后继续推进 ✓');

// —— 死亡要定住 ——
g.fullNewGame(); g.level=1; g.resetLevel(false); g.gameState='playing';
for(let i=0;i<60;i++) g.tick(1/60);
const lives0=g.lives;
g.loseLife();
if(g.deathPause<=0) fail.push('死亡没有设置定格时间');
if(g.deathFlash<=0) fail.push('死亡没有红闪');
console.log(`死亡：定格 ${g.deathPause.toFixed(2)}s，红闪 ${g.deathFlash.toFixed(2)}s，命 ${lives0}→${g.lives}`);
const gp0=g.ghosts.map(x=>x.x+','+x.y);
const e0=g.elapsed;
for(let i=0;i<Math.floor(g.DEATH_PAUSE_SECONDS*60)-4;i++) g.tick(1/60);
const movedG=g.ghosts.filter((x,i)=>x.x+','+x.y!==gp0[i]).length;
console.log(`定格期间：幽灵移动 ${movedG} 只，elapsed 走了 ${(g.elapsed-e0).toFixed(3)}s`);
if(movedG>0) fail.push('死亡定格期间幽灵还在动 —— 复活即被贴脸');
if(g.elapsed!==e0) fail.push('死亡定格期间 elapsed 还在走');
for(let i=0;i<30;i++) g.tick(1/60);
if(g.elapsed<=e0) fail.push('定格结束后游戏没恢复');
else console.log('定格结束后恢复 ✓');

console.log('\n'+(fail.length?'失败:\n  '+fail.join('\n  '):'暂停冻结与死亡定格都正确。'));
process.exit(fail.length?1:0);
