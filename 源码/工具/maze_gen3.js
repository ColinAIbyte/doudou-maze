// Robust maze generation via recursive backtracker on a cell grid, then mirrored for symmetry.
const W = 19, H = 21;
const cellCols = 5, cellRows = 10; // i:0..4 -> x=2i+1 (1,3,5,7,9) ; j:0..9 -> y=2j+1 (1..19)

function cx(i){ return 2*i+1; }
function cy(j){ return 2*j+1; }

// excluded cells (ghost house footprint): i in {3,4}, j in {4,5}
function excluded(i,j){ return (i===3||i===4) && (j===4||j===5); }

// tile grid, start all walls
const g = [];
for (let y=0;y<H;y++) g.push(new Array(10).fill('#')); // only need left half x=0..9

// mark included cells as floor
for (let i=0;i<cellCols;i++) for (let j=0;j<cellRows;j++){
  if (excluded(i,j)) continue;
  g[cy(j)][cx(i)] = '.';
}

// recursive backtracker over included cells
const visited = Array.from({length:cellCols},()=>new Array(cellRows).fill(false));
function neighborsOf(i,j){
  const list = [[i+1,j],[i-1,j],[i,j+1],[i,j-1]];
  return list.filter(([ni,nj]) => ni>=0&&ni<cellCols&&nj>=0&&nj<cellRows&&!excluded(ni,nj));
}
function shuffle(arr){
  for (let k=arr.length-1;k>0;k--){ const r=Math.floor(Math.random()*(k+1)); [arr[k],arr[r]]=[arr[r],arr[k]]; }
  return arr;
}
function carve(i,j){
  visited[i][j]=true;
  const neigh = shuffle(neighborsOf(i,j));
  for (const [ni,nj] of neigh){
    if (visited[ni][nj]) continue;
    // carve wall between (i,j) and (ni,nj)
    const wx = (cx(i)+cx(ni))/2, wy=(cy(j)+cy(nj))/2;
    g[wy][wx] = '.';
    carve(ni,nj);
  }
}
// start from first included cell
let sc=null;
for (let i=0;i<cellCols && !sc;i++) for (let j=0;j<cellRows && !sc;j++) if(!excluded(i,j)) sc=[i,j];
carve(sc[0],sc[1]);

// add a few extra loop connections for a less tree-like, more game-friendly maze
let extra=0;
for (let i=0;i<cellCols;i++) for (let j=0;j<cellRows;j++){
  if (excluded(i,j)) continue;
  if (Math.random()<0.12){
    const neigh = neighborsOf(i,j);
    for (const [ni,nj] of neigh){
      const wx=(cx(i)+cx(ni))/2, wy=(cy(j)+cy(ni===i?nj:nj))/2; // careful compute
    }
  }
}
// simpler extra-loop pass: iterate wall tiles between two included cells and randomly open ~10%
for (let i=0;i<cellCols;i++) for (let j=0;j<cellRows;j++){
  if (excluded(i,j)) continue;
  const neigh = neighborsOf(i,j);
  for (const [ni,nj] of neigh){
    if (ni<i || (ni===i && nj<j)) continue; // avoid double-processing pairs
    const wx=(cx(i)+cx(ni))/2, wy=(cy(j)+cy(nj))/2;
    if (g[wy][wx]==='#' && Math.random()<0.14){ g[wy][wx]='.'; extra++; }
  }
}

// mirror x=0..8 into x=10..18, keep x=9 as-is
const full = [];
for (let y=0;y<H;y++){
  const row = new Array(W);
  for (let x=0;x<10;x++) row[x]=g[y][x];
  for (let x=0;x<9;x++) row[18-x]=g[y][x];
  full.push(row);
}

// border walls
for (let x=0;x<W;x++){ full[0][x]='#'; full[H-1][x]='#'; }
for (let y=0;y<H;y++){ full[y][0]='#'; full[y][W-1]='#'; }

// ghost house box: x=6..12, y=8..12 ; interior x=7..11,y=9..11 -> 'g'
for (let y=8;y<=12;y++) for (let x=6;x<=12;x++){
  const border = (x===6||x===12||y===8||y===12);
  full[y][x] = border ? '#' : 'g';
}
// doors
full[8][9] = '.'; // top door
full[12][9] = '.'; // bottom door

// tunnel row at y=10, flanking the ghost house (x=1..5 and x=13..17), plus wrap exits at x=0,18
const ty = 10;
for (let x=1;x<=5;x++) full[ty][x] = '.';
for (let x=13;x<=17;x++) full[ty][x] = '.';
full[ty][0] = 'T';
full[ty][18] = 'T';

// power pellets at four corners
full[1][1]='o'; full[1][17]='o'; full[19][1]='o'; full[19][17]='o';

// portal pairs (2 pairs) placed on existing floor tiles away from center/corners
function forcePortal(x,y,id){ full[y][x]=id; full[y][18-x]=id; }
forcePortal(3,5,'1');
forcePortal(3,15,'2');

// player start
full[15][9] = 'P';

// print
console.log(full.map(r=>r.join('')).join('\n'));
console.log('\nextra loop openings:', extra);

// BFS validation with tunnel wrap only at row `ty`
function isWalkable(ch){ return ch!=='#'; }
let start=null;
for (let y=0;y<H;y++) for (let x=0;x<W;x++) if (full[y][x]==='P') start=[x,y];
const vis = Array.from({length:H},()=>new Array(W).fill(false));
const q=[start]; vis[start[1]][start[0]]=true; let count=0;
while(q.length){
  const [x,y]=q.shift(); count++;
  let neigh=[[x+1,y],[x-1,y],[x,y+1],[x,y-1]];
  for (let [nx,ny] of neigh){
    if (ny<0||ny>=H) continue;
    if (nx<0 || nx>=W){
      if (y!==ty) continue; // only wrap at tunnel row
      nx = (nx<0)? W-1 : 0;
    }
    if (vis[ny][nx]) continue;
    if (!isWalkable(full[ny][nx])) continue;
    vis[ny][nx]=true; q.push([nx,ny]);
  }
  // portal warp: also treat matching-id tiles as connected
  const ch = full[y][x];
  if (ch==='1' || ch==='2'){
    for (let yy=0;yy<H;yy++) for (let xx=0;xx<W;xx++){
      if (full[yy][xx]===ch && !(xx===x&&yy===y) && !vis[yy][xx]){ vis[yy][xx]=true; q.push([xx,yy]); }
    }
  }
}
let totalWalkable=0, unreachable=[];
for (let y=0;y<H;y++) for (let x=0;x<W;x++){
  if (isWalkable(full[y][x])){ totalWalkable++; if(!vis[y][x]) unreachable.push([x,y,full[y][x]]); }
}
console.log('\nTotalWalkable:',totalWalkable,'Reached:',count,'Unreachable:',unreachable.length);
if (unreachable.length) console.log(unreachable.slice(0,40));

// export as JS array literal for embedding
console.log('\n--- JS ARRAY ---');
console.log('[\n' + full.map(r=>"  \""+r.join('')+"\"").join(',\n') + '\n]');
