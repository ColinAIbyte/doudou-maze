// 确保 GitHub Pages 实际读取的根目录页面就是当前源片段的构建结果。
// 用法: node test_build_consistency.mjs
import { existsSync, readFileSync, statSync } from 'node:fs';
import { wrap } from './web_shell.mjs';

const fragmentUrl = new URL('../pacman_fragment.html', import.meta.url);
const rootIndexUrl = new URL('../../index.html', import.meta.url);
const heroUrl = new URL('../../assets/doudou-hero.png', import.meta.url);

const fragment = readFileSync(fragmentUrl, 'utf8');
const actual = readFileSync(rootIndexUrl, 'utf8');
const expected = wrap(fragment);
const fail = [];

if (fragment.includes('__dbg')) fail.push('源片段仍包含调试钩子 __dbg');
if (/<(?:meta|title)\b/i.test(fragment.slice(0, fragment.indexOf('<style>'))))
  fail.push('源片段开头混入了只能放在页面 head 的标签');
if (actual !== expected) fail.push('根目录 index.html 已和 pacman_fragment.html 漂移，请运行 build_web.mjs');
if (!existsSync(heroUrl) || statSync(heroUrl).size < 1024) fail.push('缺少有效的 assets/doudou-hero.png');
if (!actual.includes('assets/doudou-hero.png')) fail.push('发布页面没有引用豆豆主视觉资产');

if (fail.length){
  fail.forEach(item => console.error('✗ ' + item));
  process.exit(1);
}

console.log('构建一致：根目录页面与源片段同步，豆豆主视觉资产可用。');
