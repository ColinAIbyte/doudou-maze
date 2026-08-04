// Lays out N power pellets on a level, matching level 1's placement profile.
//   用法: node place_power.mjs <关卡> <张数>
//
// WHAT CHANGED, AND WHY
//
// The previous version scored layouts by `-avgHouse` — "closer to contested
// ground wins" — built after a request to put power pellets somewhere risky.
// It worked exactly as written, and that was the bug. Measured against level 1,
// the level the owner calls perfect:
//
//     关卡   距屋均值   车流均值   车流最高
//      1       14.8       3.5        11      <- corners
//      5        7.3      36.7        60      <- dead centre
//
// Ten times the through-traffic. That IS the 必经之路 complaint: you cross those
// tiles constantly on the way to everything else, so the power pellet fires
// whenever the route happens to run over it, never when you decide it should.
// Choosing the moment is the entire skill of a power pellet, and centre
// placement takes that choice away.
//
// Risk placement and trigger-choice pull in opposite directions. Level 1 settles
// the argument: trigger-choice wins. So the objective is now to MINIMISE
// through-traffic, with spacing as a hard floor.
//
// Two older lessons still hold and are still enforced:
//   * "Don't bunch them" is a THRESHOLD, not a target. Maximising the minimum
//     gap is its own distortion — require a gap, then optimise within that.
//   * A quadrant count can look even while every pellet sits in one narrow
//     horizontal band, so pairs are forced apart vertically too.
//
// The mazes are left/right mirrored, so the count dictates the shape:
//   even N -> N/2 mirrored pairs
//   odd  N -> (N-1)/2 pairs plus one tile on the centre column (x=9 mirrors
//             onto itself; any other single tile leaves the board lopsided)
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const LEVEL = Number(process.argv[2]);
const COUNT = Number(process.argv[3]);
if (!LEVEL || LEVEL < 1 || LEVEL > 6 || !COUNT || COUNT < 4 || COUNT > 8) {
  console.error('用法: node place_power.mjs <关卡 1-6> <张数 4-8>');
  process.exit(1);
}

const FILE = fileURLToPath(new URL('../pacman_fragment.html', import.meta.url));
let src = readFileSync(FILE, 'utf8');

const COLS = 19, ROWS = 21, MID = 9, TUNNEL_ROW = 10;
const SPAWN = [9, 15], HOUSE = [9, 10];
const MIN_SPAWN_DIST = 6, MIN_PORTAL_DIST = 3, MIN_PAIR_SPAN = 6;
const MIN_PAIR_Y_SPLIT = 4; // stop every pair landing in one horizontal band
// Level 1 achieves a gap of 9 with four pellets. Six pellets cannot hold that
// on a 19x21 board, so the search walks the target down and keeps the best gap
// that admits a layout at all, rather than failing outright.
const GAP_TARGETS = [10, 9, 8, 7, 6, 5];
const RESERVED = new Set(['9,6','9,7','9,8','9,12','9,13','9,14','9,15']);

const walk = ch => ch !== '#' && ch !== 'g' && ch !== 'D';
const md = (a,b) => Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]);

const re = new RegExp(`const MAZE_LEVEL_${LEVEL} = \\[([\\s\\S]*?)\\];`);
const g = src.match(re)[1].split('\n').map(l=>l.trim()).filter(Boolean)
  .map(l=>l.replace(/^"/,'').replace(/",?$/,'').split(''));

const portals = [];
for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++){
  if (g[y][x]==='1'||g[y][x]==='2') portals.push([x,y]);
  if (g[y][x]==='o') g[y][x]='.';        // clear the existing layout
}

const at = (x,y) => {
  let nx=x; if(nx<0)nx=COLS-1; if(nx>=COLS)nx=0;
  if(y<0||y>=ROWS) return '#';
  return g[y][nx];
};

/**
 * Through-traffic per tile: how many pellets have their shortest route from
 * spawn running over it. This is the number the layout is chosen to minimise.
 * Portals are absorbing, matching the validator — stepping onto one warps you
 * away, so a route cannot continue through it.
 */
