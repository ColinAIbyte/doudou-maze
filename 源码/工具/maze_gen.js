// Build a 19x21 symmetric maze, validate connectivity, print result.
const W = 19, H = 21;
const CX = 9; // center column

// left half template: rows 0..20, each an array of chars for columns 0..9 (10 chars incl center)
// '#' wall, '.' pellet, 'o' power pellet, ' ' empty (no pellet), 'P' player start (empty),
// 'g' ghost house floor (empty, no pellet), '1' portal A, '2' portal B, 'T' tunnel (empty)
const left = [
/*0 */ "##########",
/*1 */ "#........#",
/*2 */ "#.##.###.#",
/*3 */ "#o##.###.#",
/*4 */ "#........#",
/*5 */ "#.##.#.###",
/*6 */ "#....#...#",
/*7 */ "###.###.##",
/*8 */ "  #.#   1#",
/*9 */ "###.# ####",
/*10*/ "T     #ggg",
/*11*/ "###.# ####",
/*12*/ "  #.#   2#",
/*13*/ "###.###.##",
/*14*/ "#....#...#",
/*15*/ "#.##.#.###",
/*16*/ "#o......P#",   // placeholder, will fix center
/*17*/ "##.#.#.###",
/*18*/ "#....#...#",
/*19*/ "#.######.#",
/*20*/ "##########",
];

if (left.length !== H) throw new Error("row count mismatch " + left.length);
left.forEach((r,i) => { if (r.length !== 10) throw new Error("row "+i+" len "+r.length); });

// mirror to full width 19
const grid = left.map(row => {
  const chars = row.split("");
  const full = new Array(W);
  for (let c = 0; c < 10; c++) full[c] = chars[c];
  for (let c = 0; c < 9; c++) full[18-c] = chars[c];
  return full.join("");
});

console.log(grid.join("\n"));

// Validate: BFS connectivity of all non-wall tiles (treat tunnel row wraparound)
const rows = grid.map(r => r.split(""));
function isWalkable(ch) { return ch !== '#'; }

// find a start point (first '.' )
let start = null;
for (let y=0;y<H;y++) for (let x=0;x<W;x++) if (rows[y][x] !== '#') { start = [x,y]; }
// prefer P
for (let y=0;y<H;y++) for (let x=0;x<W;x++) if (rows[y][x] === 'P') start=[x,y];

const visited = Array.from({length:H}, ()=>new Array(W).fill(false));
const queue = [start];
visited[start[1]][start[0]] = true;
let count = 0;
while (queue.length) {
  const [x,y] = queue.shift();
  count++;
  const neighbors = [[x+1,y],[x-1,y],[x,y+1],[x,y-1]];
  for (let [nx,ny] of neighbors) {
    if (ny<0||ny>=H) continue;
    if (nx<0) nx = W-1; // tunnel wrap for validation purposes
    if (nx>=W) nx = 0;
    if (visited[ny][nx]) continue;
    if (!isWalkable(rows[ny][nx])) continue;
    visited[ny][nx] = true;
    queue.push([nx,ny]);
  }
}

let totalWalkable = 0;
let unreachable = [];
for (let y=0;y<H;y++) for (let x=0;x<W;x++) {
  if (isWalkable(rows[y][x])) {
    totalWalkable++;
    if (!visited[y][x]) unreachable.push([x,y,rows[y][x]]);
  }
}

console.log("\nTotal walkable:", totalWalkable, "Reached:", count, "Unreachable:", unreachable.length);
if (unreachable.length) console.log(unreachable);

// count portals
let p1=0,p2=0,pellets=0,power=0,pcount=0;
for (let y=0;y<H;y++) for (let x=0;x<W;x++) {
  const ch = rows[y][x];
  if (ch==='1') p1++;
  if (ch==='2') p2++;
  if (ch==='.') pellets++;
  if (ch==='o') power++;
  if (ch==='P') pcount++;
}
console.log("portal1:",p1,"portal2:",p2,"pellets:",pellets,"power:",power,"player starts:",pcount);
