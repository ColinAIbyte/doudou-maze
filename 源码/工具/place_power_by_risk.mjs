// Places the power pellets on levels 2-6 somewhere that actually costs
// something to reach.
//
// Measuring the previous layout showed it was only half-risky: the tiles had
// few escape routes (good), but every one sat 12-17 tiles from the ghost
// house — the outer ring, which you can lap while the ghosts are still stuck
// in the middle. The reward is the biggest in the game (four ghosts at
// 200/400/800/1600 plus a speed boost), so grabbing one should mean going
// into contested ground, not away from it.
//
// New rule: mirrored pairs in the CONTESTED BAND around the house, still
// clear of the spawn, the house doors and the tunnel row, and preferring
// tiles with few ways out so it stays a genuine commitment.
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = fileURLToPath(new URL('../pacman_fragment.html', import.meta.url));
let src = readFileSync(FILE, 'utf8');

const COLS = 19, ROWS = 21, MID = 9, TUNNEL_ROW = 10;
const SPAWN = [9, 15], HOUSE = [9, 10];
const HOUSE_NEAR = 5;    // any closer and it's inside the ghosts' doorway traffic
const HOUSE_FAR  = 10;   // any further and it's back on the safe outer lap
const MIN_SPAWN_DIST = 7;
const MIN_PORTAL_DIST = 3;
const RESERVED = new Set(['9,6','9,7','9,8','9,12','9,13','9,14','9,15']);

const walk = ch => ch !== '#' && ch !== 'g' && ch !== 'D';
const manhattan = (a,b) => Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]);

const at = (g,x,y) => {
  let nx=x; if(nx<0)nx=COLS-1; if(nx>=COLS)nx=0;
  if(y<0||y>=ROWS) return '#';
  return g[y][nx];
};
const deg = (g,x,y) => [[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy])=>walk(at(g,x+dx,y+dy))).length;

function escapeRoutes(g,x,y,reach=4){
  let routes=0;
  for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    if (!walk(at(g,x+dx,y+dy))) continue;
    let cx=x+dx, cy=y+dy, px=x, py=y, steps=0, escaped=false;
    while (steps++ < reach){
      if (deg(g,cx,cy) >= 3){ escaped=true; break; }
      const nexts=[[1,0],[-1,0],[0,1],[0,-1]]
        .map(([ax,ay])=>[cx+ax,cy+ay])
        .filter(([ax,ay])=>walk(at(g,ax,ay)))
        .filter(([ax,ay])=>!(ax===px&&ay===py));
      if (nexts.length!==1) break;
      px=cx; py=cy; [cx,cy]=nexts[0];
    }
    if (escaped) routes++;
  }
  return routes;
}

function relayout(n){
  const re = new RegExp(`const MAZE_LEVEL_${n} = \\[([\\s\\S]*?)\\];`);
  const g = src.match(re)[1].split('\n').map(l=>l.trim()).filter(Boolean)
    .map(l=>l.replace(/^"/,'').replace(/",?$/,'').split(''));

  const portals=[];
  for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++){
    if (g[y][x]==='1'||g[y][x]==='2') portals.push([x,y]);
    if (g[y][x]==='o') g[y][x]='.';
  }

  const eligible = (x,y) => {
    if (x<1||x>COLS-2||y<1||y>ROWS-2) return false;
    if (g[y][x] !== '.') return false;
    if (y===TUNNEL_ROW || RESERVED.has(`${x},${y}`)) return false;
    const d = manhattan([x,y], HOUSE);
    if (d < HOUSE_NEAR || d > HOUSE_FAR) return false;
    if (manhattan([x,y], SPAWN) < MIN_SPAWN_DIST) return false;
    return portals.every(p => manhattan([x,y],p) >= MIN_PORTAL_DIST);
  };

  // mirrored pairs only; score by risk (fewer escape routes, nearer the house)
  const MIN_PAIR_SPAN = 6;  // a pair straddling the centre line is just one fat pellet
  const pairs=[];
  for (let y=1;y<ROWS-1;y++) for (let x=1;x<MID;x++){
    const mx=COLS-1-x;
    if (mx - x < MIN_PAIR_SPAN) continue;
    if (!eligible(x,y) || !eligible(mx,y)) continue;
    const esc = escapeRoutes(g,x,y);
    pairs.push({ x, y, esc, house: manhattan([x,y],HOUSE),
                 risk: -esc*10 - manhattan([x,y],HOUSE) });
  }
  if (pairs.length < 2) return { n, ok:false, why:`只有 ${pairs.length} 组可用对` };

  pairs.sort((a,b)=>b.risk-a.risk);
  const top = pairs[0];
  // second pair must sit in the opposite vertical half, so they don't cluster
  const other = pairs.find(p => (p.y < HOUSE[1]) !== (top.y < HOUSE[1]))
             || pairs.find(p => Math.abs(p.y-top.y) >= 4);
  if (!other) return { n, ok:false, why:'找不到位于另一半的第二组' };

  const chosen = [[top.x,top.y],[COLS-1-top.x,top.y],[other.x,other.y],[COLS-1-other.x,other.y]];
  chosen.forEach(([x,y])=>{ g[y][x]='o'; });

  src = src.replace(re, `const MAZE_LEVEL_${n} = [\n${g.map(r=>`"${r.join('')}",`).join('\n')}\n];`);
  return { n, ok:true, chosen,
    detail:`逃生${top.esc}路/距屋${top.house}  ·  逃生${other.esc}路/距屋${other.house}`,
    nearestSpawn: Math.min(...chosen.map(p=>manhattan(p,SPAWN))) };
}

let bad=0;
for (const n of [2,3,4,5,6]){
  const r = relayout(n);
  if (!r.ok){ console.error(`L${r.n} 失败: ${r.why}`); bad++; continue; }
  console.log(`L${r.n}  ${r.chosen.map(p=>p.join(',')).join('  ')}   ${r.detail}   离出生点${r.nearestSpawn}`);
}
if (bad) process.exit(1);
writeFileSync(FILE, src);
console.log('\nwritten.');
