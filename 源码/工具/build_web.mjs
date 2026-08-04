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
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

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

const TITLE = '豆豆迷宫';
const DESC  = '霓虹迷宫吃豆游戏，六关递进。连吃 · 闪避 · 穿越。';
const AUTHOR = '超级奶爸';

// 内联的 SVG favicon：一个吃豆人。用 data URI 是因为整站必须保持"一个文件"，
// 多一个 .ico 就多一次请求，也多一个上传时会被忘掉的东西。
const FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
  `<rect width="32" height="32" rx="6" fill="#0a0612"/>` +
  `<path d="M16 6a10 10 0 1 0 8.66 15L16 16l8.66-5A10 10 0 0 0 16 6z" fill="#ffcf5c"/></svg>`);

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<title>${TITLE}</title>
<meta name="description" content="${DESC}">
<meta name="author" content="${AUTHOR}">
<meta name="theme-color" content="#0a0612">
<link rel="icon" href="${FAVICON}">
<link rel="apple-touch-icon" href="${FAVICON}">
<!-- 加到手机主屏后按全屏应用打开，而不是套一层浏览器地址栏 -->
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="mobile-web-app-capable" content="yes">
<!-- 分享到微信/群里时的卡片。缺了这些，别人看到的只有一条光秃秃的网址 -->
<meta property="og:type" content="website">
<meta property="og:title" content="${TITLE}">
<meta property="og:description" content="${DESC}">
<meta name="twitter:card" content="summary">
<style>
/* 整页锁死不滚动。手机上边玩边让页面上下弹是最影响手感的一件事，
   而 iOS Safari 的橡皮筋回弹默认就会这么干。 */
html, body {
  margin:0; padding:0;
  width:100%; min-height:100%;
  background:#0a0612;
  overscroll-behavior:none;
  -webkit-text-size-adjust:100%;
}
body {
  display:flex; align-items:center; justify-content:center;
  padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  box-sizing:border-box;
}
/* 双击缩放会在连点方向键时误触发 */
* { -webkit-tap-highlight-color:transparent; }
</style>
</head>
<body>
${fragment}
</body>
</html>
`;

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
