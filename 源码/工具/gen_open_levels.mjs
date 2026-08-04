// Generates levels 2-6: highly-connected ("四通八达") mazes with many loops,
// so the player always has alternate routes and ghosts can be juked.
//
// Open mazes have almost no natural dead ends, which conflicts with the rule
// that portals and power pellets must sit in single-entrance pockets. Resolved
// by CARVING pockets: in a well-connected maze a corridor tile can be sealed on
// one side without disconnecting anything, because redundant paths exist. Every
// carve is validated for full reachability before being kept.
//
// Difficulty across 2->6 comes from the ghosts (speed, count, shrinking fright
// window), not from making the mazes harder to walk — the maps stay generous.

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

const playerWalk = ch => ch !== '#' && ch !== 'g' && ch !== 'D';

function baseMaze(seed, loopP) {
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
  const neigh = (i, j) => [[i+1,j],[i-1,j],[i,j+1],[i,j-1]]
    .filter(([a,b]) => a>=0 && a<cellCols && b>=0 && b<cellRows && !inHouse(a,b));
  const shuffle = a => { for (let k=a.length-1;k>0;k--){const r=Math.floor(rand()*(k+1));[a[k],a[r]]=[a[r],a[k]];} return a; };

  let start = null;
  for (let i=0;i<cellCols&&!start;i++) for (let j=0;j<cellRows&&!start;j++) if(!inHouse(i,j)) start=[i,j];
  const stack = [start]; visited[start[0]][start[1]] = true;
  while (stack.length) {
    const [i,j] = stack[stack.length-1];
    const un = shuffle(neigh(i,j).filter(([a,b]) => !visited[a][b]));
    if (!un.length) { stack.pop(); continue; }
    const [ni,nj] = un[0];
    g[(cy(j)+cy(nj))/2][(cx(i)+cx(ni))/2] = '.';
    visited[ni][nj] = true; stack.push([ni,nj]);
  }
  // heavy extra openings -> lots of loops, the "四通八达" feel
  for (let i=0;i<cellCols;i++) for (let j=0;j<cellRows;j++) {
    if (inHouse(i,j)) continue;
    for (const [ni,nj] of neigh(i,j)) {
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
  g[HOUSE.y0-1][doorX] = 'D'; g[HOUSE.y1+1][doorX] = 'D';
  for (let x=1;x<HOUSE.x0-1;x++) if (g[TUNNEL_ROW][x]==='#') g[TUNNEL_ROW][x]='.';
  for (let x=HOUSE.x1+2;x<COLS-1;x++) if (g[TUNNEL_ROW][x]==='#') g[TUNNEL_ROW][x]='.';
  g[TUNNEL_ROW][0]='T'; g[TUNNEL_ROW][COLS-1]='T';
  return g;
}

function bfs(g) {
  const dist = Array.from({length:ROWS},()=>new Array(COLS).fill(-1));
  const at=(x,y)=>{ let nx=x; if(nx<0)nx=COLS-1; if(nx>=COLS)nx=0; if(y<0||y>=ROWS)return '#'; return g[y][nx]; };
  dist[PLAYER[1]][PLAYER[0]]=0;
  const q=[PLAYER];
  while(q.length){
    const [x,y]=q.shift();
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      let nx=x+dx, ny=y+dy;
      if (ny<0||ny>=ROWS) continue;
      if (nx<0||nx>=COLS){ if(y!==TUNNEL_ROW) continue; nx = nx<0?COLS-1:0; }
      if (dist[ny][nx]!==-1) continue;
      if (!playerWalk(at(nx,ny))) continue;
      dist[ny][nx]=dist[y][x]+1; q.push([nx,ny]);
    }
  }
  return dist;
}

function allFloorReachable(g) {
  const dist = bfs(g);
  for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) {
    if (g[y][x]==='.' && dist[y][x] < 0) return null;
  }
  return dist;
}

const degOf = (g,x,y) =>
  [[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy]) => {
    let nx=x+dx; const ny=y+dy;
    if (ny<0||ny>=ROWS) return false;
    if (nx<0) nx=COLS-1; if (nx>=COLS) nx=0;
    return playerWalk(g[ny][nx]);
  }).length;

const protectedTile = (x,y) =>
  GHOST_PATH.has(`${x},${y}`) || (x===PLAYER[0] && y===PLAYER[1]) ||
  y===TUNNEL_ROW || x<=1 || x>=COLS-2 || y<=1 || y>=ROWS-2;

/**
 * Turns `tile` into a single-entrance pocket by walling off its extra exits.
 * Only commits if the maze stays fully reachable afterwards.
 */
