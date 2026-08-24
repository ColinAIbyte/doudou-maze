// 通关评级 S/A/B/C + 无伤关卡统计 + 最高连击纪录。
//   用法: node test_grade.mjs
//
// 评级最容易错在两头：随便打也能拿 S（那这个字母就没意义），或者打得很好
// 也只有 B（那玩家会觉得系统在刁难）。这里固定几种打法，检查落点合理。
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
const dir=mkdtempSync(join(tmpdir(),'gr-')); const mp=join(dir,'c.mjs');
writeFileSync(mp,`export function createGame(env){
 const document=env.document,window=env.window,localStorage=env.localStorage,
   getComputedStyle=env.getComputedStyle,requestAnimationFrame=env.requestAnimationFrame,
   cancelAnimationFrame=env.cancelAnimationFrame,performance=env.performance;
${body}
 return { fullNewGame, endGame, gradeRun, bestCombo, recordScore,
   set deaths(v){deathsThisRun=v;}, set kills(v){ghostsEatenThisRun=v;},
   set combo(v){maxComboSeen=v;}, set sweeps(v){sweepsThisRun=v;},
   set perfect(v){perfectLevelsThisRun=v;},
   set score(v){score=v;}, set level(v){level=v;}, set lives(v){lives=v;},
   set gameState(v){gameState=v;} };\n}\n`);
const {installShim}=await import(new URL('../微信小游戏版/js/shim.js',import.meta.url));
const shim=installShim({maze:fakeCanvas(),fx:fakeCanvas(1,1)});
const {createGame}=await import(mp);
const g=createGame(shim.env); const el=shim.el;
const fail=[];

function grade(deaths, kills, combo, sweeps){
  g.fullNewGame();
  g.deaths=deaths; g.kills=kills; g.combo=combo; g.sweeps=sweeps;
  return g.gradeRun();
}

const cases = [
  // 死次数, 吃幽灵, 最高连击, 全灭次数, 期望
  ['全程无伤 + 猛吃 + 高连击',      0, 24, 40, 4, 'S'],
  // 六关全程不死本身就很难，即使完全不碰幽灵也该给 B，不是 C
  ['无伤但只顾吃豆、不碰幽灵',      0,  2,  8, 0, 'B'],
  ['打得不错，死了两次',            2, 16, 25, 2, 'A'],
  ['勉强通关，死五次',              5,  6, 12, 0, 'C'],
  ['稳健通关，死一次，中等表现',    1, 12, 20, 1, 'A'],
  ['苟到底：一只幽灵都不吃',        0,  0,  1, 0, 'C'],
];
console.log('打法                            死  吃  连击  全灭   评级');
for (const [name, d, k, c, s, want] of cases){
  const got = grade(d,k,c,s);
  const okk = got === want;
  console.log(`${name.padEnd(28,'　').slice(0,28)}  ${String(d).padStart(2)}  ${String(k).padStart(2)}  ${String(c).padStart(4)}  ${String(s).padStart(4)}     ${got}${okk?'':' ← 期望 '+want}`);
  if(!okk) fail.push(`${name}: 得到 ${got}，期望 ${want}`);
}

// 苟着通关不能拿 S —— 这是评级存在的意义
if (grade(0, 0, 1, 0) === 'S') fail.push('一只幽灵都不吃也能拿 S，评级失去意义');

// 无伤关卡数要真的统计，不能拿 6-死亡次数 反推
g.fullNewGame(); g.gameState='playing'; g.score=100000; g.level=6; g.lives=1;
g.deaths=3; g.perfect=4;     // 三次死亡集中在两关里 -> 仍有四关无伤
g.endGame(true);
const sub = el('overSub').textContent;
if(!sub.includes('无伤关卡 4 / 6')) fail.push('无伤关卡数不对：' + (sub.match(/无伤关卡[^\n]*/)||[''])[0]);
else console.log('\n无伤关卡: 死 3 次但集中在两关 → 仍报 4/6，正确');
if(!/评级\s*[SABC]/.test(sub)) fail.push('通关结算里没有评级');

// 最高连击纪录从榜单派生
g.fullNewGame();
g.recordScore({score:100, level:1, combo:7,  won:false, name:'a'});
g.recordScore({score:200, level:2, combo:31, won:false, name:'b'});
g.recordScore({score:300, level:3, combo:12, won:false, name:'c'});
if(g.bestCombo()!==31) fail.push('bestCombo 应为 31，实际 '+g.bestCombo());
else console.log('最高连击纪录: 三局 7/31/12 → 取 31，正确');

console.log('\n'+(fail.length?'失败:\n  '+fail.join('\n  '):'评级与纪录统计都正确。'));
process.exit(fail.length?1:0);
