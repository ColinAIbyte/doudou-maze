// Scores every walkable tile for how dangerous it is to stand on, so power
// pellets can be placed somewhere that actually costs something to reach.
//
// Two things make a tile risky in this game, and both are legible to a player:
//   * few ways out — if a ghost appears you have nowhere to break for
//   * close to the ghost house — that's where ghosts pour from and return to
//
// Reported per level so the placement rule can be chosen from real numbers
// rather than intuition.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const FILE = fileURLToPath(new URL('../pacman_fragment.html', import.meta.url));
const src = readFileSync(FILE, 'utf8');

const COLS = 19, ROWS = 21, TUNNEL_ROW = 10, SPAWN = [9, 15];
const HOUSE = [9, 10];
const walk = ch => ch !== '#' && ch !== 'g' && ch !== 'D';

function grid(n) {
  const m = src.match(new RegExp(`const MAZE_LEVEL_${n} = \\[([\\s\\S]*?)\\];`));
  return m[1].split('\n').map(l => l.trim()).filter(Boolean)
    .map(l => l.replace(/^"/, '').replace(/",?$/, ''));
}

const at = (g, x, y) => {
  let nx = x;
  if (nx < 0) nx = COLS - 1;
  if (nx >= COLS) nx = 0;
  if (y < 0 || y >= ROWS) return '#';
  return g[y][nx];
};
const deg = (g, x, y) =>
  [[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy]) => walk(at(g, x+dx, y+dy))).length;

/**
 * How many genuinely distinct escape routes leave this tile: walk out along
 * each open direction and see how many reach a junction within `reach` tiles
 * without doubling back. 1 means a dead-end pocket — enter it with a ghost
 * behind you and you are finished.
 */
function escapeRoutes(g, x, y, reach = 4) {
  let routes = 0;
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    if (!walk(at(g, x+dx, y+dy))) continue;
    let cx = x + dx, cy = y + dy, px = x, py = y, steps = 0, escaped = false;
    while (steps++ < reach) {
      if (deg(g, cx, cy) >= 3) { escaped = true; break; }
      const nexts = [[1,0],[-1,0],[0,1],[0,-1]]
        .map(([ax,ay]) => [cx+ax, cy+ay])
        .filter(([ax,ay]) => walk(at(g, ax, ay)))
        .filter(([ax,ay]) => !(ax === px && ay === py));
      if (nexts.length !== 1) break;
      px = cx; py = cy; [cx, cy] = nexts[0];
    }
    if (escaped) routes++;
  }
  return routes;
}

const manhattan = (a,b) => Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]);

console.log('每关：当前 4 颗能量豆各自的风险指标');
console.log('（逃生路线越少越险；离幽灵屋越近越险）\n');

for (const n of [1,2,3,4,5,6]) {
  const g = grid(n);
  const pellets = [];
  const all = [];
  for (let y = 1; y < ROWS-1; y++) for (let x = 1; x < COLS-1; x++) {
    const ch = g[y][x];
    if (!walk(ch)) continue;
    const rec = { x, y, esc: escapeRoutes(g, x, y), house: manhattan([x,y], HOUSE) };
    all.push(rec);
    if (ch === 'o') pellets.push(rec);
  }
  const escCounts = {};
  all.forEach(r => { escCounts[r.esc] = (escCounts[r.esc]||0) + 1; });
  console.log(`L${n}  当前能量豆: ` +
    pellets.map(p => `(${p.x},${p.y}) 逃生${p.esc}路/距屋${p.house}`).join('  '));
  console.log(`     全图逃生路线分布: ` +
    Object.entries(escCounts).sort().map(([k,v]) => `${k}路:${v}格`).join('  '));
}
