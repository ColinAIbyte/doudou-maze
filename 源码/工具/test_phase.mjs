// 穿墙水果的回归测试。
//   用法: node test_phase.mjs
//
// 借小游戏版那套假 wx + 假 canvas，在 node 里直接把真游戏逻辑跑起来——不需要
// 浏览器，也就不会再碰上"标签页不在前台 rAF 被暂停"那类干扰。
//
// 这个测试存在的理由：穿墙从一开始就没生效过，而且是无声失败——吃到水果会
// 响、会加分、玩家会变青色，唯独不能穿墙。三样反馈里有两样是对的，所以看
// 起来像"生效了但墙没穿过去"。锁死这个行为，别再退回去。
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const here = p => fileURLToPath(new URL(p, import.meta.url));

// —— 假环境 ——
const noop = () => {};
const fakeCtx = () => ({
  canvas:null, save:noop, restore:noop, scale:noop, translate:noop, rotate:noop,
  beginPath:noop, closePath:noop, moveTo:noop, lineTo:noop, arc:noop, arcTo:noop,
  rect:noop, roundRect:noop, fill:noop, stroke:noop, clip:noop, fillRect:noop,
  clearRect:noop, strokeRect:noop, drawImage:noop, fillText:noop, strokeText:noop,
  measureText:(t)=>({width:String(t).length*7}),
  createLinearGradient:()=>({addColorStop:noop}),
  createRadialGradient:()=>({addColorStop:noop}),
  setLineDash:noop, quadraticCurveTo:noop, bezierCurveTo:noop, ellipse:noop,
});
const fakeCanvas = (w=494,h=546) => {
  const cv={width:w,height:h}; const c=fakeCtx(); c.canvas=cv;
  cv.getContext=()=>c; return cv;
};
const store = new Map();
globalThis.GameGlobal = globalThis;
globalThis.wx = {
  createCanvas:()=>fakeCanvas(),
  getSystemInfoSync:()=>({windowWidth:390,windowHeight:844,pixelRatio:3}),
  getStorageSync:(k)=>store.has(k)?store.get(k):'',
  setStorageSync:(k,v)=>store.set(k,v),
  removeStorageSync:(k)=>store.delete(k),
  createWebAudioContext:()=>{
    const param=()=>({setValueAtTime:noop,linearRampToValueAtTime:noop,
                      exponentialRampToValueAtTime:noop,cancelScheduledValues:noop,value:0});
    const node=(x)=>Object.assign({connect:(d)=>d,disconnect:noop},x);
    return { currentTime:0,state:'running',resume:noop,destination:node({}),
             createOscillator:()=>node({type:'square',frequency:param(),detune:param(),
                                        start:noop,stop:noop,onended:null}),
             createGain:()=>node({gain:param()}) };
  },
  onTouchStart:noop,onTouchEnd:noop,onTouchMove:noop,showKeyboard:noop,hideKeyboard:noop,
  onKeyboardInput:noop,onKeyboardConfirm:noop,onShow:noop,onHide:noop,
};
globalThis.requestAnimationFrame = () => 0;
globalThis.performance = globalThis.performance || { now: () => Date.now() };

// —— 直接从网页版提取逻辑，测的就是要发布的那一份 ——
const html = readFileSync(here('../pacman_fragment.html'), 'utf8');
let bodyJs = html.slice(html.indexOf('<script>')+8, html.lastIndexOf('</script>')).trim();
bodyJs = bodyJs.replace(/^\(function\(\)\s*\{\s*(?:"use strict";|'use strict';)?/, '')
               .replace(/\}\)\(\);?$/, '').trim();
const dir = mkdtempSync(join(tmpdir(), 'doudou-'));
const modPath = join(dir, 'core.mjs');
writeFileSync(modPath, `export function createGame(){\n${bodyJs}\n
  return { update, render, requestDir, tileAt, canEnter, openDirs,
           get player(){return player;}, get level(){return level;},
           get score(){return score;}, get gameState(){return gameState;},
           set gameState(v){gameState=v;}, fullNewGame, COLS, ROWS,
           FRUIT_PHASE_SECONDS, SCORE_MULT, addScore };\n}\n`);

