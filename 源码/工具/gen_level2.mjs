// Generates a level-2 maze for V1: same 19x21 footprint, same ghost house /
// tunnel row / player spawn (so V1's hardcoded SPAWN, HOUSE_DOOR,
// HOUSE_EXIT_TILE and PATROL_ROUTE stay valid), but a different wall layout.
const COLS = 19, ROWS = 21;
const HOUSE = { x0: 7, x1: 11, y0: 9, y1: 11 };
const TUNNEL_ROW = 10;
const PLAYER = [9, 15];

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
  function carve(i, j) {
    visited[i][j] = true;
    for (const [ni,nj] of shuffle(neighbors(i,j))) {
      if (visited[ni][nj]) continue;
      g[(cy(j)+cy(nj))/2][(cx(i)+cx(ni))/2] = '.';
      carve(ni,nj);
    }
  }
  let start = null;
  for (let i=0;i<cellCols&&!start;i++) for (let j=0;j<cellRows&&!start;j++) if(!inHouse(i,j)) start=[i,j];
  carve(start[0], start[1]);

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

// Tiles ghosts must traverse to leave/re-enter the house. A portal here would
// teleport every ghost the instant it exits, so they're never portal candidates.
const HOUSE_EXIT_TILES = [
  [9, 8], [9, 7], [9, 6],
  [9, 12], [9, 13],
];
const isHouseExitTile = (x, y) => HOUSE_EXIT_TILES.some(([hx, hy]) => hx === x && hy === y);

function deadEnds(g) {
  const out=[];
  for (let y=1;y<ROWS-1;y++) for (let x=1;x<COLS-1;x++) {
    if (g[y][x]!=='.') continue;
    if (isHouseExitTile(x,y)) continue;
    let deg=0;
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) if (playerWalk(g[y+dy][x+dx])) deg++;
    if (deg===1) out.push([x,y]);
  }
  return out;
}

let best=null;
for (const loopP of [0.18, 0.24, 0.3]) {
  for (let seed=1; seed<=400; seed++) {
    const g = generate(seed, loopP);
    if (g[PLAYER[1]][PLAYER[0]]==='#') continue;
    const dist = bfs(g, PLAYER);
    // every pellet reachable by walking alone (no portal shortcuts assumed)
    let unreachable=0, total=0, ecc=0;
    for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) {
      if (g[y][x]==='.') { total++; if(dist[y][x]<0) unreachable++; else ecc=Math.max(ecc,dist[y][x]); }
    }
    if (unreachable>0) continue;
    const de = deadEnds(g).filter(([x,y]) => dist[y][x]>0);
    if (de.length < 4) continue; // need 4 true dead ends for 2 portal pairs
    if (!best || ecc < best.ecc) best={g,seed,loopP,ecc,de,dist};
  }
}

if (!best) { console.error('no valid maze'); process.exit(1); }

const { g, de, dist } = best;
// portals go at true dead ends only — never mid-corridor, so no pellet can be
// stranded behind a warp (the V1 dead-zone bug)
const sorted = de.slice().sort((a,b)=>dist[b[1]][b[0]]-dist[a[1]][a[0]]);
const picks = [sorted[0], sorted[1], sorted[2], sorted[3]];
g[picks[0][1]][picks[0][0]]='1';
g[picks[1][1]][picks[1][0]]='1';
g[picks[2][1]][picks[2][0]]='2';
g[picks[3][1]][picks[3][0]]='2';

// power pellets: three corners plus one central high-tension spot, matching
// the layout change requested for level 1
const powerSpots = [[1,1],[COLS-2,1],[1,ROWS-2]];
for (const [x,y] of powerSpots) if (g[y][x]!=='#') g[y][x]='o';
// central one: right outside a ghost-house door — deliberately the most
// contested tile on the map, so grabbing it is a real risk/reward call
for (const cand of [[9,7],[9,13]]) {
  if (g[cand[1]][cand[0]]==='.') { g[cand[1]][cand[0]]='o'; break; }
}

g[PLAYER[1]][PLAYER[0]]='P';

console.log(`seed=${best.seed} loopP=${best.loopP} ecc=${best.ecc} deadEnds=${de.length}`);
console.log(g.map(r=>r.join('')).join('\n'));
console.log('\n--- JS ARRAY ---');
console.log(g.map(r=>`"${r.join('')}",`).join('\n'));
