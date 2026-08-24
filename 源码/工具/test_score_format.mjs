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
const dir=mkdtempSync(join(tmpdir(),'fc-')); const mp=join(dir,'c.mjs');
writeFileSync(mp,`export function createGame(env){
 const document=env.document,window=env.window,localStorage=env.localStorage,
   getComputedStyle=env.getComputedStyle,requestAnimationFrame=env.requestAnimationFrame,
   cancelAnimationFrame=env.cancelAnimationFrame,performance=env.performance;
${body}
 return { fullNewGame, endGame, updateHud, challengeURL, shareText, renderScoreboard, recordScore, saveName,
   get score(){return score;}, set score(v){score=v;}, get level(){return level;}, set level(v){level=v;},
   get lives(){return lives;}, set lives(v){lives=v;}, get gameState(){return gameState;}, set gameState(v){gameState=v;} };\n}\n`);
const {installShim}=await import(new URL('../微信小游戏版/js/shim.js', import.meta.url));
const shim=installShim({maze:fakeCanvas(),fx:fakeCanvas(1,1)});
const {createGame}=await import(mp);
const g=createGame(shim.env); const el=shim.el;
const fail=[];

g.fullNewGame(); g.score=1283000; g.updateHud();
const hud=el('scoreVal').textContent;
console.log('HUD 分数        :', hud);
if(hud!=='1,283,000') fail.push('HUD 未格式化');

g.saveName('超级奶爸');
g.gameState='playing'; g.level=6; g.score=431070; g.lives=2;
g.endGame(true);
console.log('结算大分数      :', el('finalScore').textContent);
if(el('finalScore').textContent!=='450,570') fail.push('finalScore 未格式化');
console.log('榜单            :', (el('overBoard').innerHTML.match(/board-score">([^<]*)/)||[])[1]);
if(!/\d,\d{3}/.test(el('overBoard').innerHTML)) fail.push('榜单未格式化');
console.log('奖励分明细      :', el('overSub').textContent.split('\n').filter(l=>l.includes('奖励')).join(''));

const url=g.challengeURL();
console.log('挑战链接        :', url);
const c=new URL(url).searchParams.get('c');
console.log('  链接里的分数  :', c, '→ Number():', Number(c));
if(!Number.isFinite(Number(c))||Number(c)!==450570) fail.push('挑战链接分数损坏！');
console.log('分享文案        :', g.shareText().split('\n')[0]);

console.log('\n'+(fail.length?'失败:\n  '+fail.join('\n  '):'全部通过'));
process.exit(fail.length?1:0);
