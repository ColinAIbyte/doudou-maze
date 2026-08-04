const MAZE = [
"###################",
"#o....#.....#....o#",
"###.#.###.###.#.###",
"#.#...#.....#...#.#",
"#.#.#.#.#.#.#.#.#.#",
"#.#1#...#.#...#1#.#",
"#.#.#.###.###.#.#.#",
"#.....#.....#.....#",
"#.###.###D###.###.#",
"#...#.#ggggg#.#...#",
"T.....#ggggg#.....T",
"#...#.#ggggg#.#...#",
"#.###.###D###.###.#",
"#...#.........#...#",
"###.#####.#####.###",
"#..2....#P#....2..#",
"#.#######.#######.#",
"#.......#.#.......#",
"#.#####.#.#.#####.#",
"#o....#.....#....o#",
"###################",
];
const ROWS = MAZE.length, COLS = MAZE[0].length;
const grid = MAZE.map(r=>r.split(''));

function set(x,y,ch){ grid[y][x] = ch; }

// revert old portal tiles to plain pellet floor
set(3,5,'.'); set(15,5,'.');
set(3,15,'.'); set(15,15,'.');

// place portals at TRUE dead-end pockets (degree-1 cells) so nothing can ever
// be stranded "past" a portal in a straight pellet corridor
set(1,3,'1'); set(17,3,'1');
set(5,19,'2'); set(13,19,'2');

const newMaze = grid.map(r=>r.join(''));
console.log(newMaze.join('\n'));

// --- validate: full reachability via NORMAL walking only (portals give NO free edges) ---
function walk(ch){ return ch!=='#'; }
function tileAt(x,y){
  let nx=x;
  if (nx<0) nx=COLS-1; if (nx>=COLS) nx=0;
  if (y<0||y>=ROWS) return '#';
  return grid[y][nx];
}
let start=null;
for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) if (grid[y][x]==='P') start=[x,y];
const visited = Array.from({length:ROWS},()=>new Array(COLS).fill(false));
const q=[start]; visited[start[1]][start[0]]=true; let count=0;
const TUNNEL_ROW = 10;
while(q.length){
  const [x,y]=q.shift(); count++;
  let neigh=[[x+1,y],[x-1,y],[x,y+1],[x,y-1]];
  for (let [nx,ny] of neigh){
    if (ny<0||ny>=ROWS) continue;
    if (nx<0||nx>=COLS){ if (y!==TUNNEL_ROW) continue; nx=(nx<0)?COLS-1:0; }
    if (visited[ny][nx]) continue;
    if (!walk(grid[ny][nx])) continue;
    visited[ny][nx]=true; q.push([nx,ny]);
  }
}
let totalWalkable=0, unreachable=[];
for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++){
  if (walk(grid[y][x])){ totalWalkable++; if(!visited[y][x]) unreachable.push([x,y,grid[y][x]]); }
}
console.log('\n(No portal shortcuts used in this check)');
console.log('TotalWalkable:', totalWalkable, 'Reached:', count, 'Unreachable:', unreachable.length);
if (unreachable.length) console.log(unreachable);

console.log('\n--- JS ARRAY ---');
console.log('[\n' + newMaze.map(r=>"  \""+r+"\"").join(',\n') + '\n]');
