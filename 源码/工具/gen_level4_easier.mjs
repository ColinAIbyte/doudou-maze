// Regenerates level 4 to level 1's *forgiveness* profile.
//
// All six maps already match on openness and straight-run, but those miss what
// actually punishes a player: how deep the dead ends are. Level 1's deepest
// trap is 6 steps from a junction (avg 3.3), so being chased into one is
// recoverable. Level 4's was 12 (avg 6.4) — get cornered there and you are
// simply dead. Its worst pellet detour was also 46 tiles vs level 1's 26.
//
// So this searches for a layout matching level 1 on openness AND trap depth
// AND detour, not just the first two.

const COLS = 19, ROWS = 21;
const MID = 9;
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
const walk = ch => ch !== '#' && ch !== 'g' && ch !== 'D';

function buildMaze(seed, loopP) {
  const rand = mulberry32(seed);
  const g = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => '#'));
  const cellCols = 5, cellRows = 10;
  const cx = i => 2*i+1, cy = j => 2*j+1;
  const inHouse = (i,j) => { const x=cx(i), y=cy(j);
    return x >= HOUSE.x0-1 && y >= HOUSE.y0-1 && y <= HOUSE.y1+1; };

  for (let i=0;i<cellCols;i++) for (let j=0;j<cellRows;j++) if (!inHouse(i,j)) g[cy(j)][cx(i)]='.';

  const seen = Array.from({length:cellCols},()=>new Array(cellRows).fill(false));
  const neigh = (i,j) => [[i+1,j],[i-1,j],[i,j+1],[i,j-1]]
    .filter(([a,b]) => a>=0&&a<cellCols&&b>=0&&b<cellRows&&!inHouse(a,b));
  const shuffle = a => { for(let k=a.length-1;k>0;k--){const r=Math.floor(rand()*(k+1));[a[k],a[r]]=[a[r],a[k]];} return a; };

  let start=null;
  for (let i=0;i<cellCols&&!start;i++) for (let j=0;j<cellRows&&!start;j++) if(!inHouse(i,j)) start=[i,j];
  const stack=[start]; seen[start[0]][start[1]]=true;
  while(stack.length){
    const [i,j]=stack[stack.length-1];
    const un=shuffle(neigh(i,j).filter(([a,b])=>!seen[a][b]));
    if(!un.length){ stack.pop(); continue; }
    const [ni,nj]=un[0];
    g[(cy(j)+cy(nj))/2][(cx(i)+cx(ni))/2]='.';
    seen[ni][nj]=true; stack.push([ni,nj]);
  }
  for (let i=0;i<cellCols;i++) for (let j=0;j<cellRows;j++) {
    if (inHouse(i,j)) continue;
    for (const [ni,nj] of neigh(i,j)) {
      if (ni<i || (ni===i&&nj<j)) continue;
      const wx=(cx(i)+cx(ni))/2, wy=(cy(j)+cy(nj))/2;
      if (g[wy][wx]==='#' && rand()<loopP) g[wy][wx]='.';
    }
  }
  for (let y=0;y<ROWS;y++) for (let x=0;x<MID;x++) g[y][COLS-1-x]=g[y][x];
  for (let x=0;x<COLS;x++){ g[0][x]='#'; g[ROWS-1][x]='#'; }
  for (let y=0;y<ROWS;y++){ g[y][0]='#'; g[y][COLS-1]='#'; }
  for (let y=HOUSE.y0-1;y<=HOUSE.y1+1;y++) for (let x=HOUSE.x0-1;x<=HOUSE.x1+1;x++) {
    const b = x===HOUSE.x0-1||x===HOUSE.x1+1||y===HOUSE.y0-1||y===HOUSE.y1+1;
    g[y][x] = b ? '#' : 'g';
  }
  g[HOUSE.y0-1][9]='D'; g[HOUSE.y1+1][9]='D';
  for (const k of RESERVED){ const [x,y]=k.split(',').map(Number); if(g[y][x]==='#') g[y][x]='.'; }
  for (let x=1;x<HOUSE.x0-1;x++) g[TUNNEL_ROW][x]='.';
  for (let x=HOUSE.x1+2;x<COLS-1;x++) g[TUNNEL_ROW][x]='.';
  g[TUNNEL_ROW][0]='T'; g[TUNNEL_ROW][COLS-1]='T';
  return g;
}

const at = (g,x,y) => { let nx=x; if(nx<0)nx=COLS-1; if(nx>=COLS)nx=0;
  if(y<0||y>=ROWS) return '#'; return g[y][nx]; };
const deg = (g,x,y) => [[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy])=>walk(at(g,x+dx,y+dy))).length;

