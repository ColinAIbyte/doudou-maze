// Builds 工具/测试版.html = the shipped game + test-only hooks.
//   用法: node make_testbuild.mjs
//
// The shipped pacman_fragment.html must never contain debug hooks. Editing them
// in and remembering to strip them out again worked, but only because it was
// checked every single time — one forgotten strip and the hooks ship. Generating
// a throwaway copy instead means the published file is clean by construction,
// and the test build can never drift from it because it is regenerated from it.
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const game  = readFileSync(here('../pacman_fragment.html'), 'utf8');
const hooks = readFileSync(here('debug_hooks.js'), 'utf8');

if (game.includes('__dbg')) {
  console.error('发布文件里出现了 __dbg —— 调试钩子不该进正式文件，先清掉再生成测试版。');
  process.exit(1);
}

// The game body is one <script> ending just before </script>; the hooks have to
// run inside it to see the closure variables (level, ghosts, player, update...).
const marker = 'requestAnimationFrame(loop);';
const idx = game.lastIndexOf(marker);
if (idx === -1) { console.error('找不到启动点 requestAnimationFrame(loop);'); process.exit(1); }
const cut = idx + marker.length;

// The bot only ever touches window.__dbg, so it does not need the closure —
// but appending it here keeps the test build a single self-contained file.
const bot = readFileSync(here('autoplay.js'), 'utf8');

const out = game.slice(0, cut) + '\n\n/* ==== 测试专用，由 make_testbuild.mjs 注入 ==== */\n'
          + hooks + '\n' + bot + game.slice(cut);
writeFileSync(here('测试版.html'), out);
console.log(`已生成 工具/测试版.html（${(out.length/1024).toFixed(0)} KB），发布文件未改动。`);
