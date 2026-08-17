// 「关于《豆豆迷宫》」这一页的行为。
//   用法: node test_about.mjs
//
// 这一页的规矩里有一条**和玩法说明相反**：说明关掉会接着打，关于关掉停在暂停、
// 不自动继续。反过来的规则最容易在后来某次"顺手统一一下"里被抹平，而抹平之后
// 不会有任何报错 —— 只会变成玩家读完作者的话、一关掉就白掉一条命。
//
// 另外几条（Esc 关、点外面关、焦点进出）都是"不做也能跑"的东西：坏掉了游戏
// 照样能玩，只有用键盘的人和点空白处的人撞上。所以只能靠断言钉住。
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';

const src = readFileSync(new URL('../pacman_fragment.html', import.meta.url), 'utf8');
const fail = [];

/* ---------- 一、静态结构 ----------
   这几条用读源码的方式核，因为它们是 HTML 属性和标签，跑起来反而更绕。 */
const aboutStart = src.indexOf('id="aboutOverlay"');
const aboutEnd   = src.indexOf('id="aboutCloseBtn"');
if (aboutStart < 0 || aboutEnd < 0){
  fail.push('找不到 #aboutOverlay / #aboutCloseBtn');
} else {
  const panel = src.slice(aboutStart - 200, aboutEnd);
  const need = [
    ['标题是「关于《豆豆迷宫》」', '关于《豆豆迷宫》'],
    ['无障碍：role=dialog',        'role="dialog"'],
    ['无障碍：aria-modal',         'aria-modal="true"'],
    // tabindex="-1" 是"焦点能移进来"的前提：没有它 focus() 对 div 无效
    ['可接收焦点 tabindex=-1',     'tabindex="-1"'],
    ['邮箱是 mailto 链接',         'href="mailto:2685897@qq.com"'],
  ];
  for (const [what, pat] of need){
    if (!panel.includes(pat)) fail.push(`关于页缺少：${what}（找不到 ${pat}）`);
  }
  // 作者原文，逐句核
  for (const line of ['儿子想玩一个简单又刺激的小游戏', '他负责试玩和提意见',
                      '其它小朋友也加入了试玩', '游戏制作者：超级奶爸',
                      '反馈与建议', '如果你有建议，或者发现了问题']){
    if (!panel.includes(line)) fail.push(`关于页缺了原文里的「${line}」`);
  }
}

// 入口：标题旁边那个「关于」胶囊，和「玩法」并排
const tagline = src.slice(src.indexOf('<p class="tagline">'), src.indexOf('</p>', src.indexOf('<p class="tagline">')));
if (!tagline.includes('id="aboutBtn"')) fail.push('副标题那行没有「关于」按钮');
if (!tagline.includes('id="helpBtn"'))  fail.push('副标题那行没有「玩法」按钮');
if (tagline.indexOf('id="helpBtn"') > tagline.indexOf('id="aboutBtn"'))
  fail.push('「关于」排在了「玩法」前面，截图里是玩法在左');

// Esc 必须两页都能关
const esc = src.match(/if \(e\.key==='Escape'\)\{([^}]*)\}/);
if (!esc) fail.push('找不到 Escape 的处理');
else if (!esc[1].includes('closeAbout')) fail.push('按 Esc 关不掉关于页');

/* ---------- 二、跑起来验行为 ---------- */
const noop = () => {};
const fakeCtx = () => new Proxy({}, { get:(_,k)=>{
  if (k==='measureText') return t=>({width:String(t).length*7});
  if (k==='createLinearGradient'||k==='createRadialGradient') return ()=>({addColorStop:noop});
  return noop; } });
const fakeCanvas = (w=494,h=546) => ({ width:w, height:h, getContext:()=>fakeCtx() });
const store = new Map(); globalThis.GameGlobal = globalThis;
globalThis.location = { href:'https://example.com/' };
globalThis.wx = {
  createCanvas:()=>fakeCanvas(),
  getSystemInfoSync:()=>({windowWidth:390,windowHeight:844,pixelRatio:3}),
  getStorageSync:k=>store.has(k)?store.get(k):'', setStorageSync:(k,v)=>store.set(k,v),
  removeStorageSync:k=>store.delete(k),
  createWebAudioContext:()=>({currentTime:0,state:'running',resume:noop,destination:{},
    createOscillator:()=>({type:'',frequency:{setValueAtTime:noop,exponentialRampToValueAtTime:noop},connect:d=>d,start:noop,stop:noop}),
    createGain:()=>({gain:{setValueAtTime:noop,exponentialRampToValueAtTime:noop},connect:d=>d})}),
  onTouchStart:noop,onTouchEnd:noop,onTouchMove:noop,showKeyboard:noop,hideKeyboard:noop,
  onKeyboardInput:noop,onKeyboardConfirm:noop,onShow:noop,onHide:noop,showShareMenu:noop,
  onShareAppMessage:noop,onShareTimeline:noop,
};
globalThis.requestAnimationFrame = ()=>0;

