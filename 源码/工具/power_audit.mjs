// Audits WHERE each level's power pellets sit.
//   用法: node power_audit.mjs
//
// The owner's complaint is precise: a power pellet must not sit on a 必经之路 —
// a tile you are forced to cross on your way to other pellets. Trigger timing is
// the whole skill of the power pellet; a pellet in a mandatory corridor rips
// that choice away, because you eat it whenever the route happens to take you
// through, not when the ghosts are worth chasing.
//
// So "forced" is not about tile degree — a degree-3 junction is fine if the map
// offers another way round. The real test is an ARTICULATION test:
//
//   wall off the power pellet's tile, then BFS from spawn.
//   if any other pellet becomes unreachable, that tile was mandatory.
//
// Portals stay absorbing here, exactly as in the validator: stepping onto one
// warps you away, so it terminates the walk rather than continuing through.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const src = readFileSync(
  fileURLToPath(new URL('../pacman_fragment.html', import.meta.url)), 'utf8');

const COLS = 19, ROWS = 21, TUNNEL_ROW = 10;
const SPAWN = [9, 15], HOUSE = [9, 10];
const walk = ch => ch !== '#' && ch !== 'g' && ch !== 'D';

function readMaze(n){
  const m = src.match(new RegExp(`const MAZE_LEVEL_${n} = \\[([\\s\\S]*?)\\];`));
  return m[1].split('\n').map(l=>l.trim()).filter(Boolean)
    .map(l=>l.replace(/^"/,'').replace(/",?$/,'').split(''));
}

const at = (g,x,y) => {
  let nx=x; if(nx<0)nx=COLS-1; if(nx>=COLS)nx=0;
  if(y<0||y>=ROWS) return '#';
  return g[y][nx];
};
const deg = (g,x,y) => [[1,0],[-1,0],[0,1],[0,-1]]
  .filter(([dx,dy]) => walk(at(g,x+dx,y+dy))).length;

/** Reachable set from spawn, portals absorbing, optionally with (bx,by) walled. */
function reach(g, bx, by){
  const portals = new Set();
  for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++)
    if (g[y][x]==='1'||g[y][x]==='2') portals.add(`${x},${y}`);
  const blocked = bx===undefined ? null : `${bx},${by}`;
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
      if (blocked === `${nx},${ny}`) continue;
      seen[ny][nx]=true; q.push([nx,ny]);
    }
  }
  return seen;
}

/** True if other pellets can only be reached by crossing (px,py). */
function isForced(g, px, py){
  const seen = reach(g, px, py);
  for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++){
    if (x===px && y===py) continue;
    const ch = g[y][x];
    if ((ch==='.'||ch==='o') && !seen[y][x]) return true;
  }
  return false;
}

const md = (a,b) => Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]);

/**
 * How much through-traffic a tile carries: the number of OTHER pellets whose
 * shortest route from spawn runs over it.
 *
 * The strict articulation test above turns out to be far too lenient — it only
 * catches true cut vertices, and almost nothing on an open maze is one. But the
 * complaint is about FEEL, and what makes a pellet feel unavoidable is that you
 * keep crossing its tile on the way to everything else. That is traffic, not
 * connectivity: a tile can be perfectly bypassable and still lie on the natural
 * route to eighty other pellets.
 */
function trafficMap(g){
  const dist = Array.from({length:ROWS},()=>new Array(COLS).fill(-1));
  const prev = Array.from({length:ROWS},()=>new Array(COLS).fill(null));
  dist[SPAWN[1]][SPAWN[0]] = 0;
  const q=[SPAWN];
  const portals = new Set();
  for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++)
    if (g[y][x]==='1'||g[y][x]==='2') portals.add(`${x},${y}`);
  while(q.length){
    const [x,y]=q.shift();
    if (portals.has(`${x},${y}`)) continue;
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      let nx=x+dx; const ny=y+dy;
      if (ny<0||ny>=ROWS) continue;
      if (nx<0||nx>=COLS){ if(y!==TUNNEL_ROW) continue; nx=nx<0?COLS-1:0; }
      if (dist[ny][nx]!==-1 || !walk(at(g,nx,ny))) continue;
      dist[ny][nx]=dist[y][x]+1; prev[ny][nx]=[x,y]; q.push([nx,ny]);
    }
  }
  const traffic = Array.from({length:ROWS},()=>new Array(COLS).fill(0));
  for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++){
    if (g[y][x]!=='.' && g[y][x]!=='o') continue;
    let cur = prev[y][x];
    while (cur){ traffic[cur[1]][cur[0]]++; cur = prev[cur[1]][cur[0]]; }
  }
  return traffic;
}

console.log('关卡 颗数  必经 死巷 最近间距 距屋均值 车流均值 车流最高  坐标');
for (const n of [1,2,3,4,5,6]){
  const g = readMaze(n);
  const tiles = [];
  for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) if (g[y][x]==='o') tiles.push([x,y]);

  const traffic = trafficMap(g);
  const forced = tiles.filter(([x,y]) => isForced(g,x,y));
  const spurs  = tiles.filter(([x,y]) => deg(g,x,y)===1);
  let gap = Infinity;
  for (let i=0;i<tiles.length;i++) for (let j=i+1;j<tiles.length;j++)
    gap = Math.min(gap, md(tiles[i],tiles[j]));
  const avgHouse = tiles.reduce((s,p)=>s+md(p,HOUSE),0)/tiles.length;
  const tr = tiles.map(([x,y]) => traffic[y][x]);

  console.log(
    `  ${n}  ${String(tiles.length).padStart(2)} 颗 ` +
    `${String(forced.length).padStart(4)} ${String(spurs.length).padStart(4)} ` +
    `${String(gap).padStart(8)} ${avgHouse.toFixed(1).padStart(8)} ` +
    `${(tr.reduce((a,b)=>a+b,0)/tr.length).toFixed(1).padStart(8)} ` +
    `${String(Math.max(...tr)).padStart(8)}  ` +
    tiles.map(p=>p.join(',')).join(' '));
  if (forced.length) console.log(`       必经之路上的: ${forced.map(p=>'('+p.join(',')+')').join(' ')}`);
}
