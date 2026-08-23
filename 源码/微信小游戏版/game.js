/* 豆豆迷宫 — 微信小游戏入口
 *
 * 启动顺序是有讲究的，顺序错了就是一片黑屏而且没有任何提示：
 *   0. 先把"能把错误画到屏幕上"这件事准备好 —— 见下方引导段。
 *      这一步必须排在所有 require 之前：模块加载本身就可能失败，而失败在
 *      require 阶段的话，后面再完善的错误处理也没机会执行。前几轮排查里，
 *      崩溃恰恰就发生在这个阶段（垫片给只读的 window 赋值）。
 *   1. 建 canvas —— 第一次 wx.createCanvas() 拿到的才是上屏画布，之后拿到
 *      的都是离屏画布。迷宫和烟花画在离屏上，最后由主画布合成。
 *   2. 装垫片 —— 逻辑一加载就会 document.getElementById。
 *   3. 最后 createGame() —— 它内部自己 requestAnimationFrame 起循环。
 */

/* ============ 0. 最小引导：保证错误看得见 ============
 * 黑屏是最贵的失败方式：它不携带任何信息，而调试器还可能弹到另一个窗口去，
 * 只能靠猜。这一段刻意写得又短又笨、不依赖任何自己的模块，就是为了让它在
 * 其余部分全崩的情况下依然能跑。
 */
function screenSize(){
  // getWindowInfo 更轻、就绪更早；getSystemInfoSync 在模块顶层执行时
  // jsbridge 可能还没准备好，会直接失败（日志里那条 "jsbridge not ready"）。
  // 它一失败 W/H 就是 undefined，画布尺寸算出来是 NaN —— 又一次无声黑屏。
  const tries = [
    () => wx.getWindowInfo && wx.getWindowInfo(),
    () => wx.getSystemInfoSync && wx.getSystemInfoSync(),
  ];
  for (const f of tries){
    try {
      const s = f();
      if (s && s.windowWidth > 0 && s.windowHeight > 0){
        return { W: s.windowWidth, H: s.windowHeight, DPR: s.pixelRatio || 1 };
      }
    } catch (e) { /* 换下一个 */ }
  }
  return { W: 375, H: 667, DPR: 2 };   // 比例不准也好过黑屏
}

const { W, H, DPR } = screenSize();

const screen = wx.createCanvas();          // 上屏
screen.width  = W * DPR;
screen.height = H * DPR;
const sctx = screen.getContext('2d');
sctx.scale(DPR, DPR);
/* 立刻铺一层底色。从这里到第一帧之间要走完 require(core.js)（130KB）、装垫片、
   createGame —— 低端机上是几百毫秒，这期间画布是透明的，玩家看到的是一闪的
   黑。先涂成游戏自己的深紫，那一下就不明显了。一行的事。 */
sctx.fillStyle = '#0a0612';
sctx.fillRect(0, 0, W, H);

/** 把错误直接写在屏幕上，拍张照就能知道是哪一句崩的。 */
function paintError(err, where){
  try {
    sctx.fillStyle = '#0a0612';
    sctx.fillRect(0, 0, W, H);
    sctx.fillStyle = '#ff4d6d';
    sctx.font = 'bold 16px sans-serif';
    sctx.textAlign = 'left'; sctx.textBaseline = 'top';
    sctx.fillText('启动失败 · ' + (where || ''), 16, 50);
    sctx.fillStyle = '#ece7fb';
    sctx.font = '11px sans-serif';
    const text = String((err && (err.stack || err.message)) || err);
    let y = 78;
    for (const raw of text.split('\n').slice(0, 16)){
      let line = '';
      for (const ch of raw){                 // canvas 不会自己折行
        if (sctx.measureText(line + ch).width > W - 32){
          sctx.fillText(line, 16, y); y += 15; line = ch;
        } else line += ch;
      }
      if (line){ sctx.fillText(line, 16, y); y += 15; }
    }
  } catch (e) { /* 连报错都画不出来就真没辙了 */ }
}

/* 出错后必须**停掉合成循环**，否则下一帧就把错误覆盖掉了。
   这一点上一版漏了：paintError 确实画出来了，可 16 毫秒后 composite 又填了
   一遍底色，屏幕上只剩接近黑的背景——看起来就像"没有报错的黑屏"，
   而实际上错误闪过了。诊断工具自己把证据擦了，比没有诊断更误导。 */
