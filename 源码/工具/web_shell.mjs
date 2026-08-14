// 网页外壳：<!DOCTYPE> + <head> + 整页样式。
//
// 单独抽出来，是因为它有两个使用者，而它们必须一模一样：
//   build_web.mjs      → 发布到网站/index.html（真正上线的）
//   make_testbuild.mjs → 工具/测试版.html（用来验排版的）
//
// 之前测试版是直接写 pacman_fragment.html 的裸片段，没有 <meta viewport>。
// 后果很隐蔽：测试版在手机宽度下按 980px 桌面宽排版，量出来的坐标、发现的
// 排版问题，跟真正发布的那份根本不是一回事——拿一个排版不对的构建去验排版，
// 等于白验。共用同一个 wrap()，测试版和线上版的外壳就不可能再走偏。
const TITLE = '豆豆迷宫';
const DESC  = '霓虹迷宫吃豆游戏，六关递进。连吃 · 闪避 · 穿越。';
const AUTHOR = '超级奶爸';

// 内联的 SVG favicon：一个吃豆人。用 data URI 是因为整站必须保持"一个文件"，
// 多一个 .ico 就多一次请求，也多一个上传时会被忘掉的东西。
const FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
  `<rect width="32" height="32" rx="6" fill="#0a0612"/>` +
  `<path d="M16 6a10 10 0 1 0 8.66 15L16 16l8.66-5A10 10 0 0 0 16 6z" fill="#ffcf5c"/></svg>`);

export { TITLE, DESC, AUTHOR, FAVICON };

/**
 * 把游戏片段包成一个完整网页。
 * @param {string} fragment  pacman_fragment.html 的内容（可能已注入测试钩子）
 * @param {string} titleSuffix  测试版加个后缀，免得跟正式版的标签页混淆
 */
export function wrap(fragment, titleSuffix = ''){
  const title = TITLE + titleSuffix;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover">
<title>${title}</title>
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
   而 iOS Safari 的橡皮筋回弹默认就会这么干。
   touch-action:manipulation 是锁死缩放的第一道——它明确关掉双击放大，
   而 viewport 里的 user-scalable=no 在 iOS Safari 上是被无视的。 */
html, body {
  margin:0; padding:0;
  width:100%; height:100%;
  background:#0a0612;
  overscroll-behavior:none;
  -webkit-text-size-adjust:100%;
  touch-action:manipulation;
}
body {
  display:flex; align-items:center; justify-content:center;
  padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  box-sizing:border-box;
  overflow:hidden;
}
/* 连点方向键时那层灰色高亮很碍眼 */
* { -webkit-tap-highlight-color:transparent; }
</style>
</head>
<body>
${fragment}
</body>
</html>
`;
}
