// 把眼睛放在每一关的每一个可走格子上，看它能不能自己走回老巢。
//   用法: node test_eyes_home.mjs   （回不了家就退出码 1）
//
// 为什么要全格子扫：这个 bug 藏了很久，因为第四、五关一个坏格子都没有，
// 随手试几下正好试不出来，而第二关有 77% 的格子是坏的。抽样在这种分布上
// 完全不可靠——1204 个格子跑一遍也就几秒，那就全扫。
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
const html=readFileSync('/Users/oliver/吃豆豆/v1-发布版/pacman_fragment.html','utf8');
let body=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')).trim()
  .replace(/^\(function\(\)\s*\{\s*(?:"use strict";|'use strict';)?/,'').replace(/\}\)\(\);?$/,'').trim();
const dir=mkdtempSync(join(tmpdir(),'ey-')); const mp=join(dir,'c.mjs');
writeFileSync(mp,`export function createGame(env){
 const document=env.document,window=env.window,localStorage=env.localStorage,
   getComputedStyle=env.getComputedStyle,requestAnimationFrame=env.requestAnimationFrame,
   cancelAnimationFrame=env.cancelAnimationFrame,performance=env.performance;
${body}
 return { fullNewGame, resetLevel, update, ghosts, get grid(){return grid;}, COLS, ROWS,
   HOUSE_EXIT_TILE, HOUSE_DOOR, get gameState(){return gameState;}, set gameState(v){gameState=v;},
   get level(){return level;}, set level(v){level=v;}, get player(){return player;},
   get ghostsArr(){return ghosts;}, tileAt };\n}\n`);
const {installShim}=await import('/Users/oliver/吃豆豆/微信小游戏版/js/shim.js');
const shim=installShim({maze:fakeCanvas(),fx:fakeCanvas(1,1)});
const {createGame}=await import(mp);
const g=createGame(shim.env);

const WALKABLE = t => t!=='#';
let grandTotal=0, grandStuck=0;
for(let L=1;L<=6;L++){
  g.fullNewGame(); g.level=L; g.resetLevel(false); g.gameState='playing';
  const grid=g.grid, COLS=g.COLS, ROWS=g.ROWS;
  // 把玩家挪到角落，别干扰
  g.player.x=1; g.player.y=1;
  const stuck=[];
  let total=0;
  for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){
    if(!WALKABLE(g.tileAt(x,y))) continue;
    total++;
    // 复位这一关，只留一只眼睛
    g.resetLevel(false); g.gameState='playing'; g.player.x=1; g.player.y=1;
    const arr=g.ghostsArr;
    for(let i=1;i<arr.length;i++) arr[i].state='house';
    const e=arr[0];
    e.state='eaten'; e.x=x; e.y=y; e.dir={x:0,y:0}; e.want={x:0,y:0};
    let home=false;
    for(let t=0;t<900;t++){          // 15 秒
      g.update(1/60);
      if(e.state!=='eaten'){ home=true; break; }
    }
    if(!home) stuck.push({x,y,ex:+e.x.toFixed(1),ey:+e.y.toFixed(1)});
  }
  grandTotal+=total; grandStuck+=stuck.length;
  console.log(`第${L}关: ${total} 个格子, 回不了家 ${stuck.length} 个 ${stuck.length?'← '+stuck.slice(0,12).map(s=>`(${s.x},${s.y})→卡在(${s.ex},${s.ey})`).join(' '):''}`);
}
console.log(`\n合计 ${grandTotal} 个格子，回不了家 ${grandStuck} 个 (${(100*grandStuck/grandTotal).toFixed(1)}%)`);
if (grandStuck > 0){
  console.error('\n眼睛回不了家 = 吃掉的幽灵不再出现 = 难度悄悄塌掉，这条必须是 0。');
  process.exit(1);
}
console.log('眼睛都能回家。');
