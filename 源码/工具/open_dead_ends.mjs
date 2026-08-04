// Opens up the punishing dead ends on levels 2-6.
//   用法: node open_dead_ends.mjs
//
// Dead-end DEPTH — how far you must retrace before reaching a junction — is
// what actually makes a maze cruel here. Level 1, the one the owner is happy
// with, tops out at 6 steps: get chased in and you can still work your way
// out. Level 3 had a 17-step pit, level 6 a 12-step one, where being caught
// inside is simply fatal.
//
// The fix knocks a single wall out of the offending corridor so the pocket
// gains a second exit. Every knock is validated before being kept:
//   * never touches the border, ghost house, doors, tunnel row or portals
//   * the maze must stay fully reachable afterwards (portals absorbing)
// The freed tile becomes a plain pellet, so the level's pellet total stays
// consistent with its floor area.
//
// Level 1 is never touched.
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = fileURLToPath(new URL('../pacman_fragment.html', import.meta.url));
let src = readFileSync(FILE, 'utf8');

const COLS = 19, ROWS = 21, TUNNEL_ROW = 10;
const SPAWN = [9, 15];
const HOUSE = { x0: 6, x1: 12, y0: 8, y1: 12 };   // box incl. walls and doors
const MAX_TRAP = 6;        // level 1's worst
const MAX_DETOUR = 32;
const walk = ch => ch !== '#' && ch !== 'g' && ch !== 'D';

const at = (g,x,y) => {
  let nx=x; if(nx<0)nx=COLS-1; if(nx>=COLS)nx=0;
  if(y<0||y>=ROWS) return '#';
  return g[y][nx];
};
const deg = (g,x,y) => [[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy])=>walk(at(g,x+dx,y+dy))).length;

/** Wall tiles we must never carve through. */
function protectedWall(x,y){
  if (x<1 || x>COLS-2 || y<1 || y>ROWS-2) return true;      // border
  if (x>=HOUSE.x0 && x<=HOUSE.x1 && y>=HOUSE.y0 && y<=HOUSE.y1) return true;
  if (y===TUNNEL_ROW) return true;
  return false;
}

function reachable(g){
  const portals = new Set();
  for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++)
    if (g[y][x]==='1'||g[y][x]==='2') portals.add(`${x},${y}`);
  const seen = Array.from({length:ROWS},()=>new Array(COLS).fill(false));
  seen[SPAWN[1]][SPAWN[0]] = true;
  const q=[SPAWN];
  while(q.length){
    const [x,y]=q.shift();
    if (portals.has(`${x},${y}`)) continue;   // absorbing: stepping on it warps you
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      let nx=x+dx; const ny=y+dy;
      if (ny<0||ny>=ROWS) continue;
      if (nx<0||nx>=COLS){ if(y!==TUNNEL_ROW) continue; nx=nx<0?COLS-1:0; }
      if (seen[ny][nx] || !walk(at(g,nx,ny))) continue;
      seen[ny][nx]=true; q.push([nx,ny]);
    }
  }
  return seen;
}

function allReachable(g){
  const seen = reachable(g);
  for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++){
    const ch=g[y][x];
    if ((ch==='.'||ch==='o'||ch==='1'||ch==='2') && !seen[y][x]) return false;
  }
  return true;
}

/** Depth of the dead-end pocket starting at (x,y), plus the tiles along it. */
function trapPath(g,x,y){
  const path=[[x,y]];
  let cx=x, cy=y, prev=null, steps=0;
  while (steps<40){
    const nexts=[[1,0],[-1,0],[0,1],[0,-1]]
      .map(([a,b])=>[cx+a,cy+b])
      .filter(([a,b])=>b>=0&&b<ROWS&&a>=0&&a<COLS&&walk(g[b][a]))
      .filter(([a,b])=>!prev||a!==prev[0]||b!==prev[1]);
    if (nexts.length!==1) break;
    prev=[cx,cy]; [cx,cy]=nexts[0]; steps++;
    path.push([cx,cy]);
    if (deg(g,cx,cy)>=3) break;
  }
  return { depth: steps, path };
}

function worstTrap(g){
  let worst=0, at_=null;
  for (let y=1;y<ROWS-1;y++) for (let x=1;x<COLS-1;x++){
    if (!walk(g[y][x]) || deg(g,x,y)!==1) continue;
    const t = trapPath(g,x,y);
    if (t.depth > worst){ worst=t.depth; at_={x,y,path:t.path}; }
  }
  return { worst, at: at_ };
}

function worstDetour(g){
  const dist = Array.from({length:ROWS},()=>new Array(COLS).fill(-1));
  dist[SPAWN[1]][SPAWN[0]] = 0;
  const q=[SPAWN];
  while(q.length){
    const [x,y]=q.shift();
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      let nx=x+dx; const ny=y+dy;
      if (ny<0||ny>=ROWS) continue;
      if (nx<0||nx>=COLS){ if(y!==TUNNEL_ROW) continue; nx=nx<0?COLS-1:0; }
      if (dist[ny][nx]!==-1 || !walk(at(g,nx,ny))) continue;
      dist[ny][nx]=dist[y][x]+1; q.push([nx,ny]);
    }
  }
  let m=0;
  for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++)
    if ((g[y][x]==='.'||g[y][x]==='o') && dist[y][x]>m) m=dist[y][x];
  return m;
}

