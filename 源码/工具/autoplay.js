/* An automated playtester. Injected into 工具/测试版.html, never into the game.
 *
 * The point is not to play well — it is to answer one question honestly: is a
 * level actually CLEARABLE, or has the tuning made it impossible? A human
 * saying "第六关过不去" cannot separate "too hard for me right now" from "no
 * route exists"; a bot playing the same level two hundred times can, because
 * it plays the same way every time and only the level changes.
 *
 * Deliberately a mediocre player: greedy nearest-pellet with a danger map, no
 * lookahead, no ghost-pattern knowledge. A level that a bot this plain can
 * finish is comfortably clearable by a person; one it never finishes is a real
 * wall, not a skill gap.
 */
window.__bot = (function(){
  const DIRS = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];

  function walkable(w, x, y){
    if (y < 0 || y >= w.rows) return false;
    let nx = x;
    if (nx < 0) nx = w.cols - 1;
    if (nx >= w.cols) nx = 0;
    const ch = w.grid[y][nx];
    return ch !== '#' && ch !== 'g' && ch !== 'D';
  }

  const wrap = (w, x) => x < 0 ? w.cols - 1 : x >= w.cols ? 0 : x;

  /** Steps from (sx,sy) to every tile, refusing to enter `blocked`. */
  function bfs(w, sx, sy, blocked){
    const dist = Array.from({length:w.rows}, ()=>new Array(w.cols).fill(-1));
    const from = Array.from({length:w.rows}, ()=>new Array(w.cols).fill(null));
    dist[sy][sx] = 0;
    const q = [[sx,sy]];
    for (let h=0; h<q.length; h++){
      const [x,y] = q[h];
      for (const d of DIRS){
        const ny = y + d.y;
        if (ny < 0 || ny >= w.rows) continue;
        let nx = x + d.x;
        if (nx < 0 || nx >= w.cols){ if (y !== w.tunnelRow) continue; nx = wrap(w, nx); }
        if (dist[ny][nx] !== -1 || !walkable(w, nx, ny)) continue;
        if (blocked && blocked.has(nx+','+ny)) continue;
        dist[ny][nx] = dist[y][x] + 1;
        from[ny][nx] = [x,y];
        q.push([nx,ny]);
      }
    }
    return {dist, from};
  }

  /** First step of the route to (tx,ty), as a direction. */
  function stepToward(w, sx, sy, from, tx, ty){
    let cur = [tx,ty], prev = null;
    while (cur && !(cur[0]===sx && cur[1]===sy)){ prev = cur; cur = from[cur[1]][cur[0]]; }
    if (!prev) return null;
    let dx = prev[0]-sx, dy = prev[1]-sy;
    if (dx >  1) dx = -1;            // stepped through the tunnel
    if (dx < -1) dx =  1;
    return {x:dx, y:dy};
  }

  /** Tiles within `radius` steps of a ghost that can currently kill us. */
  function dangerSet(w, radius){
    const danger = new Set();
    for (const g of w.ghosts){
      if (g.edible || g.st === 'eaten' || g.st === 'house') continue;
      const gx = Math.round(g.x), gy = Math.round(g.y);
      if (!walkable(w, gx, gy)) continue;
      const {dist} = bfs(w, gx, gy, null);
      for (let y=0;y<w.rows;y++) for (let x=0;x<w.cols;x++)
        if (dist[y][x] >= 0 && dist[y][x] <= radius) danger.add(x+','+y);
    }
    return danger;
  }

  function nearest(w, dist, pick){
    let best = null, bd = Infinity;
    for (let y=0;y<w.rows;y++) for (let x=0;x<w.cols;x++){
      if (dist[y][x] < 0 || dist[y][x] >= bd) continue;
      if (!pick(w.grid[y][x], x, y)) continue;
      bd = dist[y][x]; best = [x,y];
    }
    return best ? {tile:best, d:bd} : null;
  }

  function policy(w){
    const sx = Math.round(w.px), sy = Math.round(w.py);
    if (!walkable(w, sx, sy)) return null;      // mid-rescue, let the game settle

    const isPellet = ch => ch === '.' || ch === 'o';
    const isPower  = ch => ch === 'o';

    // How close the nearest killer is decides how cautious to be. Hugging a
    // radius that is too wide strands the bot in a corner with nowhere legal to
    // go, so the danger ring shrinks when it has to.
    for (const radius of [3, 2, 1, 0]){
      const danger = radius ? dangerSet(w, radius) : null;
      const {dist, from} = bfs(w, sx, sy, danger);

      // Fright is on: hunt whatever is edible and close.
      if (w.fright > 0.6){
        let bg = null, bd = Infinity;
        for (const g of w.ghosts){
          if (!g.edible) continue;
          const gx = Math.round(g.x), gy = Math.round(g.y);
          if (gy<0||gy>=w.rows||gx<0||gx>=w.cols) continue;
          if (dist[gy][gx] >= 0 && dist[gy][gx] < bd){ bd = dist[gy][gx]; bg = [gx,gy]; }
        }
        if (bg && bd <= 10) return stepToward(w, sx, sy, from, bg[0], bg[1]);
      }

      // A killer is breathing down our neck: a power pellet is the way out.
      const threat = w.ghosts.some(g => !g.edible && g.st!=='eaten' && g.st!=='house' &&
        Math.abs(Math.round(g.x)-sx) + Math.abs(Math.round(g.y)-sy) <= 6);
      if (threat){
        const p = nearest(w, dist, isPower);
        if (p && p.d <= 12) return stepToward(w, sx, sy, from, p.tile[0], p.tile[1]);
      }

      const t = nearest(w, dist, isPellet);
      if (t) return stepToward(w, sx, sy, from, t.tile[0], t.tile[1]);
    }
    return null;
  }

  return {
    policy,
    /** Plays one level to a conclusion. Returns the sim's verdict. */
    playLevel(lvl, budgetSeconds){
      __dbg.jump(lvl);
      const runs = [];
      let guard = 0;
      // A death restarts the level with a life gone; keep going until the level
      // is cleared, lives run out, or the budget is spent.
      while (guard++ < 30){
        const r = __dbg.sim(budgetSeconds || 120, policy);
        runs.push(r);
        if (r.cleared || r.state !== 'playing' || r.seconds >= (budgetSeconds||120)) return {runs, last:r};
      }
      return {runs, last: runs[runs.length-1]};
    },
  };
})();
