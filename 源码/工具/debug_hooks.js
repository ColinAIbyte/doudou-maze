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
  /* 直接跳到结算页，用来看排版：真打一局到第六关要好几分钟，而排版问题
     （数字多长、榜单几行、烟花挡不挡字）只跟结算页的数据有关。 */
  finish(won, sc, lv, deaths){
    gameState='playing';
    score = sc==null ? 431070 : sc;
    level = lv==null ? MAX_LEVEL : lv;
    deathsThisRun = deaths==null ? 0 : deaths;
    maxComboSeen = 7;
    endGame(won!==false);
    return { score, rank:'见榜单' };
  },
  /* 把关卡卡片按住不放，用来截图核对排版 —— 它只显示 1.8 秒，
     截图的往返延迟比这还长，正常跑是抓不到的。 */
  intro(sec){ introTimer = (sec == null ? 8 : sec); return `卡片保持 ${introTimer}s`; },
  /* 强制画一帧，并且可以把 elapsed 钉死。
     两个用处：一是预览窗报 document.hidden=true，rAF 被节流到几乎不触发，
     等它自己画是等不到的；二是拿两个版本做像素对比时时间必须一致 ——
     豆子的呼吸、传送门的旋转都跟 elapsed 走，差一点点就分不清"这处不同是
     改动引起的，还是只是时刻不同"。 */
  draw(e){ if (e != null) elapsed = e; render(); return elapsed; },
  /* 把小豆吃到只剩 n 颗（能量豆一颗不动），用来看"最后几颗"那个提示效果。
     正常玩到这一步要几分钟，而这个状态恰恰是两种豆子最容易混淆的时刻 ——
     没有它就只能靠肉眼盯着一局慢慢打，截不到图。 */
  eatDownTo(n){
    const dots = [];
    for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) if (grid[y][x]==='.') dots.push([x,y]);
    for (let i=0;i<dots.length-n;i++){
      const [x,y] = dots[i]; grid[y][x] = ' '; pelletsLeft--;
    }
    return { 剩余小豆: dots.length - Math.max(0, dots.length-n), pelletsLeft };
  },
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

/* ==== 真机帧率表 ====
 * 只进测试版，不进正式文件。
 *
 * 存在的理由：「手机上流畅吗」这个问题，人给不出能用来做决定的答案。
 * 「感觉还行」既分不出 60 帧和 45 帧，也说不清卡的是哪一下 —— 而恰恰是
 * 「偶尔卡一下」最能毁掉这种要精确转向的游戏，平均帧率却完全看不出来。
 *
 * 所以这里量三样，都是平均值会藏起来的东西：
 *   最低帧率  —— 最难受的那一秒有多难受
 *   卡顿次数  —— 超过 50ms 的帧有几次（一次就是肉眼可见的一顿）
 *   渲染耗时  —— 是画面画不动，还是逻辑算不动，两者的解法完全不同
 */
window.__perf = (function(){
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:6px;top:6px;z-index:99999;pointer-events:none;'
    + 'font:11px/1.45 ui-monospace,Menlo,monospace;color:#8ef;background:rgba(8,4,18,.82);'
    + 'padding:5px 8px;border-radius:6px;white-space:pre;letter-spacing:.02em';

  let frames = 0, lastSec = performance.now(), fps = 0;
  let minFps = Infinity, sumFps = 0, secs = 0;
  let stutter = 0, dropped = 0;
  let prev = performance.now();
  let renderMs = 0, updateMs = 0, n = 0;
  let running = false;

  /* render 和 update 是同一个闭包里的函数声明，所以这里能直接换掉它们 ——
     钩子是被注入到游戏脚本内部的，不是从外面 window 上挂的。 */
  const origRender = render, origUpdate = update;
  render = function(){ const t=performance.now(); origRender.apply(this, arguments);
                       renderMs += performance.now()-t; n++; };
  update = function(){ const t=performance.now(); origUpdate.apply(this, arguments);
                       updateMs += performance.now()-t; };

  function tick(){
    if (!running) return;
    const now = performance.now();
    const dt = now - prev; prev = now;
    // 60Hz 一帧 16.7ms。>33ms 是掉了至少一帧，>50ms 是肉眼能看出的一顿。
    if (dt > 50) stutter++; else if (dt > 33) dropped++;
    frames++;
    if (now - lastSec >= 1000){
      fps = Math.round(frames * 1000 / (now - lastSec));
      frames = 0; lastSec = now;
      if (secs > 1){ minFps = Math.min(minFps, fps); sumFps += fps; }  // 头两秒是加载抖动，不算
      secs++;
      const avg = secs > 2 ? (sumFps/(secs-2)) : fps;
      box.textContent =
        `${fps} fps   平均 ${avg.toFixed(1)}   最低 ${minFps===Infinity?'—':minFps}\n`
      + `卡顿 ${stutter}   掉帧 ${dropped}   跑了 ${secs}s\n`
      + `渲染 ${(renderMs/Math.max(1,n)).toFixed(2)}ms  逻辑 ${(updateMs/Math.max(1,n)).toFixed(2)}ms\n`
      + `${innerWidth}×${innerHeight}  dpr${devicePixelRatio}`;
      renderMs = 0; updateMs = 0; n = 0;
    }
    requestAnimationFrame(tick);
  }

  return {
    on(){ if(running) return '已经在跑了';
          running = true; document.body.appendChild(box);
          prev = lastSec = performance.now(); requestAnimationFrame(tick); return '帧率表已打开'; },
    off(){ running = false; box.remove(); return '已关闭'; },
    reset(){ minFps=Infinity; sumFps=0; secs=0; stutter=0; dropped=0; return '已清零'; },
    report(){ return { 最低帧率:minFps===Infinity?null:minFps,
                       平均帧率:secs>2?+(sumFps/(secs-2)).toFixed(1):null,
                       卡顿次数:stutter, 掉帧次数:dropped, 秒数:secs,
                       屏幕:innerWidth+'×'+innerHeight, dpr:devicePixelRatio }; },
  };
})();
// 测试版默认就打开 —— 手机上没有控制台可以敲命令
window.__perf.on();
