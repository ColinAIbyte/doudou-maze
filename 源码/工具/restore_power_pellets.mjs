// Repairs levels where moving a portal onto a corner tile overwrote a power
// pellet that happened to already be sitting there. Re-adds power pellets
// until each level has exactly 4, choosing spots that are far from the ones
// already placed so they stay spread around the board.
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = fileURLToPath(new URL('../pacman_fragment.html', import.meta.url));
let src = readFileSync(FILE, 'utf8');

const COLS = 19, ROWS = 21, TUNNEL_ROW = 10;
const PLAYER = [9, 15];
const RESERVED = new Set(['9,6','9,7','9,8','9,12','9,13','9,14','9,15']);

for (const n of [2,3,4,5,6]) {
  const re = new RegExp(`const MAZE_LEVEL_${n} = \\[([\\s\\S]*?)\\];`);
  const m = src.match(re);
  const g = m[1].split('\n').map(l=>l.trim()).filter(Boolean)
    .map(l=>l.replace(/^"/,'').replace(/",?$/,'').split(''));

  const powers = [];
  for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) if (g[y][x]==='o') powers.push([x,y]);
  if (powers.length === 4) { console.log(`L${n}: already 4 power pellets`); continue; }

  const need = 4 - powers.length;
  const cands = [];
  for (let y=1;y<ROWS-1;y++) for (let x=1;x<COLS-1;x++) {
    if (g[y][x] !== '.') continue;                       // plain pellet tiles only
    if (RESERVED.has(`${x},${y}`) || y===TUNNEL_ROW) continue;
    if (x===PLAYER[0] && y===PLAYER[1]) continue;
    cands.push([x,y]);
  }

  const added = [];
  for (let k=0;k<need;k++) {
    let best=null, bestScore=-1;
    for (const [x,y] of cands) {
      if (g[y][x] !== '.') continue;
      const placed = [...powers, ...added];
      const score = placed.length
        ? Math.min(...placed.map(([px,py]) => Math.abs(px-x)+Math.abs(py-y)))
        : 0;
      if (score > bestScore) { bestScore = score; best = [x,y]; }
    }
    if (!best) { console.error(`L${n}: nowhere to put a power pellet`); process.exit(1); }
    g[best[1]][best[0]] = 'o';
    added.push(best);
  }
  console.log(`L${n}: restored ${need} power pellet(s) at ${added.map(p=>p.join(',')).join(' ')}`);

  src = src.replace(re, `const MAZE_LEVEL_${n} = [\n${g.map(r=>`"${r.join('')}",`).join('\n')}\n];`);
}

writeFileSync(FILE, src);
console.log('\nwritten.');
