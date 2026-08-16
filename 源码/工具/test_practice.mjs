// 练习模式：单关可练、完全不计分、不污染排行榜和解锁进度。
//   用法: node test_practice.mjs
//
// 起因是小玩家的反馈"一失败就要从头开始"。练习模式解决它，但边界必须硬：
// 只要练习的成绩能进榜、或者能拿来解锁下一关、或者清掉能算通关，
// "通关"这件事就不值钱了——而通关的满足感是整个游戏的终点。
// 这个测试守的就是这条边界。
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
const dir=mkdtempSync(join(tmpdir(),'pr-')); const mp=join(dir,'c.mjs');
writeFileSync(mp,`export function createGame(env){
 const document=env.document,window=env.window,localStorage=env.localStorage,
   getComputedStyle=env.getComputedStyle,requestAnimationFrame=env.requestAnimationFrame,
   cancelAnimationFrame=env.cancelAnimationFrame,performance=env.performance;
${body}
 return { fullNewGame, endGame, startPractice, renderLevelSelect, renderBest,
   loadScores, bestScore, maxLevelReached, noteLevelReached, MAX_LEVEL,
   get practiceLevel(){return practiceLevel;},
   get level(){return level;}, set level(v){level=v;},
   set score(v){score=v;}, get score(){return score;},
   set lives(v){lives=v;}, set gameState(v){gameState=v;}, get gameState(){return gameState;} };\n}\n`);
const {installShim}=await import(new URL('../../微信小游戏版/js/shim.js',import.meta.url));
const shim=installShim({maze:fakeCanvas(),fx:fakeCanvas(1,1)});
const {createGame}=await import(mp);
const g=createGame(shim.env); const el=shim.el;
const fail=[];
const LS = shim.env.localStorage;

// —— 1) 一开始只解锁第一关，选关条整个不出现 ——
LS.removeItem('doudou.reached'); LS.removeItem('doudou.scores.v2');
g.fullNewGame(); g.renderLevelSelect();
if(g.maxLevelReached()!==1) fail.push('初始解锁应为 1，实际 '+g.maxLevelReached());
if(!el('levelSel').classList.contains('hidden')) fail.push('只解锁一关时，选关条不该出现');
console.log('初次进入：解锁到第 1 关，选关条隐藏');

// —— 2) 正式挑战打到第 4 关，解锁跟上 ——
g.fullNewGame();
g.noteLevelReached(2); g.noteLevelReached(3); g.noteLevelReached(4);
if(g.maxLevelReached()!==4) fail.push('应解锁到 4，实际 '+g.maxLevelReached());
g.renderLevelSelect();
const locked = (el('levelSel').innerHTML.match(/🔒/g)||[]).length;
if(locked!==2) fail.push(`解锁到 4 时应有 2 把锁，实际 ${locked}`);
console.log(`打到第 4 关：可练 1-4，第 5、6 关上锁（${locked} 把）`);

// —— 3) 练习不计分：不入榜、不动最高分 ——
const boardBefore = g.loadScores().length;
const bestBefore  = g.bestScore();
g.startPractice(3);
if(g.practiceLevel!==3) fail.push('练习模式没进去');
if(g.level!==3) fail.push('练习没有跳到第 3 关，实际第 '+g.level+' 关');
g.score = 999999;
g.endGame(false);
if(g.loadScores().length !== boardBefore) fail.push('练习成绩混进了排行榜');
if(g.bestScore() !== bestBefore) fail.push('练习成绩改动了最高分');
if(el('overTitle').textContent.indexOf('练习') < 0) fail.push('练习结算标题里没有"练习"：'+el('overTitle').textContent);
if(el('overSub').textContent.indexOf('不计分') < 0) fail.push('练习结算没有说明不计分');
if(!el('overBoard').classList.contains('hidden')) fail.push('练习结算不该摆排行榜');
console.log(`练习 999999 分：榜单仍 ${g.loadScores().length} 条，最高分仍 ${g.bestScore()}，标题「${el('overTitle').textContent}」`);

// —— 4) 练习不能拿来解锁下一关 ——
const before = g.maxLevelReached();
g.startPractice(4);
g.noteLevelReached(5);          // 练习中调用，应当被忽略
if(g.maxLevelReached() !== before) fail.push('练习把下一关解锁了');
console.log(`练习第 4 关期间尝试解锁第 5 关：仍停在 ${g.maxLevelReached()}，正确`);

// —— 5) 想练没解锁的关，会被夹回到已解锁的最高关 ——
g.startPractice(6);              // 此时只解锁到 4
if(g.level !== 4) fail.push(`练没解锁的第 6 关应夹回第 4 关，实际第 ${g.level} 关`);
console.log(`点了没解锁的第 6 关：夹回第 ${g.level} 关（已解锁上限），正确`);

// —— 6) 练习清关不算通关 ——
LS.setItem('doudou.reached','6');
g.startPractice(6);
if(g.level !== 6) fail.push('解锁到 6 之后仍进不去第 6 关');
g.endGame(true);                 // 就算传 true 也不能显示成通关
const t = el('overTitle').textContent;
if(t.indexOf('通关！') >= 0) fail.push('练习清掉第 6 关被当成了通关：'+t);
if(t.indexOf('第 6 关') < 0) fail.push('练习结算标题里的关卡号不对：'+t);
console.log(`练习第 6 关：标题「${t}」，不是通关`);

// —— 7) 正式挑战不受影响 ——
g.fullNewGame();
if(g.practiceLevel!==null) fail.push('开正式局时 practiceLevel 没清干净');
g.gameState='playing'; g.score=54321; g.level=5; g.lives=1;
g.endGame(false);
if(g.loadScores().length !== boardBefore+1) fail.push('正式挑战没有进榜');
console.log(`正式挑战 54321 分：进榜，共 ${g.loadScores().length} 条`);

console.log('\n'+(fail.length?'失败:\n  '+fail.join('\n  '):'练习模式的边界都守住了。'));
process.exit(fail.length?1:0);
