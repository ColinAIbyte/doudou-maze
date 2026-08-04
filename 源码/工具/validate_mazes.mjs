// Validates every maze embedded in pacman_fragment.html.
//
// The hard invariant is that NO pellet can ever be stranded. Portals are
// modelled as ABSORBING: you can step onto one but never walk through it,
// because arriving teleports you away — a portal effectively cuts its corridor.
// That is the real rule. The older "portals must sit on dead ends" check was
// only a crude sufficient condition for it; on a well-connected map a
// mid-corridor portal is perfectly safe because other routes exist.
//
// Power-pellet placement is unconstrained now (the maps are open enough to
// route around any of them), so that is reported for information only.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const src = readFileSync(
  fileURLToPath(new URL('../pacman_fragment.html', import.meta.url)), 'utf8',
);

function extract(name) {
  const m = src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  if (!m) throw new Error(`could not find ${name}`);
  return m[1].split('\n').map(l => l.trim()).filter(Boolean)
    .map(l => l.replace(/^"/, '').replace(/",?$/, ''));
}

const mazes = Object.fromEntries(
  [1, 2, 3, 4, 5, 6].map(n => [`MAZE_LEVEL_${n}`, extract(`MAZE_LEVEL_${n}`)]),
);
// Per-level power pellet counts. Level 1 keeps the original four; every later
// level carries an extra one to take the edge off, with 3 and 5 richer still.
// Level 6 carries 7 — it fields seven ghosts, two more than any other level,
// and needs the extra escape windows to stay clearable.
const EXPECTED_POWER = { MAZE_LEVEL_2: 5, MAZE_LEVEL_3: 6, MAZE_LEVEL_4: 5, MAZE_LEVEL_5: 6, MAZE_LEVEL_6: 7 };
// Level 1 is frozen by owner request and predates the symmetry rule.
const SYMMETRY_EXEMPT = new Set(['MAZE_LEVEL_1']);

const playerWalk = ch => ch !== '#' && ch !== 'g' && ch !== 'D';
const GHOST_PATH = [[9, 8], [9, 7], [9, 6], [9, 12], [9, 13]];

