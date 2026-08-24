// 关掉玩法说明必须**立刻**回到原样：不能有布局动画、不能白烧渲染。
//   用法: node test_help_close.mjs
//
// 玩家报"点了知道了还是卡顿，理论上该立刻回到原来的页面"。
// 根因不是点击慢（实测处理函数 0.2ms），是关掉之后页面还在动：
// 打开说明会把 gameState 变成 paused，syncChrome 就摘掉 body.in-game、
// 标题展开；点知道了变回 playing，标题再收回去——两次都是 280ms 的过渡，
// 后一次正好落在玩家刚点完的那一刻。
//
// 这条在浏览器里量不了：预览面板 document.hidden=true，rAF 整个停摆，
// 所有帧率读数都是假的。所以直接在无头环境里验机制。
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
const dir=mkdtempSync(join(tmpdir(),'hc-')); const mp=join(dir,'c.mjs');
writeFileSync(mp,`export function createGame(env){
 const document=env.document,window=env.window,localStorage=env.localStorage,
   getComputedStyle=env.getComputedStyle,requestAnimationFrame=env.requestAnimationFrame,
   cancelAnimationFrame=env.cancelAnimationFrame,performance=env.performance;
${body}
 return { fullNewGame, openHelp, closeHelp, render, syncChrome,
   get gameState(){return gameState;}, set gameState(v){gameState=v;} };\n}\n`);
const {installShim}=await import(new URL('../微信小游戏版/js/shim.js',import.meta.url));
const shim=installShim({maze:fakeCanvas(),fx:fakeCanvas(1,1)});
const {createGame}=await import(mp);
const g=createGame(shim.env); const fail=[];
const bodyCls = () => shim.env.document.body.classList.contains('in-game');

g.fullNewGame();
g.gameState='playing';
g.render();                       // 让 syncChrome 把 in-game 加上
const before = bodyCls();
if(!before) fail.push('开打后 body 上没有 in-game，后面的比较没有意义');
console.log('开打后        body.in-game =', before);

g.openHelp();
g.render();
const during = bodyCls();
console.log('说明开着      body.in-game =', during, during===before?'✓ 没变':'✗ 变了');
if(during !== before) fail.push('打开说明改动了 body.in-game —— 关掉时会有 280ms 的标题动画');

g.closeHelp();
g.render();
const after = bodyCls();
console.log('点「知道了」  body.in-game =', after, after===before?'✓ 立刻是原样':'✗ 和打开前不一致');
if(after !== before) fail.push('关掉说明后 body.in-game 和打开前不一致');

/* 从开始页打开说明也不能把 in-game 加上：那儿本来就该显示标题 */
g.fullNewGame();
g.gameState='ready';
g.render();
const s0 = bodyCls();
g.openHelp(); g.render();
const s1 = bodyCls();
g.closeHelp(); g.render();
const s2 = bodyCls();
console.log('开始页开关说明 in-game:', s0, '→', s1, '→', s2, (s0===s1&&s1===s2)?'✓ 始终不变':'✗ 变了');
if(!(s0===s1 && s1===s2)) fail.push('在开始页开关说明也会动 body.in-game');

/* 上面那三条走的是 render()，而 render 在说明盖着时会**提前返回**，
   所以 syncChrome 根本没被调到——等于没验到守卫本身。
   这里直接调 syncChrome：万一以后有人去掉 render 的提前返回（比如为了
   在说明背后继续放动画），守卫是最后一道防线，它必须自己站得住。 */
g.fullNewGame(); g.gameState='playing'; g.render();
const base = bodyCls();
g.openHelp();
g.gameState='paused';          // openHelp 实际就是这么干的
g.syncChrome();                // 绕开 render，直接调
const direct = bodyCls();
console.log('\n直接调 syncChrome（说明盖着、gameState=paused）: in-game =', direct,
  direct===base?'✓ 守卫生效':'✗ 守卫失效，标题会在关掉时抖一下');
if(direct !== base) fail.push('syncChrome 的守卫失效：说明盖着时仍然改了 body.in-game');
g.closeHelp(); g.gameState='playing';

console.log('\n'+(fail.length?'失败:\n  '+fail.join('\n  '):'开关说明不会引起任何布局变化。'));
process.exit(fail.length?1:0);