const body = src.slice(src.indexOf('<script>')+8, src.lastIndexOf('</script>')).trim()
  .replace(/^\(function\(\)\s*\{\s*(?:"use strict";|'use strict';)?/,'').replace(/\}\)\(\);?$/,'').trim();
const dir = mkdtempSync(join(tmpdir(),'ta-')); const mp = join(dir,'c.mjs');
writeFileSync(mp, `export function createGame(env){
 const document=env.document,window=env.window,localStorage=env.localStorage,
   getComputedStyle=env.getComputedStyle,requestAnimationFrame=env.requestAnimationFrame,
   cancelAnimationFrame=env.cancelAnimationFrame,performance=env.performance;
${body}
 return { fullNewGame, update, render, openAbout, closeAbout, openHelp, closeHelp,
   get gameState(){return gameState;}, set gameState(v){gameState=v;},
   get player(){return player;} };\n}\n`);

const { installShim } = await import(new URL('../../微信小游戏版/js/shim.js', import.meta.url));
const shim = installShim({ maze:fakeCanvas(), fx:fakeCanvas(1,1) });
const { createGame } = await import(mp);
const g = createGame(shim.env);
const el = shim.el;
const shown = id => !el(id).classList.contains('hidden');

// 1) 从开始页打开 → 关掉回开始页，且全程没在跑
g.fullNewGame();
el('startOverlay').classList.remove('hidden');
g.openAbout();
if (!shown('aboutOverlay')) fail.push('从开始页打不开关于页');
if (g.gameState === 'playing') fail.push('关于页开着时游戏在跑');
g.closeAbout();
if (shown('aboutOverlay')) fail.push('关不掉关于页');
if (!shown('startOverlay')) fail.push('从开始页进去，关掉后没回到开始页');

// 2) 玩到一半打开 → 自动暂停；关掉停在暂停页，**不自动继续**
g.fullNewGame();
el('startOverlay').classList.add('hidden');
g.gameState = 'playing';
g.openAbout();
if (g.gameState !== 'paused') fail.push('玩到一半打开关于页没有自动暂停');
if (!shown('pauseOverlay')) fail.push('打开关于页时没把暂停页也备好，关掉后玩家会对着静止的棋盘');
// 关着的时候推进时间，人物一步都不许动
const px = g.player.x, py = g.player.y;
for (let i=0;i<120;i++){ if (g.gameState==='playing') g.update(1/60); }
if (g.player.x !== px || g.player.y !== py) fail.push('关于页开着时人物动了');
g.closeAbout();
if (g.gameState !== 'paused') fail.push(`关掉关于页后自动继续了游戏（应停在暂停），gameState=${g.gameState}`);
if (!shown('pauseOverlay')) fail.push('关掉关于页后没停在暂停页');

// 3) 结算页打开 → 关掉仍回结算页
g.fullNewGame();
el('startOverlay').classList.add('hidden');
el('pauseOverlay').classList.add('hidden');
el('overOverlay').classList.remove('hidden');
g.gameState = 'over';
g.openAbout();
g.closeAbout();
if (g.gameState !== 'over') fail.push('从结算页进出关于页，状态被改成了 ' + g.gameState);
if (!shown('overOverlay')) fail.push('从结算页进去，关掉后没回到结算页');

// 4) 两页不能同时开着
g.openHelp();
g.openAbout();
if (shown('helpOverlay') && shown('aboutOverlay'))
  fail.push('玩法说明和关于页同时开着，会叠在一起');
g.closeAbout(); g.closeHelp();

console.log(fail.length ? '关于页有问题：\n  ✗ ' + fail.join('\n  ✗ ')
                        : '关于页 OK：结构 / 原文 / 入口 / Esc / 三种状态进出 / 开着时不推进。');
process.exit(fail.length ? 1 : 0);