function profile(g) {
  let floors=0, degSum=0, runTotal=0, deadEnds=0, worstTrap=0, trapTotal=0;
  const dist = Array.from({length:ROWS},()=>new Array(COLS).fill(-1));
  dist[PLAYER[1]][PLAYER[0]]=0;
  const q=[PLAYER];
  while(q.length){
    const [x,y]=q.shift();
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      let nx=x+dx; const ny=y+dy;
      if (ny<0||ny>=ROWS) continue;
      if (nx<0||nx>=COLS){ if(y!==TUNNEL_ROW) continue; nx=nx<0?COLS-1:0; }
      if (dist[ny][nx]!==-1 || !walk(at(g,nx,ny))) continue;
      dist[ny][nx]=dist[y][x]+1; q.push([nx,ny]);
    }
  }
  let ecc=0, unreachable=0;
  for (let y=1;y<ROWS-1;y++) for (let x=1;x<COLS-1;x++) {
    if (!walk(g[y][x])) continue;
    floors++;
    if (dist[y][x] < 0) unreachable++; else ecc = Math.max(ecc, dist[y][x]);
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) if (walk(at(g,x+dx,y+dy))) degSum++;
    let h=1,v=1;
    for(let k=x-1;k>=1&&walk(g[y][k]);k--)h++;
    for(let k=x+1;k<COLS-1&&walk(g[y][k]);k++)h++;
    for(let k=y-1;k>=1&&walk(g[k][x]);k--)v++;
    for(let k=y+1;k<ROWS-1&&walk(g[k][x]);k++)v++;
    runTotal += Math.max(h,v);
    if (deg(g,x,y) === 1) {
      deadEnds++;
      let cxx=x, cyy=y, prev=null, steps=0;
      while (steps < 40) {
        const nx = [[1,0],[-1,0],[0,1],[0,-1]]
          .map(([dx,dy])=>[cxx+dx, cyy+dy])
          .filter(([a,b])=>b>=0&&b<ROWS&&a>=0&&a<COLS&&walk(g[b][a]))
          .filter(([a,b])=>!prev||a!==prev[0]||b!==prev[1]);
        if (nx.length!==1) break;
        prev=[cxx,cyy]; [cxx,cyy]=nx[0]; steps++;
        if (deg(g,cxx,cyy)>=3) break;
      }
      worstTrap = Math.max(worstTrap, steps);
      trapTotal += steps;
    }
  }
  return { openness:degSum/floors, straight:runTotal/floors, ecc, unreachable,
           deadEnds, worstTrap, avgTrap: deadEnds?trapTotal/deadEnds:0, floors };
}

function reachableWithPortals(g, portals) {
  const p = new Set(portals.map(([x,y])=>`${x},${y}`));
  const seen = Array.from({length:ROWS},()=>new Array(COLS).fill(false));
  seen[PLAYER[1]][PLAYER[0]]=true;
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

function spreadPick(c, n, rand) {
  if (c.length<n) return null;
  const picked=[c[Math.floor(rand()*c.length)]];
  while(picked.length<n){
    let best=null,bs=-1;
    for(const t of c){
      if(picked.some(p=>p[0]===t[0]&&p[1]===t[1]))continue;
      const s=Math.min(...picked.map(p=>Math.abs(p[0]-t[0])+Math.abs(p[1]-t[1])));
      if(s>bs){bs=s;best=t;}
    }
    if(!best)return null;
    picked.push(best);
  }
  return picked;
}

// level 1's forgiveness benchmarks
const MAX_TRAP = 6, MAX_AVG_TRAP = 3.6, MAX_ECC = 30;

let best = null;
for (const loopP of [0.14, 0.16, 0.18, 0.20, 0.22]) {
  for (let seed = 300000; seed < 302500; seed++) {
    const g = buildMaze(seed, loopP);
    if (g[PLAYER[1]][PLAYER[0]]==='#') continue;
    const p = profile(g);
    if (p.unreachable) continue;
    if (p.worstTrap > MAX_TRAP) continue;      // no death-pit corridors
    if (p.avgTrap > MAX_AVG_TRAP) continue;
    if (p.ecc > MAX_ECC) continue;             // no marathon detours

    const rand = mulberry32(seed ^ 0x2545f491);
    const cands=[];
    for (let y=1;y<ROWS-1;y++) for (let x=1;x<COLS-1;x++) {
      if (g[y][x]==='.' && !RESERVED.has(`${x},${y}`) && y!==TUNNEL_ROW) cands.push([x,y]);
    }
    const spots = spreadPick(cands, 8, rand);
    if (!spots) continue;
    const portals = spots.slice(0,4), powers = spots.slice(4,8);
    const seen = reachableWithPortals(g, portals);
    let bad=0;
    for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) if (g[y][x]==='.' && !seen[y][x]) bad++;
    if (bad) continue;

    // among the survivors, prefer the one closest to level 1's texture
    const score = -(Math.abs(p.openness-2.19)*4 + Math.abs(p.straight-7.4)*0.15
                    + p.worstTrap*0.05 + p.ecc*0.01);
    if (best && score <= best.score) continue;

    const out = g.map(r=>r.slice());
    out[portals[0][1]][portals[0][0]]='1'; out[portals[1][1]][portals[1][0]]='1';
    out[portals[2][1]][portals[2][0]]='2'; out[portals[3][1]][portals[3][0]]='2';
    for (const [x,y] of powers) out[y][x]='o';
    out[PLAYER[1]][PLAYER[0]]='P';
    best = { grid: out.map(r=>r.join('')), seed, loopP, p, score };
  }
}

if (!best) { console.error('no candidate met level 1\'s forgiveness bar'); process.exit(1); }
const p = best.p;
console.log(`seed=${best.seed} loopP=${best.loopP}`);
console.log(`openness=${p.openness.toFixed(2)} straight=${p.straight.toFixed(1)} ` +
            `deadEnds=${p.deadEnds} worstTrap=${p.worstTrap} avgTrap=${p.avgTrap.toFixed(1)} detour=${p.ecc}`);
console.log(best.grid.join('\n'));
console.log('\nconst MAZE_LEVEL_4 = [');
console.log(best.grid.map(r=>`"${r}",`).join('\n'));
console.log('];');