let crashed = false;
function fatal(err, where){
  if (crashed) return;      // 只认第一个错，后面的多半是它的连锁反应
  crashed = true;
  paintError(err, where);
  try { console.error('[豆豆迷宫] ' + where, err); } catch (e) {}
}

// 兜住任何漏网的异步异常（游戏自己那条 rAF 循环里的异常也走这里）
try { wx.onError && wx.onError(e => fatal((e && (e.stack || e.message)) || e, 'onError')); }
catch (e) {}

/* ============ 1. 加载模块（放在引导之后，且包 try） ============ */
let installShim, PALETTE, createUI, createGame;
try {
  ({ installShim, PALETTE } = require('./js/shim.js'));
  ({ createUI } = require('./js/ui.js'));
  ({ createGame } = require('./js/core.js'));
} catch (err) {
  fatal(err, 'require 模块');
  throw err;
}

const mazeCanvas = wx.createCanvas();      // 离屏：迷宫
const fxCanvas   = wx.createCanvas();      // 离屏：烟花

let shim, el;
try {
  shim = installShim({ maze: mazeCanvas, fx: fxCanvas });
  el = shim.el;
} catch (err) {
  fatal(err, 'installShim');
  throw err;
}

/* ---------- 安全区与布局 ----------
 * 小游戏是真正全屏的，刘海和底部横条都归你自己避让 —— 不像网页有
 * env(safe-area-inset-*) 可用。而且右上角那个「···⊙」胶囊按钮是微信画的，
 * 谁都盖不住它，只能让开。上一版没让，HUD 的「生命」正好被压在下面。
 *
 * getMenuButtonBoundingClientRect() 给的就是胶囊的精确位置。用它来定 HUD
 * 的上沿和右边界，比自己猜状态栏高度靠谱 —— 各家手机刘海高度差很多。 */
/* 纯函数：只吃数据、不碰 wx，这样测试能直接喂各种残缺输入进来。
   拆出来是因为上一版的测试另抄了一份同样的逻辑去测 —— 抄出来的那份迟早和
   真货漂移，测得再绿也说明不了什么。 */
function insetsFrom(info, cap, screenW){
  const DEF = { top: 20, bottom: 0, capsuleLeft: screenW, capsuleBottom: 0 };
  let { top, bottom, capsuleLeft, capsuleBottom } = DEF;

  /* 每一个从宿主拿来的数都要过一遍这道闸。

     原来是直接 `info.windowHeight - info.safeArea.bottom` —— 只要 windowHeight
     这一个字段缺了，结果就是 NaN，然后一路传进 bottomInset → usable → boardH，
     棋盘尺寸变成 NaN，屏幕上什么都画不出来。**不报错、不崩溃，就是一片黑。**
     而机型和基础库版本千奇百怪，"这个字段一定有"是最不该做的假设。 */
  const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v)) ? v : fallback;

  if (info){
    const sa = info.safeArea;
    if (sa && Number.isFinite(sa.top)){
      top = num(sa.top, DEF.top);
      const wh = num(info.windowHeight, NaN);
      const sab = num(sa.bottom, NaN);
      // 两个都拿得到才算得出底部安全区；缺一个就退回 0（宁可少让，不要 NaN）
      bottom = (Number.isFinite(wh) && Number.isFinite(sab)) ? Math.max(0, wh - sab) : 0;
    } else {
      top = num(info.statusBarHeight, DEF.top);
    }
  }

  if (cap && num(cap.width, 0) > 0){
    capsuleLeft   = num(cap.left, DEF.capsuleLeft);
    capsuleBottom = num(cap.bottom, DEF.capsuleBottom);
    top = Math.max(top, num(cap.top, top));   // 胶囊比状态栏更靠下时以它为准
  }

  // 最后再兜一层：上面任何一步漏网，这里都把它按回默认值
  return {
    top: num(top, DEF.top),
    bottom: num(bottom, DEF.bottom),
    capsuleLeft: num(capsuleLeft, DEF.capsuleLeft),
    capsuleBottom: num(capsuleBottom, DEF.capsuleBottom),
  };
}

function insets(){
  let info = null, cap = null;
  try { info = (wx.getWindowInfo && wx.getWindowInfo()) || wx.getSystemInfoSync(); } catch (e) {}
  try { cap = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect(); } catch (e) {}
  return insetsFrom(info, cap, W);
}

