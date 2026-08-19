// 每帧渲染的开销上限。
//   用法: node test_render_cost.mjs
//
// 为什么要有这一条：性能是**不会报错**的那类东西。少一个缓存、多一层循环，
// 测试照样全绿、画面一模一样，只有真机上手感变钝——而手机（微信那两个版本）
// 掉帧的门槛比电脑低得多，等有人反馈"卡"的时候，早就说不清是哪次改动带来的。
//
// 这里盯三个数，都是实测出来会失控的：
//   1. getComputedStyle 的次数。cssVar 曾经每次调用都走它，而它被写在了画豆子的
//      双层循环里 —— 第一关每帧 361 次。它不是读个属性那么便宜，会迫使浏览器
//      重新解析样式，是典型的"不量就永远想不到"的大头。
//   2. 带阴影的绘制次数。shadowBlur 是 canvas 2D 最贵的操作，曾经每帧 394 次
//      （墙 200 + 豆子 175 + 其他）—— 而墙一整关都不动。
//   3. 绘制调用总数。
//
// 阈值都留了余量，是"别再退回去"的护栏，不是精确基准。
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';

const noop = () => {};
const C = {};
const bump = k => { C[k] = (C[k] || 0) + 1; };
let shadowOn = false;

const fakeCtx = () => new Proxy({}, {
  get: (t, k) => {
    if (k === 'measureText') return x => ({ width: String(x).length * 7 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k === 'fill' || k === 'stroke' || k === 'fillText'){
      return () => { bump('draws'); if (shadowOn) bump('shadowed'); };
    }
    return noop;
  },
  set: (t, k, v) => { if (k === 'shadowBlur') shadowOn = Number(v) > 0; return true; },
});
const fakeCanvas = (w = 494, h = 546) => ({ width: w, height: h, getContext: () => fakeCtx() });

const store = new Map(); globalThis.GameGlobal = globalThis;
globalThis.location = { href: 'https://example.com/' };
globalThis.wx = {
  createCanvas: () => fakeCanvas(),
  getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3 }),
  getStorageSync: k => store.has(k) ? store.get(k) : '',
  setStorageSync: (k, v) => store.set(k, v), removeStorageSync: k => store.delete(k),
  createWebAudioContext: () => ({ currentTime: 0, state: 'running', resume: noop, destination: {},
    createOscillator: () => ({ type: '', frequency: { setValueAtTime: noop, exponentialRampToValueAtTime: noop }, connect: d => d, start: noop, stop: noop }),
    createGain: () => ({ gain: { setValueAtTime: noop, exponentialRampToValueAtTime: noop }, connect: d => d }) }),
  onTouchStart: noop, onTouchEnd: noop, onTouchMove: noop, showKeyboard: noop, hideKeyboard: noop,
  onKeyboardInput: noop, onKeyboardConfirm: noop, onShow: noop, onHide: noop, showShareMenu: noop,
  onShareAppMessage: noop, onShareTimeline: noop,
};
globalThis.requestAnimationFrame = () => 0;

const html = readFileSync(new URL('../pacman_fragment.html', import.meta.url), 'utf8');
const body = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>')).trim()
  .replace(/^\(function\(\)\s*\{\s*(?:"use strict";|'use strict';)?/, '').replace(/\}\)\(\);?$/, '').trim();
const dir = mkdtempSync(join(tmpdir(), 'trc-')); const mp = join(dir, 'c.mjs');
writeFileSync(mp, `export function createGame(env){
 const document=env.document,window=env.window,localStorage=env.localStorage,
   getComputedStyle=env.getComputedStyle,requestAnimationFrame=env.requestAnimationFrame,
   cancelAnimationFrame=env.cancelAnimationFrame,performance=env.performance;
${body}
 return { fullNewGame, update, render, get pelletsLeft(){return pelletsLeft;},
   set gameState(v){gameState=v;} };\n}\n`);

const { installShim } = await import(new URL('../../微信小游戏版/js/shim.js', import.meta.url));
const shim = installShim({ maze: fakeCanvas(), fx: fakeCanvas(1, 1) });

let gcs = 0;
const realGcs = shim.env.getComputedStyle;
shim.env.getComputedStyle = (...a) => { gcs++; return realGcs(...a); };

const { createGame } = await import(mp);
const g = createGame(shim.env);
g.fullNewGame(); g.gameState = 'playing';
g.update(1 / 60);                        // 先跑一帧，把一次性的初始化排除掉

for (const k of Object.keys(C)) delete C[k];
gcs = 0;
const N = 60;
for (let i = 0; i < N; i++){ g.update(1 / 60); g.render(); }

const per = { 'getComputedStyle': gcs / N, '带阴影的绘制': (C.shadowed || 0) / N, '绘制总数': (C.draws || 0) / N };
// 上限 / 修好之前的实测值，用来说明护栏拦的是什么
const LIMIT = { 'getComputedStyle': [5, 361], '带阴影的绘制': [60, 394], '绘制总数': [90, 410] };

