// 穿墙时的手感：速度要降下来、转向要立刻生效、人不能卡在格线之间。
//   用法: node test_phase_control.mjs
//
// 玩家的原话是"速度太快导致很难控制，道具吸引力减弱"。根因不是穿墙本身快，
// 是**冲刺加成在穿墙时白送**：没有墙逼你转弯，长直线随便走，动量必然顶满。
// 这里守三条：穿墙比平时慢、转向不再要等前方路口、以及最要紧的——
// 转完之后人必须还在格心上。掉到格线之间，stepEntity 就再也没有机会重新
// 选方向，玩家会直接卡死（幽灵那个 bug 就是这么来的）。
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
const dir=mkdtempSync(join(tmpdir(),'pc-')); const mp=join(dir,'c.mjs');
writeFileSync(mp,`export function createGame(env){
 const document=env.document,window=env.window,localStorage=env.localStorage,
   getComputedStyle=env.getComputedStyle,requestAnimationFrame=env.requestAnimationFrame,
   cancelAnimationFrame=env.cancelAnimationFrame,performance=env.performance;
${body}
 return { fullNewGame, resetLevel, update, requestDir, applySpeedModifiers, nearCenter, tileAt,
   MOMENTUM_MAX, FRUIT_PHASE_SPEED_MULT, COLS, ROWS,
   get player(){return player;}, set gameState(v){gameState=v;}, set level(v){level=v;} };\n}\n`);
const {installShim}=await import(new URL('../微信小游戏版/js/shim.js',import.meta.url));
const shim=installShim({maze:fakeCanvas(),fx:fakeCanvas(1,1)});
const {createGame}=await import(mp);
const g=createGame(shim.env);
const fail=[];

// —— 1) 速度：穿墙时该比"跑满冲刺"慢一大截 ——
g.fullNewGame(); g.level=6; g.resetLevel(false); g.gameState='playing';
const P=g.player;
P.straightTiles = 99;              // 冲刺拉满
P.phase = 0; g.applySpeedModifiers();
const dashSpeed = P.speed;
P.phase = 5;   g.applySpeedModifiers();
const phaseSpeed = P.speed;
console.log(`第六关  冲刺跑满 ${dashSpeed.toFixed(2)} 格/秒　穿墙 ${phaseSpeed.toFixed(2)} 格/秒　慢了 ${Math.round((1-phaseSpeed/dashSpeed)*100)}%`);
if (phaseSpeed >= dashSpeed) fail.push('穿墙没有比冲刺慢');
if (phaseSpeed > P.baseSpeed)  fail.push('穿墙比常速还快，等于没改');

// —— 2) 转向：穿墙时立刻生效，不必等前方路口 ——
g.fullNewGame(); g.level=1; g.resetLevel(false); g.gameState='playing';
const p2=g.player;
p2.phase = 8;
p2.x = 9; p2.y = 15; p2.dir = {x:1,y:0}; p2.want={x:0,y:0};
// 走到离格心还差 0.7 格的地方（远超平时 0.45 的辅助窗口）
for(let i=0;i<40 && Math.abs(p2.x - Math.round(p2.x)) < 0.28; i++) g.update(1/60);
const before = { x:+p2.x.toFixed(2), y:+p2.y.toFixed(2) };
g.requestDir('up');
g.update(1/60);
const turned = p2.dir.y === -1;
console.log(`穿墙转向  在 (${before.x},${before.y}) 按上 → ${turned?'立刻转了':'没转'}  转后位置 (${p2.x.toFixed(2)},${p2.y.toFixed(2)})`);
if(!turned) fail.push('穿墙时转向没有立刻生效');

// —— 3) 最要紧：转完必须还在格心，不能掉到格线之间 ——
g.fullNewGame(); g.level=3; g.resetLevel(false); g.gameState='playing';
const p3=g.player; p3.phase = 60;
const dirs=['up','left','down','right'];
let offGrid = 0, stuck = 0, lastX=p3.x, lastY=p3.y, still=0;
for(let f=0; f<60*40; f++){
  if(f%7===0) g.requestDir(dirs[(f/7|0)%4]);   // 疯狂乱转
  g.update(1/60);
  p3.phase = 60;                                // 一直保持穿墙
  // 在格心附近时，两个轴都该是整数
  if(g.nearCenter(p3.x) && !Number.isInteger(Math.round(p3.y*1000)/1000) ) {}
  const dx=Math.abs(p3.x-lastX), dy=Math.abs(p3.y-lastY);
  if(dx<1e-6 && dy<1e-6) still++; else still=0;
  if(still>90) { stuck++; still=0; }
  lastX=p3.x; lastY=p3.y;
  if(!Number.isFinite(p3.x)||!Number.isFinite(p3.y)){ offGrid++; break; }
}
console.log(`乱转 40 秒  卡住 ${stuck} 次  坐标异常 ${offGrid} 次  最终 (${p3.x.toFixed(2)},${p3.y.toFixed(2)})`);
if(stuck>0) fail.push('穿墙乱转会把玩家卡死');
if(offGrid>0) fail.push('穿墙乱转把坐标搞坏了');

console.log('\n'+(fail.length?'失败:\n  '+fail.join('\n  '):'穿墙手感三条都正确。'));
process.exit(fail.length?1:0);
