// 分享链接落到哪个地址。
//   用法: node test_share_url.mjs
//
// 为什么单独测这一条：默认行为（用当前地址）在自己的网站上是对的，所以本地
// 怎么点都正常。只有把游戏放进别人的 iframe 里才会出问题 —— itch.io 就是这样，
// 游戏跑在 html-classic.itch.zone 上，location.href 是 CDN 里那个 html 文件。
// 玩家分享出去的链接，别人打开是一个没有介绍、没有作者、随时会换地址的裸页面。
//
// 这类错误不会报任何异常，链接也点得开，只是**落错了地方** —— 除非有人真的
// 去点一次分享出来的链接，否则永远发现不了。
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';

const noop=()=>{};
const fakeCtx=()=>new Proxy({},{get:(_,k)=>{
  if(k==='measureText')return t=>({width:String(t).length*7});
  if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop:noop});
  return noop;}});
const fakeCanvas=(w=494,h=546)=>({width:w,height:h,getContext:()=>fakeCtx()});
const store=new Map(); globalThis.GameGlobal=globalThis;
globalThis.location={href:'https://html-classic.itch.zone/html/9999/index.html'};
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
const dir=mkdtempSync(join(tmpdir(),'su-')); const mp=join(dir,'c.mjs');
writeFileSync(mp,`export function createGame(env){
 const document=env.document,window=env.window,localStorage=env.localStorage,
   getComputedStyle=env.getComputedStyle,requestAnimationFrame=env.requestAnimationFrame,
   cancelAnimationFrame=env.cancelAnimationFrame,performance=env.performance;
${body}
 return { challengeURL, shareBase, fullNewGame, endGame,
   set score(v){score=v;}, set level(v){level=v;}, set lives(v){lives=v;},
   set gameState(v){gameState=v;} };\n}\n`);

const {installShim}=await import(new URL('../微信小游戏版/js/shim.js',import.meta.url));
const fail=[];

/** 每次都新建一份游戏，因为 shareBase 读的是创建时那个 window。 */
async function make(shareUrl){
  const shim=installShim({maze:fakeCanvas(),fx:fakeCanvas(1,1)});
  if (shareUrl) shim.env.window.DOUDOU_SHARE_URL = shareUrl;
  else delete shim.env.window.DOUDOU_SHARE_URL;
  const {createGame}=await import(mp + '?v=' + Math.random());
  return createGame(shim.env);
}

// 一、没指定：用当前地址（自己的网站上就该是这样）
{
  const g = await make(null);
  const u = g.challengeURL();
  if (!u.startsWith('https://html-classic.itch.zone/'))
    fail.push(`没指定落地页时应当用当前地址，实得 ${u}`);
}

// 二、指定了：分享链接必须落到正式页面，而不是 CDN 上那个文件
{
  const site = 'https://superpapa.itch.io/doudou-maze';
  const g = await make(site);
  const u = g.challengeURL();
  if (!u.startsWith(site))
    fail.push(`指定了落地页却没用上，实得 ${u}`);
  if (u.includes('itch.zone'))
    fail.push(`分享链接里还带着 CDN 地址：${u}`);
  // 分数和名字这两个参数不能因为换了地址就丢了
  if (!/[?&]c=/.test(u))
    fail.push(`分享链接里没有分数参数：${u}`);
}

// 三、地址本身带查询串时，不能把它冲掉
{
  const site = 'https://example.com/play?from=weixin';
  const g = await make(site);
  const u = new URL(g.challengeURL());
  if (u.searchParams.get('from') !== 'weixin')
    fail.push('落地页原有的查询参数被冲掉了：' + u.toString());
  if (!u.searchParams.has('c'))
    fail.push('分数参数没加上：' + u.toString());
}

// 四、打包脚本得真的会注入
const build = readFileSync(new URL('./build_itch.mjs', import.meta.url), 'utf8');
if (!build.includes('window.DOUDOU_SHARE_URL='))
  fail.push('build_itch.mjs 不再注入 DOUDOU_SHARE_URL 了');
if (!build.includes("{ cwd: STAGE }") || !build.includes("'index.html'"))
  fail.push('build_itch.mjs 没有从暂存目录打包根级 index.html，itch 会拒绝');
if (!build.includes("'assets/doudou-hero.png'"))
  fail.push('build_itch.mjs 没把豆豆主视觉资源装进 zip');

console.log(fail.length
  ? '分享链接有问题：\n  ✗ ' + fail.join('\n  ✗ ')
  : '分享链接 OK：默认用当前地址；宿主指定 DOUDOU_SHARE_URL 时落到正式页面，分数与原有参数都不丢。');
process.exit(fail.length ? 1 : 0);