let failures = 0;
for (const [name, grid] of Object.entries(mazes)) {
  const ROWS = grid.length, COLS = grid[0].length;
  const problems = [];
  const at = (x, y) => {
    let nx = x;
    if (nx < 0) nx = COLS - 1;
    if (nx >= COLS) nx = 0;
    if (y < 0 || y >= ROWS) return '#';
    return grid[y]?.[nx] ?? '#';
  };

  if (ROWS !== 21 || COLS !== 19) problems.push(`wrong size ${COLS}x${ROWS}`);
  grid.forEach((r, i) => { if (r.length !== COLS) problems.push(`row ${i} is ${r.length} wide`); });

  let spawn = null;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (grid[y][x] === 'P') spawn = [x, y];
  if (!spawn) problems.push('no player spawn P');
  else if (spawn[0] !== 9 || spawn[1] !== 15) problems.push(`spawn at ${spawn}, expected [9,15]`);

  const tunnelRow = grid.findIndex(r => r.includes('T'));
  if (tunnelRow !== 10) problems.push(`tunnel row ${tunnelRow}, expected 10`);
  for (const [x, y] of [[9, 8], [9, 12]]) {
    if (grid[y][x] !== 'D') problems.push(`expected ghost door at (${x},${y}), got '${grid[y][x]}'`);
  }

  // portal bookkeeping
  const portals = {};
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const ch = grid[y][x];
    if (ch === '1' || ch === '2') (portals[ch] ??= []).push([x, y]);
  }
  for (const [id, tiles] of Object.entries(portals)) {
    if (tiles.length !== 2) problems.push(`portal '${id}' has ${tiles.length} tiles, expected exactly 2`);
    for (const [x, y] of tiles) {
      if (GHOST_PATH.some(([gx, gy]) => gx === x && gy === y)) {
        problems.push(`portal '${id}' at (${x},${y}) sits on the ghost-house exit path`);
      }
    }
  }

  // reachability with portals absorbing — the invariant that actually matters
  const portalSet = new Set(Object.values(portals).flat().map(([x, y]) => `${x},${y}`));
  const seen = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
  if (spawn) {
    seen[spawn[1]][spawn[0]] = true;
    const q = [spawn];
    while (q.length) {
      const [x, y] = q.shift();
      if (portalSet.has(`${x},${y}`)) continue; // stepping on it warps you away
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let nx = x + dx; const ny = y + dy;
        if (ny < 0 || ny >= ROWS) continue;
        if (nx < 0 || nx >= COLS) { if (y !== tunnelRow) continue; nx = nx < 0 ? COLS - 1 : 0; }
        if (seen[ny][nx] || !playerWalk(at(nx, ny))) continue;
        seen[ny][nx] = true; q.push([nx, ny]);
      }
    }
  }

  let pellets = 0, power = 0, forcedPath = 0;
  const powerTiles = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const ch = grid[y][x];
    if (ch !== '.' && ch !== 'o' && ch !== '1' && ch !== '2') continue;
    if (ch === '.') pellets++;
    if (ch === 'o') {
      power++;
      powerTiles.push([x, y]);
      const deg = [[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy]) => playerWalk(at(x+dx, y+dy))).length;
      if (deg !== 1) forcedPath++;
    }
    if (!seen[y][x]) problems.push(`unreachable ${ch} at (${x},${y}) — stranded even before warping`);
  }

  // Kept as an exact per-level expectation rather than a loose range, so an
  // accidental loss — a portal overwriting one, which has happened — still fails.
  const expectedPower = EXPECTED_POWER[name] ?? 4;
  if (power !== expectedPower) problems.push(`${power} power pellets, expected ${expectedPower}`);

  // The mazes are mirrored, so pellets should pair up across the centre line.
  // An odd count is only symmetric if exactly one sits on the centre column.
  // Level 1 is exempt: it predates this rule and the owner has ruled it
  // untouchable, so its two unpaired pellets are a deliberate exception, not
  // a defect to be "fixed".
  if (!SYMMETRY_EXEMPT.has(name)) {
    const centreCol = (COLS - 1) / 2;
    const offAxis = powerTiles.filter(([x]) => x !== centreCol);
    const mirrored = offAxis.filter(([x, y]) =>
      powerTiles.some(([ox, oy]) => oy === y && ox === COLS - 1 - x));
    if (mirrored.length !== offAxis.length) {
      problems.push(`power pellets not mirror-symmetric (${offAxis.length - mirrored.length} unpaired)`);
    }
  }

  // straight-run and connectivity readouts (informational)
  let runTotal = 0, runCount = 0, degSum = 0, floors = 0;
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
    if (!playerWalk(grid[y][x])) continue;
    floors++;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) if (playerWalk(at(x+dx, y+dy))) degSum++;
    let h = 1, v = 1;
    for (let k = x-1; k >= 1 && playerWalk(grid[y][k]); k--) h++;
    for (let k = x+1; k < COLS-1 && playerWalk(grid[y][k]); k++) h++;
    for (let k = y-1; k >= 1 && playerWalk(grid[k][x]); k--) v++;
    for (let k = y+1; k < ROWS-1 && playerWalk(grid[k][x]); k++) v++;
    runTotal += Math.max(h, v); runCount++;
  }

  const ok = problems.length === 0;
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}: ${pellets} pellets, ${power} power (${forcedPath} mid-path), ` +
    `straightRun ${(runTotal/runCount).toFixed(1)}, openness ${(degSum/floors).toFixed(2)}`,
  );
  for (const p of problems) console.log(`        - ${p}`);
}

const sigs = Object.entries(mazes).map(([n, g]) => [n, g.join('\n')]);
for (let i = 0; i < sigs.length; i++) {
  for (let j = i + 1; j < sigs.length; j++) {
    if (sigs[i][1] === sigs[j][1]) {
      console.log(`FAIL  ${sigs[i][0]} and ${sigs[j][0]} use identical layouts`);
      failures++;
    }
  }
}

console.log(failures === 0 ? '\nAll mazes valid.' : `\n${failures} maze(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
