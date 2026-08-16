// 六关各跑 90 秒真实节奏（不断转向、反复吃能量豆和幽灵），检查有没有幽灵
// 长时间困在原地。
//   用法: node test_no_stuck_ghost.mjs   （发现卡住就退出码 1）
//
// 为什么要有这一条：'幽灵定在那儿不动'是玩家一眼就能看见、却最难在代码里看
// 出来的一类故障。它的成因不止一种——贪心寻路撞进凹角、出巢时停在格子中间
// 拿不到新方向——共同点是"位置八秒不变"。与其逐个猜成因，不如直接盯住这个
// 现象本身。
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
/* 固定随机数：恐惧状态下的幽灵有 28% 概率随机选方向，不定住的话这个测试
   时灵时不灵——同一个 bug 跑十次可能只报一次，修没修好根本看不出来。
   种子写死，任何一次失败都能原样复现。 */
let __seed = Number(process.argv[2]) || 20260815;   // 可传参换种子，扫多条轨迹
Math.random = () => { __seed = (__seed * 1103515245 + 12345) & 0x7fffffff; return __seed / 0x7fffffff; };
const html=readFileSync('/Users/oliver/吃豆豆/v1-发布版/pacman_fragment.html','utf8');
let body=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')).trim()
  .replace(/^\(function\(\)\s*\{\s*(?:"use strict";|'use strict';)?/,'').replace(/\}\)\(\);?$/,'').trim();
const dir=mkdtempSync(join(tmpdir(),'st-')); const mp=join(dir,'c.mjs');
writeFileSync(mp,`export function createGame(env){
 const document=env.document,window=env.window,localStorage=env.localStorage,
   getComputedStyle=env.getComputedStyle,requestAnimationFrame=env.requestAnimationFrame,
   cancelAnimationFrame=env.cancelAnimationFrame,performance=env.performance;
${body}
 return { fullNewGame, resetLevel, update, startPowerMode, handleGhostCollisions, requestDir,
   get ghosts(){return ghosts;}, get player(){return player;},
   get gameState(){return gameState;}, set gameState(v){gameState=v;}, set level(v){level=v;} };\n}\n`);
const {installShim}=await import('/Users/oliver/吃豆豆/微信小游戏版/js/shim.js');
const shim=installShim({maze:fakeCanvas(),fx:fakeCanvas(1,1)});
const {createGame}=await import(mp);
const g=createGame(shim.env);

const WINDOW=8*60;      // 观察窗口 8 秒
const RADIUS=1.5;       // 8 秒里活动范围不超过 1.5 格就算卡住
const dirs=['left','up','right','down'];
let findings=[];
for(let L=1;L<=6;L++){
  g.fullNewGame(); g.level=L; g.resetLevel(false); g.gameState='playing';
  const hist=g.ghosts.map(()=>[]);
  for(let t=0;t<60*90;t++){        // 90 秒
    if(t%37===0) g.requestDir(dirs[(t/37|0)%4]);
    if(t%(60*11)===0 && t>0) g.startPowerMode();
    // 偶尔吃掉一只，制造 eaten 状态
    if(t%(60*13)===0 && t>0){
      const v=g.ghosts.find(x=>x.state==='frightened');
      if(v){ g.player.x=v.x; g.player.y=v.y; g.handleGhostCollisions(); }
    }
    g.update(1/60);
    if(g.gameState!=='playing') break;
    g.ghosts.forEach((gh,i)=>{
      hist[i].push({x:gh.x,y:gh.y,s:gh.state});
      if(hist[i].length>WINDOW) hist[i].shift();
      if(hist[i].length===WINDOW && t%30===0){
        const xs=hist[i].map(p=>p.x), ys=hist[i].map(p=>p.y);
        const span=Math.max(Math.max(...xs)-Math.min(...xs), Math.max(...ys)-Math.min(...ys));
        const states=[...new Set(hist[i].map(p=>p.s))];
        // 'house' 是设计好的停留，不算卡住
        if(span<RADIUS && !states.includes('house') && !states.includes('fused-hidden')){
          findings.push(`第${L}关 ${(t/60).toFixed(0)}s 幽灵#${i}(${gh.id}) 状态[${states}] 8秒只动了 ${span.toFixed(2)} 格 @(${gh.x.toFixed(1)},${gh.y.toFixed(1)})`);
          hist[i].length=0;
        }
      }
    });
  }
}
if(findings.length){ console.log('发现疑似卡住:'); findings.slice(0,25).forEach(f=>console.log('  '+f)); console.log(`共 ${findings.length} 条`); }
else console.log('六关各跑 90 秒（含反复吃幽灵），没有幽灵长时间困在原地。');
process.exit(findings.length ? 1 : 0);