const SAFE = insets();

// 逻辑把迷宫画成 19x21 格、每格 26px，也就是 494x546。
const BOARD_W = 494, BOARD_H = 546;

// HUD 整条压到胶囊下面。跟胶囊并排看着更紧凑，但 HUD 要放四项数值加一个
// 「?」，挤在剩下那半行里字会小到看不清，不如让开一行。
const hudTop = Math.max(SAFE.top, SAFE.capsuleBottom) + 6;
const hudH = 64;
const hudBottom = hudTop + hudH;

/* 空间分配：棋盘优先，方向键吃剩下的。
 *
 * 棋盘是 19:21 的近似正方形，而手机屏是细长的，所以在大多数机型上棋盘由
 * **宽度**决定，竖向总会有富余。但在 iPhone SE 那类短屏上反过来 —— 高度不够，
 * 这时若还按固定高度给方向键留位，棋盘就被硬生生挤小（实测小了 12%）。
 * 所以先按宽度算出棋盘想要的大小，再看竖向装不装得下，剩下的才给方向键，
 * 并把方向键钳在一个能用的区间里。 */
const bottomInset = SAFE.bottom + 6;
const usable = H - hudBottom - bottomInset - 12;

/* 方向键已经彻底去掉（2026-08-21，业主定的："感觉方向键是鸡肋"）。
   原来留着是因为滑动要等抬手才判定、比按键慢将近一格；滑动改成滑过即转向
   之后它就没有存在理由了，而它要吃掉 116~190px，是全屏第二大的一块。
   padH 保留为 0 而不是把变量删掉：ui.drawPad / drawDoc 都拿它算过版面，
   一起改动面太大，留一个恒 0 的值最省事也最不容易漏。 */
const padH = 0;
const avail = usable;
const scale = Math.min((W - 6) / BOARD_W, avail / BOARD_H);
const boardW = BOARD_W * scale, boardH = BOARD_H * scale;
const boardX = (W - boardW) / 2;
/* 棋盘竖直居中。19:21 的棋盘在 375:812 的屏幕上是被**宽度**卡住的，方向键
   腾出来的高度一分也变不成棋盘面积 —— 那就让它均分到上下，而不是全吊在底下。 */
const boardY = hudBottom + 4 + Math.max(0, (avail - boardH) * 0.5);

/** 方向键那一块需要多高。
 *  必须和 ui.drawPad 里的实际尺寸算法一致 —— 之前多留了 24px 余量，
 *  在 iPhone SE 那类小屏上把棋盘白白挤小了 16%。这里只留 10px 呼吸位。 */
function padHeightFor(w){
  const hSide = Math.min(54, w * 0.145);   // 上下键的高
  const hMid  = Math.min(50, w * 0.135);   // 中间那行的高
  return hSide * 2 + hMid + 14 + 10;       // 14 = 两道 7px 间距
}

let ui, game;
try {
  ui = createUI(sctx, el, { W, H, hudTop, hudH, hudBottom, boardX, boardY, boardW, boardH, padH, bottomInset, capsuleLeft: SAFE.capsuleLeft });
} catch (err) { fatal(err, 'createUI'); throw err; }
try {
  // 核心那条循环里的异常也接到 fatal 上——不然它断了只会定格，不报错
  shim.env.onFrameError(err => fatal(err, '游戏帧'));
  game = createGame(shim.env);
} catch (err) { fatal(err, 'createGame'); throw err; }

/* 迷宫那块离屏画布要按**它最终被画到屏幕上的大小**分配像素，而且必须在
   createGame **之后**做。

   核心加载时有这么一行：
       canvas.width = COLS*TILE; canvas.height = ROWS*TILE;   // 494×546
   在它之前设的任何尺寸都会被推翻，而给 canvas 赋 width 还会连带清空 ctx 的变换。

   不改的话，494×546 的迷宫被 drawImage 放大到 boardW×boardH×DPR —— 在 dpr3 的
   手机上是 1107 像素宽的位置显示 494 像素的内容，**放大 2.2 倍，整张图是糊的**。
   现在按目标像素分配，再把 494×546 的逻辑坐标映射上去，1:1 出图。
   上限 2：3 倍和 2 倍在这种线条上肉眼分不出，不值得拿帧率换。 */
