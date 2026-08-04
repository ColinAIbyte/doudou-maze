// Re-lays the power pellets on levels 2-6.
//
// The generator scattered them by "spread them apart" alone, which produced
// three problems the maps make obvious:
//   * the mazes are left/right mirrored, but the pellets weren't — they read as
//     litter rather than as placed landmarks
//   * some sat 1-2 tiles from the player spawn, so the level's whole difficulty
//     could be skipped by grabbing one on the opening step
//   * whole quadrants went empty while others had two
//
// New rule, matching how level 1 reads: two mirrored PAIRS — one in the upper
// half, one in the lower — each at least MIN_SPAWN_DIST from the spawn and
// clear of the portals, ghost house and tunnel row.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not .pathname — the repo lives under a Chinese path and
// .pathname hands back percent-encoded bytes that fs can't open.
const FILE = fileURLToPath(new URL('../pacman_fragment.html', import.meta.url));
let src = readFileSync(FILE, 'utf8');

const COLS = 19, ROWS = 21, MID = 9, TUNNEL_ROW = 10;
const SPAWN = [9, 15];
const MIN_SPAWN_DIST = 9;     // no freebie on the opening step
const MIN_PORTAL_DIST = 3;    // don't stack a pellet onto a warp exit
const RESERVED = new Set(['9,6','9,7','9,8','9,12','9,13','9,14','9,15']);

const walk = ch => ch !== '#' && ch !== 'g' && ch !== 'D';
const manhattan = (a, b) => Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]);

function relayout(n) {
  const re = new RegExp(`const MAZE_LEVEL_${n} = \\[([\\s\\S]*?)\\];`);
  const rows = src.match(re)[1].split('\n').map(l => l.trim()).filter(Boolean)
    .map(l => l.replace(/^"/, '').replace(/",?$/, ''));
  const g = rows.map(r => r.split(''));

  const portals = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (g[y][x] === '1' || g[y][x] === '2') portals.push([x, y]);
    if (g[y][x] === 'o') g[y][x] = '.';   // clear the old layout
  }

  const usable = (x, y) =>
    x >= 1 && x <= COLS-2 && y >= 1 && y <= ROWS-2 &&
    g[y][x] === '.' &&
    y !== TUNNEL_ROW &&
    !RESERVED.has(`${x},${y}`) &&
    manhattan([x,y], SPAWN) >= MIN_SPAWN_DIST &&
    portals.every(p => manhattan([x,y], p) >= MIN_PORTAL_DIST);

  /** A mirrored pair sits at (x,y) and (18-x,y); both halves must qualify. */
  function pairsIn(yLo, yHi) {
    const out = [];
    for (let y = yLo; y <= yHi; y++) {
      for (let x = 1; x < MID; x++) {
        const mx = COLS - 1 - x;
        if (usable(x, y) && usable(mx, y)) out.push([x, y]);
      }
    }
    return out;
  }

  // Upper pair hugs the top edge; lower pair deliberately sits INSIDE the
  // bottom band rather than on the outer ring, so the four pellets don't all
  // end up on the same perimeter lap. Widest-apart placement wins, which also
  // keeps them clear of the middle where the ghost house already draws traffic.
  const upper = pairsIn(1, 5).sort((a,b) => (a[1]-b[1]) || (a[0]-b[0]));
  const lower = pairsIn(13, 17).sort((a,b) => (a[0]-b[0]) || (b[1]-a[1]));

  if (!upper.length || !lower.length) {
    return { n, ok:false, why:`no symmetric pair (upper=${upper.length} lower=${lower.length})` };
  }
  const u = upper[0], l = lower[0];

  for (const [x, y] of [u, [COLS-1-u[0], u[1]], l, [COLS-1-l[0], l[1]]]) g[y][x] = 'o';

  src = src.replace(re, `const MAZE_LEVEL_${n} = [\n${g.map(r=>`"${r.join('')}",`).join('\n')}\n];`);
  return { n, ok:true,
    placed: [u, [COLS-1-u[0], u[1]], l, [COLS-1-l[0], l[1]]].map(p=>p.join(',')),
    nearestSpawn: Math.min(...[u, [COLS-1-u[0],u[1]], l, [COLS-1-l[0],l[1]]].map(p=>manhattan(p,SPAWN))) };
}

let bad = 0;
for (const n of [2,3,4,5,6]) {
  const r = relayout(n);
  if (!r.ok) { console.error(`L${r.n} FAILED: ${r.why}`); bad++; continue; }
  console.log(`L${r.n}  ${r.placed.join('  ')}   离出生点最近 ${r.nearestSpawn} 格`);
}
if (bad) process.exit(1);
writeFileSync(FILE, src);
console.log('\nwritten.');
