// 生成可直接上传到网站的完整网页。
//   用法: node build_web.mjs
//   产物: ~/吃豆豆/发布到网站/index.html
//
// 为什么需要这一步：pacman_fragment.html 是**片段**，不是完整网页。它没有
// <!DOCTYPE>、没有 <html>、没有 <head>。artifact 平台发布时会自动包一层壳，
// 所以在那个链接上一切正常；可一旦把这个文件直接传到静态托管上，就没人替你
// 包了。
//
// 最要命的是缺 <meta name="viewport">。浏览器对缺 doctype 很宽容，照样渲染，
// 但没有 viewport 的页面在手机上会按 980px 的桌面宽度排版再整体缩小 ——
// 迷宫小得看不清，按钮点不中。而分享出去的链接绝大多数正是在手机上打开的，
// 也就是说：不包这层壳，等于把最主要的使用场景做坏了，桌面上却看不出问题。
//
// 外壳本身在 web_shell.mjs，跟测试版共用同一份。
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { wrap, TITLE } from './web_shell.mjs';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const OUT_DIR = here('../../发布到网站');
const fragment = readFileSync(here('../pacman_fragment.html'), 'utf8');

if (fragment.includes('__dbg')) {
  console.error('片段里有调试钩子，先清干净再打包。');
  process.exit(1);
}
if (/<!DOCTYPE|<html[\s>]/i.test(fragment)) {
  console.error('片段里已经有 <html>/<!DOCTYPE> 了，说明结构变了，本脚本会包重复。');
  process.exit(1);
}

const html = wrap(fragment);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/index.html`, html);

// 静态托管上没有这个文件时，访问不存在的路径会是平台自带的英文报错页。
writeFileSync(`${OUT_DIR}/404.html`, `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>页面不存在 · ${TITLE}</title>
<style>body{margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;
justify-content:center;background:#0a0612;color:#ece7fb;font-family:system-ui,sans-serif;gap:16px}
a{color:#ffcf5c}</style></head>
<body><h1 style="font-size:20px">页面不存在</h1><a href="/">回到${TITLE}</a></body></html>
`);

const kb = (html.length/1024).toFixed(0);
console.log(`已生成 发布到网站/index.html（${kb} KB，单文件，零外部依赖）`);
console.log('     发布到网站/404.html');
console.log('整个目录拖到任意静态托管即可。');
