// Gives level 3 five power pellets instead of four, spread across the board.
//
// The map is left/right mirrored, so an odd count only stays symmetric as
// TWO mirrored pairs PLUS one tile on the centre column (x=9, which mirrors
// onto itself). Anything else would leave the layout visibly lopsided.
//
// Selection maximises the SMALLEST gap between any two pellets, which is what
// "don't bunch them up" actually means — averages hide a cluster, the minimum
// doesn't.
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = fileURLToPath(new URL('../pacman_fragment.html', import.meta.url));
let src = readFileSync(FILE, 'utf8');

const COLS = 19, ROWS = 21, MID = 9, TUNNEL_ROW = 10;
const SPAWN = [9, 15], HOUSE = [9, 10];
const MIN_SPAWN_DIST = 6;
const MIN_PORTAL_DIST = 3;
const MIN_PAIR_SPAN = 6;   // a pair hugging the centre line is one fat pellet
const RESERVED = new Set(['9,6','9,7','9,8','9,12','9,13','9,14','9,15']);

const walk = ch => ch !== '#' && ch !== 'g' && ch !== 'D';
const md = (a,b) => Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]);

const re = /const MAZE_LEVEL_3 = \[([\s\S]*?)\];/;
const g = src.match(re)[1].split('\n').map(l=>l.trim()).filter(Boolean)
  .map(l=>l.replace(/^"/,'').replace(/",?$/,'').split(''));

const portals = [];
for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++){
  if (g[y][x]==='1'||g[y][x]==='2') portals.push([x,y]);
  if (g[y][x]==='o') g[y][x]='.';        // clear the old four
}

const eligible = (x,y) =>
  x>=1 && x<=COLS-2 && y>=1 && y<=ROWS-2 &&
  g[y][x]==='.' &&
  y!==TUNNEL_ROW && !RESERVED.has(`${x},${y}`) &&
  md([x,y],SPAWN) >= MIN_SPAWN_DIST &&
  portals.every(p => md([x,y],p) >= MIN_PORTAL_DIST);

// candidate mirrored pairs, and candidate centre-column tiles
const pairs = [];
for (let y=1;y<ROWS-1;y++) for (let x=1;x<MID;x++){
  const mx = COLS-1-x;
  if (mx - x < MIN_PAIR_SPAN) continue;
  if (eligible(x,y) && eligible(mx,y)) pairs.push([x,y]);
}
const centres = [];
for (let y=1;y<ROWS-1;y++) if (eligible(MID,y)) centres.push([MID,y]);

if (pairs.length < 2 || !centres.length){
  console.error(`候选不足: 镜像对 ${pairs.length} 组, 中轴 ${centres.length} 格`);
  process.exit(1);
}

/** Smallest gap between any two of the five — the number that decides clustering. */
function minGap(set){
  let m = Infinity;
  for (let i=0;i<set.length;i++) for (let j=i+1;j<set.length;j++) m = Math.min(m, md(set[i],set[j]));
  return m;
}

// "Not concentrated" is a threshold, not something to maximise: pushing the
// gap as wide as possible just flings all five onto the safe outer ring and
// undoes the risk placement. So require a decent gap, then among the layouts
// that clear it, take the one sitting deepest in contested ground.
const MIN_GAP = 8;

let best = null;
for (let a=0;a<pairs.length;a++){
  for (let b=a+1;b<pairs.length;b++){
    for (const c of centres){
      const set = [
        pairs[a], [COLS-1-pairs[a][0], pairs[a][1]],
        pairs[b], [COLS-1-pairs[b][0], pairs[b][1]],
        c,
      ];
      const gap = minGap(set);
      if (gap < MIN_GAP) continue;
      const avgHouse = set.reduce((s,p)=>s+md(p,HOUSE),0) / set.length;
      const score = -avgHouse;              // closer to the house wins
      if (!best || score > best.score) best = { set, gap, score, avgHouse };
    }
  }
}
if (!best){ console.error(`没有满足最小间距 ${MIN_GAP} 的布局`); process.exit(1); }

best.set.forEach(([x,y]) => { g[y][x]='o'; });
src = src.replace(re, `const MAZE_LEVEL_3 = [\n${g.map(r=>`"${r.join('')}",`).join('\n')}\n];`);
writeFileSync(FILE, src);

console.log('第三关能量豆 5 颗:', best.set.map(p=>p.join(',')).join('  '));
console.log('彼此最近间距:', best.gap, '格');
console.log('距幽灵屋:', best.set.map(p=>md(p,HOUSE)).join(' '));
console.log('距出生点:', best.set.map(p=>md(p,SPAWN)).join(' '));
