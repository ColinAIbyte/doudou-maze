// Levels 2-6, built block-style rather than with a maze algorithm.
//
// A recursive-backtracker maze inherently zig-zags — corridors turn every
// couple of tiles. Classic arcade layouts are the opposite: rectangular wall
// blocks separated by single-tile lanes, which produces long straight runs you
// can actually sprint down. So this starts from a full lattice of open lanes
// (every odd row and odd column) and then grows wall blocks into it, keeping
// every corridor dead straight and the whole map heavily interconnected.
//
// Layouts are mirrored left/right for the symmetric arcade look.
// Power pellets go anywhere on open floor now — with this much connectivity a
// player can always route around one, so they no longer need pocket carving.

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

const playerWalk = ch => ch !== '#' && ch !== 'g' && ch !== 'D';

/** Tiles that must stay open for ghosts to leave/return home, plus the spawn. */
const RESERVED = new Set([
  '9,6','9,7','9,8','9,12','9,13','9,14','9,15',
]);

function buildLattice(seed, blockGrow) {
  const rand = mulberry32(seed);
  const g = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => '#'));

  // open every odd row and odd column -> a full lattice of straight lanes
  for (let y = 1; y < ROWS - 1; y += 2) for (let x = 1; x < COLS - 1; x++) g[y][x] = '.';
  for (let x = 1; x < COLS - 1; x += 2) for (let y = 1; y < ROWS - 1; y++) g[y][x] = '.';

  // grow wall blocks: seal a lane tile adjacent to a pillar so the pillar
  // becomes a longer rectangle. Only the LEFT half is decided; it's mirrored
  // afterwards, so the map stays symmetric.
  const mid = (COLS - 1) / 2;
  for (let y = 2; y < ROWS - 1; y += 2) {
    for (let x = 2; x <= mid; x += 2) {
      // horizontal growth: wall the lane tile to the pillar's right
      if (x + 1 < mid && rand() < blockGrow) g[y][x + 1] = '#';
      // vertical growth: wall the lane tile below the pillar
      if (y + 1 < ROWS - 1 && rand() < blockGrow) g[y + 1][x] = '#';
    }
  }

  // mirror left half onto the right for symmetry
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < mid; x++) g[y][COLS - 1 - x] = g[y][x];
  }

  // borders
  for (let x = 0; x < COLS; x++) { g[0][x] = '#'; g[ROWS-1][x] = '#'; }
  for (let y = 0; y < ROWS; y++) { g[y][0] = '#'; g[y][COLS-1] = '#'; }

  // ghost house
  for (let y = HOUSE.y0-1; y <= HOUSE.y1+1; y++) for (let x = HOUSE.x0-1; x <= HOUSE.x1+1; x++) {
    const border = x===HOUSE.x0-1||x===HOUSE.x1+1||y===HOUSE.y0-1||y===HOUSE.y1+1;
    g[y][x] = border ? '#' : 'g';
  }
  g[HOUSE.y0-1][9] = 'D';
  g[HOUSE.y1+1][9] = 'D';

  // keep the ghosts' way in and out clear
  for (const key of RESERVED) {
    const [x,y] = key.split(',').map(Number);
    if (g[y][x] === '#') g[y][x] = '.';
  }

  // tunnel row runs clear either side of the house, wrapping at both edges
  for (let x = 1; x < HOUSE.x0-1; x++) g[TUNNEL_ROW][x] = '.';
  for (let x = HOUSE.x1+2; x < COLS-1; x++) g[TUNNEL_ROW][x] = '.';
  g[TUNNEL_ROW][0] = 'T'; g[TUNNEL_ROW][COLS-1] = 'T';

  return g;
}

/**
 * Reachability with portals treated as ABSORBING: you can step onto a portal
 * tile but never walk through it, because arriving teleports you away. This is
 * the correct model — a portal effectively cuts its corridor — and it lets
 * portals sit mid-lane safely as long as redundant routes exist.
 */