const MAZE_CAP = Math.min(DPR, 2);
const mazePixW = Math.max(1, Math.round(boardW * MAZE_CAP));
const mazePixH = Math.max(1, Math.round(boardH * MAZE_CAP));
try {
  mazeCanvas.width = mazePixW;
  mazeCanvas.height = mazePixH;
  /* 用 scale 而不是 setTransform：给 canvas 赋 width 之后变换本来就是单位矩阵，
     两者等价，而老基础库的 2d context 不一定有 setTransform（假环境就没有，
     一调用直接抛异常被 fatal 接住，整个游戏被标记成崩溃 —— 就这么踩过一次）。 */
  mazeCanvas.getContext('2d').scale(mazePixW / BOARD_W, mazePixH / BOARD_H);
} catch (err) { fatal(err, '画布分辨率'); }

// ---- 输入 ----
let hits = {}, padKeys = {}, hudHits = {};
// 方向键显隐。存进 storage，不然每开一局都要重按一次，这个开关反而成了负担。
let padHidden = false;
try { padHidden = wx.getStorageSync('doudou.padHidden') === '1'; } catch (e) {}
const SWIPE_MIN = 24;
let touchStart = null;
/* 玩法说明比一屏高，要能滑动看。滚动量记在这里，drawOverlays 每帧读它。
   打开说明时归零，否则上次滚到哪儿这次就从哪儿开始，玩家会以为内容缺了一截。 */
let helpScroll = 0;
let helpMaxScroll = 0;
let helpDragFrom = null;

function inRect(x, y, r){ return r && x>=r.x && x<=r.x+r.w && y>=r.y && y<=r.y+r.h; }

function pressButton(id){
  // 复用逻辑自己注册的 click 回调，而不是另写一套开始/重开流程——
  // 另写一套就会漏掉它在回调里做的重置动作。
  el(id).dispatch('click', {});
}

wx.onTouchStart(e => {
  const t = e.touches[0];
  /* 任何一次触摸都顺手解锁音频。WebAudio 在多数宿主里要等一次用户手势才肯出声，
     而这边此前只在「练习关」那个分支里解锁过 —— 走主流程（点开始直接玩）的人
     一次都不会碰到那行。真出问题的话是整局无声，而且不报任何错。
     unlock() 内部只是拿一下 context、必要时 resume，重复调用没有代价。 */
  try { game.Audio2.unlock(); } catch (err) { /* 音频起不来不该拦住游戏 */ }
  touchStart = { x: t.clientX, y: t.clientY, t: Date.now() };

  // 文档页（玩法说明 / 关于这个游戏）开着时，手指是用来滚页面的，不是转向的
  const docClose = hits.helpClose || hits.aboutClose;
  if (docClose && !inRect(t.clientX, t.clientY, docClose)){
    helpDragFrom = { y: t.clientY, scroll: helpScroll };
  }

  if (inRect(t.clientX, t.clientY, hits.helpClose)){ game.closeHelp(); return; }
  if (inRect(t.clientX, t.clientY, hits.aboutClose)){ game.closeAbout(); return; }
  /* 练习关那一排。必须排在 hits.start 前面判断：两者在开始页上离得近，
     而锁着的关卡也要吃掉这一下点击（它有热区但不响应），不能穿透到「开始」。 */
  if (hits.practice){
    for (const p of hits.practice){
      if (!inRect(t.clientX, t.clientY, p)) continue;
      if (p.locked) return;                       // 没解锁：吃掉这一下，什么都不做
      game.Audio2.unlock();                       // 和「开始」一样，首次触摸解锁音频
      el('startOverlay').classList.add('hidden');
      game.startPractice(p.lv);
      return;
    }
  }
  if (inRect(t.clientX, t.clientY, hits.start))   { pressButton('startBtn');   return; }
  if (inRect(t.clientX, t.clientY, hits.resume))  { if (ui.setPauseReason) ui.setPauseReason('');
                                                     pressButton('resumeBtn');  return; }
  if (inRect(t.clientX, t.clientY, hits.restart)) { pressButton('restartBtn'); return; }
  if (inRect(t.clientX, t.clientY, hits.name))    { openKeyboard();            return; }
  // 开始页和暂停页上并排的那个「玩法说明」
  if (inRect(t.clientX, t.clientY, hits.help))    { helpScroll = 0; game.openHelp(); return; }
  if (inRect(t.clientX, t.clientY, hudHits.help)) { helpScroll = 0; game.openHelp(); return; }
  if (inRect(t.clientX, t.clientY, hudHits.pause)){
    if (ui.setPauseReason) ui.setPauseReason('');   // 自己按的，不用解释
    game.togglePause(); return; }
  // 开始页那行署名 —— 点进「关于这个游戏」
  if (inRect(t.clientX, t.clientY, hits.about))   { helpScroll = 0; game.openAbout(); return; }

  // 显隐开关必须排在方向键前面判断：隐藏状态下 padKeys 里只剩它一个，
  // 但显示状态下两者的命中区是挨着的，先判方向键会把它吃掉。
  if (inRect(t.clientX, t.clientY, padKeys.padToggle)){
    padHidden = !padHidden;
    try { wx.setStorageSync('doudou.padHidden', padHidden ? '1' : '0'); } catch (e) {}
    return;
  }

  for (const k of Object.keys(padKeys)){
    if (k === 'padToggle') continue;
    if (inRect(t.clientX, t.clientY, padKeys[k])){
      if (k === 'pause'){ if (ui.setPauseReason) ui.setPauseReason(''); game.togglePause(); }
      else game.requestDir(k);
      return;
    }
  }
});

