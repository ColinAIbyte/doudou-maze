// Finds tiles in level 2 where a power pellet can sit WITHOUT being on a
// forced path — i.e. dead ends (degree 1), which you only enter deliberately.
// A degree-2 corridor tile forces you to eat it just by walking through.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const src = readFileSync(
  fileURLToPath(new URL('../pacman_fragment.html', import.meta.url)), 'utf8',
);
const m = src.match(/const MAZE_LEVEL_2 = \[([\s\S]*?)\];/);
const grid = m[1].split('\n').map(l => l.trim()).filter(Boolean)
  .map(l => l.replace(/^"/, '').replace(/",?$/, ''));

const ROWS = grid.length, COLS = grid[0].length;
const walk = ch => ch !== '#' && ch !== 'g' && ch !== 'D';
const at = (x, y) => {
  let nx = x;
  if (nx < 0) nx = COLS - 1;
  if (nx >= COLS) nx = 0;
  if (y < 0 || y >= ROWS) return '#';
  return grid[y][nx];
};
const degree = (x, y) =>
  [[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy]) => walk(at(x+dx, y+dy))).length;

console.log('current power pellets and their degree (1 = dead end, safe; 2+ = forced path):');
for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) {
  if (grid[y][x] === 'o') {
    const d = degree(x,y);
    console.log(`  (${x},${y})  degree ${d}  ${d===1 ? 'OK — dead end' : 'FORCED PATH'}`);
  }
}

const portals = [];
for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) if ('12'.includes(grid[y][x])) portals.push(`${x},${y}`);

console.log('\navailable dead ends (excluding portals & ghost-house exit path):');
const GHOST_PATH = new Set(['9,8','9,7','9,6','9,12','9,13']);
const candidates = [];
for (let y=1;y<ROWS-1;y++) for (let x=1;x<COLS-1;x++) {
  if (grid[y][x] !== '.') continue;
  if (portals.includes(`${x},${y}`) || GHOST_PATH.has(`${x},${y}`)) continue;
  if (degree(x,y) === 1) { candidates.push([x,y]); console.log(`  (${x},${y})`); }
}

// which half of the map each candidate falls in, to honor "middle-right" / "top-right"
console.log('\nright-half candidates (x >= 10):');
for (const [x,y] of candidates) if (x >= 10) console.log(`  (${x},${y})  ${y<7?'top':y>13?'bottom':'middle'}`);
