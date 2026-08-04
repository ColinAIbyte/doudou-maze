// Compares the six maps on the things that actually make a maze punishing:
// dead ends you can be cornered in, how far the worst pellet is, and how many
// tiles offer a genuine choice of escape route.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const src = readFileSync(
  fileURLToPath(new URL('../pacman_fragment.html', import.meta.url)), 'utf8',
);
const grab = n => {
  const m = src.match(new RegExp(`const MAZE_LEVEL_${n} = \\[([\\s\\S]*?)\\];`));
  return m[1].split('\n').map(l => l.trim()).filter(Boolean)
    .map(l => l.replace(/^"/, '').replace(/",?$/, ''));
};

const walk = ch => ch !== '#' && ch !== 'g' && ch !== 'D';
const TUNNEL_ROW = 10;

function analyse(g) {
  const R = g.length, C = g[0].length;
  const at = (x, y) => {
    let nx = x;
    if (nx < 0) nx = C - 1;
    if (nx >= C) nx = 0;
    if (y < 0 || y >= R) return '#';
    return g[y][nx];
  };
  const deg = (x, y) => [[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy]) => walk(at(x+dx, y+dy))).length;

  let spawn = null;
  for (let y=0;y<R;y++) for (let x=0;x<C;x++) if (g[y][x]==='P') spawn=[x,y];

  const dist = Array.from({length:R},()=>new Array(C).fill(-1));
  dist[spawn[1]][spawn[0]] = 0;
  const q=[spawn];
  while(q.length){
    const [x,y]=q.shift();
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      let nx=x+dx; const ny=y+dy;
      if (ny<0||ny>=R) continue;
      if (nx<0||nx>=C){ if(y!==TUNNEL_ROW) continue; nx = nx<0?C-1:0; }
      if (dist[ny][nx]!==-1 || !walk(at(nx,ny))) continue;
      dist[ny][nx]=dist[y][x]+1; q.push([nx,ny]);
    }
  }

  let deadEnds = 0, corridors = 0, junctions = 0, ecc = 0, floors = 0;
  // "trap depth": how far you must walk back out of a dead end before reaching
  // a junction — the longer, the more lethal it is to be caught in there
  let worstTrap = 0, trapTotal = 0;
  for (let y=1;y<R-1;y++) for (let x=1;x<C-1;x++) {
    if (!walk(g[y][x])) continue;
    floors++;
    const d = deg(x,y);
    if (d === 1) {
      deadEnds++;
      // walk out until a junction (deg>=3) is reached
      let cx=x, cy=y, prev=null, steps=0;
      while (steps < 40) {
        const nexts = [[1,0],[-1,0],[0,1],[0,-1]]
          .map(([dx,dy]) => [cx+dx, cy+dy])
          .filter(([nx,ny]) => ny>=0&&ny<R&&nx>=0&&nx<C&&walk(g[ny][nx]))
          .filter(([nx,ny]) => !prev || nx!==prev[0] || ny!==prev[1]);
        if (nexts.length !== 1) break;
        prev=[cx,cy]; [cx,cy]=nexts[0]; steps++;
        if (deg(cx,cy) >= 3) break;
      }
      worstTrap = Math.max(worstTrap, steps);
      trapTotal += steps;
    }
    else if (d === 2) corridors++;
    else junctions++;
    if ((g[y][x]==='.'||g[y][x]==='o') && dist[y][x]>ecc) ecc = dist[y][x];
  }
  return { deadEnds, worstTrap, avgTrap: deadEnds ? +(trapTotal/deadEnds).toFixed(1) : 0,
           junctionPct: +(junctions/floors*100).toFixed(0), ecc, floors };
}

console.log('lvl | deadEnds | worstTrap | avgTrap | junction% | worstDetour');
for (const n of [1,2,3,4,5,6]) {
  const a = analyse(grab(n));
  const flag = n===4 ? '   <-- flagged as too hard' : '';
  console.log(`  ${n} |    ${String(a.deadEnds).padStart(2)}    |    ${String(a.worstTrap).padStart(2)}     |  ${String(a.avgTrap).padStart(4)}   |    ${String(a.junctionPct).padStart(2)}%    |     ${a.ecc}${flag}`);
}