function trafficMap(){
  const dist = Array.from({length:ROWS},()=>new Array(COLS).fill(-1));
  const prev = Array.from({length:ROWS},()=>new Array(COLS).fill(null));
  const portalSet = new Set(portals.map(p=>p.join(',')));
  dist[SPAWN[1]][SPAWN[0]] = 0;
  const q=[SPAWN];
  while(q.length){
    const [x,y]=q.shift();
    if (portalSet.has(`${x},${y}`)) continue;
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      let nx=x+dx; const ny=y+dy;
      if (ny<0||ny>=ROWS) continue;
      if (nx<0||nx>=COLS){ if(y!==TUNNEL_ROW) continue; nx=nx<0?COLS-1:0; }
      if (dist[ny][nx]!==-1 || !walk(at(nx,ny))) continue;
      dist[ny][nx]=dist[y][x]+1; prev[ny][nx]=[x,y]; q.push([nx,ny]);
    }
  }
  const traffic = Array.from({length:ROWS},()=>new Array(COLS).fill(0));
  for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++){
    if (g[y][x]!=='.') continue;
    let cur = prev[y][x];
    while (cur){ traffic[cur[1]][cur[0]]++; cur = prev[cur[1]][cur[0]]; }
  }
  return traffic;
}
const TRAFFIC = trafficMap();

const eligible = (x,y) =>
  x>=1 && x<=COLS-2 && y>=1 && y<=ROWS-2 &&
  g[y][x]==='.' && y!==TUNNEL_ROW && !RESERVED.has(`${x},${y}`) &&
  md([x,y],SPAWN) >= MIN_SPAWN_DIST &&
  portals.every(p => md([x,y],p) >= MIN_PORTAL_DIST);

const pairs = [];
for (let y=1;y<ROWS-1;y++) for (let x=1;x<MID;x++){
  const mx = COLS-1-x;
  if (mx - x < MIN_PAIR_SPAN) continue;
  if (eligible(x,y) && eligible(mx,y)) pairs.push([x,y]);
}
const centres = [];
for (let y=1;y<ROWS-1;y++) if (eligible(MID,y)) centres.push([MID,y]);

const wantPairs = Math.floor(COUNT / 2);
const wantCentre = COUNT % 2 === 1;
if (pairs.length < wantPairs || (wantCentre && !centres.length)){
  console.error(`候选不足: 需要 ${wantPairs} 组镜像对(有 ${pairs.length}), 中轴 ${wantCentre?1:0}(有 ${centres.length})`);
  process.exit(1);
}

const minGap = set => {
  let m = Infinity;
  for (let i=0;i<set.length;i++) for (let j=i+1;j<set.length;j++) m = Math.min(m, md(set[i],set[j]));
  return m;
};
const expand = pair => [pair, [COLS-1-pair[0], pair[1]]];
const trafficOf = set => set.reduce((s,[x,y]) => s + TRAFFIC[y][x], 0);

function search(gapFloor){
  let best = null;
  const picked = [];
  (function choose(startIdx){
    if (picked.length === wantPairs){
      const tiles = picked.flatMap(expand);
      for (const c of (wantCentre ? centres : [null])){
        const set = c ? [...tiles, c] : tiles;
        const gap = minGap(set);
        if (gap < gapFloor) continue;
        const traffic = trafficOf(set);
        // Traffic decides. avgHouse only breaks ties, keeping the layout on the
        // outer ring where level 1 puts it when two options carry equal traffic.
        const avgHouse = set.reduce((s,p)=>s+md(p,HOUSE),0) / set.length;
        if (!best || traffic < best.traffic ||
            (traffic === best.traffic && avgHouse > best.avgHouse)){
          best = { set, gap, traffic, avgHouse };
        }
      }
      return;
    }
    for (let i=startIdx;i<pairs.length;i++){
      const p = pairs[i];
      if (picked.some(q => Math.abs(q[1]-p[1]) < MIN_PAIR_Y_SPLIT)) continue;
      picked.push(p);
      choose(i+1);
      picked.pop();
    }
  })(0);
  return best;
}

let best = null, usedGap = 0;
for (const gapFloor of GAP_TARGETS){
  best = search(gapFloor);
  if (best){ usedGap = gapFloor; break; }
}
if (!best){ console.error('找不到满足纵向分散的布局'); process.exit(1); }

best.set.forEach(([x,y]) => { g[y][x]='o'; });
src = src.replace(re, `const MAZE_LEVEL_${LEVEL} = [\n${g.map(r=>`"${r.join('')}",`).join('\n')}\n];`);
writeFileSync(FILE, src);

const ys = best.set.map(p=>p[1]);
const tr = best.set.map(([x,y])=>TRAFFIC[y][x]);
console.log(`L${LEVEL}  ${COUNT} 颗: ${best.set.map(p=>p.join(',')).join('  ')}`);
console.log(`      间距下限 ${usedGap}　实际最近 ${best.gap} 格　纵向 y${Math.min(...ys)}-${Math.max(...ys)}`);
console.log(`      车流 ${tr.join(' ')}　均值 ${(best.traffic/COUNT).toFixed(1)}　距屋均值 ${best.avgHouse.toFixed(1)}`);
