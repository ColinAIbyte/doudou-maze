// 开始页那几处"温度"：欢迎语、故事入口、榜单只露前三、「新」徽章。
//   用法: node test_warmth.mjs
//
// 这几样全是**坏了也不会报错**的东西：欢迎语说错话、榜单一直摊开六行、
// 「新」挂在旧纪录上 —— 游戏照样能玩，只有人看着别扭。而它们又恰恰是这一屏
// 想传达的全部意思，所以只能靠断言钉住。
//
// 「新」这一条尤其要盯：它必须是**独立徽章**、而且只标刚打出来的那条。
// 拼在名字后面就成了"超级奶爸新"，看着像名字的一部分或者程序出错 ——
// 作者报的正是这个观感。
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
const body=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')).trim()
  .replace(/^\(function\(\)\s*\{\s*(?:"use strict";|'use strict';)?/,'').replace(/\}\)\(\);?$/,'').trim();
const dir=mkdtempSync(join(tmpdir(),'wm-')); const mp=join(dir,'c.mjs');
writeFileSync(mp,`export function createGame(env){
 const document=env.document,window=env.window,localStorage=env.localStorage,
   getComputedStyle=env.getComputedStyle,requestAnimationFrame=env.requestAnimationFrame,
   cancelAnimationFrame=env.cancelAnimationFrame,performance=env.performance;
${body}
 return { fullNewGame, endGame, recordScore, renderScoreboard, renderBest, renderWelcome,
   loadScores, saveScores,
   set score(v){score=v;}, set level(v){level=v;}, set lives(v){lives=v;},
   set gameState(v){gameState=v;} };\n}\n`);

const {installShim}=await import(new URL('../../微信小游戏版/js/shim.js',import.meta.url));
const shim=installShim({maze:fakeCanvas(),fx:fakeCanvas(1,1)});
const {createGame}=await import(mp);
const g=createGame(shim.env);
const el=shim.el; const fail=[];

// ---------- 一、欢迎语按"以前玩过没有"分两句 ----------
store.clear();
g.renderWelcome();
const first = el('welcomeLine').textContent;
if (!/准备好了吗/.test(first)) fail.push(`第一次打开该说"准备好了吗"，实得「${first}」`);

g.recordScore({ score:1000, level:1, combo:3, won:false, name:'豆豆' });
g.renderWelcome();
const again = el('welcomeLine').textContent;
if (!/欢迎回来/.test(again)) fail.push(`有纪录时该说"欢迎回来"，实得「${again}」`);
if (first === again) fail.push('两种情况说的是同一句话，等于没分');

// ---------- 二、榜单默认只露前三 ----------
store.clear();
for (let i=1;i<=6;i++) g.recordScore({ score:i*1000, level:i, combo:i, won:false, name:'玩家'+i });
g.renderScoreboard('startBoard', null);
let html2 = el('startBoard').innerHTML;
const rows = (html2.match(/class="board-row/g)||[]).length;
if (rows !== 3) fail.push(`默认该只显示前三名，实得 ${rows} 行`);
if (!/board-more/.test(html2)) fail.push('超过三条时没有「查看全部纪录」的出口');
if (!/查看全部纪录/.test(html2)) fail.push('展开按钮文案不对');

// 三条以内不该出现展开按钮 —— 只有四条却摆个"查看全部"是徒增一次点击
store.clear();
for (let i=1;i<=3;i++) g.recordScore({ score:i*1000, level:i, combo:i, won:false, name:'玩家'+i });
g.renderScoreboard('startBoard', null);
if (/board-more/.test(el('startBoard').innerHTML))
  fail.push('只有三条纪录时不该出现展开按钮');

// ---------- 三、「新」徽章 ----------
store.clear();
g.recordScore({ score:5000, level:2, combo:9, won:false, name:'超级奶爸' });
g.recordScore({ score:3000, level:1, combo:4, won:false, name:'豆豆' });

// 没打过任何一局时，谁也不该挂「新」
g.renderScoreboard('startBoard', null);
if (/board-new/.test(el('startBoard').innerHTML))
  fail.push('还没打这一局，旧纪录就挂上了「新」');

// 真打一局，只有刚产生的那条挂「新」
g.fullNewGame();
g.gameState='playing'; g.score=7777; g.level=3; g.lives=0;
g.endGame(false);
const over = el('overBoard').innerHTML;
const badges = (over.match(/class="board-new"/g)||[]).length;
if (badges !== 1) fail.push(`「新」徽章应当正好 1 个，实得 ${badges} 个`);
/* 徽章必须是独立元素，不能拼在名字里。
   `>超级奶爸新<` 这种形态就是作者报的"看起来像昵称内容或程序错误"。 */
if (/>[^<]*新<\/span>\s*<span class="board-score"/.test(over) && !/class="board-new"/.test(over))
  fail.push('「新」被拼进了名字里，应当是独立徽章');
if (/board-name">[^<]*新</.test(over))
  fail.push('名字里混进了「新」字');

// 开下一局，「新」必须消失
g.fullNewGame();
g.renderScoreboard('startBoard', null);
if (/board-new/.test(el('startBoard').innerHTML))
  fail.push('开了下一局，上一局的「新」还挂着');

// ---------- 四、最高纪录改成中文 ----------
store.clear();
g.recordScore({ score:128650, level:5, combo:20, won:false, name:'豆豆' });
g.renderBest();
const best = el('bestLine').innerHTML;
if (/BEST/.test(best)) fail.push('最高纪录那行还写着 BEST，应当是中文');
if (!/你的最高纪录/.test(best)) fail.push('最高纪录那行没有「你的最高纪录」');
if (!/128,650/.test(best)) fail.push('最高分数字没了或没加千分位');

// ---------- 五、开始页那句故事（源码级接线）----------
const src = html;
const wire = [
  ['故事那句在开始页',   /id="storyLine"[\s\S]{0,200}?一个爸爸和儿子一起做的小游戏/],
  ['故事那句可点开关于', /\['aboutBtn', 'storyLine'\]/],
  ['欢迎语在投币下面',   /<h2>投币<\/h2>[\s\S]{0,600}?id="welcomeLine"/],
  ['故事在按钮下面',     /id="startBtn"[\s\S]{0,800}?id="storyLine"/],
];
for (const [what, re] of wire){
  if (!re.test(src)) fail.push(`接线断了：${what}`);
}
/* 旧文案不许再出现在任何地方。改文案最容易漏的就是"还有一处也写着同样的话"，
   而两处不一致比两处都是旧的更糟 —— 玩家会以为自己看花了眼。 */
if (src.includes('一个爸爸做给儿子的游戏'))
  fail.push('还残留着旧文案「一个爸爸做给儿子的游戏」，应当全部换成「一个爸爸和儿子一起做的小游戏」');

console.log(fail.length
  ? '开始页的"温度"有问题：\n  ✗ ' + fail.join('\n  ✗ ')
  : '开始页 OK：欢迎语分两句 / 榜单默认前三 / 「新」是独立徽章且只标本局 / 最高纪录已中文 / 故事入口就位。');
process.exit(fail.length ? 1 : 0);
