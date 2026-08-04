// Reduces the NUMBER of dead ends on a level.
//   用法: node reduce_deadends.mjs <关卡> <目标数量>
//
// open_dead_ends.mjs attacks dead-end DEPTH — how far you must retrace before
// reaching a junction. That is the right measure for "I got chased into a pit
// and died". This script attacks a different problem found by the playtest bot:
// level 5 clears only 70% of the time against 93-100% everywhere else, and the
// distinguishing number is not depth (its worst is a harmless 2) but COUNT — it
// has 10 dead ends against 6 and 7 on its neighbours. Ten shallow pockets is
// ten more places to be cornered, and with six ghosts on the board that is what
// the deaths were.
//
// Each carve opens one wall so a degree-1 tile gains a second exit, and its
// mirror image with it — the mazes are left/right symmetric and a lone carve
// leaves a visible scar. Every carve is validated before being kept:
//   * never the border, ghost house, doors, tunnel row or a portal
//   * the maze stays fully reachable afterwards (portals absorbing)
//   * power pellets are never overwritten
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const LEVEL = Number(process.argv[2]);
const TARGET = Number(process.argv[3]);
if (!LEVEL || LEVEL < 2 || LEVEL > 6 || !Number.isFinite(TARGET)) {
  console.error('用法: node reduce_deadends.mjs <关卡 2-6> <目标数量>');
  console.error('（第一关是业主的基准关，不接受修改）');
  process.exit(1);
}

const FILE = fileURLToPath(new URL('../pacman_fragment.html', import.meta.url));
let src = readFileSync(FILE, 'utf8');

const COLS = 19, ROWS = 21, TUNNEL_ROW = 10;
const SPAWN = [9, 15];
const HOUSE = { x0: 6, x1: 12, y0: 8, y1: 12 };
const walk = ch => ch !== '#' && ch !== 'g' && ch !== 'D';

const at = (g,x,y) => {
  let nx=x; if(nx<0)nx=COLS-1; if(nx>=COLS)nx=0;
  if(y<0||y>=ROWS) return '#';
  return g[y][nx];
};
const deg = (g,x,y) => [[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy])=>walk(at(g,x+dx,y+dy))).length;

function protectedWall(x,y){
  if (x<1 || x>COLS-2 || y<1 || y>ROWS-2) return true;
  if (x>=HOUSE.x0 && x<=HOUSE.x1 && y>=HOUSE.y0 && y<=HOUSE.y1) return true;
  if (y===TUNNEL_ROW) return true;
  return false;
}

function allReachable(g){
  const portals = new Set();
  for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++)
    if (g[y][x]==='1'||g[y][x]==='2') portals.add(`${x},${y}`);
  const seen = Array.from({length:ROWS},()=>new Array(COLS).fill(false));
  seen[SPAWN[1]][SPAWN[0]] = true;
  const q=[SPAWN];
  while(q.length){
    const [x,y]=q.shift();
    if (portals.has(`${x},${y}`)) continue;
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      let nx=x+dx; const ny=y+dy;
      if (ny<0||ny>=ROWS) continue;
      if (nx<0||nx>=COLS){ if(y!==TUNNEL_ROW) continue; nx=nx<0?COLS-1:0; }
      if (seen[ny][nx] || !walk(at(g,nx,ny))) continue;
      seen[ny][nx]=true; q.push([nx,ny]);
    }
  }
  for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++){
    const ch=g[y][x];
    if ((ch==='.'||ch==='o'||ch==='1'||ch==='2') && !seen[y][x]) return false;
  }
  return true;
}

const deadEnds = g => {
  const list=[];
  for (let y=1;y<ROWS-1;y++) for (let x=1;x<COLS-1;x++)
    if (walk(g[y][x]) && deg(g,x,y)===1) list.push([x,y]);
  return list;
};

/** Carves a wall and its mirror, rolling both back if the result won't validate. */
function carveMirrored(g, wx, wy){
  const mx = COLS - 1 - wx;
  const cells = [[wx,wy]];
  if (mx !== wx && g[wy][mx] === '#' && !protectedWall(mx,wy)) cells.push([mx,wy]);
  const backup = cells.map(([x,y]) => g[y][x]);
  cells.forEach(([x,y]) => { g[y][x] = '.'; });
  if (allReachable(g)) return cells;
  cells.forEach(([x,y],i) => { g[y][x] = backup[i]; });
  return null;
}

/** Gives a dead-end tile a second exit by opening one adjacent wall. */
function openOne(g, [x,y]){
  for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const wx=x+dx, wy=y+dy;
    if (g[wy]?.[wx] !== '#' || protectedWall(wx,wy)) continue;
    // the far side must already lead somewhere, else we only carve a nub
    const fx=wx+dx, fy=wy+dy;
    if (fx<0||fx>=COLS||fy<0||fy>=ROWS) continue;
    if (!walk(at(g,fx,fy))) continue;
    const cells = carveMirrored(g, wx, wy);
    if (cells) return cells;
  }
  return null;
}

const re = new RegExp(`const MAZE_LEVEL_${LEVEL} = \\[([\\s\\S]*?)\\];`);
const g = src.match(re)[1].split('\n').map(l=>l.trim()).filter(Boolean)
  .map(l=>l.replace(/^"/,'').replace(/",?$/,'').split(''));

const before = deadEnds(g).length;
const opened = [];
for (let pass=0; pass<20; pass++){
  const list = deadEnds(g);
  if (list.length <= TARGET) break;
  // deepest-looking first: open the ones furthest from spawn, which are the
  // pockets you get chased into rather than the ones next to home
  list.sort((a,b) =>
    (Math.abs(b[0]-SPAWN[0])+Math.abs(b[1]-SPAWN[1])) -
    (Math.abs(a[0]-SPAWN[0])+Math.abs(a[1]-SPAWN[1])));
  let did = null;
  for (const de of list){ did = openOne(g, de); if (did) break; }
  if (!did) break;
  opened.push(...did);
}
const after = deadEnds(g).length;

if (opened.length){
  src = src.replace(re, `const MAZE_LEVEL_${LEVEL} = [\n${g.map(r=>`"${r.join('')}",`).join('\n')}\n];`);
  writeFileSync(FILE, src);
}
console.log(`L${LEVEL}  死巷 ${before} -> ${after}（目标 ${TARGET}）　打通 ${opened.length} 处 ` +
  opened.map(p=>'('+p.join(',')+')').join(' '));
