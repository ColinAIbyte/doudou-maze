// 连击容错：跑动时窗口宽，停下时快断。
//   用法: node test_combo.mjs
//
// 这条改动**机器人量不出来**：它总是直奔最近的一颗豆、从不犹豫，
// 所以根本不会走进"穿过一整段吃空的走廊"那个场景。改动是给人用的。
// 既然行为层面量不到，就直接量机制本身：同样是断连，站着不动该比一路跑
// 快得多。这一条错了（比如两档写反），玩家的感受是"站着不动反而更安全"。
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
const dir=mkdtempSync(join(tmpdir(),'cb-')); const mp=join(dir,'c.mjs');
writeFileSync(mp,`export function createGame(env){
 const document=env.document,window=env.window,localStorage=env.localStorage,
   getComputedStyle=env.getComputedStyle,requestAnimationFrame=env.requestAnimationFrame,
   cancelAnimationFrame=env.cancelAnimationFrame,performance=env.performance;
${body}
 return { fullNewGame, resetLevel, update, addPelletScore, sustainCombo, comboWindow,
   startPowerMode, handleGhostCollisions, eatFruitAt: null,
   COMBO_WINDOW, COMBO_IDLE_DECAY, COMBO_GRACE_MAX,
   get combo(){return combo;}, get comboTimer(){return comboTimer;},
   get ghosts(){return ghosts;},
   get player(){return player;}, set gameState(v){gameState=v;}, set level(v){level=v;} };\n}\n`);
const {installShim}=await import(new URL('../微信小游戏版/js/shim.js',import.meta.url));
const shim=installShim({maze:fakeCanvas(),fx:fakeCanvas(1,1)});
const {createGame}=await import(mp);
const g=createGame(shim.env);
const fail=[];

/** 攒起连击，然后按给定的"在不在动"空跑，返回撑了多少秒才断 */
function survive(moving){
  g.fullNewGame(); g.gameState='playing';
  for(let i=0;i<5;i++) g.addPelletScore(15);       // combo 起来
  g.player.dir = moving ? {x:1,y:0} : {x:0,y:0};
  let t=0;
  for(; t<600; t++){
    g.update(1/60);
    g.player.dir = moving ? {x:1,y:0} : {x:0,y:0};  // update 里可能被改，钉住
    if(g.combo===1) break;
  }
  return t/60;
}

const run = survive(true);
const idle = survive(false);
console.log(`一路跑：撑了 ${run.toFixed(2)} 秒才断`);
console.log(`站着不动：撑了 ${idle.toFixed(2)} 秒才断`);
console.log(`倍率 ${(run/idle).toFixed(1)}x（设定值 ${g.COMBO_IDLE_DECAY}x）`);

if (run <= idle) fail.push('站着不动比跑着还耐久——两档写反了');
if (run < 1.4) fail.push(`跑动窗口只有 ${run.toFixed(2)} 秒，太短，穿不过空走廊`);
if (idle > 0.8) fail.push(`站着不动能撑 ${idle.toFixed(2)} 秒，太久，"别停下"的压力没了`);
if (Math.abs(run/idle - g.COMBO_IDLE_DECAY) > 0.4) fail.push('实测倍率和 COMBO_IDLE_DECAY 对不上');

/* 窗口随连击放宽，但要封顶。不封顶的话高连击就断不了了，
   而"别断啊"这份紧张感正是连击唯一的乐趣。 */
g.fullNewGame(); g.gameState='playing';
const w1 = g.comboWindow();
for(let i=0;i<80;i++) g.addPelletScore(15);
const wHigh = g.comboWindow();
console.log(`\n窗口：x1 时 ${w1.toFixed(2)}s → x${g.combo} 时 ${wHigh.toFixed(2)}s（上限 +${g.COMBO_GRACE_MAX}）`);
if(wHigh <= w1) fail.push('窗口没有随连击放宽');
if(wHigh > g.COMBO_WINDOW + g.COMBO_GRACE_MAX + 1e-9) fail.push('窗口超过了上限，高连击会断不了');

/* 吃幽灵必须续连击。原先不续，导致"发奖金鼓励你追幽灵"和"追幽灵会没收你的
   倍率"两套机制互相拆台——这条是这次改动的核心，必须守死。 */
g.fullNewGame(); g.level=1; g.resetLevel(false); g.gameState='playing';
for(let i=0;i<6;i++) g.addPelletScore(15);
g.startPowerMode();
/* 只等 0.4 秒。注意站着不动是 **3 倍速**扣的，0.4 秒实际消耗 1.2 秒窗口，
   刚好留下一点余量。第一版等了 1 秒 = 消耗 3 秒，连击自己先断了，
   量到的是"从 x1 重新起步"，跟这条要验的东西毫无关系。 */
for(let i=0;i<24;i++) g.update(1/60);
const comboBefore = g.combo, timerBefore = g.comboTimer;
if(comboBefore <= 1) fail.push('等待期间连击就断了，这一条没验到东西');
// 只吃一只：开局幽灵挤在老巢里，站上去会一次吃掉好几只
const v = g.ghosts.find(x=>x.state==='frightened');
g.player.x = v.x; g.player.y = v.y;
g.ghosts.forEach(x=>{ if(x!==v && x.state==='frightened') x.state='house'; });
g.handleGhostCollisions();
console.log(`吃幽灵：连击 x${comboBefore} → x${g.combo}　倒计时 ${timerBefore.toFixed(2)}s → ${g.comboTimer.toFixed(2)}s`);
if(g.combo !== comboBefore + 1) fail.push(`吃幽灵应让连击 +1，实际 x${comboBefore} → x${g.combo}`);
if(g.comboTimer <= timerBefore) fail.push('吃幽灵没有把连击倒计时续满');

console.log('\n'+(fail.length?'失败:\n  '+fail.join('\n  '):'连击两档衰减正确。'));
process.exit(fail.length?1:0);
