// 从网页版提取核心逻辑，生成微信小程序版的 utils/core.js。
//   用法: node build_miniprogram.mjs
//
// 和 build_weapp.mjs 是同一个思路、两个产物：逻辑只在 pacman_fragment.html
// 里维护，小游戏版和小程序版都从它生成，谁也不许手抄。抄一遍就等于多了一份
// 会各自漂移的实现——网页版调了难度、修了 bug，另外两份还停在旧版本，而这种
// 不一致通常几周后才被发现。
//
// 与小游戏版唯一的区别是模块格式：小程序对 ES module 的支持随基础库版本而变，
// 而 CommonJS 从第一天起就稳。差一个 export 关键字换来的兼容性，值。
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const OUT_DIR = here('../../微信小程序版/utils');
const src = readFileSync(here('../pacman_fragment.html'), 'utf8');

if (src.includes('__dbg')) {
  console.error('网页版里有调试钩子，先清干净再生成小程序版。');
  process.exit(1);
}

const open = src.indexOf('<script>');
const close = src.lastIndexOf('</script>');
if (open === -1 || close === -1) { console.error('找不到 <script> 块'); process.exit(1); }
let body = src.slice(open + '<script>'.length, close).trim();

// 网页版整段包在一个 IIFE 里，必须拆掉这层壳，否则下面 return 引用的
// gameState / level / player 全在闭包内部，外面看不见。
const HEAD = /^\(function\(\)\s*\{\s*(?:"use strict";|'use strict';)?/;
const TAIL = /\}\)\(\);?$/;
if (!HEAD.test(body) || !TAIL.test(body)) {
  console.error('网页版脚本的 IIFE 外壳对不上，提取会出错。请检查正则。');
  process.exit(1);
}
body = body.replace(HEAD, '').replace(TAIL, '').trim();

// 自启的 requestAnimationFrame(loop) 保留原样。小程序没有全局 rAF（它挂在
// canvas 节点上），但垫片会在 createGame() 之前把它补到全局，所以自启是有效的。
//
// 一开始的做法是把这行拆掉、改成页面显式 startLoop()，那样不够：通关烟花
// 自己还有一条独立的动画循环，也用全局 rAF，只改主循环的话，玩家打穿六关的
// 那一瞬间才会抛 ReferenceError —— 最难复现的一类崩溃。既然补全局 rAF 无论
// 如何都要做，主循环就没必要再特殊处理。

const out = `/* 自动生成，请勿手改。
 * 由 v1-发布版/工具/build_miniprogram.mjs 从 v1-发布版/pacman_fragment.html 提取。
 * 要改游戏逻辑，改网页版那一份，然后重新跑一次生成脚本。
 * 生成时间: ${new Date().toISOString().slice(0,19).replace('T',' ')}
 */
function createGame(env){
  /* 浏览器全局一律从 env 取，声明成局部变量把宿主那份遮蔽掉。
   *
   * 为什么非这样不可：微信基础库 3.17 自带只读的 window 和 document，
   * 而那个 document 里没有 getElementById。试过替换全局（只读，装不上），
   * 也试过往宿主对象上补方法（对象本身也只读，补不进去），都失败了 ——
   * 逻辑一跑到 document.getElementById 就崩，游戏加载即黑屏。
   *
   * 局部变量则一定赢：它在词法作用域上遮蔽全局，宿主怎么锁都无关。
   * 这也比跟运行时较劲更稳 —— 基础库以后再改行为，这里都不用跟着改。 */
  const document = env.document;
  const window = env.window;
  const localStorage = env.localStorage;
  const getComputedStyle = env.getComputedStyle;
  const requestAnimationFrame = env.requestAnimationFrame;
  const cancelAnimationFrame = env.cancelAnimationFrame;
  const performance = env.performance;

${body}

  // 供页面驱动的入口。用 getter 是因为 gameState / level / score 这些是会变的
  // 顶层变量，直接取值只会拿到创建那一刻的快照。
  return {
    get gameState(){ return gameState; },
    set gameState(v){ gameState = v; },
    get level(){ return level; },
    get score(){ return score; },
    get lives(){ return lives; },
    get combo(){ return combo; },
    get player(){ return player; },
    get ghosts(){ return ghosts; },
    // 小程序的榜单是自己用 WXML 渲的，拿不到逻辑层写好的那串 HTML，
    // 所以得把"这一局是哪条记录"给出去，不然高亮不出玩家自己那行。
    get lastRunId(){ return lastRunId; },
    MAX_LEVEL,
    requestDir, togglePause, fullNewGame, render, update, Audio2,
    renderScoreboard, loadScores, recordScore, renameScore, cleanName,
    commitName, openHelp, closeHelp,
  };
}

module.exports = { createGame };
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/core.js`, out);
console.log(`已生成 微信小程序版/utils/core.js（${(out.length/1024).toFixed(0)} KB，${body.split('\n').length} 行逻辑）`);
console.log('提醒: 逻辑只在网页版维护，改完记得重跑本脚本。');
