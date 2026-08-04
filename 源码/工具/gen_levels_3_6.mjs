// Generates levels 3-6 for V1. Same 19x21 footprint / ghost house / tunnel row
// / player spawn as levels 1-2, so the shared SPAWN, HOUSE_DOOR,
// HOUSE_EXIT_TILE and PATROL_ROUTE constants stay valid — only the walls differ.
//
// Placement rules enforced here (all learned from earlier playtest bugs):
//   * portals only on TRUE dead ends, never mid-corridor (a mid-corridor portal
//     cuts the corridor and can strand pellets behind it)
//   * portals never on the ghost-house exit path (would teleport ghosts the
//     instant they leave home)
//   * power pellets only on TRUE dead ends, so walking past never force-feeds
//     one to the player
//   * every pellet reachable by walking alone, with portals giving no shortcut

const COLS = 19, ROWS = 21;
const HOUSE = { x0: 7, x1: 11, y0: 9, y1: 11 };
const TUNNEL_ROW = 10;
const PLAYER = [9, 15];
const GHOST_PATH = new Set(['9,8', '9,7', '9,6', '9,12', '9,13']);

function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generate(seed, loopP) {
  const rand = mulberry32(seed);
  const g = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => '#'));
  const cellCols = (COLS - 1) / 2, cellRows = (ROWS - 1) / 2;
  const cx = i => 2 * i + 1, cy = j => 2 * j + 1;
  const inHouse = (i, j) => {
    const x = cx(i), y = cy(j);
    return x >= HOUSE.x0 - 1 && x <= HOUSE.x1 + 1 && y >= HOUSE.y0 - 1 && y <= HOUSE.y1 + 1;
  };
  for (let i = 0; i < cellCols; i++) for (let j = 0; j < cellRows; j++) {
    if (!inHouse(i, j)) g[cy(j)][cx(i)] = '.';
  }
  const visited = Array.from({ length: cellCols }, () => new Array(cellRows).fill(false));
  const neighbors = (i, j) => [[i+1,j],[i-1,j],[i,j+1],[i,j-1]]
    .filter(([a,b]) => a>=0 && a<cellCols && b>=0 && b<cellRows && !inHouse(a,b));
  const shuffle = arr => { for (let k=arr.length-1;k>0;k--){const r=Math.floor(rand()*(k+1));[arr[k],arr[r]]=[arr[r],arr[k]];} return arr; };
  const stack = [];
  let start = null;
  for (let i=0;i<cellCols&&!start;i++) for (let j=0;j<cellRows&&!start;j++) if(!inHouse(i,j)) start=[i,j];
  stack.push(start); visited[start[0]][start[1]] = true;
  while (stack.length) {
    const [i,j] = stack[stack.length-1];
    const unvisited = shuffle(neighbors(i,j).filter(([a,b]) => !visited[a][b]));
    if (!unvisited.length) { stack.pop(); continue; }
    const [ni,nj] = unvisited[0];
    g[(cy(j)+cy(nj))/2][(cx(i)+cx(ni))/2] = '.';
    visited[ni][nj] = true;
    stack.push([ni,nj]);
  }

  for (let i=0;i<cellCols;i++) for (let j=0;j<cellRows;j++) {
    if (inHouse(i,j)) continue;
    for (const [ni,nj] of neighbors(i,j)) {
      if (ni<i || (ni===i && nj<j)) continue;
      const wx=(cx(i)+cx(ni))/2, wy=(cy(j)+cy(nj))/2;
      if (g[wy][wx]==='#' && rand()<loopP) g[wy][wx]='.';
    }
  }

  for (let x=0;x<COLS;x++){ g[0][x]='#'; g[ROWS-1][x]='#'; }
  for (let y=0;y<ROWS;y++){ g[y][0]='#'; g[y][COLS-1]='#'; }

  for (let y=HOUSE.y0-1;y<=HOUSE.y1+1;y++) for (let x=HOUSE.x0-1;x<=HOUSE.x1+1;x++) {
    const border = x===HOUSE.x0-1||x===HOUSE.x1+1||y===HOUSE.y0-1||y===HOUSE.y1+1;
    g[y][x] = border ? '#' : 'g';
  }
  const doorX = Math.round((HOUSE.x0+HOUSE.x1)/2);
  g[HOUSE.y0-1][doorX] = 'D';
  g[HOUSE.y1+1][doorX] = 'D';

  for (let x=1;x<HOUSE.x0-1;x++) if (g[TUNNEL_ROW][x]==='#') g[TUNNEL_ROW][x]='.';
  for (let x=HOUSE.x1+2;x<COLS-1;x++) if (g[TUNNEL_ROW][x]==='#') g[TUNNEL_ROW][x]='.';
  g[TUNNEL_ROW][0]='T'; g[TUNNEL_ROW][COLS-1]='T';

  return g;
}

const playerWalk = ch => ch!=='#' && ch!=='g' && ch!=='D';

