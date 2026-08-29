// v1.0 发布契约：把本轮已经确认的手机体验和产物同步要求钉住。
// 用法: node 源码/工具/test_release_contract.mjs
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { wrap } from './web_shell.mjs';

const src = readFileSync(new URL('../pacman_fragment.html', import.meta.url), 'utf8');
const web = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const core = readFileSync(new URL('../微信小游戏版/js/core.js', import.meta.url), 'utf8');
const weappEntry = readFileSync(new URL('../微信小游戏版/game.js', import.meta.url), 'utf8');
const buildWeb = readFileSync(new URL('./build_web.mjs', import.meta.url), 'utf8');
const buildWeapp = readFileSync(new URL('./build_weapp.mjs', import.meta.url), 'utf8');
const fail = [];

const number = (name) => {
  const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*([\\d.]+)`));
  if (!m){ fail.push(`找不到 ${name}`); return NaN; }
  return Number(m[1]);
};

if (!src.includes('<span class="tip-touch">在迷宫上滑动</span>'))
  fail.push('手机开始页没有写清楚「在迷宫上滑动」');
if (number('SWIPE_MIN_PX') !== 24) fail.push('滑动阈值不是 24px');
if (number('SWIPE_HINT_SECONDS') !== 2) fail.push('首次滑动动画不是 2 秒');
if (number('TURN_BUFFER_SECONDS') !== 0.25) fail.push('转向缓存不是 250ms');
if (number('TURN_ASSIST_TILES') !== 0.22) fail.push('路口吸附不是 0.22 格');

const drawHint = src.slice(src.indexOf('function drawSwipeHint'), src.indexOf('function markHintSeen'));
const acceptSwipe = src.slice(src.indexOf('function acceptSwipe'), src.indexOf("stage.addEventListener('touchmove'"));
if (/markHintSeen\('move'\)/.test(drawHint)) fail.push('教学一显示就被记成完成');
if (!/markHintSeen\('move'\)/.test(acceptSwipe)) fail.push('首次成功滑动后没有记住教学完成');

if (!src.includes('<details class="help-advanced">')) fail.push('进阶规则没有折叠');
if (!/body\.in-game \.marquee\{[\s\S]{0,100}?max-height:0/.test(src)) fail.push('手机开打后没有收起大标题');
if (!/\.hud \.stat \.k, #comboLabel\{font-size:12px/.test(src)) fail.push('手机 HUD 标签小于 12px');
if (!/\.hud \.stat \.v\{font-size:18px/.test(src)) fail.push('手机 HUD 重要数字小于 18px');
if (!src.includes('v1.0.0')) fail.push('页面没有显示 v1.0.0');

if (!src.includes("const MUTE_KEY = 'doudou.muted.v1'")) fail.push('静音偏好没有固定存储键');
if (!src.includes("localStorage.setItem(MUTE_KEY, muted ? '1' : '0')")) fail.push('静音切换没有持久化');

if (web !== wrap(src)) fail.push('根目录 index.html 不是当前主源码生成的版本');
const hash = createHash('sha1').update(src).digest('hex').slice(0, 12);
if (!core.includes(`源码指纹: ${hash}`)) fail.push('微信小游戏 core.js 落后于主源码');
if (!buildWeapp.includes('requestDir, acceptSwipe')) fail.push('微信核心没有导出统一滑动入口');
if (!weappEntry.includes('game.acceptSwipe(dx, dy)')) fail.push('微信触屏仍绕过统一滑动入口');
if (!buildWeb.includes("const ROOT_DIR = here('../../')") ||
    !buildWeb.includes('writeFileSync(`${ROOT_DIR}index.html`, html)'))
  fail.push('网页版构建没有写回项目根目录');
if (!buildWeapp.includes("const OUT_DIR = here('../微信小游戏版/js')")) fail.push('微信构建输出路径不正确');

if (fail.length){
  console.error('v1.0 发布契约失败：\n  ✗ ' + fail.join('\n  ✗ '));
  process.exit(1);
}
console.log('v1.0 发布契约通过：手机提示、转向、字号、静音、版本号及网页/微信产物均已同步。');
