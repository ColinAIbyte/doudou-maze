const W = 19, H = 21, CX = 9;
// grid[y][x], build left half x=0..9 then mirror
const g = [];
for (let y=0;y<H;y++){ g.push(new Array(10).fill('.')); }

// helper to set a rectangle wall on left half (inclusive coords), clipped to x<=9
function wall(x0,x1,y0,y1){
  for (let y=y0;y<=y1;y++) for (let x=x0;x<=x1;x++){
    if (x>=0 && x<=9 && y>=0 && y<H) g[y][x]='#';
  }
}
function set(x,y,ch){ if(x>=0&&x<=9&&y>=0&&y<H) g[y][x]=ch; }

// border
wall(0,9,0,0);      // top border (full row incl center; mirrored covers rest)
wall(0,9,20,20);    // bottom border
wall(0,0,0,20);     // left border column
// note: right border (x=18) comes from mirroring x=0 automatically

// --- interior wall blocks (left half only, x:0-9) ---
// small corner blocks row2-3
wall(2,3,2,3);
wall(5,7,2,2);
// row4 divider under top pellet field - none, keep open
// row5 blocks
wall(2,2,5,6);
wall(4,4,5,7);
wall(6,7,5,5);
wall(6,6,6,7);
// long horizontal shelf row 7 (like classic bar), leave gap near center for shaft
wall(1,3,7,7);
wall(5,8,7,7); // leave x=9 (center) open as shaft, and x=4 open as side corridor gap
set(4,7,'.');

// ghost house box x:8-9(part)-... center box occupies x:8-9 on left half, mirrors to x:9-10 -> full box x:8..10
wall(8,9,9,11);      // left wall of box + interior marked wall then carve interior below
// carve interior of ghost house to 'g' (empty, ghost home) except keep box walls at edges
for (let y=9;y<=11;y++){
  for (let x=8;x<=9;x++){
    // will refine after mirroring; mark as ghost interior for x=8 only (x9 handled by center col logic)
  }
}
// simpler: explicitly set box perimeter and interior directly with full-grid thinking after mirror.
// Reset box area then rebuild cleanly:
for (let y=8;y<=12;y++) for (let x=6;x<=9;x++) g[y][x] = '.';

wall(6,9,8,8);  // top wall of ghost house (will mirror to full 6..12 top wall, minus door)
wall(6,9,12,12); // bottom wall
wall(6,6,8,12); // left wall of house
for (let y=9;y<=11;y++) set(9,y,'g'); // interior row at center-ish (x9 will be center col after mirror... )

// door: open center-top of house
set(9,8,'.'); // door tile on top wall (center column) -> walkable, connects shaft to house
set(6,10,'#'); // ensure left wall solid at tunnel row too (redundant)

// tunnel row y=10: fully open corridor from x=0 to x=6 (flanking house), x=0 is tunnel exit
wall(0,0,10,10); // remove border wall at tunnel row -> reset below
set(0,10,'T');
for (let x=1;x<=5;x++) set(x,10,'.');
set(6,10,'#'); // house wall boundary stays

// rows 13-19 mirror-ish of rows 1-7 pattern (hand designed, symmetric top/bottom too for balance)
wall(2,3,17,18);
wall(5,7,18,18);
wall(2,2,14,15);
wall(4,4,13,15);
wall(6,7,15,15);
wall(6,6,13,14);
wall(1,3,13,13);
wall(5,8,13,13);
set(4,13,'.');

// power pellets at four corners (inside border)
set(1,1,'o');
set(1,19,'o');

// portal pair marker (single tile on left half; mirror creates the twin)
set(1,9,'1');
set(1,11,'1'); // hmm duplicate id both sides would create 4 tiles; instead use two different rows one each id
set(1,9,'1');
set(1,11,'2');

// player start marker near bottom center-left area (will only appear once, not mirrored duplicate issue since it's a single coordinate not on axis... but mirroring x=? if x<9 it also creates mirror 'P' on right! Need P only once -> place at center column x=9)
set(9,16,'P');

// clear a plausible player start row area to '.' first then set P
for (let x=1;x<=8;x++) set(x,16,'.');
set(9,16,'.'); // temp, will overwrite

// finalize player start at center col (only one since center col not mirrored separately)
set(9,16,'P');

// mirror to full grid
const full = [];
for (let y=0;y<H;y++){
  const row = new Array(W);
  for (let x=0;x<10;x++) row[x] = g[y][x];
  for (let x=0;x<9;x++) row[18-x] = g[y][x];
  full.push(row);
}

// print
const lines = full.map(r=>r.join(''));
console.log(lines.join('\n'));

// validate connectivity via BFS from P, with tunnel wrap at the T row
function isWalkable(ch){ return ch!=='#'; }
let start=null;
for (let y=0;y<H;y++) for (let x=0;x<W;x++) if (full[y][x]==='P') start=[x,y];
if(!start){ console.log('NO PLAYER START'); process.exit(1); }
const visited = Array.from({length:H},()=>new Array(W).fill(false));
const q=[start]; visited[start[1]][start[0]]=true; let count=0;
while(q.length){
  const [x,y]=q.shift(); count++;
  const neigh=[[x+1,y],[x-1,y],[x,y+1],[x,y-1]];
  for (let [nx,ny] of neigh){
    if(ny<0||ny>=H) continue;
    if(nx<0) nx=W-1; if(nx>=W) nx=0;
    if(visited[ny][nx]) continue;
    if(!isWalkable(full[ny][nx])) continue;
    visited[ny][nx]=true; q.push([nx,ny]);
  }
}
let totalWalkable=0, unreachable=[];
for (let y=0;y<H;y++) for (let x=0;x<W;x++){
  if(isWalkable(full[y][x])){ totalWalkable++; if(!visited[y][x]) unreachable.push([x,y,full[y][x]]); }
}
console.log('\nTotalWalkable:',totalWalkable,'Reached:',count,'Unreachable:',unreachable.length);
if(unreachable.length) console.log(unreachable);

let p1=0,p2=0;
for (let y=0;y<H;y++) for (let x=0;x<W;x++){ if(full[y][x]==='1')p1++; if(full[y][x]==='2')p2++; }
console.log('portal1 tiles:',p1,'portal2 tiles:',p2);