console.log(`第 1 关满图（${g.pelletsLeft} 颗豆子），${N} 帧平均：\n`);
const bad = [];
for (const [k, v] of Object.entries(per)){
  const [cap, was] = LIMIT[k];
  const ok = v <= cap;
  if (!ok) bad.push(`${k} 每帧 ${v.toFixed(1)}，超过上限 ${cap}`);
  console.log(`  ${ok ? '✓' : '✗'} ${k.padEnd(16)} ${v.toFixed(1).padStart(6)} / 上限 ${String(cap).padEnd(4)}（修好之前是 ${was}）`);
}

if (bad.length){
  console.log('\n渲染开销回退了：');
  bad.forEach(b => console.log('  ✗ ' + b));
  console.log('\n常见原因：cssVar 之类的调用被写进了逐格循环，或者本来一条路径画完的');
  console.log('东西（墙、豆子）又改回一格一次 beginPath+fill。');
  process.exit(1);
}
/* ---------- 画布分辨率的接线检查 ----------
   这部分没法在无头环境里量（没有布局、没有 devicePixelRatio），但接线断没断
   是能从源码看出来的，而断了的后果很实在：要么高清屏上糊回去，要么微信两版
   直接崩。后者不是假设 —— 守卫写错过一次，小游戏当场 setTransform 报错。 */
const src = readFileSync(new URL('../pacman_fragment.html', import.meta.url), 'utf8');
const wire = [
  ['每帧套用变换',      /function render\(\)\{[\s\S]{0,400}?applyMazeTransform\(\)/],
  ['按 dpr 分配像素',   /canvas\.width = w; canvas\.height = h;/],
  ['dpr 有上限',        /Math\.min\(window\.devicePixelRatio \|\| 1, DPR_CAP\)/],
  ['尺寸没变就不重建',  /if \(canvas\.width === w && canvas\.height === h\) return;/],
  ['盯着画布本身变化',  /new ResizeObserver\(fitMazeCanvas\)/],
  // 这三条是微信那两版不被误伤的全部保障
  ['守卫用 instanceof', /canvas instanceof HTMLCanvasElement/],
  ['fit 受守卫保护',    /function fitMazeCanvas\(\)\{\s*\n\s*if \(!CAN_OWN_CANVAS\) return;/],
  ['变换受守卫保护',    /function applyMazeTransform\(\)\{\s*\n\s*if \(!CAN_OWN_CANVAS\) return;/],
  ['清屏用逻辑尺寸',    /ctx\.clearRect\(0, 0, COLS\*TILE, ROWS\*TILE\)/],
];
const broken = wire.filter(([, re]) => !re.test(src)).map(([w]) => w);
if (broken.length){
  console.log('\n画布分辨率的接线断了：');
  broken.forEach(b => console.log('  ✗ ' + b));
  console.log('\n少了守卫，微信两版会在 render 里崩（它们的画布由各自外壳定尺寸）；');
  console.log('少了变换或 dpr，高清屏上迷宫会糊回去。');
  process.exit(1);
}
console.log(`  ✓ 画布分辨率接线完整（${wire.length} 项）`);

/* ---------- 礼花：粒子必须走贴图，不许逐个 shadowBlur ----------
   通关礼花原来每个粒子一次 shadowBlur 的 arc+fill，实测**平均每帧 317 次、
   单帧峰值 506 次**，四秒十万次 —— 比豆子那次（394/帧）还重，而且发生在
   最该流畅的一刻、还要持续十八秒。改成预渲染贴图后每帧带阴影绘制降到 0。
   这里守住那条路径还在，以及退路（微信垫片造不出离屏画布时）也还在。 */
const fxWire = [
  ['贴图会被生成',      /function fxGetSprites\(\)/],
  ['贴图用真实阴影渲染', /g\.shadowBlur = 8;[\s\S]{0,80}?g\.arc\(R, R, FX_REF/],
  ['绘制走 drawImage',  /fxCtx\.drawImage\(sprites\[p\.color\]/],
  ['保留退路',          /fxSpritesFailed = true/],
  ['退路仍逐个画',      /else \{[\s\S]{0,400}?fxCtx\.shadowBlur = 8;/],
];
const fxBroken = fxWire.filter(([, re]) => !re.test(src)).map(([w]) => w);
if (fxBroken.length){
  console.log('\n礼花的贴图渲染断了：');
  fxBroken.forEach(b => console.log('  ✗ ' + b));
  console.log('\n退回逐个 shadowBlur 的话，通关那一刻每帧会多出三百多次最贵的绘制。');
  process.exit(1);
}
console.log(`  ✓ 礼花走贴图渲染（${fxWire.length} 项，含退路）`);

console.log('\n渲染开销在上限内。');