function swipeDir(dx, dy){
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left')
                                     : (dy > 0 ? 'down'  : 'up');
}

wx.onTouchMove(e => {
  const t = e.touches[0];
  if (helpDragFrom){
    // 手指往上滑，内容往上走 —— 和滚动列表一致
    helpScroll = Math.max(0, Math.min(helpMaxScroll,
                  helpDragFrom.scroll + (helpDragFrom.y - t.clientY)));
    return;
  }
  /* 滑过阈值就立刻转向，**不等抬手**。
     原来只在 onTouchEnd 里判定，手指抬起来之前一个转向都不会发生 —— 一次滑动
     手势 100~250ms，而玩家速度 5.4~6.9 格/秒，手还没离开屏幕人就越过路口
     0.8~1.0 格，而转角辅助只救得了 0.45 格。这就是"滑动没有方向键好控制"的
     真正来源：不是触屏天生不如按键，是判定时机放错了（方向键走的是按下即响应）。
     判定后把起点挪到当前位置，按着不放一路划就能连续拐弯。 */
  if (!touchStart) return;
  const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
  if (Math.abs(dx) <= SWIPE_MIN && Math.abs(dy) <= SWIPE_MIN) return;
  game.requestDir(swipeDir(dx, dy));
  touchStart = { x: t.clientX, y: t.clientY, t: Date.now() };
});

wx.onTouchEnd(e => {
  if (helpDragFrom){ helpDragFrom = null; touchStart = null; return; }
  if (!touchStart) return;
  const t = (e.changedTouches && e.changedTouches[0]) || null;
  if (t){
    /* 兜底：极短的一甩可能整个手势里都没有过阈值的 touchmove，这里补一次。
       已经在 touchmove 里转过向的手势，起点被重置过，剩下的位移通常不到阈值。 */
    const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
    if (Math.abs(dx) > SWIPE_MIN || Math.abs(dy) > SWIPE_MIN){
      game.requestDir(swipeDir(dx, dy));
    }
  }
  touchStart = null;
});

/* 手势被系统打断（下拉通知栏、侧边返回那类）时，微信发的是 onTouchCancel，
   **不会**再发 touchend。不接的话 touchStart 和说明页的拖动状态会一直挂着：
   下一次 touchmove 会拿上一次那个陈旧的起点去算位移，很可能直接判出一个
   玩家根本没做的转向 —— 而这种"我明明没滑它自己拐了"最难复现也最恼人。
   取消不是手势完成，所以什么都不该触发，只清状态。 */
wx.onTouchCancel(() => { touchStart = null; helpDragFrom = null; });

/** 小游戏没有 <input>，署名走系统键盘。 */
function openKeyboard(){
  wx.showKeyboard({
    defaultValue: el('nameInput').value || '',
    maxLength: 8,
    multiple: false,
    confirmHold: false,
    confirmType: 'done',
  });
}
wx.onKeyboardInput(res => { el('nameInput').value = res.value; });
wx.onKeyboardConfirm(res => {
  el('nameInput').value = res.value;
  el('nameSaveBtn').dispatch('click', {});
  wx.hideKeyboard();
});

