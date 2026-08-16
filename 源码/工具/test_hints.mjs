// 新手提示：该出现的要出现，且每条只出现一次。
//   用法: node test_hints.mjs
//
// 为什么要测：提示是"到点才教"的，触发条件散在四五个地方（连击到 5、第一次
// 吃幽灵、第一次用传送门…）。任何一条悄悄失效都不会报错，只会让新玩家永远
// 不知道有这个机制——而这恰恰是最难靠自己玩发现的一类问题。
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
const dir=mkdtempSync(join(tmpdir(),'hn-')); const mp=join(dir,'c.mjs');
writeFileSync(mp,`export function createGame(env){
 const document=env.document,window=env.window,localStorage=env.localStorage,
   getComputedStyle=env.getComputedStyle,requestAnimationFrame=env.requestAnimationFrame,
   cancelAnimationFrame=env.cancelAnimationFrame,performance=env.performance;
${body}
 return { fullNewGame, resetLevel, update, startPowerMode, handleGhostCollisions, addPelletScore,
   render, startSwipeHint, tileAt, COLS, ROWS,
   HINT_KEY, get ghosts(){return ghosts;}, get player(){return player;},
   get gameState(){return gameState;}, set gameState(v){gameState=v;}, set level(v){level=v;} };\n}\n`);
const {installShim}=await import(new URL('../../微信小游戏版/js/shim.js',import.meta.url));
const shim=installShim({maze:fakeCanvas(),fx:fakeCanvas(1,1)});
const {createGame}=await import(mp);
const g=createGame(shim.env);

const seen = () => (shim.env.localStorage.getItem('doudou.hints.v1')||'').split(',').filter(Boolean);
const fail=[];

g.fullNewGame(); g.gameState='playing';
// 连击到 5
for(let i=0;i<6;i++) g.addPelletScore(15);
if(!seen().includes('combo')) fail.push('连击 x5 没触发 combo 提示');

// 第一次吃幽灵
g.startPowerMode();
const v=g.ghosts.find(x=>x.state==='frightened');
g.player.x=v.x; g.player.y=v.y; g.handleGhostCollisions();
// bounty 是延迟 1.4 秒弹的（让加分那条先显示完），而且现在**弹出来才算用掉**，
// 所以必须等过这段时间再查。
await new Promise(r=>setTimeout(r, 1600));
if(!seen().includes('bounty')) fail.push('第一次吃幽灵没触发 bounty 提示');

const first = seen().slice();
console.log('触发到的提示:', first.join(' / ') || '（无）');

// 再来一整局：一条都不该重复
g.fullNewGame(); g.gameState='playing';
for(let i=0;i<9;i++) g.addPelletScore(15);
g.startPowerMode();
const v2=g.ghosts.find(x=>x.state==='frightened');
g.player.x=v2.x; g.player.y=v2.y; g.handleGhostCollisions();
await new Promise(r=>setTimeout(r, 1600));
const after = seen();
const dup = after.length !== new Set(after).size;
if(dup) fail.push('提示重复记录了');
if(after.length !== first.length) fail.push(`第二局又多出了提示: ${after.filter(x=>!first.includes(x))}`);

console.log('第二局后:', after.join(' / '));
/* 走近能量豆就该讲，不必等死。把玩家放到一颗能量豆旁边跑一帧。 */
shim.env.localStorage.removeItem('doudou.hints.v1');
g.fullNewGame(); g.gameState='playing';
let po=null;
for(let y=0;y<g.ROWS&&!po;y++) for(let x=0;x<g.COLS;x++) if(g.tileAt(x,y)==='o'){ po={x,y}; break; }
g.player.x=po.x+2; g.player.y=po.y;      // 2 格远，在 3.2 格阈值内
g.update(1/60);
if(!seen().includes('power')) fail.push('走到能量豆旁边没有触发 power 提示');
else console.log(`走近能量豆: 在 (${po.x+2},${po.y}) 触发，豆在 (${po.x},${po.y})`);

/* 离得远不该触发 */
shim.env.localStorage.removeItem('doudou.hints.v1');
g.fullNewGame(); g.gameState='playing';
// 找一个离所有能量豆都远的位置
let far=null;
for(let y=1;y<g.ROWS-1&&!far;y++) for(let x=1;x<g.COLS-1;x++){
  if(g.tileAt(x,y)==='#') continue;
  let ok=true;
  for(let yy=0;yy<g.ROWS&&ok;yy++) for(let xx=0;xx<g.COLS;xx++)
    if(g.tileAt(xx,yy)==='o' && Math.hypot(xx-x,yy-y)<=4.5) ok=false;
  if(ok){ far={x,y}; break; }
}
if(far){
  g.player.x=far.x; g.player.y=far.y;
  g.update(1/60);
  if(seen().includes('power')) fail.push(`离能量豆很远 (${far.x},${far.y}) 却触发了 power 提示`);
  else console.log(`远离能量豆: 在 (${far.x},${far.y}) 不触发，正确`);
}

/* 开局手势：画出来才算用掉；玩家一动就收起 */
shim.env.localStorage.removeItem('doudou.hints.v1');
g.fullNewGame();
g.startSwipeHint();
g.gameState='ready';
g.render();
if(seen().includes('move')) fail.push('还没开打，手势就被算作已显示');
g.gameState='playing';
g.player.dir={x:0,y:0};
g.render();
if(!seen().includes('move')) fail.push('开打后手势没有记为已显示');
else console.log('开局手势: 进游戏才计数，正确');

/* 延迟提示如果在弹层盖着的时候到点，不能算"已用掉"——它弹在棋盘上，会被
   结算弹层挡住，玩家根本看不见。丢一条教学提示是永久性的。 */
await new Promise(r=>setTimeout(r,10));
const before = seen().slice();
g.fullNewGame();               // gameState 回到 'ready'，不是 playing
g.gameState = 'over';
// 找一条还没用过的：把存档清掉重来一遍，模拟新玩家在延迟窗口内死掉
shim.env.localStorage.removeItem('doudou.hints.v1');
g.gameState = 'playing';
for(let i=0;i<6;i++) g.addPelletScore(15);   // 触发 combo（无延迟，应当照常）
if(!seen().includes('combo')) fail.push('无延迟的提示在游戏中没触发');
shim.env.localStorage.removeItem('doudou.hints.v1');
g.gameState = 'over';
for(let i=0;i<6;i++) g.addPelletScore(15);   // 弹层状态下，不该消费
if(seen().includes('combo')) fail.push('结算状态下提示被白白用掉了');
console.log('弹层遮挡时:', seen().length ? seen().join('/') : '（未消费，正确）');

console.log('\n' + (fail.length ? '失败:\n  '+fail.join('\n  ') : '提示都会触发，且每条只一次。'));
process.exit(fail.length?1:0);
