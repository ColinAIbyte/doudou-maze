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
const dir=mkdtempSync(join(tmpdir(),'sq-')); const mp=join(dir,'c.mjs');
writeFileSync(mp,`export function createGame(env){
 const document=env.document,window=env.window,localStorage=env.localStorage,
   getComputedStyle=env.getComputedStyle,requestAnimationFrame=env.requestAnimationFrame,
   cancelAnimationFrame=env.cancelAnimationFrame,performance=env.performance;
${body}
 return { fullNewGame, resetLevel, update, startPowerMode, handleGhostCollisions, isEdible, tileAt,
   get ghosts(){return ghosts;}, get player(){return player;},
   get gameState(){return gameState;}, set gameState(v){gameState=v;},
   set level(v){level=v;}, get frightTimer(){return frightTimer;} };\n}\n`);
const {installShim}=await import(new URL('../微信小游戏版/js/shim.js', import.meta.url));
const shim=installShim({maze:fakeCanvas(),fx:fakeCanvas(1,1)});
const {createGame}=await import(mp);
const g=createGame(shim.env);
let bad=0;

g.fullNewGame(); g.level=2; g.resetLevel(false); g.gameState='playing';
for(let i=0;i<180;i++) g.update(1/60);
g.startPowerMode();
const victim=g.ghosts.find(x=>x.state==='frightened');
g.player.x=victim.x; g.player.y=victim.y; g.handleGhostCollisions();
console.log('第二关：吃掉一只，跟踪它回家的全过程\n');
let prev=null, t=0, maxJump=0, lastX=victim.x, lastY=victim.y;
const marks=[];
for(t=0; t<900; t++){
  g.update(1/60);
  const jump=Math.hypot(victim.x-lastX, victim.y-lastY);
  if(jump>maxJump) maxJump=jump;
  lastX=victim.x; lastY=victim.y;
  if(victim.state!==prev){
    marks.push(`${(t/60).toFixed(2)}s  ${prev??'(吃掉)'} → ${victim.state}  在 (${victim.x.toFixed(1)},${victim.y.toFixed(1)})  可吃=${g.isEdible(victim)}`);
    prev=victim.state;
  }
  if(victim.state==='chase'||victim.state==='scatter') break;
}
marks.forEach(m=>console.log('  '+m));
console.log(`\n单帧最大位移 ${maxJump.toFixed(3)} 格（超过 0.5 就是瞬移）`);
if(maxJump>0.5){ console.log('✗ 中间有瞬移'); bad++; } else console.log('✓ 全程连续移动，没有瞬移');
const inHouse = marks.some(m=>m.includes('→ house'));
if(!inHouse){ console.log('✗ 没有进老巢停留'); bad++; } else console.log('✓ 进了老巢停留');
if(g.frightTimer>0 && g.isEdible(victim)){ console.log('✗ 复活后仍然可吃'); bad++; }
else console.log('✓ 复活后不可吃（本轮已吃过）');
process.exit(bad?1:0);
