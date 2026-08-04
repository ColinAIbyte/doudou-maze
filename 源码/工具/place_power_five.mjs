// Lays out FIVE power pellets on a given level, spread over the board.
//   用法: node place_power_five.mjs 5
//
// The maps are left/right mirrored, so an odd count only stays symmetric as
// two mirrored PAIRS plus one tile on the centre column (x=9 mirrors onto
// itself). Anything else leaves the board visibly lopsided.
//
// Two lessons are baked into the scoring:
//
//   * "Don't bunch them" is a THRESHOLD, not something to maximise. Maximising
//     the minimum gap flings every pellet onto the safe outer ring and undoes
//     the risk placement. So require a gap, then among layouts that clear it
//     pick the one sitting deepest in contested ground.
//   * A quadrant count can look perfectly even while every pellet sits in one
//     narrow horizontal band (this is exactly what was wrong with level 5).
//     So the two pairs are additionally required to straddle the ghost house
//     vertically.
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const LEVEL = Number(process.argv[2]);
if (!LEVEL || LEVEL < 1 || LEVEL > 6) {
  console.error('用法: node place_power_five.mjs <关卡号 1-6>');
  process.exit(1);
}

const FILE = fileURLToPath(new URL('../pacman_fragment.html', import.meta.url));
let src = readFileSync(FILE, 'utf8');

const COLS = 19, ROWS = 21, MID = 9, TUNNEL_ROW = 10;
const SPAWN = [9, 15], HOUSE = [9, 10];
const MIN_SPAWN_DIST = 6;
const MIN_PORTAL_DIST = 3;
const MIN_PAIR_SPAN = 6;   // a pair hugging the centre line is one fat pellet
const MIN_GAP = 8;         // threshold, not a target — see header
const MIN_PAIR_Y_SPLIT = 6; // the two pairs must be genuinely far apart vertically
const RESERVED = new Set(['9,6','9,7','9,8','9,12','9,13','9,14','9,15']);

const walk = ch => ch !== '#' && ch !== 'g' && ch !== 'D';
const md = (a,b) => Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]);

const re = new RegExp(`const MAZE_LEVEL_${LEVEL} = \\[([\\s\\S]*?)\\];`);
const g = src.match(re)[1].split('\n').map(l=>l.trim()).filter(Boolean)
  .map(l=>l.replace(/^"/,'').replace(/",?$/,'').split(''));

const portals = [];
for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++){
  if (g[y][x]==='1'||g[y][x]==='2') portals.push([x,y]);
  if (g[y][x]==='o') g[y][x]='.';        // clear the existing layout
}

const eligible = (x,y) =>
  x>=1 && x<=COLS-2 && y>=1 && y<=ROWS-2 &&
  g[y][x]==='.' &&
  y!==TUNNEL_ROW && !RESERVED.has(`${x},${y}`) &&
  md([x,y],SPAWN) >= MIN_SPAWN_DIST &&
  portals.every(p => md([x,y],p) >= MIN_PORTAL_DIST);

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

const minGap = set => {
  let m = Infinity;
  for (let i=0;i<set.length;i++) for (let j=i+1;j<set.length;j++) m = Math.min(m, md(set[i],set[j]));
  return m;
};

let best = null;
for (let a=0;a<pairs.length;a++){
  for (let b=a+1;b<pairs.length;b++){
    // one pair above the house, one below, and not merely a row apart
    const above = pairs[a][1] < HOUSE[1], below = pairs[b][1] > HOUSE[1];
    const straddles = (above && below) || (pairs[b][1] < HOUSE[1] && pairs[a][1] > HOUSE[1]);
    if (!straddles) continue;
    if (Math.abs(pairs[a][1] - pairs[b][1]) < MIN_PAIR_Y_SPLIT) continue;

    for (const c of centres){
      const set = [
        pairs[a], [COLS-1-pairs[a][0], pairs[a][1]],
        pairs[b], [COLS-1-pairs[b][0], pairs[b][1]],
        c,
      ];
      if (minGap(set) < MIN_GAP) continue;
      const avgHouse = set.reduce((s,p)=>s+md(p,HOUSE),0) / set.length;
      const score = -avgHouse;            // closer to contested ground wins
      if (!best || score > best.score) best = { set, gap:minGap(set), score, avgHouse };
    }
  }
}

if (!best){ console.error(`找不到同时满足间距 ${MIN_GAP} 与纵向分散的布局`); process.exit(1); }

best.set.forEach(([x,y]) => { g[y][x]='o'; });
src = src.replace(re, `const MAZE_LEVEL_${LEVEL} = [\n${g.map(r=>`"${r.join('')}",`).join('\n')}\n];`);
writeFileSync(FILE, src);

const ys = best.set.map(p=>p[1]);
console.log(`第 ${LEVEL} 关能量豆 5 颗:`, best.set.map(p=>p.join(',')).join('  '));
console.log('彼此最近间距:', best.gap, '格');
console.log('纵向跨度: y', Math.min(...ys), '->', Math.max(...ys));
console.log('距幽灵屋:', best.set.map(p=>md(p,HOUSE)).join(' '), `(均值 ${best.avgHouse.toFixed(1)})`);
