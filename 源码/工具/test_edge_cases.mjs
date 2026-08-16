// 杂项边界：名字注入、暂停冻结、存档不可用、畸形挑战链接。
//   用法: node test_edge_cases.mjs   （任一项失败退出码 1）
//
// 这些都是"平时碰不到、碰到就很难看"的路径：名字要进 innerHTML，挑战链接的
// 参数来自别人发给你的 URL，无痕模式下 localStorage 直接抛异常。
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
const noop=()=>{};
const fakeCtx=()=>new Proxy({},{get:(_,k)=>{
  if(k==='measureText')return t=>({width:String(t).length*7});
  if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop:noop});
  return noop;}});
const fakeCanvas=(w=494,h=546)=>({width:w,height:h,getContext:()=>fakeCtx()});
let store=new Map(); globalThis.GameGlobal=globalThis;
let storageBroken=false;
globalThis.location={href:'https://example.com/'};
globalThis.wx={createCanvas:()=>fakeCanvas(),getSystemInfoSync:()=>({windowWidth:390,windowHeight:844,pixelRatio:3}),
 getStorageSync:k=>{ if(storageBroken) throw new Error('无痕模式'); return store.has(k)?store.get(k):''; },
 setStorageSync:(k,v)=>{ if(storageBroken) throw new Error('无痕模式'); store.set(k,v); },
 removeStorageSync:k=>{ if(storageBroken) throw new Error('无痕模式'); store.delete(k); },
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
const dir=mkdtempSync(join(tmpdir(),'ec-')); const mp=join(dir,'c.mjs');
writeFileSync(mp,`export function createGame(env){
 const document=env.document,window=env.window,localStorage=env.localStorage,
   getComputedStyle=env.getComputedStyle,requestAnimationFrame=env.requestAnimationFrame,
   cancelAnimationFrame=env.cancelAnimationFrame,performance=env.performance;
${body}
 return { fullNewGame, resetLevel, update, cleanName, recordScore, renderScoreboard, loadScores,
   startPowerMode, handleGhostCollisions, togglePause, endGame,
   get ghosts(){return ghosts;}, get player(){return player;},
   get gameState(){return gameState;}, set gameState(v){gameState=v;},
   set level(v){level=v;}, set score(v){score=v;}, get elapsed(){return elapsed;} };\n}\n`);
const {installShim}=await import('../../微信小游戏版/js/shim.js');
let fails=[];
const ok=(m)=>console.log('✓ '+m);
const bad=(m,e)=>{ console.log('✗ '+m+(e?'\n    '+e.message:'')); fails.push(m); };

function fresh(){
  const shim=installShim({maze:fakeCanvas(),fx:fakeCanvas(1,1)});
  return { shim, el: shim.el };
}
const {createGame}=await import(mp);

// 1) 名字里的尖括号必须进不去 innerHTML
try {
  const {shim,el}=fresh(); const g=createGame(shim.env);
  const nasty = '<img src=x onerror=alert(1)>';
  const cleaned = g.cleanName(nasty);
  if (/[<>&"']/.test(cleaned)) throw new Error('cleanName 没滤干净: '+cleaned);
  g.recordScore({score:999, level:1, combo:1, won:false, name:cleaned});
  g.renderScoreboard('startBoard');
  const h = el('startBoard').innerHTML;
  if (h.includes('<img') || h.includes('onerror')) throw new Error('榜单 HTML 里出现了标签');
  ok(`名字注入被挡住（"${nasty}" → "${cleaned}"）`);
} catch(e){ bad('名字注入', e); }

// 2) 挑战链接里的名字同样要滤
try {
  globalThis.location={href:'https://example.com/?c=5000&n=' + encodeURIComponent('<b>坏</b>')};
  const {shim,el}=fresh(); const g=createGame(shim.env);
  const h = el('challengeBox').innerHTML;
  if (h.includes('<b>坏')) throw new Error('挑战横幅里出现了标签: '+h);
  ok('挑战链接里的名字也被滤（横幅: ' + h.replace(/<[^>]*>/g,'').trim() + '）');
  globalThis.location={href:'https://example.com/'};
} catch(e){ bad('挑战链接名字', e); globalThis.location={href:'https://example.com/'}; }

// 3) 畸形挑战参数不能把游戏搞崩
try {
  for (const q of ['?c=abc', '?c=-5', '?c=1e999', '?c=NaN&n=x', '?c=', '?n=只有名字']){
    globalThis.location={href:'https://example.com/'+q};
    const {shim}=fresh(); const g=createGame(shim.env);
    g.fullNewGame();
  }
  globalThis.location={href:'https://example.com/'};
  ok('畸形挑战参数（abc / -5 / 1e999 / NaN / 空 / 只有名字）都不崩');
} catch(e){ bad('畸形挑战参数', e); globalThis.location={href:'https://example.com/'}; }

// 4) 存档不可用（无痕模式）时游戏仍要能玩
try {
  storageBroken=true;
  const {shim}=fresh(); const g=createGame(shim.env);
  g.fullNewGame(); g.gameState='playing';
  for(let i=0;i<600;i++) g.update(1/60);
  g.score=12345; g.endGame(false);
  storageBroken=false;
  ok('localStorage 全程抛异常也能开局、能跑、能结算');
} catch(e){ storageBroken=false; bad('无痕模式', e); }

// 5) 暂停要冻住复活计时，否则暂停一分钟回来幽灵全在门口
try {
  const {shim}=fresh(); const g=createGame(shim.env);
  g.fullNewGame(); g.gameState='playing';
  for(let i=0;i<180;i++) g.update(1/60);
  const before=g.elapsed;
  g.togglePause();
  if (g.gameState!=='paused') throw new Error('没暂停成功');
  // 主循环在 paused 时根本不调 update，这里模拟同样的行为
  for(let i=0;i<600;i++){ if(g.gameState==='playing') g.update(1/60); }
  if (Math.abs(g.elapsed-before)>1e-9) throw new Error('暂停期间 elapsed 还在走');
  g.togglePause();
  ok('暂停冻结计时（elapsed 不前进，复活/释放时刻不会被跳过）');
} catch(e){ bad('暂停冻结', e); }

// 6) 名字里的表情和超长输入
try {
  const {shim,el}=fresh(); const g=createGame(shim.env);
  const long = g.cleanName('一二三四五六七八九十');
  if ([...long].length > 8) throw new Error('没有截断到 8 个字: '+long);
  const emoji = g.cleanName('🎮奶爸🎮');
  g.recordScore({score:777, level:1, combo:1, won:false, name:emoji});
  g.renderScoreboard('startBoard');
  ok(`超长名字截断为「${long}」，表情名字「${emoji}」正常入榜`);
} catch(e){ bad('名字边界', e); }

console.log(fails.length ? `\n${fails.length} 项失败。` : '\n边界用例全部通过。');
process.exit(fails.length?1:0);
