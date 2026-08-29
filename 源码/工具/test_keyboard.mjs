// 键盘：转向缓存、狂按、长按 repeat、以及**什么时候该放手**。
//   用法: node test_keyboard.mjs
//
// 手感这块最容易改坏又最难发现。这里守四条，其中第四条是这轮新加的：
// 原来无条件拦方向键，导致玩法说明打开时键盘滚不动它——那是一份要上下滚
// 的长文档，方向键被游戏吃掉，键盘用户就卡在那儿了。
//
// 写这个测试时我自己连挑了三次朝墙的方向，量到"没动"其实是撞墙。
// 所以最长走廊改成让程序自己找，不靠人眼数地图。
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
const dir=mkdtempSync(join(tmpdir(),'kb-')); const mp=join(dir,'c.mjs');
writeFileSync(mp,`export function createGame(env){
 const document=env.document,window=env.window,localStorage=env.localStorage,
   getComputedStyle=env.getComputedStyle,requestAnimationFrame=env.requestAnimationFrame,
   cancelAnimationFrame=env.cancelAnimationFrame,performance=env.performance;
${body}
 return { fullNewGame, resetLevel, update, requestDir, tileAt, TURN_BUFFER_SECONDS, TURN_ASSIST_TILES,
   gameHasKeyboard, openHelp, closeHelp, currentScreen, handleEnter, endGame, togglePause,
   get player(){return player;}, set level(v){level=v;}, set gameState(v){gameState=v;} };\n}\n`);
const {installShim}=await import(new URL('../微信小游戏版/js/shim.js',import.meta.url));
const shim=installShim({maze:fakeCanvas(),fx:fakeCanvas(1,1)});
const {createGame}=await import(mp);
const g=createGame(shim.env);
const fail=[];

// —— 1) 提前按方向要能存住 ——
g.fullNewGame(); g.level=1; g.resetLevel(false); g.gameState='playing';
function findTurnSpot(){
  for(let y=1;y<20;y++){
    let run=[];
    const flush=()=>{ if(run.length>=5){
      const up=run.find(x=>{const t=g.tileAt(x,y-1); return t!=='#'&&t!=='g'&&t!=='D';});
      if(up!==undefined && up>run[0]+2) return {y, junction:up};
    } return null; };
    for(let x=1;x<18;x++){
      const t=g.tileAt(x,y);
      if(t!=='#'&&t!=='g'&&t!=='D') run.push(x);
      else { const r=flush(); if(r) return r; run=[]; }
    }
    const r=flush(); if(r) return r;
  }
  return null;
}
const spot=findTurnSpot();
let maxEarly=0;
for(const early of [0.5,1,2,3,4]){
  const P=g.player;                 // resetLevel 会新建 player，每轮重取
  P.x=spot.junction-early; P.y=spot.y; P.dir={x:1,y:0}; P.want={x:0,y:0};
  P.distTravelled=0; P.wantAtTime=-Infinity; P.straightTiles=0;
  g.requestDir('up');
  let turned=false;
  for(let i=0;i<240;i++){ g.update(1/60); if(g.player.dir.y===-1){turned=true;break;} }
  if(turned) maxEarly=early;
}
console.log(`提前按方向：最多提前 ${maxEarly} 格仍然有效（缓存 ${g.TURN_BUFFER_SECONDS}s，吸附 ${g.TURN_ASSIST_TILES} 格）`);
if(Math.abs(g.TURN_BUFFER_SECONDS - 0.25) > 1e-9) fail.push(`转向缓存应为 0.25s，实际 ${g.TURN_BUFFER_SECONDS}s`);
if(Math.abs(g.TURN_ASSIST_TILES - 0.22) > 1e-9) fail.push(`路口吸附应为 0.22 格，实际 ${g.TURN_ASSIST_TILES}`);
if(maxEarly < 1) fail.push(`只能提前 ${maxEarly} 格，转弯太容易错过`);
if(maxEarly > 1) fail.push(`提前 ${maxEarly} 格的旧指令仍会触发，缓存过长`);

// —— 2) 狂按不能卡死 ——
g.fullNewGame(); g.level=1; g.resetLevel(false); g.gameState='playing';
{
  const seq=['up','right','down','left','up','right','right','down','left','up'];
  let stuck=0,maxStuck=0,bad=0,lx=g.player.x,ly=g.player.y;
  for(let i=0;i<60*30;i++){
    if(i%4===0) g.requestDir(seq[(i/4|0)%seq.length]);
    g.update(1/60);
    const P=g.player;
    if(!Number.isFinite(P.x)||!Number.isFinite(P.y)){ bad++; break; }
    if(Math.abs(P.x-lx)<1e-9&&Math.abs(P.y-ly)<1e-9){ stuck++; maxStuck=Math.max(maxStuck,stuck);} else stuck=0;
    lx=P.x; ly=P.y;
  }
  console.log(`狂按 30 秒：坐标异常 ${bad} 次，最长静止 ${(maxStuck/60).toFixed(2)}s`);
  if(bad) fail.push('狂按把坐标搞坏了');
  if(maxStuck>60) fail.push('狂按会卡死');
}

