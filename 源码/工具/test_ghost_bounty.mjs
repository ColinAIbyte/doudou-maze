// 真实节奏下：吃一颗能量豆，能不能在幽灵复活之前把全场吃完拿到全灭奖励
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
const html=readFileSync(new URL('../pacman_fragment.html', import.meta.url),'utf8');
let body=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')).trim()
  .replace(/^\(function\(\)\s*\{\s*(?:"use strict";|'use strict';)?/,'').replace(/\}\)\(\);?$/,'').trim();
const dir=mkdtempSync(join(tmpdir(),'sw-')); const mp=join(dir,'c.mjs');
writeFileSync(mp,`export function createGame(env){
 const document=env.document,window=env.window,localStorage=env.localStorage,
   getComputedStyle=env.getComputedStyle,requestAnimationFrame=env.requestAnimationFrame,
   cancelAnimationFrame=env.cancelAnimationFrame,performance=env.performance;
${body}
 return { fullNewGame, resetLevel, update, startPowerMode, handleGhostCollisions,
   get ghosts(){return ghosts;}, get player(){return player;}, get score(){return score;},
   get gameState(){return gameState;}, set gameState(v){gameState=v;},
   get level(){return level;}, set level(v){level=v;},
   get sweeps(){return sweepsThisRun;}, get frightTimer(){return frightTimer;},
   get chain(){return ghostEatChain;} };\n}\n`);
const {installShim}=await import(new URL('../微信小游戏版/js/shim.js', import.meta.url));
const shim=installShim({maze:fakeCanvas(),fx:fakeCanvas(1,1)});
const {createGame}=await import(mp);
const g=createGame(shim.env);

console.log('每关：吃一颗能量豆后不停追幽灵，检查悬赏只数封顶 + 全灭奖励只发一次\n');
let bad=0;
for(let L=1;L<=6;L++){
  g.fullNewGame(); g.level=L; g.resetLevel(false); g.gameState='playing';
  // 先跑 3 秒让幽灵散开，更接近真实局面
  for(let i=0;i<180;i++) g.update(1/60);
  const before=g.sweeps;
  g.startPowerMode();
  const n=g.ghosts.length;
  let ate=0, t=0, maxChain=0, sweepCount=0, lastSweeps=g.sweeps;
  // 每帧瞬移到最近的可吃幽灵身上（上限＝玩家理论最快追击）
  while(t<600 && g.frightTimer>0){
    let tgt=null, bd=1e9;
    for(const gh of g.ghosts){
      if(gh.state==='eaten'||gh.state==='house'||gh.state==='exiting'||gh.state==='fused-hidden') continue;
      const d=Math.hypot(gh.x-g.player.x, gh.y-g.player.y);
      if(d<bd){bd=d;tgt=gh;}
    }
    if(tgt){ g.player.x=tgt.x; g.player.y=tgt.y; g.handleGhostCollisions(); }
    if(g.chain>maxChain) maxChain=g.chain;
    if(g.sweeps>lastSweeps){ sweepCount+=g.sweeps-lastSweeps; lastSweeps=g.sweeps; }
    g.update(1/60); t++;
  }
  ate=maxChain;
  const okChain = ate === n;
  const okSweep = sweepCount === 1;
  console.log(`第${L}关  幽灵 ${n} 只  一轮最多吃到 ${ate} 只 ${okChain?'✓':'✗ 应当正好 '+n}   全灭奖励发了 ${sweepCount} 次 ${okSweep?'✓':'✗ 应当正好 1 次'}`);
  if(!okChain||!okSweep) bad++;
}

console.log(bad ? `\n${bad} 关不对劲。` : '\n悬赏只数封顶正确，全灭奖励每颗豆只发一次。');
process.exit(bad?1:0);
