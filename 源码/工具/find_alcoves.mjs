// Finds wall tiles that would become a single-entrance alcove if opened.
// Putting a power pellet in one means the player has to deliberately detour
// in to grab it, instead of swallowing it just by walking down a corridor.
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
const at = (x, y) => (y < 0 || y >= ROWS || x < 0 || x >= COLS) ? '#' : grid[y][x];
const deg = (x, y) => [[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy]) => walk(at(x+dx,y+dy))).length;

console.log('wall tiles that would become dead-end alcoves if carved open:');
const found = [];
for (let y = 1; y < ROWS - 1; y++) {
  for (let x = 1; x < COLS - 1; x++) {
    if (grid[y][x] !== '#') continue;
    if (deg(x, y) !== 1) continue; // exactly one walkable neighbour => alcove
    found.push([x, y]);
  }
}
const region = (x, y) =>
  `${y < 7 ? 'top' : y > 13 ? 'bottom' : 'middle'}-${x < 6 ? 'left' : x > 12 ? 'right' : 'centre'}`;
for (const [x, y] of found) console.log(`  (${x},${y})  ${region(x, y)}`);

console.log('\nbest fits for the two pellets being relocated:');
const midRight = found.filter(([x,y]) => x >= 13 && y >= 8 && y <= 13);
const topRight = found.filter(([x,y]) => x >= 12 && y <= 6);
console.log('  middle-right:', midRight.map(([x,y])=>`(${x},${y})`).join(' ') || 'none');
console.log('  top-right   :', topRight.map(([x,y])=>`(${x},${y})`).join(' ') || 'none');