function reachable(g, portalTiles) {
  const portal = new Set(portalTiles.map(([x,y]) => `${x},${y}`));
  const at=(x,y)=>{ let nx=x; if(nx<0)nx=COLS-1; if(nx>=COLS)nx=0; if(y<0||y>=ROWS)return '#'; return g[y][nx]; };
  const seen = Array.from({length:ROWS},()=>new Array(COLS).fill(false));
  seen[PLAYER[1]][PLAYER[0]] = true;
  const q=[PLAYER];
  while(q.length){
    const [x,y]=q.shift();
    if (portal.has(`${x},${y}`)) continue; // absorbing: cannot continue through
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      let nx=x+dx, ny=y+dy;
      if (ny<0||ny>=ROWS) continue;
      if (nx<0||nx>=COLS){ if(y!==TUNNEL_ROW) continue; nx = nx<0?COLS-1:0; }
      if (seen[ny][nx]) continue;
      if (!playerWalk(at(nx,ny))) continue;
      seen[ny][nx]=true; q.push([nx,ny]);
    }
  }
  return seen;
}

/** Longest unbroken straight run through a tile — the "can I sprint here" metric. */
function straightness(g) {
  let total = 0, count = 0;
  for (let y=1;y<ROWS-1;y++) for (let x=1;x<COLS-1;x++) {
    if (g[y][x] !== '.') continue;
    let h=1, v=1;
    for (let k=x-1;k>=1 && g[y][k]==='.';k--) h++;
    for (let k=x+1;k<COLS-1 && g[y][k]==='.';k++) h++;
    for (let k=y-1;k>=1 && g[k][x]==='.';k--) v++;
    for (let k=y+1;k<ROWS-1 && g[k][x]==='.';k++) v++;
    total += Math.max(h,v); count++;
  }
  return total/count;
}

function openTiles(g) {
  const out = [];
  for (let y=1;y<ROWS-1;y++) for (let x=1;x<COLS-1;x++) {
    if (g[y][x]==='.' && !RESERVED.has(`${x},${y}`) && y!==TUNNEL_ROW) out.push([x,y]);
  }
  return out;
}

function spreadPick(cands, n, rand) {
  if (cands.length < n) return null;
  const picked = [cands[Math.floor(rand()*cands.length)]];
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

function build(seedStart, blockGrow) {
  let best = null;
  for (let seed = seedStart; seed < seedStart + 400; seed++) {
    const g = buildLattice(seed, blockGrow);
    if (g[PLAYER[1]][PLAYER[0]] === '#') continue;

    const rand = mulberry32(seed ^ 0x9e3779b9);
    const cands = openTiles(g);
    const spots = spreadPick(cands, 8, rand);
    if (!spots) continue;
    const portals = spots.slice(0,4);
    const powers  = spots.slice(4,8);

    const seen = reachable(g, portals);
    let unreachable = 0, floors = 0;
    for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) {
      if (g[y][x]==='.') { floors++; if (!seen[y][x]) unreachable++; }
    }
    if (unreachable) continue;

    let degSum = 0;
    for (let y=1;y<ROWS-1;y++) for (let x=1;x<COLS-1;x++) {
      if (g[y][x] !== '.') continue;
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) if (playerWalk(g[y+dy][x+dx])) degSum++;
    }
    const openness = degSum/floors;
    const straight = straightness(g);
    const score = straight + openness; // want both long lanes and many junctions
    if (best && score <= best.score) continue;

    const out = g.map(r=>r.slice());
    out[portals[0][1]][portals[0][0]]='1'; out[portals[1][1]][portals[1][0]]='1';
    out[portals[2][1]][portals[2][0]]='2'; out[portals[3][1]][portals[3][0]]='2';
    for (const [x,y] of powers) out[y][x]='o';
    out[PLAYER[1]][PLAYER[0]]='P';
    best = { grid: out.map(r=>r.join('')), seed, openness:+openness.toFixed(2),
             straight:+straight.toFixed(2), floors, score };
  }
  return best;
}

// Slightly denser blocks in later levels: still wide open, just a touch more
// structure to navigate. The real difficulty ramp is in the ghost tuning.
const specs = [
  { name:'MAZE_LEVEL_2', seed:71000, grow:0.30 },
  { name:'MAZE_LEVEL_3', seed:73000, grow:0.34 },
  { name:'MAZE_LEVEL_4', seed:75000, grow:0.38 },
  { name:'MAZE_LEVEL_5', seed:77000, grow:0.42 },
  { name:'MAZE_LEVEL_6', seed:79000, grow:0.46 },
];

const results = [];
for (const s of specs) {
  const r = build(s.seed, s.grow);
  if (!r) { console.error(`FAILED ${s.name}`); process.exit(1); }
  results.push({ ...s, ...r });
  console.log(`${s.name}: seed=${r.seed} openness=${r.openness} avgStraightRun=${r.straight} floors=${r.floors}`);
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
