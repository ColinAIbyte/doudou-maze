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
function walk(ch){ return ch!=='#'; }

// find degree-1 (dead-end) cells, excluding special tiles we don't want to move (ghost house door/interior, tunnel, player start)
const deadEnds = [];
for (let y=1;y<ROWS-1;y++){
  for (let x=1;x<COLS-1;x++){
    const ch = grid[y][x];
    if (!walk(ch)) continue;
    if (['g','D','T','P'].includes(ch)) continue;
    let deg=0;
    const neigh=[[x+1,y],[x-1,y],[x,y+1],[x,y-1]];
    for (const [nx,ny] of neigh){ if (walk(grid[ny][nx])) deg++; }
    if (deg===1) deadEnds.push({x,y,ch});
  }
}
console.log('Dead ends found:', deadEnds.length);
console.log(deadEnds);

// current portal positions for reference
let portals = {};
for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++){
  const ch = grid[y][x];
  if (ch==='1'||ch==='2'){ portals[ch]=portals[ch]||[]; portals[ch].push({x,y}); }
}
console.log('current portals', portals);