/**
 * Carves a wall AND its mirror. The mazes are built left/right symmetric, so
 * knocking out one side alone leaves a visible lopsided scar. Both are opened
 * together, and both are rolled back if the result doesn't validate.
 */
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

/** Tries to give the pocket a second exit by opening one wall along it. */
function relieve(g, path){
  // prefer opening near the closed end, which is where you get cornered
  for (const [x,y] of path){
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const wx=x+dx, wy=y+dy;
      if (wx<0||wx>=COLS||wy<0||wy>=ROWS) continue;
      if (g[wy][wx] !== '#' || protectedWall(wx,wy)) continue;
      // the far side must lead somewhere, else we just carve a nub
      const fx=wx+dx, fy=wy+dy;
      if (fx<0||fx>=COLS||fy<0||fy>=ROWS) continue;
      if (!walk(at(g,fx,fy))) continue;
      const cells = carveMirrored(g, wx, wy);
      if (cells) return cells;
    }
  }
  return null;
}

/** Distance from spawn to every tile, or -1 where unreachable. */
function distMap(g){
  const dist = Array.from({length:ROWS},()=>new Array(COLS).fill(-1));
  dist[SPAWN[1]][SPAWN[0]] = 0;
  const q=[SPAWN];
  while(q.length){
    const [x,y]=q.shift();
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      let nx=x+dx; const ny=y+dy;
      if (ny<0||ny>=ROWS) continue;
      if (nx<0||nx>=COLS){ if(y!==TUNNEL_ROW) continue; nx=nx<0?COLS-1:0; }
      if (dist[ny][nx]!==-1 || !walk(at(g,nx,ny))) continue;
      dist[ny][nx]=dist[y][x]+1; q.push([nx,ny]);
    }
  }
  return dist;
}

/**
 * A long worst-case detour isn't a dead-end problem — it means the far corner
 * is only reachable the long way round. Fixing it needs a SHORTCUT: open the
 * wall that most shortens the walk to the currently farthest pellet.
 */
function openShortcut(g){
  const before = worstDetour(g);
  let best = null;
  for (let y=1;y<ROWS-1;y++) for (let x=1;x<COLS-1;x++){
    if (g[y][x] !== '#' || protectedWall(x,y)) continue;
    // only useful if it joins two already-walkable tiles on opposite sides
    const pairs = [[[1,0],[-1,0]], [[0,1],[0,-1]]];
    const joins = pairs.some(([a,b]) =>
      walk(at(g, x+a[0], y+a[1])) && walk(at(g, x+b[0], y+b[1])));
    if (!joins) continue;
    const cells = carveMirrored(g, x, y);
    if (cells){
      const after = worstDetour(g);
      if (after < before && (!best || after < best.after)) best = { x, y, after };
      cells.forEach(([cx,cy]) => { g[cy][cx] = '#'; });   // roll back the trial
    }
  }
  if (!best) return null;
  return carveMirrored(g, best.x, best.y);
}

let changed = 0;
for (const n of [2,3,4,5,6]){
  const re = new RegExp(`const MAZE_LEVEL_${n} = \\[([\\s\\S]*?)\\];`);
  const g = src.match(re)[1].split('\n').map(l=>l.trim()).filter(Boolean)
    .map(l=>l.replace(/^"/,'').replace(/",?$/,'').split(''));

  const before = { trap: worstTrap(g).worst, detour: worstDetour(g) };
  const opened = [];

  // first pass: flatten the deep pockets
  for (let pass=0; pass<12; pass++){
    const w = worstTrap(g);
    if (w.worst <= MAX_TRAP) break;
    const spot = w.at ? relieve(g, w.at.path) : null;
    if (!spot) break;
    opened.push(...spot);
  }
  // second pass: shorten the long way round, which pockets alone can't fix
  for (let pass=0; pass<8; pass++){
    if (worstDetour(g) <= MAX_DETOUR) break;
    const spot = openShortcut(g);
    if (!spot) break;
    opened.push(...spot);
  }

  const after = { trap: worstTrap(g).worst, detour: worstDetour(g) };
  if (opened.length){
    src = src.replace(re, `const MAZE_LEVEL_${n} = [\n${g.map(r=>`"${r.join('')}",`).join('\n')}\n];`);
    changed++;
  }
  console.log(`L${n}  打通 ${opened.length} 处 ${opened.map(p=>'('+p.join(',')+')').join(' ')}` +
    `\n     最深死路 ${before.trap} -> ${after.trap}　最远绕路 ${before.detour} -> ${after.detour}`);
}

if (changed) writeFileSync(FILE, src);
console.log(`\n${changed} 张地图已更新。`);
