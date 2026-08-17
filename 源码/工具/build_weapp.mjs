// 从网页版提取核心脚本，生成微信小游戏版的 js/core.js。
//
// 模块格式用 CommonJS 而不是 ES module：小游戏打包器对 import 的处理随基础库
// 和工具版本而变，而 require 从第一天起就稳。小程序版本来就是 CommonJS 且能跑，
// 两边统一，排查时少一个变量。
//   用法: node build_weapp.mjs
//
// 小游戏版不手抄游戏逻辑。抄一遍就等于有了两份会各自漂移的实现——网页版调了
// 难度、修了 bug，小游戏版还停在旧版本，而且这种不一致往往几周后才被发现。
// 所以核心逻辑永远从 pacman_fragment.html 机械提取，js/shim.js 负责把它缺的
// 那一小片 DOM 补出来。改游戏只改网页版，跑一次这个脚本，小游戏版就跟上了。
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const OUT_DIR = here('../../微信小游戏版/js');
const src = readFileSync(here('../pacman_fragment.html'), 'utf8');

if (src.includes('__dbg')) {
  console.error('网页版里有调试钩子，先清干净再生成小游戏版。');
  process.exit(1);
}

const open = src.indexOf('<script>');
const close = src.lastIndexOf('</script>');
if (open === -1 || close === -1) { console.error('找不到 <script> 块'); process.exit(1); }
let body = src.slice(open + '<script>'.length, close).trim();

// 网页版整段包在一个 IIFE 里。必须把这层壳拆掉，否则下面 return 里引用的
// gameState / level / player 全都在闭包内部，外面根本看不见——包着生成出来的
// 文件能通过语法检查，一运行就是一片 ReferenceError。
const HEAD = /^\(function\(\)\s*\{\s*(?:"use strict";|'use strict';)?/;
const TAIL = /\}\)\(\);?$/;
if (!HEAD.test(body) || !TAIL.test(body)) {
  console.error('网页版脚本的 IIFE 外壳对不上，提取会出错。请检查 build_weapp.mjs 的正则。');
  process.exit(1);
}
body = body.replace(HEAD, '').replace(TAIL, '').trim();

// 末尾的 requestAnimationFrame(loop) 保留原样：createGame() 本来就是在垫片
// 装好、canvas 建好之后才调用的，所以在这里自启动是对的。正因为它已经会自启，
// 返回的对象里就不能再给一个 startLoop()——那会开出第二个循环，每帧 update
// 两次，游戏直接快一倍。

const out = `/* 自动生成，请勿手改。
 * 由 v1-发布版/工具/build_weapp.mjs 从 v1-发布版/pacman_fragment.html 提取。
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

  // 供外壳驱动的入口。用 getter 是因为 gameState / level / score 这些是会
  // 变的顶层变量，直接取值只会拿到创建那一刻的快照。
  return {
    get gameState(){ return gameState; },
    set gameState(v){ gameState = v; },
    get level(){ return level; },
    get score(){ return score; },
    get lives(){ return lives; },
    get combo(){ return combo; },
    get player(){ return player; },
    get ghosts(){ return ghosts; },
    MAX_LEVEL,
    requestDir, togglePause, fullNewGame, render, update, Audio2,
    renderScoreboard, loadScores, recordScore, renameScore, cleanName,
    // 玩法说明的开关。小游戏的 game.js 会调它们来响应「?」和「知道了」——
    // 漏导出的话点下去就是 undefined is not a function，游戏直接崩。
    openHelp, closeHelp, openAbout, closeAbout,
    commitName,
  };
}

module.exports = { createGame };
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/core.js`, out);
console.log(`已生成 微信小游戏版/js/core.js（${(out.length/1024).toFixed(0)} KB，${body.split('\n').length} 行逻辑）`);
console.log('提醒: 逻辑只在网页版维护，改完记得重跑本脚本。');