const { installShim } = await import(here('../微信小游戏版/js/shim.js'));
installShim({ maze: fakeCanvas(), fx: fakeCanvas(1,1) });
const { createGame } = await import(modPath);
const g = createGame();

let failed = 0;
const ok   = m => console.log('✓ ' + m);
const bad  = m => { console.log('✗ ' + m); failed++; };

g.fullNewGame();
g.gameState = 'playing';

// 找一堵内部的墙：左右都是墙，上下是通路——不穿墙就绝对过不去
const { COLS, ROWS } = g;
let probe = null;
for (let y=2; y<ROWS-2 && !probe; y++){
  for (let x=2; x<COLS-2; x++){
    const wall = g.tileAt(x,y) === '#';
    const openL = g.tileAt(x-1,y) !== '#', openR = g.tileAt(x+1,y) !== '#';
    if (wall && openL && openR){ probe = {x,y}; break; }
  }
}
if (!probe){ bad('第一关找不到可用于测试的内墙'); process.exit(1); }
console.log(`测试墙: (${probe.x},${probe.y})，左右两侧都是通路\n`);

function runFrom(startX, startY, dir, phase, seconds){
  const p = g.player;
  p.x = startX; p.y = startY; p.phase = phase;
  p.dir = {x:0,y:0}; p.want = {x:0,y:0}; p.warpCd = 0;
  p.baseSpeed = 5.408; p.speed = 5.408; p.straightTiles = 0;
  g.requestDir(dir);
  for (let i=0;i<Math.round(seconds*60);i++) g.update(1/60);
  return { x:+p.x.toFixed(2), y:+p.y.toFixed(2) };
}

// 1) 没吃水果：必须被墙挡住
{
  const r = runFrom(probe.x-1, probe.y, 'right', 0, 1.0);
  if (r.x <= probe.x - 0.9) ok(`没有穿墙能力时被墙挡住（停在 x=${r.x}）`);
  else bad(`没有穿墙能力却穿过去了，停在 x=${r.x}`);
}

// 2) 吃了水果：必须穿过去
{
  const r = runFrom(probe.x-1, probe.y, 'right', g.FRUIT_PHASE_SECONDS, 1.0);
  if (r.x >= probe.x + 0.9) ok(`穿墙生效，穿过 (${probe.x},${probe.y}) 到 x=${r.x}`);
  else bad(`穿墙没生效，仍停在 x=${r.x}（期望 > ${probe.x + 0.9}）`);
}

// 3) 边框永远穿不出去
{
  const p = g.player;
  const r = runFrom(1, 1, 'up', g.FRUIT_PHASE_SECONDS, 1.0);
  if (r.y >= 0.9) ok(`穿墙状态下也出不了边框（停在 y=${r.y}）`);
  else bad(`穿墙把玩家带出了边框，y=${r.y}`);
}

// 4) 穿墙失效后不会卡死在墙里
{
  const p = g.player;
  p.x = probe.x; p.y = probe.y; p.phase = 0;
  p.dir={x:0,y:0}; p.want={x:0,y:0};
  g.update(1/60);
  const inWall = g.tileAt(Math.round(p.x), Math.round(p.y)) === '#';
  if (!inWall) ok(`穿墙失效后被救回合法格 (${Math.round(p.x)},${Math.round(p.y)})`);
  else bad('穿墙失效后仍卡在墙里');
}

// 5) 分数倍率
{
  if (g.SCORE_MULT === 1.5) ok('分数倍率 = 1.5');
  else bad(`分数倍率 = ${g.SCORE_MULT}，期望 1.5`);
  const before = g.score;
  const paid = g.addScore(10);
  if (paid === 15) ok(`基础 10 分实际入账 ${paid} 分`);
  else bad(`基础 10 分入账 ${paid} 分，期望 15`);
  if (Number.isInteger(paid)) ok('得分是整数，不会出现小数点');
  else bad(`得分出现小数: ${paid}`);
}

console.log(failed ? `\n${failed} 项失败。` : '\n全部通过。');
process.exit(failed ? 1 : 0);
