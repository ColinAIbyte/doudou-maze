// Levels 2-6, rebuilt in the SAME style as level 1.
//
// The previous block/lattice attempt read as chopped-up — a grid of separate
// rectangular cells rather than corridors that flow into one another. Level 1
// gets its character from a different construction: carve a maze over the LEFT
// half only, then mirror it onto the right. That yields continuous, winding
// runs and a symmetric arcade silhouette, which is what we're matching here.
//
// Power pellets and portals go anywhere on open floor; the only hard invariant
// is that no pellet can be stranded once portals are treated as absorbing.

const COLS = 19, ROWS = 21;
const MID = 9;                       // centre column, not mirrored
const HOUSE = { x0: 7, x1: 11, y0: 9, y1: 11 };
const TUNNEL_ROW = 10;
const PLAYER = [9, 15];
const RESERVED = new Set(['9,6','9,7','9,8','9,12','9,13','9,14','9,15']);

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

function buildMaze(seed, loopP) {
  const rand = mulberry32(seed);
  const g = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => '#'));

  // cell lattice: centres at odd coordinates. Only i=0..4 (x=1..9) are carved;
  // i=0..3 get mirrored to the right half afterwards.
  const cellCols = 5, cellRows = 10;
  const cx = i => 2*i + 1, cy = j => 2*j + 1;
  const inHouse = (i, j) => {
    const x = cx(i), y = cy(j);
    return x >= HOUSE.x0-1 && y >= HOUSE.y0-1 && y <= HOUSE.y1+1;
  };

  for (let i=0;i<cellCols;i++) for (let j=0;j<cellRows;j++) {
    if (!inHouse(i,j)) g[cy(j)][cx(i)] = '.';
  }

  const seen = Array.from({length:cellCols},()=>new Array(cellRows).fill(false));
  const neigh = (i,j) => [[i+1,j],[i-1,j],[i,j+1],[i,j-1]]
    .filter(([a,b]) => a>=0 && a<cellCols && b>=0 && b<cellRows && !inHouse(a,b));
  const shuffle = a => { for(let k=a.length-1;k>0;k--){const r=Math.floor(rand()*(k+1));[a[k],a[r]]=[a[r],a[k]];} return a; };

  let start=null;
  for (let i=0;i<cellCols&&!start;i++) for (let j=0;j<cellRows&&!start;j++) if(!inHouse(i,j)) start=[i,j];
  const stack=[start]; seen[start[0]][start[1]]=true;
  while(stack.length){
    const [i,j]=stack[stack.length-1];
    const un = shuffle(neigh(i,j).filter(([a,b])=>!seen[a][b]));
    if(!un.length){ stack.pop(); continue; }
    const [ni,nj]=un[0];
    g[(cy(j)+cy(nj))/2][(cx(i)+cx(ni))/2] = '.';
    seen[ni][nj]=true; stack.push([ni,nj]);
  }
  // extra openings turn the spanning tree into a looping, flowing layout
  for (let i=0;i<cellCols;i++) for (let j=0;j<cellRows;j++) {
    if (inHouse(i,j)) continue;
    for (const [ni,nj] of neigh(i,j)) {
      if (ni<i || (ni===i && nj<j)) continue;
      const wx=(cx(i)+cx(ni))/2, wy=(cy(j)+cy(nj))/2;
      if (g[wy][wx]==='#' && rand()<loopP) g[wy][wx]='.';
    }
  }

  // mirror the left half onto the right
  for (let y=0;y<ROWS;y++) for (let x=0;x<MID;x++) g[y][COLS-1-x] = g[y][x];

  for (let x=0;x<COLS;x++){ g[0][x]='#'; g[ROWS-1][x]='#'; }
  for (let y=0;y<ROWS;y++){ g[y][0]='#'; g[y][COLS-1]='#'; }

  for (let y=HOUSE.y0-1;y<=HOUSE.y1+1;y++) for (let x=HOUSE.x0-1;x<=HOUSE.x1+1;x++) {
    const border = x===HOUSE.x0-1||x===HOUSE.x1+1||y===HOUSE.y0-1||y===HOUSE.y1+1;
    g[y][x] = border ? '#' : 'g';
  }
  g[HOUSE.y0-1][9]='D'; g[HOUSE.y1+1][9]='D';
  for (const k of RESERVED) { const [x,y]=k.split(',').map(Number); if (g[y][x]==='#') g[y][x]='.'; }

  for (let x=1;x<HOUSE.x0-1;x++) g[TUNNEL_ROW][x]='.';
  for (let x=HOUSE.x1+2;x<COLS-1;x++) g[TUNNEL_ROW][x]='.';
  g[TUNNEL_ROW][0]='T'; g[TUNNEL_ROW][COLS-1]='T';
  return g;
}

/** Reachability with portals absorbing: enterable, never passable. */
function reachable(g, portalTiles) {
  const portal = new Set(portalTiles.map(([x,y])=>`${x},${y}`));
  const at=(x,y)=>{ let nx=x; if(nx<0)nx=COLS-1; if(nx>=COLS)nx=0; if(y<0||y>=ROWS)return '#'; return g[y][nx]; };
  const seen = Array.from({length:ROWS},()=>new Array(COLS).fill(false));
  seen[PLAYER[1]][PLAYER[0]]=true;
  const q=[PLAYER];
  while(q.length){
    const [x,y]=q.shift();
    if (portal.has(`${x},${y}`)) continue;
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      let nx=x+dx; const ny=y+dy;
      if (ny<0||ny>=ROWS) continue;
      if (nx<0||nx>=COLS){ if(y!==TUNNEL_ROW) continue; nx = nx<0?COLS-1:0; }
      if (seen[ny][nx] || !playerWalk(at(nx,ny))) continue;
      seen[ny][nx]=true; q.push([nx,ny]);
    }
  }
  return seen;
}

