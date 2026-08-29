// 打一个能直接上传到 itch.io 的 zip。
//   用法: node build_itch.mjs [itch 页面地址]
//   例:   node build_itch.mjs https://superpapa.itch.io/doudou-maze
//
// itch.io 的 HTML5 游戏有一条硬要求：**zip 解开后根目录必须有 index.html**。
// 放进子文件夹就传不上去（它会说找不到 index.html），这是最常见的一次性失败。
//
// 那个可选的地址参数解决另一个坑：itch 把游戏放在 html-classic.itch.zone 的
// iframe 里，游戏内 location.href 拿到的是 CDN 上那个 html 文件的地址。
// 「分享成绩」照着它生成链接，别人点开就是一个没有介绍、没有作者、随时会换
// 地址的裸游戏页。传参数进来就会注入 window.DOUDOU_SHARE_URL，分享链接落到
// 正式页面上。第一次上传时还没有地址，可以先不传，上线后拿到地址再打一次包。
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const OUT_DIR = here('../../itch上传包');
const STAGE = `${OUT_DIR}/game`;
const ZIP = `${OUT_DIR}/doudou-maze-itch.zip`;

const shareUrl = (process.argv[2] || '').trim();
if (shareUrl && !/^https?:\/\//.test(shareUrl)) {
  console.error('地址要带 http(s)://，收到的是：' + shareUrl);
  process.exit(1);
}

const src = here('../../index.html');
const hero = here('../../assets/doudou-hero.png');
if (!existsSync(src)) {
  console.error('没找到项目根目录的 index.html —— 先跑 node build_web.mjs');
  process.exit(1);
}
if (!existsSync(hero)) {
  console.error('没找到 assets/doudou-hero.png，itch 包会缺主角图片。');
  process.exit(1);
}
let html = readFileSync(src, 'utf8');

if (html.includes('__dbg')) {
  console.error('发布文件里有调试钩子，不能上传。先重跑 build_web.mjs。');
  process.exit(1);
}

if (shareUrl) {
  /* 注入到 <head> 最前面：游戏脚本在 body 末尾，读到时这个变量必须已经存在。
     用 JSON.stringify 转义，地址里带引号或反斜杠也不会把脚本打断。 */
  const tag = `<script>window.DOUDOU_SHARE_URL=${JSON.stringify(shareUrl)};</script>`;
  const at = html.indexOf('<head>');
  if (at < 0) { console.error('找不到 <head>，没法注入分享地址'); process.exit(1); }
  html = html.slice(0, at + 6) + '\n' + tag + html.slice(at + 6);
}

/* 只清理**自己产出的东西**，不要整目录 rm。
   第一版写的是 rmSync(OUT_DIR)，结果重跑一次打包就把同目录下手写的
   itch页面文案.md 一起删了 —— 输出目录不是这个脚本的私有领地，
   用户完全可能往里放别的东西。 */
rmSync(STAGE, { recursive: true, force: true });
rmSync(ZIP, { force: true });
mkdirSync(STAGE, { recursive: true });
// index.html 必须在**根目录**
writeFileSync(`${STAGE}/index.html`, html);
mkdirSync(`${STAGE}/assets`, { recursive: true });
copyFileSync(hero, `${STAGE}/assets/doudou-hero.png`);

// cwd 定在暂存目录，既让 index.html 留在 zip 根目录，也保留 assets/ 相对路径。
execFileSync('zip', ['-q', '-r', ZIP, 'index.html', 'assets/doudou-hero.png'], { cwd: STAGE });
rmSync(STAGE, { recursive: true, force: true });   // 打完就收拾掉中间目录

// 打完自己验一遍：解压清单里第一项就该是 index.html
const listing = execFileSync('unzip', ['-Z1', ZIP], { encoding: 'utf8' }).trim().split('\n');
const ok = listing.includes('index.html') && listing.includes('assets/doudou-hero.png');
const kb = (readFileSync(ZIP).length / 1024).toFixed(0);

console.log(`已生成 ${ZIP}（${kb} KB）`);
console.log(`zip 内容: ${listing.join(', ')}`);
console.log(ok ? '✓ index.html 在根目录，主视觉资源也已打包'
               : '✗ index.html 或主视觉资源缺失，不能上传');
console.log(shareUrl ? `✓ 分享链接落到: ${shareUrl}`
                     : '· 未指定分享地址：游戏内「分享成绩」会用 itch 的 CDN 地址\n'
                     + '  上线拿到正式地址后，重跑一次并把地址作为参数传进来。');
if (!ok) process.exit(1);