function bfs(g, from) {
  const dist = Array.from({length:ROWS},()=>new Array(COLS).fill(-1));
  const at=(x,y)=>{ let nx=x; if(nx<0)nx=COLS-1; if(nx>=COLS)nx=0; if(y<0||y>=ROWS)return '#'; return g[y][nx]; };
  dist[from[1]][from[0]]=0;
  const q=[from];
  while(q.length){
    const [x,y]=q.shift();
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      let nx=x+dx, ny=y+dy;
      if (ny<0||ny>=ROWS) continue;
      if (nx<0||nx>=COLS){ if(y!==TUNNEL_ROW) continue; nx = nx<0?COLS-1:0; }
      if (dist[ny][nx]!==-1) continue;
      if (!playerWalk(at(nx,ny))) continue;
      dist[ny][nx]=dist[y][x]+1;
      q.push([nx,ny]);
    }
  }
  return dist;
}

function deadEnds(g) {
  const out=[];
  for (let y=1;y<ROWS-1;y++) for (let x=1;x<COLS-1;x++) {
    if (g[y][x]!=='.') continue;
    if (GHOST_PATH.has(`${x},${y}`)) continue;
    if (x===PLAYER[0] && y===PLAYER[1]) continue;
    let deg=0;
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) if (playerWalk(g[y+dy][x+dx])) deg++;
    if (deg===1) out.push([x,y]);
  }
  return out;
}

/** Greedily picks `n` spots that are as far apart as possible, so pellets don't cluster. */
function spreadPick(candidates, n) {
  if (candidates.length < n) return null;
  const picked = [candidates[0]];
  while (picked.length < n) {
    let best = null, bestScore = -1;
    for (const c of candidates) {
      if (picked.some(p => p[0]===c[0] && p[1]===c[1])) continue;
      const score = Math.min(...picked.map(p => Math.abs(p[0]-c[0]) + Math.abs(p[1]-c[1])));
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (!best) return null;
    picked.push(best);
  }
  return picked;
}

/** Searches the whole seed/loop space and keeps the candidate with the shortest
 *  worst-case detour, rather than taking the first that merely passes. A maze
 *  that satisfies every placement rule can still be a slog to walk. */
function build(seedStart, loopRange) {
  let best = null;
  for (const loopP of loopRange) {
    for (let seed = seedStart; seed < seedStart + 600; seed++) {
      const g = generate(seed, loopP);
      if (g[PLAYER[1]][PLAYER[0]] === '#') continue;
      const dist = bfs(g, PLAYER);
      let unreachable = 0, ecc = 0;
      for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) {
        if (g[y][x]==='.') { if (dist[y][x]<0) unreachable++; else ecc = Math.max(ecc, dist[y][x]); }
      }
      if (unreachable) continue;
      if (best && ecc >= best.ecc) continue;

      const de = deadEnds(g).filter(([x,y]) => dist[y][x] > 0);
      if (de.length < 8) continue; // 4 portals + 4 power pellets

      // portals: the 4 dead ends furthest from spawn, so warps feel like real shortcuts
      const byDist = de.slice().sort((a,b)=>dist[b[1]][b[0]]-dist[a[1]][a[0]]);
      const portals = byDist.slice(0, 4);
      const rest = de.filter(c => !portals.some(p => p[0]===c[0] && p[1]===c[1]));
      const powers = spreadPick(rest, 4);
      if (!powers) continue;

      const out = g.map(r => r.slice());
      out[portals[0][1]][portals[0][0]] = '1';
      out[portals[1][1]][portals[1][0]] = '1';
      out[portals[2][1]][portals[2][0]] = '2';
      out[portals[3][1]][portals[3][0]] = '2';
      for (const [x,y] of powers) out[y][x] = 'o';
      out[PLAYER[1]][PLAYER[0]] = 'P';
      best = { grid: out.map(r=>r.join('')), seed, loopP, ecc, deadEnds: de.length };
    }
  }
  return best;
}

const specs = [
  { name: 'MAZE_LEVEL_3', seedStart: 5000, loops: [0.10, 0.14, 0.18, 0.22, 0.26] },
  { name: 'MAZE_LEVEL_4', seedStart: 9000, loops: [0.10, 0.14, 0.18, 0.22, 0.26] },
  { name: 'MAZE_LEVEL_5', seedStart: 14000, loops: [0.10, 0.14, 0.18, 0.22, 0.26] },
  { name: 'MAZE_LEVEL_6', seedStart: 21000, loops: [0.10, 0.14, 0.18, 0.22, 0.26] },
];

const results = [];
for (const spec of specs) {
  const r = build(spec.seedStart, spec.loops);
  if (!r) { console.error(`FAILED to build ${spec.name}`); process.exit(1); }
  results.push({ ...spec, ...r });
  console.log(`${spec.name}: seed=${r.seed} loopP=${r.loopP} ecc=${r.ecc} deadEnds=${r.deadEnds}`);
}

// every maze must be a distinct layout, including vs the two already shipped
const sigs = results.map(r => r.grid.join('\n'));
if (new Set(sigs).size !== sigs.length) { console.error('duplicate layouts generated'); process.exit(1); }

console.log('\n================ JS =================\n');
for (const r of results) {
  console.log(`const ${r.name} = [`);
  console.log(r.grid.map(row => `"${row}",`).join('\n'));
  console.log('];\n');
}
