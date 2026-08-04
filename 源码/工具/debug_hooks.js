/* Test-only hooks. NEVER part of the published game — 工具/make_testbuild.mjs
 * appends this to a copy, and the copy is what the bot plays. Keeping them out
 * of pacman_fragment.html removes the repeated "remember to strip the hooks
 * before publishing" step, which is exactly the kind of thing that eventually
 * ships by accident.
 *
 * The important one is sim(): it drives update() directly in a tight loop
 * instead of waiting on requestAnimationFrame. rAF is throttled to zero in a
 * background tab, which has twice made a perfectly healthy game look frozen —
 * and it also means a real-time playtest of six levels would take minutes.
 * Simulated, a whole level runs in well under a second and the result does not
 * depend on which tab happens to be in front.
 */
window.__dbg = {
  jump(n){ level=n; resetLevel(false); gameState='playing';
           document.querySelectorAll('.overlay').forEach(o=>o.classList.add('hidden')); },
  newRun(){ fullNewGame(); gameState='playing';
            document.querySelectorAll('.overlay').forEach(o=>o.classList.add('hidden')); },
  snap(){ return ghosts.map(g=>({id:g.id, st:g.state, host:!!g.isFusionHost, linked:!!g.fusedWith})); },
  power(){ startPowerMode(); },
  forceFuse(){ const f=ghosts.filter(g=>g.state==='frightened'&&!g.fusedWith); if(f.length<2) return 'need 2';
               f[1].x=f[0].x; f[1].y=f[0].y; handleFusion(); return 'fused'; },
  eatHost(){ const h=ghosts.find(g=>g.isFusionHost); if(!h) return 'no host';
             player.x=h.x; player.y=h.y; handleGhostCollisions(); return 'ate host'; },
  eatPartner(){ const p=ghosts.find(g=>g.fusedWith&&!g.isFusionHost); if(!p) return 'no partner';
                player.x=p.x; player.y=p.y; handleGhostCollisions(); return 'ate partner'; },
  movePartner(x,y){ const p=ghosts.find(g=>g.fusedWith&&!g.isFusionHost); if(!p) return 'no partner';
                    p.x=x; p.y=y; return 'moved'; },
  endFright(){ endPowerMode(); },
  put(x,y,ph){ player.x=x; player.y=y; player.phase=ph; player.dir={x:0,y:0}; player.want={x:0,y:0};
               return tileAt(x,y); },
  tile(x,y){ return tileAt(x,y); },
  tryMove(dx,dy,secs){ player.want={x:dx,y:dy}; player.dir={x:dx,y:dy};
                       for(let i=0;i<Math.round(secs*60);i++) update(1/60);
                       return {x:+player.x.toFixed(2), y:+player.y.toFixed(2),
                               phase:+player.phase.toFixed(1),
                               tile:tileAt(Math.round(player.x),Math.round(player.y))}; },

  stats(){
    let p=0; for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) if(grid[y][x]==='o') p++;
    return { ghosts:ghosts.length, gs:+ghosts[0].baseSpeed.toFixed(2), ps:+player.baseSpeed.toFixed(2),
             ratio:Math.round(ghosts[0].baseSpeed/player.baseSpeed*100), fright:frightSeconds(),
             power:p, pellets:pelletsLeft, released:ghosts.filter(g=>g.state!=='house').length };
  },

  /** Everything a policy needs to decide a direction, as plain data. */
  world(){
    return {
      cols:COLS, rows:ROWS, tunnelRow:10,
      grid: grid.map(r=>r.join('')),
      px:player.x, py:player.y, phase:player.phase,
      fright: frightTimer, lives, level, score, pelletsLeft,
      combo,
      ghosts: ghosts.filter(g=>g.state!=='fused-hidden').map(g=>({
        x:g.x, y:g.y, st:g.state, edible: frightTimer>0 && g.state!=='eaten' && g.state!=='house',
      })),
    };
  },

  steer(dx,dy){ requestDir(dx===1?'right':dx===-1?'left':dy===1?'down':'up'); },

  /**
   * Runs the game headlessly at a fixed 60Hz. `policy` is called every tick with
   * the world and may return {x,y} to steer. Stops on death, level change, game
   * over, or the tick budget.
   */
  sim(maxSeconds, policy){
    const startLevel = level, startLives = lives;
    const ticks = Math.round(maxSeconds*60);
    let t = 0;
    for (; t<ticks; t++){
      if (gameState!=='playing') break;
      if (policy){
        const d = policy(this.world());
        if (d) this.steer(d.x, d.y);
      }
      update(1/60);
      if (level!==startLevel || lives!==startLives || gameState!=='playing') break;
    }
    // Clearing the FINAL level calls endGame(true) instead of advancing `level`,
    // so "level changed" alone reports a full clear of level 6 as a failure.
    const wonRun = gameState === 'over' && pelletsLeft <= 0;
    return { seconds:+(t/60).toFixed(1), level, lives, livesLost:startLives-lives,
             cleared: level!==startLevel || wonRun, wonRun,
             pelletsLeft, score, state:gameState,
             pctEaten: +(100*(1 - pelletsLeft/pelletsTotal)).toFixed(1) };
  },
};