// ---- 合成循环 ----
// 逻辑自己那条 rAF 只负责 update + 往离屏画布上画迷宫；这条负责把离屏内容和
// HUD、弹层合成到屏幕上。两条分开是因为逻辑那份是从网页版原样提取的，不该为了
// 小游戏去改它。
function composite(){
  if (crashed) return;
  try { drawFrame(); }
  catch (err){ fatal(err, '渲染'); return; }
  requestAnimationFrame(composite);
}

function drawFrame(){
  sctx.fillStyle = PALETTE['--void'];
  sctx.fillRect(0, 0, W, H);

  hudHits = ui.drawHud();

  // 源矩形用画布的**真实像素**，不是逻辑坐标 —— 分辨率已经按目标大小分配过了
  sctx.drawImage(mazeCanvas, 0, 0, mazeCanvas.width, mazeCanvas.height, boardX, boardY, boardW, boardH);
  if (el('fxCanvas').classList.contains('on') && fxCanvas.width > 1){
    sctx.drawImage(fxCanvas, 0, 0, fxCanvas.width, fxCanvas.height, boardX, boardY, boardW, boardH);
  }

  // toast
  const toastEl = el('toast');
  if (toastEl.classList.contains('show') && toastEl.textContent){
    sctx.font = 'bold 14px sans-serif';
    const tw = sctx.measureText(toastEl.textContent).width + 28;
    const tx = W/2 - tw/2, ty = boardY + boardH*0.12;
    sctx.fillStyle = 'rgba(0,0,0,.6)';
    /* 用 ui.js 那个 arcTo 版圆角矩形，不用原生 ctx.roundRect。
       原生这条在微信的 Chromium 里会抛
         TypeError: Failed to execute 'roundRect' ...
         The provided value cannot be converted to a sequence
       ——它要求半径是数组，给数字不认。而且原来那句用
       `sctx.roundRect ? ... : ...` 做特性检测也是错的：方法确实存在，
       只是参数形状不同，存在性检测挡不住。掉命会弹 toast，一画就崩在
       渲染循环里，画面就此定格——正是"死一条命后黑屏"。 */
    ui.roundRect(tx, ty, tw, 28, 14);
    sctx.fill();
    sctx.fillStyle = PALETTE['--amber'];
    sctx.textAlign='center'; sctx.textBaseline='middle';
    sctx.fillText(toastEl.textContent, W/2, ty+14);
  }

  padKeys = {};              // 方向键已去掉，命中表留空
  hits = ui.drawOverlays(helpScroll);
  if (hits.helpMaxScroll != null) helpMaxScroll = hits.helpMaxScroll;
}
requestAnimationFrame(composite);

/* 回到前台。rAF 自己会续上，但**启动参数要重读一次**。
   getLaunchOptionsSync 只反映冷启动那一次：游戏已经在内存里时，别人分享的
   挑战链接点进来走的是 onShow(res)，query 在这里。不接的话，热启动进来的
   挑战会静默丢失 —— 而"已经玩过一次、后来收到朋友挑战"恰恰是最常见的路径。 */
wx.onShow((res) => {
  try {
    const q = (res && res.query) || {};
    if (q.c && game.setChallenge) game.setChallenge(q.c, q.n);
  } catch (e) { /* 拿不到就当没有挑战 */ }
});

/* 被打断时暂停，并且**说清楚为什么**。
   手机上这两件事天天发生：切个 App、来一通电话。不暂停的话玩家回来发现莫名
   死了一条命 —— 那不是他操作失误；暂停了却不解释，他的第一反应是"我按到什么
   了"。pauseReason 由暂停页读，玩家自己按暂停时是空的。 */
let pauseReason = '';
function autoPause(why){
  if (game.gameState !== 'playing') return;
  pauseReason = why;
  if (ui && ui.setPauseReason) ui.setPauseReason(why);
  game.togglePause();
}
wx.onHide(() => autoPause('你切走了，游戏替你按了暂停'));
try {
  wx.onAudioInterruptionBegin && wx.onAudioInterruptionBegin(
    () => autoPause('有电话或语音打断了，先替你暂停'));
} catch (e) { /* 老基础库没有这个接口 */ }

