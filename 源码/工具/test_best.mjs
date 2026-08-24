// 个人纪录系统：BEST 从榜单派生、破纪录判定、"差多少分"、反击敌人统计。
//   用法: node test_best.mjs
//
// 这里最容易错的一处是**读旧纪录的时机**：endGame 会先把本局写进榜单，
// 如果之后才去读最高分，读到的就是本局自己 —— "破纪录了没有"永远为假、
// "差多少分"永远是 0。这类 bug 不会报错，只会让结算页天天说反话。
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
const dir=mkdtempSync(join(tmpdir(),'bs-')); const mp=join(dir,'c.mjs');
writeFileSync(mp,`export function createGame(env){
 const document=env.document,window=env.window,localStorage=env.localStorage,
   getComputedStyle=env.getComputedStyle,requestAnimationFrame=env.requestAnimationFrame,
   cancelAnimationFrame=env.cancelAnimationFrame,performance=env.performance;
${body}
 return { fullNewGame, endGame, bestScore, renderBest, levelName, startPowerMode,
   handleGhostCollisions, resetLevel, get ghosts(){return ghosts;}, get player(){return player;},
   get score(){return score;}, set score(v){score=v;}, set level(v){level=v;},
   set lives(v){lives=v;}, set gameState(v){gameState=v;},
   get kills(){return ghostsEatenThisRun;} };\n}\n`);
const {installShim}=await import(new URL('../微信小游戏版/js/shim.js',import.meta.url));
const shim=installShim({maze:fakeCanvas(),fx:fakeCanvas(1,1)});
const {createGame}=await import(mp);
const g=createGame(shim.env);
const el=shim.el; const fail=[];

// 1) 还没有任何记录时，BEST 不显示
g.fullNewGame(); g.renderBest();
if(g.bestScore()!==0) fail.push('空榜单时 bestScore 应为 0，实际 '+g.bestScore());
if(!el('bestLine').classList.contains('hidden')) fail.push('没有记录时 BEST 那行不该出现');

// 2) 第一局：应当是"第一条纪录"
g.fullNewGame(); g.gameState='playing'; g.score=50000; g.level=3; g.lives=1;
g.endGame(false);
let sub=el('overSub').textContent;
console.log('第一局  :', sub.replace(/\s+/g,' ').trim());
if(!sub.includes('第一条纪录')) fail.push('首局没有说"第一条纪录"');

// 3) 第二局更低：应报差额，且差额算的是**旧纪录**
g.fullNewGame(); g.gameState='playing'; g.score=30000; g.level=2; g.lives=1;
g.endGame(false);
sub=el('overSub').textContent;
console.log('低于纪录:', sub.replace(/\s+/g,' ').trim());
if(!sub.includes('差 20,000 分')) fail.push('差额不对，应为 差 20,000 分');
if(!sub.includes('最高纪录')) fail.push('战绩表里没有"最高纪录"');

// 4) 第三局破纪录
g.fullNewGame(); g.gameState='playing'; g.score=80000; g.level=4; g.lives=1;
g.endGame(false);
sub=el('overSub').textContent;
console.log('破纪录  :', sub.replace(/\s+/g,' ').trim());
if(!sub.includes('新纪录')) fail.push('破纪录没有提示');
if(!sub.includes('30,000')) fail.push('破纪录的领先分数不对，应为 30,000');

// 4.5) 正好打平自己的纪录：不能说成"差 0 分"
//      挑战那边早先修过同样的问题（"超过 0 分"），这是同一类，
//      只是这次比的对象是自己的历史最高。
// 失败结算不发奖励分，所以分数原样就是最终分——直接给成和纪录一模一样
g.fullNewGame(); g.gameState='playing'; g.score=g.bestScore(); g.level=4; g.lives=0;
g.endGame(false);
{
  const t = el('overSub').textContent;
  const line = (t.split('\n').map(x=>x.trim()).find(x=>x.includes('纪录')) || '');
  console.log('打平    :', line);
  if(t.includes('差 0 分')) fail.push('打平时说成了"差 0 分打破自己的纪录"');
  if(!t.includes('打平')) fail.push('打平时没有专门的说法');
}

// 5) BEST 显示出来了，且等于榜单第一名
g.renderBest();
if(g.bestScore()!==80000) fail.push('bestScore 应为 80000，实际 '+g.bestScore());
if(el('bestLine').classList.contains('hidden')) fail.push('有记录了 BEST 还藏着');
if(!el('bestLine').innerHTML.includes('80,000')) fail.push('BEST 没带千分位');
console.log('BEST 行 :', el('bestLine').textContent);

// 6) 击杀统计
g.fullNewGame(); g.level=1; g.resetLevel(false); g.gameState='playing';
g.startPowerMode();
let n=0;
for(const gh of g.ghosts){ if(gh.state==='frightened'){ g.player.x=gh.x; g.player.y=gh.y; g.handleGhostCollisions(); n++; } }
if(g.kills!==n) fail.push(`击杀统计 ${g.kills} != 实吃 ${n}`);
console.log(`击杀统计: 吃了 ${n} 只，记录 ${g.kills} 只`);

// 7) 关卡名字
const names=[1,2,3,4,5,6].map(l=>g.levelName(l));
console.log('关卡名字:', names.join(' / '));
if(new Set(names).size!==6) fail.push('关卡名字有重复');

/* 微信两个版本画的是 stripTags 之后的纯文本。战绩表必须**一行一条**，
   否则就是 "到达关卡第 4 关最高连击x1反击敌人0只" 糊成一长串。
   网页版看不出这个问题（它有 CSS 网格），只有纯文本这一路会坏。 */
const raw = el('overSub').textContent;
const statLines = raw.split('\n').map(s=>s.trim()).filter(Boolean);
console.log('\n纯文本逐行（微信版看到的）:');
statLines.forEach(l=>console.log('  | '+l));
if(!statLines.some(l=>l.startsWith('到达关卡'))) fail.push('纯文本里"到达关卡"没有独占一行');
if(!statLines.some(l=>l.startsWith('最高连击'))) fail.push('纯文本里"最高连击"没有独占一行');
if(!statLines.some(l=>l.startsWith('反击敌人'))) fail.push('纯文本里"反击敌人"没有独占一行');
if(statLines.some(l=>/到达关卡.*最高连击/.test(l))) fail.push('战绩糊成了一行');

console.log('\n'+(fail.length?'失败:\n  '+fail.join('\n  '):'纪录系统全部正确。'));
process.exit(fail.length?1:0);