function carvePocket(g, x, y) {
  if (g[y][x] !== '.') return false;
  const exits = [[1,0],[-1,0],[0,1],[0,-1]]
    .map(([dx,dy]) => [x+dx, y+dy])
    .filter(([nx,ny]) => ny>=0 && ny<ROWS && nx>=0 && nx<COLS && playerWalk(g[ny][nx]));
  if (exits.length <= 1) return exits.length === 1;

  // keep whichever exit leaves the map connected; seal the rest
  for (let keep = 0; keep < exits.length; keep++) {
    const backup = exits.map(([nx,ny]) => g[ny][nx]);
    let ok = true;
    exits.forEach(([nx,ny], i) => {
      if (i === keep) return;
      if (protectedTile(nx,ny) || g[ny][nx] !== '.') { ok = false; return; }
      g[ny][nx] = '#';
    });
    if (ok && degOf(g,x,y) === 1 && allFloorReachable(g)) return true;
    exits.forEach(([nx,ny], i) => { g[ny][nx] = backup[i]; });
  }
  return false;
}

function spreadPick(cands, n) {
  if (cands.length < n) return null;
  const picked = [cands[0]];
  while (picked.length < n) {
    let best=null, bestScore=-1;
    for (const c of cands) {
      if (picked.some(p=>p[0]===c[0]&&p[1]===c[1])) continue;
      const s = Math.min(...picked.map(p=>Math.abs(p[0]-c[0])+Math.abs(p[1]-c[1])));
      if (s>bestScore){bestScore=s;best=c;}
    }
    if(!best) return null;
    picked.push(best);
  }
  return picked;
}

function build(seedStart, loopP) {
  let best = null;
  for (let seed = seedStart; seed < seedStart + 500; seed++) {
    const g = baseMaze(seed, loopP);
    if (g[PLAYER[1]][PLAYER[0]] === '#') continue;
    let dist = allFloorReachable(g);
    if (!dist) continue;

    // openness: average number of exits per floor tile. Higher = more routes.
    let floors=0, degSum=0;
    for (let y=1;y<ROWS-1;y++) for (let x=1;x<COLS-1;x++) {
      if (g[y][x]==='.') { floors++; degSum += degOf(g,x,y); }
    }
    const openness = degSum/floors;

    // candidate pocket sites, spread over the map and away from protected tiles
    const cands = [];
    for (let y=2;y<ROWS-2;y++) for (let x=2;x<COLS-2;x++) {
      if (g[y][x] !== '.' || protectedTile(x,y)) continue;
      if (dist[y][x] < 4) continue;
      cands.push([x,y]);
    }
    const sites = spreadPick(cands, 8); // 4 power pellets + 4 portal tiles
    if (!sites) continue;

    const work = g.map(r=>r.slice());
    const carved = [];
    for (const [x,y] of sites) { if (carvePocket(work, x, y)) carved.push([x,y]); }
    if (carved.length < 8) continue;

    dist = allFloorReachable(work);
    if (!dist) continue;
    let ecc = 0;
    for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) if (work[y][x]==='.') ecc = Math.max(ecc, dist[y][x]);
    if (ecc > 28) continue;

    const byDist = carved.slice().sort((a,b)=>dist[b[1]][b[0]]-dist[a[1]][a[0]]);
    const portals = byDist.slice(0,4);
    const powers = carved.filter(c=>!portals.some(p=>p[0]===c[0]&&p[1]===c[1])).slice(0,4);
    if (powers.length < 4) continue;

    const score = openness - ecc/100; // favour connectivity, break ties on shorter detours
    if (best && score <= best.score) continue;

    const out = work.map(r=>r.slice());
    out[portals[0][1]][portals[0][0]]='1'; out[portals[1][1]][portals[1][0]]='1';
    out[portals[2][1]][portals[2][0]]='2'; out[portals[3][1]][portals[3][0]]='2';
    for (const [x,y] of powers) out[y][x]='o';
    out[PLAYER[1]][PLAYER[0]]='P';
    best = { grid: out.map(r=>r.join('')), seed, loopP, ecc, openness:+openness.toFixed(2), score };
  }
  return best;
}

// Maps stay generous throughout; the difficulty ramp lives in the ghost tuning.
const specs = [
  { name:'MAZE_LEVEL_2', seed:31000, loopP:0.50 },
  { name:'MAZE_LEVEL_3', seed:37000, loopP:0.48 },
  { name:'MAZE_LEVEL_4', seed:43000, loopP:0.46 },
  { name:'MAZE_LEVEL_5', seed:51000, loopP:0.44 },
  { name:'MAZE_LEVEL_6', seed:59000, loopP:0.42 },
];

const results = [];
for (const s of specs) {
  const r = build(s.seed, s.loopP);
  if (!r) { console.error(`FAILED ${s.name}`); process.exit(1); }
  results.push({ ...s, ...r });
  console.log(`${s.name}: seed=${r.seed} loopP=${r.loopP} openness=${r.openness} ecc=${r.ecc}`);
}
const sigs = results.map(r=>r.grid.join('\n'));
if (new Set(sigs).size !== sigs.length) { console.error('duplicate layouts'); process.exit(1); }

console.log('\n================ JS =================\n');
for (const r of results) {
  console.log(`const ${r.name} = [`);
  console.log(r.grid.map(row=>`"${row}",`).join('\n'));
  console.log('];\n');
}