/* 内存告警。小游戏跑在别人的手机上，低端机上这是常事 —— 收到告警却什么都
   不做，下一步就是被系统杀掉，玩家看到的是"闪退"，而且完全不知道为什么。
   能放的是烟花贴图和调色板缓存，两样都会在下次需要时自动重建。 */
try {
  wx.onMemoryWarning && wx.onMemoryWarning((res) => {
    console.warn('[豆豆迷宫] 内存告警 level=' + (res && res.level));
    if (game && game.releaseCaches) game.releaseCaches();
    if (wx.triggerGC) wx.triggerGC();
  });
} catch (e) { /* 老基础库没有这个接口 */ }

/* 别人分享的挑战。小游戏没有 URL，参数在启动选项的 query 里：
   分享出去的 path 带 ?c=分数&n=名字，这里读回来交给逻辑层。
   之后开始页的横幅和结算页那句「超过谁多少分」都是现成的。 */
try {
  const q = (wx.getLaunchOptionsSync && wx.getLaunchOptionsSync().query) || {};
  if (q.c && game.setChallenge) game.setChallenge(q.c, q.n);
} catch (e) { /* 拿不到启动参数就当没有挑战 */ }

/* ---------- 分享 ----------
 * 胶囊菜单里那两个按钮默认是灰的，写着「当前页面未设置分享」—— 小游戏必须
 * 显式调 showShareMenu 才会亮，光注册 onShareAppMessage 是不够的。两件事都要：
 *   showShareMenu      让按钮可用（转发给好友 / 分享到朋友圈）
 *   onShareAppMessage  决定转发出去长什么样
 */
try {
  wx.showShareMenu && wx.showShareMenu({
    withShareTicket: false,
    menus: ['shareAppMessage', 'shareTimeline'],
  });
} catch (e) {}

/** 分享文案带上当前成绩 —— 光一个游戏名没什么点开的理由，"我打了多少分"才有。 */
function shareContent(){
  let title = '豆豆迷宫 — 连吃 · 闪避 · 穿越';
  let onResult = false;
  try {
    const score = Number(el('scoreVal').textContent) || 0;
    onResult = !el('overOverlay').classList.contains('hidden');
    const won = onResult && el('overTitle').textContent.indexOf('通关') >= 0;
    if (won)            title = `我通关了全 6 关，${score} 分！你能吗？`;
    else if (score > 0) title = `我在豆豆迷宫拿了 ${score} 分，来比比？`;
  } catch (e) { /* 取不到就用默认文案 */ }
  /* 分享出去带上挑战：对方打开就看到「你 向他挑战 多少分」，打完还会被告知
     超没超过。网页版一直有这个玩法（那边靠 URL 查询串），小游戏这边此前
     query 是空的，发出去只是"也来玩"，少了对比这一层。 */
  let query = '';
  try {
    const n = Number(String(el('finalScore').textContent || '0').replace(/,/g, '')) || 0;
    if (onResult && n > 0){
      query = 'c=' + n;
      let who = '';
      try { who = wx.getStorageSync('doudou.name') || ''; } catch (e2) {}
      if (who && game.cleanName) who = game.cleanName(who);
      if (who) query += '&n=' + encodeURIComponent(who);
    }
  } catch (e) { /* 拼不出来就发不带挑战的 */ }
  /* 分享图。不给 imageUrl 的话，微信会拿**当前这一帧**去截图 —— 于是发出去的
     可能是一张暂停页、一张开始页，甚至是死掉的瞬间。分享是这游戏唯一的传播
     途径，那张图就是第一印象，不该交给运气。
     500×400 是微信建议的 5:4。 */
  return { title, query, imageUrl: 'images/share.jpg' };
}

try { wx.onShareAppMessage && wx.onShareAppMessage(shareContent); } catch (e) {}
try { wx.onShareTimeline   && wx.onShareTimeline(shareContent);   } catch (e) {}

/* 把内部句柄挂出来给冒烟测试用。
   之前测试是自己重新搭一遍启动流程，等于从没测过 game.js 本身 —— 而
   toast 的 roundRect 崩溃、分享没开启，两个真 bug 都恰恰在这个文件里。
   测真正的入口才有意义。这几个引用在正式环境里也就是几个字节。 */
GameGlobal.__test = { shareContent, shim, game, ui, el, mazeCanvas, insetsFrom, layout: {
  W, H, DPR, hudTop, hudH, hudBottom, boardX, boardY, boardW, boardH, padH, bottomInset,
} };