// —— 3) 长按 repeat 不能拖慢移动 ——
g.fullNewGame(); g.level=1; g.resetLevel(false); g.gameState='playing';
{
  let best={len:0};
  for(let y=1;y<20;y++){
    let run=[];
    for(let x=0;x<19;x++){
      const t=g.tileAt(x,y);
      if(t!=='#'&&t!=='g'&&t!=='D') run.push(x);
      else { if(run.length>best.len) best={len:run.length,y,x0:run[0]}; run=[]; }
    }
    if(run.length>best.len) best={len:run.length,y,x0:run[0]};
  }
  const P=g.player;
  P.x=best.x0; P.y=best.y; P.dir={x:0,y:0}; P.want={x:0,y:0};
  let dist=0,last=P.x;
  for(let i=0;i<60*3;i++){ g.requestDir('right'); g.update(1/60);
    let d=P.x-last; if(Math.abs(d)>5) d=0; dist+=Math.abs(d); last=P.x; }
  const room=best.len-1;
  console.log(`长按 3 秒（每帧 repeat）：跑了 ${dist.toFixed(1)} 格，走廊可用 ${room} 格`);
  if(dist < room*0.9) fail.push(`repeat 拖慢了移动（只跑了 ${dist.toFixed(1)}/${room}）`);
}

// —— 4) 说明打开时游戏该放开键盘 ——
g.fullNewGame(); g.gameState='playing';
const inGame = g.gameHasKeyboard();
g.openHelp();
const inHelp = g.gameHasKeyboard();
g.closeHelp();
const after = g.gameHasKeyboard();
console.log(`键盘归属：游戏中=${inGame}　说明开着=${inHelp}　关掉后=${after}`);
if(!inGame) fail.push('游戏中键盘不归游戏管');
if(inHelp)  fail.push('说明开着时游戏仍在吃方向键 —— 键盘滚不动说明');
if(!after)  fail.push('关掉说明后键盘没还给游戏');

/* —— Enter 快捷键 ——
   开始/继续/重开三处共用一个分发，靠 currentScreen() 判断当前是哪一屏。
   最要紧的两条是**不该响应**的：说明页按 Enter 不能误关（读到一半关掉比
   不支持更烦），昵称框里按 Enter 只能记录、绝不能顺手重开一局。 */
{
  g.fullNewGame();
  const fakeEvt = (extra)=>Object.assign({key:'Enter', isComposing:false, keyCode:13}, extra||{});
  const check = (want, tag)=>{
    const got = g.currentScreen();
    if (got !== want) fail.push(`${tag}：当前屏应是 ${want}，实际 ${got}`);
  };
  check('start','初始');
  g.handleEnter(fakeEvt());
  check('playing','开始页按 Enter');

  g.togglePause();
  check('paused','暂停后');
  g.handleEnter(fakeEvt());
  check('playing','暂停页按 Enter');

  g.openHelp();
  check('help','打开说明');
  g.handleEnter(fakeEvt());
  check('help','说明页按 Enter（应当无反应）');
  g.closeHelp();

  g.gameState='playing';
  g.endGame(false);
  check('over','结算');
  g.handleEnter(fakeEvt());
  check('playing','结算页按 Enter');

  // 输入法组词中不能触发
  g.gameState='playing'; g.endGame(false);
  const handled = g.handleEnter(fakeEvt({isComposing:true}));
  if (handled) fail.push('输入法组词时 Enter 被当成了游戏指令');
  check('over','组词中按 Enter（应当停在结算页）');
  console.log('Enter 快捷键：开始/继续/重开都通，说明页与组词中不响应 ✓');
}

/* 上面第 4 条只验了 gameHasKeyboard() 这个函数**本身**算得对不对，
   并没有验 keydown 处理器**有没有真的去调它** —— 我试过把调用点删掉，
   测试照样全绿。真实路径（派发 KeyboardEvent 看 defaultPrevented）只能在
   浏览器里跑，那边已经逐条确认过：游戏中拦、说明开着放行、关掉恢复拦。
   这里退一步做源码级检查：至少保证那行调用还在，被误删会立刻报出来。 */
const src = readFileSync(new URL('../pacman_fragment.html', import.meta.url), 'utf8');
const handler = src.slice(src.indexOf("window.addEventListener('keydown'"));
const handlerBody = handler.slice(0, handler.indexOf('});') + 3);
if (!/gameHasKeyboard\(\)/.test(handlerBody))
  fail.push('keydown 处理器里没有调用 gameHasKeyboard() —— 作用域判断被绕过了');
else console.log('keydown 处理器确实调用了 gameHasKeyboard() ✓');
if (!/e\.preventDefault\(\)/.test(handlerBody))
  fail.push('keydown 处理器不再阻止默认行为，方向键会滚页面');

console.log('\n'+(fail.length?'失败:\n  '+fail.join('\n  '):'键盘手感四项都正常。'));
process.exit(fail.length?1:0);