function metrics(g) {
  let floors=0, degSum=0, runTotal=0;
  for (let y=1;y<ROWS-1;y++) for (let x=1;x<COLS-1;x++) {
    if (g[y][x] !== '.') continue;
    floors++;
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) if (playerWalk(g[y+dy][x+dx])) degSum++;
    let h=1,v=1;
    for(let k=x-1;k>=1&&playerWalk(g[y][k]);k--)h++;
    for(let k=x+1;k<COLS-1&&playerWalk(g[y][k]);k++)h++;
    for(let k=y-1;k>=1&&playerWalk(g[k][x]);k--)v++;
    for(let k=y+1;k<ROWS-1&&playerWalk(g[k][x]);k++)v++;
    runTotal += Math.max(h,v);
  }
  return { openness: degSum/floors, straight: runTotal/floors, floors };
}

function spreadPick(cands, n, rand) {
  if (cands.length < n) return null;
  const picked=[cands[Math.floor(rand()*cands.length)]];
  while(picked.length<n){
    let best=null,bs=-1;
    for(const c of cands){
      if(picked.some(p=>p[0]===c[0]&&p[1]===c[1]))continue;
      const s=Math.min(...picked.map(p=>Math.abs(p[0]-c[0])+Math.abs(p[1]-c[1])));
      if(s>bs){bs=s;best=c;}
    }
    if(!best)return null;
    picked.push(best);
  }
  return picked;
}

function build(seedStart, loopP) {
  let best=null;
  for (let seed=seedStart; seed<seedStart+500; seed++) {
    const g = buildMaze(seed, loopP);
    if (g[PLAYER[1]][PLAYER[0]]==='#') continue;

    const rand = mulberry32(seed ^ 0x5bf03635);
    const cands=[];
    for (let y=1;y<ROWS-1;y++) for (let x=1;x<COLS-1;x++) {
      if (g[y][x]==='.' && !RESERVED.has(`${x},${y}`) && y!==TUNNEL_ROW) cands.push([x,y]);
    }
    const spots = spreadPick(cands, 8, rand);
    if (!spots) continue;
    const portals = spots.slice(0,4), powers = spots.slice(4,8);

    const seen = reachable(g, portals);
    let bad=0;
    for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) if (g[y][x]==='.' && !seen[y][x]) bad++;
    if (bad) continue;

    const m = metrics(g);
    // Match level 1's feel rather than maximising openness. Level 1 measures
    // openness 2.19 / straight-run 7.4 — deliberately NOT wide open; it has
    // real corridors and choices. Score is distance from that target, so a
    // maze that is too flowing is rejected just like one that is too closed.
    const TARGET_OPENNESS = 2.19, TARGET_STRAIGHT = 7.4;
    const score = -(Math.abs(m.openness - TARGET_OPENNESS) * 4
                  + Math.abs(m.straight - TARGET_STRAIGHT) * 0.15);
    if (best && score <= best.score) continue;

    const out = g.map(r=>r.slice());
    out[portals[0][1]][portals[0][0]]='1'; out[portals[1][1]][portals[1][0]]='1';
    out[portals[2][1]][portals[2][0]]='2'; out[portals[3][1]][portals[3][0]]='2';
    for (const [x,y] of powers) out[y][x]='o';
    out[PLAYER[1]][PLAYER[0]]='P';
    best = { grid: out.map(r=>r.join('')), seed,
             openness:+m.openness.toFixed(2), straight:+m.straight.toFixed(1), floors:m.floors, score };
  }
  return best;
}

// Loop probability kept near what produced level 1, so all six share a family
// resemblance instead of levels 2-6 drifting into a different visual language.
const specs = [
  { name:'MAZE_LEVEL_2', seed:201000, loopP:0.16 },
  { name:'MAZE_LEVEL_3', seed:203000, loopP:0.15 },
  { name:'MAZE_LEVEL_4', seed:205000, loopP:0.14 },
  { name:'MAZE_LEVEL_5', seed:207000, loopP:0.13 },
  { name:'MAZE_LEVEL_6', seed:209000, loopP:0.12 },
];

const results=[];
for (const s of specs) {
  const r = build(s.seed, s.loopP);
  if(!r){ console.error(`FAILED ${s.name}`); process.exit(1); }
  results.push({...s,...r});
  console.log(`${s.name}: seed=${r.seed} openness=${r.openness} straightRun=${r.straight} floors=${r.floors}`);
}
const sigs = results.map(r=>r.grid.join('\n'));
if (new Set(sigs).size !== sigs.length) { console.error('duplicate layouts'); process.exit(1); }

console.log('\n--- preview: level 2 ---');
console.log(results[0].grid.join('\n'));
console.log('\n================ JS =================\n');
for (const r of results) {
  console.log(`const ${r.name} = [`);
  console.log(r.grid.map(row=>`"${row}",`).join('\n'));
  console.log('];\n');
}
