// Repositions the portals in levels 2-6 to the four corners, paired
// DIAGONALLY (top-left <-> bottom-right, top-right <-> bottom-left) so each
// warp is the longest possible jump across the board.
//
// Also cleans up "lonely pellets" around each portal: a one-tile pocket
// hanging off a corridor holds a single pellet that you have to detour into
// and back out of. Right next to a portal — where you land and immediately
// need to pick a direction — those are especially disruptive, so any such
// pocket within 2 tiles of a portal is sealed. Sealing is only committed if
// the map stays fully reachable afterwards.
//
// Level 1 is never touched.
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = fileURLToPath(new URL('../pacman_fragment.html', import.meta.url));
let src = readFileSync(FILE, 'utf8');

const COLS = 19, ROWS = 21, TUNNEL_ROW = 10;
const PLAYER = [9, 15];
const RESERVED = new Set(['9,6','9,7','9,8','9,12','9,13','9,14','9,15']);
const walk = ch => ch !== '#' && ch !== 'g' && ch !== 'D';

const at = (g,x,y) => {
  let nx=x; if(nx<0)nx=COLS-1; if(nx>=COLS)nx=0;
  if(y<0||y>=ROWS) return '#';
  return g[y][nx];
};
const deg = (g,x,y) => [[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy])=>walk(at(g,x+dx,y+dy))).length;

/** Reachability with portals absorbing (enterable, not passable). */
function reachable(g, portals) {
  const p = new Set(portals.map(([x,y])=>`${x},${y}`));
  const seen = Array.from({length:ROWS},()=>new Array(COLS).fill(false));
  seen[PLAYER[1]][PLAYER[0]] = true;
  const q=[PLAYER];
  while(q.length){
    const [x,y]=q.shift();
    if (p.has(`${x},${y}`)) continue;
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      let nx=x+dx; const ny=y+dy;
      if (ny<0||ny>=ROWS) continue;
      if (nx<0||nx>=COLS){ if(y!==TUNNEL_ROW) continue; nx=nx<0?COLS-1:0; }
      if (seen[ny][nx] || !walk(at(g,nx,ny))) continue;
      seen[ny][nx]=true; q.push([nx,ny]);
    }
  }
  return seen;
}

function allPelletsReachable(g, portals) {
  const seen = reachable(g, portals);
  for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) {
    const ch = g[y][x];
    if ((ch==='.'||ch==='o'||ch==='1'||ch==='2') && !seen[y][x]) return false;
  }
  return true;
}

/** Walkable tile nearest the given corner, excluding reserved/tunnel tiles. */
function cornerTile(g, cornerX, cornerY) {
  let best=null, bestD=Infinity;
  for (let y=1;y<ROWS-1;y++) for (let x=1;x<COLS-1;x++) {
    if (!walk(g[y][x])) continue;
    if (RESERVED.has(`${x},${y}`) || y===TUNNEL_ROW) continue;
    if (x===PLAYER[0] && y===PLAYER[1]) continue;
    const d = Math.abs(x-cornerX) + Math.abs(y-cornerY);
    if (d < bestD) { bestD = d; best = [x,y]; }
  }
  return best;
}

function processLevel(n) {
  const re = new RegExp(`const MAZE_LEVEL_${n} = \\[([\\s\\S]*?)\\];`);
  const m = src.match(re);
  const rows = m[1].split('\n').map(l=>l.trim()).filter(Boolean)
    .map(l=>l.replace(/^"/,'').replace(/",?$/,''));
  const g = rows.map(r=>r.split(''));

  // strip existing portals back to plain pellets
  for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) {
    if (g[y][x]==='1' || g[y][x]==='2') g[y][x]='.';
  }

  const tl = cornerTile(g, 1, 1);
  const tr = cornerTile(g, COLS-2, 1);
  const bl = cornerTile(g, 1, ROWS-2);
  const br = cornerTile(g, COLS-2, ROWS-2);
  const corners = [tl, tr, bl, br];
  const key = c => `${c[0]},${c[1]}`;
  if (new Set(corners.map(key)).size !== 4) return { n, ok:false, why:'corners collided' };

  // diagonal pairing = the longest possible jump for each pair
  const portals = [...corners];
  g[tl[1]][tl[0]] = '1'; g[br[1]][br[0]] = '1';
  g[tr[1]][tr[0]] = '2'; g[bl[1]][bl[0]] = '2';

  // seal lonely one-tile pockets near each portal
  let sealed = 0;
  for (const [px,py] of corners) {
    for (let dy=-2; dy<=2; dy++) for (let dx=-2; dx<=2; dx++) {
      const x=px+dx, y=py+dy;
      if (x<1||x>=COLS-1||y<1||y>=ROWS-1) continue;
      if (g[y][x] !== '.') continue;                 // only plain pellets
      if (RESERVED.has(`${x},${y}`) || y===TUNNEL_ROW) continue;
      if (deg(g,x,y) !== 1) continue;                 // only dead-end pockets
      const backup = g[y][x];
      g[y][x] = '#';
      if (allPelletsReachable(g, portals)) sealed++;
      else g[y][x] = backup;                          // would strand something
    }
  }

  if (!allPelletsReachable(g, portals)) return { n, ok:false, why:'unreachable after edit' };

  const out = g.map(r=>r.join(''));
  src = src.replace(re, `const MAZE_LEVEL_${n} = [\n${out.map(r=>`"${r}",`).join('\n')}\n];`);
  const dist = (a,b) => Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]);
  return { n, ok:true, sealed,
           pair1: `${key(tl)} <-> ${key(br)} (${dist(tl,br)} tiles)`,
           pair2: `${key(tr)} <-> ${key(bl)} (${dist(tr,bl)} tiles)` };
}

for (const n of [2,3,4,5,6]) {
  const r = processLevel(n);
  if (!r.ok) { console.error(`L${r.n} FAILED: ${r.why}`); process.exit(1); }
  console.log(`L${r.n}: sealed ${r.sealed} lonely pockets`);
  console.log(`      1: ${r.pair1}`);
  console.log(`      2: ${r.pair2}`);
}
writeFileSync(FILE, src);
console.log('\nwritten.');
