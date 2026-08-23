// 无头冒烟测试：用假的 wx 和假的 canvas 把小游戏跑起来。
//   用法: node 工具/smoke.mjs
//
// 语法检查通过不代表能跑。垫片补出来的 DOM 只要缺一个属性，逻辑就会在加载的
// 第一行崩掉——而这种崩溃在微信开发者工具里表现为白屏，不打开调试面板根本
// 看不出原因。这里在本机就把它跑一遍：建游戏、开局、推进若干帧、翻六关、
// 触发结算，任何一步抛异常都算失败。
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';

// ---- 假 canvas ----
const noop = () => {};
function fakeCtx(){
  const c = {
    canvas: null, __rec: [], __recOn: false,
    save:noop, restore:noop, scale:noop, translate:noop, rotate:noop,
    beginPath:noop, closePath:noop, moveTo:noop, lineTo:noop, arc:noop, arcTo:noop,
    rect:noop, fill:noop, stroke:noop, clip:noop,
    /* 微信的 Chromium 里 roundRect 只收数组半径，给数字会抛
         TypeError: Failed to execute 'roundRect' ...
         The provided value cannot be converted to a sequence
       这正是"死一条命后黑屏"的真凶（掉命弹 toast，一画就崩在渲染循环里）。
       假实现照着挑剔，不然本机永远测不出来。 */
    roundRect:(x,y,w,h,r)=>{
      if (!Array.isArray(r)) {
        throw new TypeError("Failed to execute 'roundRect' on 'CanvasRenderingContext2D': "
          + "The provided value cannot be converted to a sequence.");
      }
    },
    fillRect:noop, clearRect:noop, strokeRect:noop, drawImage:noop,
    /* 记下每一次 fillText。排版类的断言（正文左边缘在哪、滚到底能不能看到
       最后一行）只能从这里读——画布是假的，没有别的地方能观察到坐标。 */
    fillText:(t,x,y)=>{ if (c.__recOn) c.__rec.push({ t:String(t), x, y, align:c.textAlign }); },
    strokeText:noop,
    /* 每个字一律 7px 是不行的。中文在 11.5px 字号下差不多就是 11.5px 宽，
       按 7px 算，测试里**任何中文都不会折行** —— 于是所有"折行之后才暴露"的
       排版问题（正文被挤窄、总高算少导致滚不到底）在本机永远是绿的。
       这里按字号折算，并区分全角和半角，够真实到能把折行测出来。 */
    measureText: (t) => {
      const m = /([\d.]+)px/.exec(c.font || '');
      const size = m ? parseFloat(m[1]) : 11.5;
      let w = 0;
      for (const ch of String(t)) w += /[\u2e80-\u9fff\uff00-\uffef\u3000-\u303f]/.test(ch) ? size : size * 0.55;
      return { width: w };
    },
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    setLineDash:noop, quadraticCurveTo:noop, bezierCurveTo:noop, ellipse:noop,
  };
  return c;
}
function fakeCanvas(w=300,h=150){
  const cv = { width:w, height:h };
  const ctx = fakeCtx(); ctx.canvas = cv;
  cv.getContext = () => ctx;
  return cv;
}

// ---- 假 wx ----
const store = new Map();
let created = 0;
globalThis.GameGlobal = globalThis;

// 复刻基础库 3.17 的另一处敌意行为：宿主自带一个 document 桩，
// 而且是**只读的**，里面没有 getElementById。
// 真机报错就是 "TypeError: document.getElementById is not a function"。
// 之前测试没抓到，是因为 node 里根本没有 document，垫片一装就成功了。
// 测试环境必须比真实环境更刁钻，否则测了等于没测。
// 冻结：真机上不仅替换不掉这个 document，连往它身上补方法都会被拒。
// 这是第五轮才发现的——先前以为"补方法"能兜住，结果同一条错误又出现一次。
const hostDoc = Object.freeze({ hidden:false, visibilityState:'visible' });
Object.defineProperty(globalThis, 'document', {
  get(){ return hostDoc; },
  configurable: false,
});


// 复刻新版基础库的敌意环境：window 是**只读 getter**。
// 之前测试没抓到那个致命 bug，就是因为 node 里 window 可写，垫片里
// `win.window = win` 在本机畅通无阻，到真机上直接抛
//   TypeError: Cannot set property window of #<Window> which has only a getter
// 于是游戏死在加载阶段，界面一片黑。测试环境必须比真实环境更严格，
// 不然测了等于没测。
Object.defineProperty(globalThis, 'window', {
  get(){ return globalThis; },
  configurable: false,
});

globalThis.wx = {
  createCanvas: () => { created++; const cv = fakeCanvas(created===1?390:494, created===1?844:546);
                        if (created===1) globalThis.__screenCtx = cv.getContext();
                        return cv; },
  getSystemInfoSync: () => ({
    windowWidth:390, windowHeight:844, pixelRatio:3, statusBarHeight:47,
    safeArea:{ top:47, bottom:810, left:0, right:390, width:390, height:763 },
  }),
  getWindowInfo: () => ({
    windowWidth:390, windowHeight:844, pixelRatio:3, statusBarHeight:47,
    safeArea:{ top:47, bottom:810, left:0, right:390, width:390, height:763 },
  }),
  // 右上角那个「···⊙」胶囊，iPhone 13 上的实际位置
  getMenuButtonBoundingClientRect: () => ({
    top:52, right:383, bottom:84, left:296, width:87, height:32,
  }),
  getStorageSync: (k) => store.has(k) ? store.get(k) : '',
  setStorageSync: (k,v) => store.set(k,v),
  removeStorageSync: (k) => store.delete(k),
  createWebAudioContext: () => {
    // Web Audio 的 connect() 按规范返回目标节点，逻辑里用的是链式写法
    // osc.connect(g).connect(ac.destination)。假实现必须照做，否则测出来的
    // 是假实现的毛病，不是代码的。
    const param = () => ({ setValueAtTime:noop, linearRampToValueAtTime:noop,
                           exponentialRampToValueAtTime:noop, cancelScheduledValues:noop, value:0 });
    const node = (extra) => Object.assign({ connect:(dst)=>dst, disconnect:noop }, extra);
    return {
      currentTime: 0, state:'running', resume: noop, destination: node({}),
      createOscillator: () => node({ type:'square', frequency:param(), detune:param(),
                                     start:noop, stop:noop, onended:null }),
      createGain: () => node({ gain: param() }),
      createBiquadFilter: () => node({ frequency:param(), Q:param(), type:'lowpass' }),
    };
  },
  // 记录分享相关调用：胶囊菜单里那两个按钮灰着，就是因为漏了 showShareMenu
  showShareMenu:(o)=>{ globalThis.__shareMenu = o; },
  onShareAppMessage:(fn)=>{ globalThis.__shareCb = fn; },
  onShareTimeline:(fn)=>{ globalThis.__timelineCb = fn; },
  // 抓住触摸回调，测试才点得下去 —— 命中区算得再对，接错了照样点不动
  // 抓住音频中断回调，测试才能模拟来电打断；启动参数默认为空
  onAudioInterruptionBegin:(fn)=>{ globalThis.__audioBreak = fn; },
  onMemoryWarning:(fn)=>{ globalThis.__memWarn = fn; },
  triggerGC:()=>{ globalThis.__gc = (globalThis.__gc||0)+1; },
  onAudioInterruptionEnd:()=>{},
  getLaunchOptionsSync:()=>({ query:{} }),
  onTouchStart:(fn)=>{ globalThis.__touch = fn; },
  onTouchEnd:(fn)=>{ globalThis.__touchEnd = fn; },
  onTouchCancel:(fn)=>{ globalThis.__touchCancel = fn; },
  onTouchMove:(fn)=>{ globalThis.__touchMove = fn; },
  showKeyboard:noop, hideKeyboard:noop, onKeyboardInput:noop, onKeyboardConfirm:noop,
  onShow:(fn)=>{ globalThis.__onShow = fn; }, onHide:noop,
};

// rAF: 手动驱动，别让它真的跑起来
let rafQueue = [];
/* 真的走一帧：把排队的 rAF 回调放出来跑一次。
   点击派发用的是 game.js 里那个模块级 hits，而它只在**它自己的合成循环**里
   赋值。测试直接调 ui.drawOverlays() 拿到的是另一份新对象，game.js 那边还是
   上一帧的旧命中区 —— 于是点练习关会穿过去点到「开始」，看起来像命中区算错了，
   其实是根本没刷新。 */
globalThis.__frame = () => { const q = rafQueue; rafQueue = [];
                             for (const fn of q) fn(performance.now()); };
globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
globalThis.cancelAnimationFrame = noop;
globalThis.performance = globalThis.performance || { now: () => Date.now() };

const here = p => fileURLToPath(new URL(p, import.meta.url));
const { createRequire } = await import('node:module');
const req = createRequire(import.meta.url);

const fail = (msg, e) => { console.error('✗ ' + msg + (e ? '\n  ' + (e.stack||e) : '')); process.exitCode = 1; };
const ok   = (msg) => console.log('✓ ' + msg);

/* 直接加载真正的入口 game.js，走它完整的启动流程：建画布、装垫片、
   起游戏、注册分享、开合成循环。之前测试是自己重搭一遍，等于从没测过
   game.js —— 而 toast 崩溃和分享没开启这两个真 bug 都在那个文件里。 */
let shim, game, ui, el;
try {
  req(here('../game.js'));
  const t = globalThis.__test;
  if (!t) throw new Error('game.js 没有挂出 __test 句柄');
  ({ shim, game, ui, el } = t);
  ok('入口 game.js 完整启动');
} catch(e){ fail('入口 game.js 启动', e); process.exit(1); }

// 逻辑自启的那条 rAF 应该已经排队了
try {
  if (!rafQueue.length) throw new Error('逻辑没有启动 requestAnimationFrame');
  ok('主循环已启动');
} catch(e){ fail('主循环', e); }

// 开局
try {
  el('startBtn').dispatch('click', {});
  if (game.gameState !== 'playing') throw new Error('点开始后 gameState=' + game.gameState);
  ok('点"开始"进入游戏');
} catch(e){ fail('开局', e); }

// 推进 10 秒，边走边转向
try {
  const dirs = ['left','up','right','down'];
  for (let i=0;i<600;i++){
    if (i % 30 === 0) game.requestDir(dirs[((i/30)|0) % 4]);
    game.update(1/60);
    game.render();
  }
  ok(`跑了 10 秒：分数 ${game.score}，第 ${game.level} 关，${game.lives} 条命`);
} catch(e){ fail('推进 10 秒', e); }

// HUD 有没有被写进去
try {
  if (!el('scoreVal').textContent) throw new Error('scoreVal 是空的');
  if (!el('levelVal').textContent) throw new Error('levelVal 是空的');
  ok(`HUD 已更新：分数=${el('scoreVal').textContent} 关卡=${el('levelVal').textContent} 生命节点数=${(el('livesVal').innerHTML.match(/<svg/g)||[]).length}`);
} catch(e){ fail('HUD', e); }

// UI 绘制（这一步最容易因为垫片缺属性而炸）
try {
  // 布局由 game.js 按假 wx 报的屏幕尺寸真算出来，不是测试里编的
  const layout = globalThis.__test.layout;
  for (const [k,v] of Object.entries(layout)){
    if (!Number.isFinite(v)) throw new Error(`布局参数 ${k} 不是有限数：${v}`);
  }
  const hud = ui.drawHud();
  ui.drawOverlays(0);
  if (!hud || !hud.help) throw new Error('HUD 上的「?」命中区没生成');
  if (!hud.pause) throw new Error('HUD 上的暂停命中区没生成');
  ok('界面绘制（HUD / 暂停 / 「?」/ 弹层）');
} catch(e){ fail('界面绘制', e); }

/* 开始页和暂停页都要有并排的「玩法说明」按钮。
   暂停页这个尤其不能少：开打之后标题栏收起，HUD 上那个「?」跟着消失，
   玩到一半想查规则就没有任何入口了 —— 而这正是最想查的时刻。 */
try {
  el('startOverlay').classList.remove('hidden');
  el('pauseOverlay').classList.add('hidden');
  el('overOverlay').classList.add('hidden');
  const s = ui.drawOverlays(0);
  if (!s.start) throw new Error('开始页「开始」命中区没了');
  if (!s.help)  throw new Error('开始页缺「玩法说明」命中区');

  el('startOverlay').classList.add('hidden');
  el('pauseOverlay').classList.remove('hidden');
  const p = ui.drawOverlays(0);
  if (!p.resume) throw new Error('暂停页「继续」命中区没了');
  if (!p.help)   throw new Error('暂停页缺「玩法说明」命中区');
  // 两个按钮不能叠在一起，否则点哪个都是同一个
  const a=p.resume, b=p.help;
  if (!(a.x + a.w <= b.x || b.x + b.w <= a.x)) throw new Error('两个按钮命中区重叠');
  el('pauseOverlay').classList.add('hidden');
  ok(`「玩法说明」入口齐全（开始页 + 暂停页，按钮不重叠）`);
} catch(e){ fail('玩法说明入口', e); }

/* 方向键 2026-08-21 整个去掉了（业主："感觉方向键是鸡肋"），原来那两条
   ——「显隐开关」和「位置在安全区内」——测的都是不复存在的东西，一并删掉。

   但删掉方向键带出一个新风险，必须有人守：**暂停键原本嵌在方向键正中**。
   它一走，手机上就只剩"打完这局"一种停下来的办法，而这种缺失不会报任何错，
   画面上也看不出少了什么。所以换成下面这条。 */
try {
  const hud = ui.drawHud();
  if (!hud.pause) throw new Error('HUD 上没有暂停键 —— 方向键已经没了，'
                                + '这是手机上唯一能暂停的地方');
  const L = globalThis.__test.layout;
  // 不能和「?」重叠，也不能跑到 HUD 外面去
  const h = hud.help, p = hud.pause;
  if (!(p.x + p.w <= h.x || h.x + h.w <= p.x))
    throw new Error('暂停键和「?」重叠了，点哪个都是同一个');
  if (p.y < L.hudTop || p.y + p.h > L.hudBottom)
    throw new Error(`暂停键跑出 HUD 了：${p.y.toFixed(0)}→${(p.y+p.h).toFixed(0)}，`
                  + `HUD 是 ${L.hudTop}→${L.hudBottom}`);
  // 够大才点得中。微信的建议是 44×44pt，这里至少要有 28。
  if (p.w < 28 || p.h < 28) throw new Error(`暂停键只有 ${p.w}×${p.h}，太小点不中`);
  ok(`HUD 暂停键（${p.w.toFixed(0)}×${p.h.toFixed(0)}，不与「?」重叠，在 HUD 内）`);
} catch(e){ fail('HUD 暂停键', e); }

// 棋盘该把方向键腾出来的地方吃掉：它现在是被屏宽卡住的，竖向应当居中而不是吊在上面
try {
  const L = globalThis.__test.layout;
  if (L.padH !== 0) throw new Error(`padH 不是 0（${L.padH}）—— 方向键那条带子还占着位`);
  const 上 = L.boardY - L.hudBottom;
  const 下 = L.H - L.bottomInset - (L.boardY + L.boardH);
  if (Math.abs(上 - 下) > 24)
    throw new Error(`棋盘没居中：上留 ${上.toFixed(0)}px，下留 ${下.toFixed(0)}px`);
  ok(`棋盘竖直居中（上 ${上.toFixed(0)} / 下 ${下.toFixed(0)}，占屏宽 `
     + Math.round(100*L.boardW/L.W) + '%）');
} catch(e){ fail('棋盘布局', e); }

try {
  game.openHelp();
  const hits = ui.drawOverlays(0);
  if (!hits.helpClose) throw new Error('玩法说明的「知道了」按钮没生成');
  if (game.gameState !== 'paused') throw new Error('打开说明没有暂停游戏');
  /* 内容比一屏高，必须能滚 —— 否则底部的「意见反馈」永远看不到。
     maxScroll 为 0 说明要么内容缩水了，要么滚动被算错了。 */
  if (!(hits.helpMaxScroll > 0))
    throw new Error('说明不可滚动（maxScroll=' + hits.helpMaxScroll + '），底部内容会看不到');
  // 滚到底也不该崩，且按钮位置不变（它在视窗外面，不跟着滚）
  const bottom = ui.drawOverlays(hits.helpMaxScroll);
  if (Math.abs(bottom.helpClose.y - hits.helpClose.y) > 0.5)
    throw new Error('滚动时「知道了」按钮跟着动了，它应该固定在视窗外');
  game.closeHelp();
  const after = ui.drawOverlays(0);
  if (after.helpClose) throw new Error('关闭后说明仍在显示');
  ok('玩法说明（暂停 / 可滚动 maxScroll=' + hits.helpMaxScroll.toFixed(0) + ' / 按钮固定 / 可关闭）');
} catch(e){ fail('玩法说明', e); }

/* 两页文档的排版。这两条守的都是"人一眼能看见、测试却一直看不见"的东西。

   一、能不能滚到底。量高和画图原来是两段各算各的：量高按「rows 有几条就是
   几行」，可真画的时候中文会折行。少算的那部分直接变成滚不到的死区，而最后
   一行恰好是联系邮箱。现在改成排一次版、量和画共用同一份坐标。

   二、「关于」的正文左边缘。它一直套着玩法说明的两栏模板画（左栏放词条、
   右栏放解释），可「关于」根本没有词条 —— 于是左边整整一栏是空的，正文被
   挤进右半边。网页版早就改成通栏了，这边一直没跟上。 */
const rec = globalThis.__screenCtx;
const draw = (fn) => { rec.__rec.length = 0; rec.__recOn = true;
                       const r = fn(); rec.__recOn = false; return r; };

try {
  game.openHelp();
  const h = ui.drawOverlays(0);
  const bottom = draw(() => ui.drawOverlays(h.helpMaxScroll));
  /* 折行是把一句话切成几段画出去，字一个没少，所以**不加分隔**地拼回来
     就能还原原句，再去里面找。
     锚点必须选**最后一行的正文**，而且要是全文只出现一次的那一句。第一版拿
     「幽灵融合」当锚，它其实是左栏的词条、前面那节也有一个，永远看得见 ——
     测试于是一直是绿的，把它想抓的 bug 整个放过去了。 */
  const seen = rec.__rec.map(r => r.t).join('');
  if (seen.indexOf('两只各算一档悬赏') < 0)
    throw new Error('玩法说明滚到底，最后一行的正文仍然画不出来 —— '
                  + '总高算少了，末尾那截滚不到（maxScroll='
                  + bottom.helpMaxScroll.toFixed(0) + '）');
  ok('玩法说明滚到底能看到最后一行');
} catch(e){ fail('玩法说明滚动到底', e); }
finally { try { game.closeHelp(); } catch(e){} }

const stateBeforeLayout = game.gameState;
try {
  game.openAbout();
  draw(() => ui.drawOverlays(0));
  const rows = rec.__rec.filter(r => r.align === 'left');
  /* 锚在正文**第一行的开头**。文案 2026-08-21 改成一整段，开头是「暑期，」；
     用 indexOf(...)===0 而不是 includes，是因为要的是"这一行是正文的第一行"，
     而折行之后后面几行也含正文的字。 */
  const body = rows.find(r => r.t.indexOf('暑期，') === 0);
  const head = rows.find(r => r.t === '反馈与建议');
  if (!body) throw new Error('「关于」正文没画出来');
  if (!head) throw new Error('「关于」的「反馈与建议」小标题没画出来');

  // 通栏：正文必须贴着左边距（20），不能停在两栏模板的右栏起点上
  if (body.x > 40)
    throw new Error('「关于」正文从 x=' + body.x + ' 开始，左边空出一大条 —— '
                  + '还在套玩法说明的两栏模板，网页版这里是通栏的');
  // 小标题和正文共用一条左边缘
  if (Math.abs(head.x - body.x) > 1)
    throw new Error('「反馈与建议」在 x=' + head.x + '，正文在 x=' + body.x + '，左边缘没对齐');

  // 正文宽度要用得上：最长的一行不该只占屏宽的一半。
  // 宽度必须用排版时那把尺去量，自己另估一套迟早和它对不上。
  rec.font = '11.5px sans-serif';
  const longest = Math.max(...rows.filter(r => !/^超级奶爸$/.test(r.t))
                                  .map(r => rec.measureText(r.t).width));
  if (longest < 390 * 0.6)
    throw new Error('正文最长一行只有 ' + longest.toFixed(0) + 'px，不到屏宽六成，正文区域太窄');

  game.closeAbout();
  ok('「关于」通栏排版（正文 x=' + body.x + '，与小标题共用左边缘，最长行 '
     + longest.toFixed(0) + 'px）');
} catch(e){ fail('「关于」排版', e); }
finally {
  /* 断言失败也必须把这一页关掉。少了这一步，「关于」会一直开着，后面
     那条测开始页的用例就会报「没有我们的故事入口」—— 一条红染出第二条红，
     而第二条红指向的地方根本没有问题。 */
  try { game.closeAbout(); } catch(e){}
  game.gameState = stateBeforeLayout;
}

/* 开始页第一句要来自逻辑层的 welcomeLine，不能再是写死的操作说明；
   操作说明只给新玩家看（网页版是 .start-tip 跟着有没有纪录显隐）。

   两种状态都自己造出来测，不依赖跑到这一步时"恰好有没有纪录"。
   前两版都栽在这上头：一次断言"应该显示欢迎回来"，可 renderWelcome 在启动时
   就跑完了，那会儿还没有纪录；一次断言"不该有操作说明"，可那时榜单确实是空的。
   两次红的都是测试自己的假设，不是被测的代码 —— 状态得测试自己说了算。 */
const stateBeforeWelcome = game.gameState;
try {
  el('startOverlay').classList.remove('hidden');
  el('pauseOverlay').classList.add('hidden');
  el('overOverlay').classList.add('hidden');

  const line = '欢迎回来，再闯一次迷宫吧。';
  const beforeW = el('welcomeLine').textContent;
  const beforeB = el('startBoard').innerHTML;
  el('welcomeLine').textContent = line;

  const show = (boardHtml) => {
    el('startBoard').innerHTML = boardHtml;
    draw(() => ui.drawOverlays(0));
    return rec.__rec.map(r => r.t).join('\n');
  };

  const 新玩家 = show('');
  const 老玩家 = show('<div class="board-row"><span>1</span><span>豆豆</span><span>12,345</span></div>');

  el('welcomeLine').textContent = beforeW;
  el('startBoard').innerHTML = beforeB;

  if (新玩家.indexOf(line) < 0 || 老玩家.indexOf(line) < 0)
    throw new Error('welcomeLine 的内容没画到开始页上 —— 欢迎语这根线没接');
  if (新玩家.indexOf('手指滑动屏幕') < 0)
    throw new Error('新玩家看不到操作说明了');
  if (老玩家.indexOf('手指滑动屏幕') >= 0)
    throw new Error('有纪录的老玩家还在看操作说明，网页版这行该收起来');
  if (老玩家.indexOf('吃豆连击叠加倍率') >= 0)
    throw new Error('开始页还留着写死的那两行说明');

  ok('开始页欢迎语来自逻辑层（新玩家带操作说明，老玩家只留欢迎语）');
} catch(e){ fail('开始页欢迎语', e); }
finally { game.gameState = stateBeforeWelcome; }

/* 练习关那一排。网页版开始页早就有「练习 1 2 3 4 5 6」，小游戏版一行都没画 ——
   core 里 renderLevelSelect 把按钮写进 levelSel 的 innerHTML，还给它们挂了
   click，可垫片上的假元素根本不会派发，所以外壳必须自己画、自己接。

   要测三件事，缺一件这个功能都是坏的：画出来、点得中、锁着的点不动。
   只测"画出来"是不够的 —— 命中区算错一个像素，屏幕上照样好看。 */
const stateBeforePractice = game.gameState;
try {
  el('startOverlay').classList.remove('hidden');
  el('pauseOverlay').classList.add('hidden');
  el('overOverlay').classList.add('hidden');

  /* 解锁进度要**真的**写进存档，不能只在 innerHTML 里假装。
     startPractice 自己会拿 maxLevelReached() 再夹一次（这是对的，外壳传什么
     进来都不该越权），所以只改 HTML 的话点第 3 关照样落回第 1 关 ——
     第一版就是这么红的，红在测试撒谎，不在代码。 */
  shim.env.localStorage.setItem('doudou.reached', '3');

  // 照 renderLevelSelect 的产物造一份：前 3 关解锁，后 3 关锁着
  const sel = el('levelSel');
  sel.classList.remove('hidden');
  sel.innerHTML = '<span class="levelsel-k">练习</span>'
    + [1,2,3].map(i=>`<button class="lv" data-lv="${i}">${i}</button>`).join('')
    + [4,5,6].map(i=>`<button class="lv" data-lv="${i}" disabled aria-label="未解锁">🔒</button>`).join('');

  globalThis.__frame();                       // 让 game.js 那份 hits 跟上
  const h = draw(() => ui.drawOverlays(0));
  if (!h.practice || h.practice.length !== 6)
    throw new Error('练习关那排没画出来（拿到 '
                  + (h.practice ? h.practice.length : 0) + ' 个热区，应该 6 个）');
  if (h.practice.filter(p=>p.locked).length !== 3)
    throw new Error('锁定状态没读对：应该 3 个锁着');
  // 不能和「开始」按钮叠在一起，否则点哪个都是同一个
  for (const p of h.practice){
    const r = h.start;
    if (r && !(p.x+p.w<=r.x || r.x+r.w<=p.x || p.y+p.h<=r.y || r.y+r.h<=p.y))
      throw new Error('练习关热区和「开始」按钮重叠，第 ' + p.lv + ' 关');
  }

  const tap = (r) => globalThis.__touch({ touches:[{ clientX:r.x+r.w/2, clientY:r.y+r.h/2 }] });

  // 锁着的：点下去必须什么都不发生（也不能穿透到「开始」）
  const before = game.gameState;
  tap(h.practice.find(p=>p.locked));
  if (game.gameState !== before)
    throw new Error('点了锁着的关卡，状态却变了（gameState=' + game.gameState + '）');

  // 解锁的：点第 3 关，应该直接进第 3 关
  tap(h.practice.find(p=>p.lv===3 && !p.locked));
  if (game.level !== 3)
    throw new Error('点了练习第 3 关，实际进了第 ' + game.level + ' 关');
  if (game.gameState !== 'playing')
    throw new Error('点了练习关没进入游戏（gameState=' + game.gameState + '）');

  ok('练习关（6 个热区 / 3 个锁着 / 点第 3 关直接进第 3 关 / 锁着的点不动）');
} catch(e){ fail('练习关', e); }
finally {
  try { el('levelSel').classList.add('hidden'); } catch(e){}
  try { shim.env.localStorage.setItem('doudou.reached', '1'); } catch(e){}
  game.gameState = stateBeforePractice;
}

/* 滑动必须在**手指还没抬起来**的时候就转向。

   原来只在 onTouchEnd 里判定：一次滑动手势 100~250ms，而玩家 5.4~6.9 格/秒，
   手还没离开屏幕人就越过路口约一格，转角辅助只救得了 0.45 格 —— 这就是
   "滑动没有方向键好控制"的全部原因。所以这条测的不是"能不能转向"，而是
   "**在 touchmove 阶段**转没转向"，只在 end 之后断言的话，退回旧写法照样是绿的。 */
const stateBeforeSwipe = game.gameState;
try {
  el('startOverlay').classList.add('hidden');
  el('pauseOverlay').classList.add('hidden');
  el('overOverlay').classList.add('hidden');
  game.gameState = 'playing';

  const dirOf = () => JSON.stringify(game.player.want);
  const swipe = (dx, dy) => {
    globalThis.__touch({ touches:[{ clientX:200, clientY:600 }] });
    globalThis.__touchMove({ touches:[{ clientX:200+dx, clientY:600+dy }] });
  };

  // 阈值以内不该转向（那是点击，不是滑动）
  game.requestDir('right');
  swipe(10, 0);
  if (dirOf() !== JSON.stringify({x:1,y:0}))
    throw new Error('10px 的位移就转向了，点击会被误判成滑动');
  globalThis.__touchEnd({ changedTouches:[{ clientX:210, clientY:600 }] });

  // 过阈值：**还没抬手**就必须已经转向
  swipe(0, 60);
  const afterMove = dirOf();
  globalThis.__touchEnd({ changedTouches:[{ clientX:200, clientY:660 }] });
  if (afterMove !== JSON.stringify({x:0,y:1}))
    throw new Error('滑过阈值后、抬手之前没有转向（want=' + afterMove
                  + '）—— 判定又回到 touchend 了，手感会比方向键慢一格');

  // 一路连划：不抬手继续往另一个方向划，应该再转一次
  globalThis.__touch({ touches:[{ clientX:200, clientY:600 }] });
  globalThis.__touchMove({ touches:[{ clientX:200, clientY:660 }] });
  globalThis.__touchMove({ touches:[{ clientX:140, clientY:660 }] });
  const chained = dirOf();
  globalThis.__touchEnd({ changedTouches:[{ clientX:140, clientY:660 }] });
  if (chained !== JSON.stringify({x:-1,y:0}))
    throw new Error('按着不放连续划第二个方向没生效（want=' + chained
                  + '）—— 起点没重置，连划会失效');

  /* 手势被系统打断（下拉通知栏那类）时微信发的是 onTouchCancel，**不会**再发
     touchend。不清状态的话，下一次 touchmove 会拿上一次那个陈旧的起点去算
     位移，很可能判出一个玩家根本没做的转向 —— "我明明没滑它自己拐了"，
     这种最难复现也最恼人。 */
  if (typeof globalThis.__touchCancel !== 'function')
    throw new Error('没接 onTouchCancel，被打断的手势会留下陈旧起点');
  game.requestDir('right');
  globalThis.__touch({ touches:[{ clientX:200, clientY:600 }] });
  globalThis.__touchCancel({});
  // 取消之后再动手指：起点已清，不该判出任何转向
  globalThis.__touchMove({ touches:[{ clientX:200, clientY:700 }] });
  if (dirOf() !== JSON.stringify({x:1,y:0}))
    throw new Error('取消手势后仍然转向了（want=' + dirOf() + '）—— 起点没清干净');

  ok('滑动：过阈值即转向（不等抬手）／10px 不误触／按住可连划／被打断不误判');
} catch(e){ fail('滑动手感', e); }
finally { game.gameState = stateBeforeSwipe; }

/* 所有命中区都得够手指点，而且彼此不许叠。

   苹果和微信的建议都是 44×44pt。HUD 那两个图标画出来只有 28 —— 照着画的大小
   做热区，手指粗一点就点不中，而这种问题不会报错、截图上也看不出来。
   另一半同样重要：撑热区最容易撑过头，两个叠在一起就变成"点哪个都是同一个"，
   那比太小更糟，因为它看起来完全正常。所以两条一起测。 */
const stateBeforeTap = game.gameState;
try {
  const MIN = 44;
  el('startOverlay').classList.remove('hidden');
  el('pauseOverlay').classList.add('hidden');
  el('overOverlay').classList.add('hidden');
  shim.env.localStorage.setItem('doudou.reached', '4');
  const sel = el('levelSel');
  sel.classList.remove('hidden');
  sel.innerHTML = [1,2,3,4].map(i=>`<button class="lv" data-lv="${i}">${i}</button>`).join('')
                + [5,6].map(i=>`<button class="lv" data-lv="${i}" disabled>🔒</button>`).join('');
  el('startBoard').innerHTML = '<div class="board-row"><span>1</span><span>豆豆</span><span>1</span></div>';

  const hud = ui.drawHud();
  const ov  = ui.drawOverlays(0);
  const rects = [];
  const add = (name, r) => { if (r && Number.isFinite(r.w)) rects.push({ name, r }); };
  add('HUD「?」', hud.help); add('HUD暂停', hud.pause);
  add('开始', ov.start); add('玩法说明', ov.help); add('关于入口', ov.about);
  (ov.practice || []).forEach(p => add('练习' + p.lv, p));

  const small = rects.filter(x => Math.min(x.r.w, x.r.h) < MIN)
                     .map(x => `${x.name} ${Math.round(x.r.w)}×${Math.round(x.r.h)}`);
  if (small.length) throw new Error('热区不足 44：' + small.join('　'));

  const over = [];
  for (let i=0;i<rects.length;i++) for (let j=i+1;j<rects.length;j++){
    const a=rects[i].r, b=rects[j].r;
    if (!(a.x+a.w<=b.x || b.x+b.w<=a.x || a.y+a.h<=b.y || b.y+b.h<=a.y))
      over.push(rects[i].name + '↔' + rects[j].name);
  }
  if (over.length) throw new Error('热区互相重叠，点哪个都是同一个：' + over.join('　'));

  ok(`命中区（${rects.length} 个，最小 `
     + Math.round(Math.min(...rects.map(x=>Math.min(x.r.w,x.r.h)))) + '，无重叠）');
} catch(e){ fail('命中区大小', e); }

/* 迷宫那块离屏画布必须按**它最终显示的大小**分配像素。

   核心加载时会把画布设成逻辑坐标系的 494×546，在那之后不再调整的话，
   drawImage 会把它放大到 boardW×DPR —— dpr3 的手机上是在 1107 像素宽的位置
   显示 494 像素的内容，**放大 2.2 倍，整张迷宫是糊的**。
   这种糊在模拟器上（dpr 常常是 1）根本看不出来，只有真机才暴露。 */
try {
  const L = globalThis.__test.layout;
  const cap = Math.min(L.DPR || 2, 2);
  const wantW = Math.round(L.boardW * cap), wantH = Math.round(L.boardH * cap);
  const c = globalThis.__test.mazeCanvas;
  if (!c) throw new Error('__test 没有挂出 mazeCanvas');
  if (Math.abs(c.width - wantW) > 1 || Math.abs(c.height - wantH) > 1)
    throw new Error(`迷宫画布 ${c.width}×${c.height}，按显示大小×dpr(上限2) 应当是 ${wantW}×${wantH}`
                  + ` —— 差这么多就是在放大模糊的图`);
  ok(`迷宫画布分辨率（${c.width}×${c.height}，显示 ${Math.round(L.boardW)}×${Math.round(L.boardH)}）`);
} catch(e){ fail('迷宫画布分辨率', e); }

/* 今晚在小程序版补的几处，这一版（**才是上架要提交的那个**）同样要有。
   README 里写得很清楚：小游戏是小程序的一个类目，注册时选定不可逆，普通
   小程序放游戏内容会因"类目与内容不符"被驳回 —— 所以这一版才是终点。 */
try {
  // 一、被打断要暂停并说明原因
  if (typeof globalThis.__audioBreak !== 'function')
    throw new Error('没有注册 onAudioInterruptionBegin，来电时游戏会继续跑');
  /* drawOverlays 的判断顺序是 说明 → 关于 → 开始 → 暂停，前面的用例把开始页
     留成打开状态的话，画出来的就是开始页 —— 第一版就是这么误报的。先都关掉。 */
  for (const id of ['helpOverlay','aboutOverlay','startOverlay','overOverlay']){
    el(id).classList.add('hidden');
  }
  if (game.gameState !== 'playing'){ el('startBtn').dispatch('click', {}); }
  globalThis.__audioBreak();
  if (game.gameState !== 'paused') throw new Error('来电打断没有暂停');
  const pauseTxt = (() => { rec.__rec.length = 0; rec.__recOn = true;
                            ui.drawOverlays(0); rec.__recOn = false;
                            return rec.__rec.map(r => r.t).join(''); })();
  if (!/电话|语音/.test(pauseTxt))
    throw new Error('暂停页没说明是被打断的：' + pauseTxt.slice(0, 60));

  // 二、挑战能从启动参数进来
  if (typeof game.setChallenge !== 'function') throw new Error('core 没导出 setChallenge');

  // 三、分享带上挑战
  el('overOverlay').classList.remove('hidden');
  el('finalScore').textContent = '50,000';
  const sc = globalThis.__test.shareContent();
  el('overOverlay').classList.add('hidden');
  if (!/c=50000/.test(sc.query || ''))
    throw new Error('分享的 query 没带挑战分数：' + JSON.stringify(sc.query));
  /* 分享图必须自己给。不给的话微信拿**当前这一帧**去截图 —— 发出去的可能是
     一张暂停页、一张开始页，甚至是死掉的瞬间。分享是这游戏唯一的传播途径，
     那张图就是第一印象，不该交给运气。 */
  if (!sc.imageUrl) throw new Error('分享没有 imageUrl，微信会拿当前帧去截图');
  if (!existsSync(here('../' + sc.imageUrl)))
    throw new Error('分享图文件不存在：' + sc.imageUrl);

  // 四、连击快断要变红
  el('comboFill').classList.add('urgent');
  el('comboFill').style.width = '20%';
  let painted = false;
  const realFill = rec.fillStyle;
  ui.drawHud();
  el('comboFill').classList.remove('urgent');
  // 只要代码路径走到了 urgent 分支就算过（假 ctx 记不下颜色）
  const uiSrc = readFileSync(here('../js/ui.js'), 'utf8');
  if (!/classList\.contains\('urgent'\)/.test(uiSrc))
    throw new Error('HUD 没有读 urgent，连击快断时不会变红');

  /* 挑战要在**热启动**时也能进来。getLaunchOptionsSync 只反映冷启动那一次；
     游戏已经在内存里时，别人分享的链接点进来走的是 onShow(res)，query 在那儿。
     "已经玩过一次、后来收到朋友挑战"恰恰是最常见的路径，漏掉它等于挑战功能
     对老玩家不生效 —— 而这不会报任何错。 */
  if (typeof globalThis.__onShow !== 'function')
    throw new Error('没有注册 wx.onShow，热启动进来的挑战会丢');
  el('challengeBox').classList.add('hidden');
  el('challengeBox').innerHTML = '';
  globalThis.__onShow({ query: { c: '77777', n: '热启动' } });
  const box = el('challengeBox');
  if (box.classList.contains('hidden') || !/77,?777/.test(box.innerHTML || ''))
    throw new Error('热启动的挑战没生效：' + JSON.stringify(box.innerHTML));
  game.setChallenge(0, '');

  ok('与小程序版对齐（打断说明 / 挑战冷热启动 / 分享带挑战 / 连击快断变红）');
} catch(e){ fail('与小程序版对齐', e); }

/* 内存告警要真的放掉东西。
   小游戏跑在别人手机上，低端机内存告警是常事 —— 收到却什么都不做，下一步就是
   被系统杀掉，玩家看到的是"闪退"，还完全不知道为什么。
   而"注册了回调"和"回调里真的释放了"是两件事：只注册不释放，审核和自测都
   看不出区别，只有内存真紧张的那台手机会崩。 */
try {
  if (typeof globalThis.__memWarn !== 'function')
    throw new Error('没有注册 onMemoryWarning，内存吃紧时只能等着被系统杀');
  if (typeof game.releaseCaches !== 'function')
    throw new Error('core 没导出 releaseCaches，注册了回调也没东西可放');

  // 先让烟花贴图生成出来，再看告警之后是不是真放掉了
  game.releaseCaches();
  const before = globalThis.__gc || 0;
  globalThis.__memWarn({ level: 10 });
  if ((globalThis.__gc || 0) <= before)
    throw new Error('收到告警没有调 triggerGC');

  ok('内存告警（注册了 / 放得掉缓存 / 触发 GC）');
} catch(e){ fail('内存告警', e); }

/* 安全区计算必须扛得住残缺的宿主数据。

   原来是直接 `info.windowHeight - info.safeArea.bottom` —— 只要 windowHeight
   这一个字段缺了，结果就是 NaN，一路传进 bottomInset → usable → boardH，
   棋盘尺寸变 NaN，屏幕上什么都画不出来。**不报错、不崩溃，就是一片黑。**
   机型和基础库版本千奇百怪，"这个字段一定有"是最不该做的假设。

   调的是 game.js 里那个真函数（insetsFrom 是纯的，专为此拆出来）——
   另抄一份逻辑来测，测得再绿也只能说明抄的那份是对的。 */
try {
  const f = globalThis.__test.insetsFrom;
  if (typeof f !== 'function') throw new Error('__test 没挂出 insetsFrom');
  const cap = { width:87, left:278, top:48, bottom:80 };
  const cases = [
    ['字段齐全',        { safeArea:{top:44,bottom:778}, windowHeight:812, statusBarHeight:44 }],
    ['缺 windowHeight', { safeArea:{top:44,bottom:778}, statusBarHeight:44 }],
    ['缺 safeArea',     { windowHeight:812, statusBarHeight:20 }],
    ['safeArea 空对象', { safeArea:{}, windowHeight:812 }],
    ['info 为 null',    null],
    ['字段是字符串',    { safeArea:{top:'44',bottom:'778'}, windowHeight:'812' }],
    ['safeArea.bottom 缺', { safeArea:{top:44}, windowHeight:812 }],
  ];
  const bad = [];
  for (const [name, info] of cases){
    const r = f(info, cap, 375);
    for (const [k, v] of Object.entries(r)){
      if (!Number.isFinite(v)) bad.push(`${name} 的 ${k}=${v}`);
    }
  }
  // 胶囊数据本身残缺时也不能坏
  for (const badCap of [null, {}, { width:'87' }, { width:87, left:NaN }]){
    const r = f({ safeArea:{top:44,bottom:778}, windowHeight:812 }, badCap, 375);
    for (const [k, v] of Object.entries(r)){
      if (!Number.isFinite(v)) bad.push(`胶囊=${JSON.stringify(badCap)} 时 ${k}=${v}`);
    }
  }
  if (bad.length) throw new Error('这些输入算出了非有限数（会黑屏）：' + bad.join('；'));
  ok(`安全区计算扛得住残缺数据（${cases.length} 种 info + 4 种胶囊，全部有限）`);
} catch(e){ fail('安全区容错', e); }

/* 任何一次触摸都要顺手解锁音频。
   WebAudio 在多数宿主里要等一次用户手势才肯出声。此前只在「练习关」那个分支里
   解锁过 —— 走主流程（点开始直接玩）的人一次都碰不到那行。真出问题的话是
   **整局无声**，而且不报任何错、不崩溃，自测时很容易以为"是我手机静音了"。 */
try {
  let unlocked = 0;
  const A = game.Audio2;
  const real = A.unlock;
  A.unlock = function(){ unlocked++; return real.apply(this, arguments); };
  globalThis.__touch({ touches:[{ clientX:200, clientY:600 }] });
  globalThis.__touchEnd({ changedTouches:[{ clientX:200, clientY:600 }] });
  A.unlock = real;
  if (!unlocked) throw new Error('触摸没有解锁音频 —— 走主流程的玩家可能整局无声');
  ok('触摸即解锁音频（不再只依赖练习关那一个分支）');
} catch(e){ fail('音频解锁', e); }
finally {
  try { el('levelSel').classList.add('hidden'); } catch(e){}
  try { shim.env.localStorage.setItem('doudou.reached', '1'); } catch(e){}
  game.gameState = stateBeforeTap;
}

/* 「关于这个游戏」自己一页，走新加的 openAbout/closeAbout。
   这条一定要跑真正的绘制路径：这一页是 canvas 逐行画的，而垫片造的假元素
   一向是崩溃的来源（少个方法就直接抛）。开始页上还多画一行可点的署名，
   那段代码在闭包里就地设命中区 —— 画不出来、或者热区小到点不中，
   都不会有任何别的地方报错。 */
/* 入口和暂停要分两段测，因为它们发生在不同状态下：
     入口在**开始页**上，那时游戏还没跑，本来就没有什么可暂停的；
     暂停要在**玩到一半**点进来才有意义。
   合成一段写会得出错误的期望（第一版就是这么错的：在 ready 状态下断言
   "打开关于页会暂停"）。
   后面还有测试指望这里是 playing，所以借来的状态用 finally 还回去 —— 断言
   失败时也要还，不然一条红会连带把后面几条都染红。 */
const stateBeforeAbout = game.gameState;
try {
  el('startOverlay').classList.remove('hidden');
  el('pauseOverlay').classList.add('hidden');
  el('overOverlay').classList.add('hidden');
  const start = ui.drawOverlays(0);
  if (!start.about) throw new Error('开始页没有「我们的故事」入口');
  if (!(start.about.w > 40 && start.about.h > 10))
    throw new Error(`入口热区太小，点不中：${JSON.stringify(start.about)}`);
  // 不能和「开始」「玩法说明」两个按钮叠在一起，否则点哪个都是同一个
  for (const [name, r] of [['开始', start.start], ['玩法说明', start.help]]){
    const a = start.about;
    if (r && !(a.x + a.w <= r.x || r.x + r.w <= a.x || a.y + a.h <= r.y || r.y + r.h <= a.y))
      throw new Error(`「我们的故事」热区和「${name}」按钮重叠`);
  }

  game.openAbout();
  const a = ui.drawOverlays(0);
  if (!a.aboutClose) throw new Error('关于页的「知道了」按钮没生成');
  if (a.helpClose) throw new Error('关于页开着时还在画玩法说明');
  if (a.start) throw new Error('关于页开着时还在画开始页');
  game.closeAbout();
  if (ui.drawOverlays(0).aboutClose) throw new Error('关闭后关于页仍在显示');

  /* 玩到一半点进来：必须暂停，而且关掉之后**停在暂停**、不自动继续。
     这一条和玩法说明是反的（说明关掉会接着打），所以特别容易被"顺手统一"掉：
     读完一段文字抬头，手指未必回到键盘上，直接把幽灵放出来就是白掉一条命。 */
  el('startOverlay').classList.add('hidden');
  game.gameState = 'playing';
  game.openAbout();
  if (game.gameState !== 'paused') throw new Error('玩到一半打开关于页没有暂停');
  game.closeAbout();
  if (game.gameState !== 'paused')
    throw new Error('关掉关于页后自动继续了游戏（应停在暂停），gameState=' + game.gameState);
  if (el('pauseOverlay').classList.contains('hidden'))
    throw new Error('关掉关于页后没有露出暂停页，玩家会看到一个静止的棋盘不知道该点哪');

  ok('关于《豆豆迷宫》（入口热区 ' + Math.round(start.about.w) + 'x' + Math.round(start.about.h)
     + '，不与按钮重叠 / 独占屏幕 / 玩到一半打开会暂停，关掉停在暂停页不自动继续）');
} catch(e){
  fail('关于这个游戏', e);
} finally {
  el('startOverlay').classList.add('hidden');
  game.closeAbout();
  game.gameState = stateBeforeAbout;
}

// 掉命 —— 真机上就是死在这里：掉命会弹 toast，而 toast 用了原生 roundRect
try {
  el('toast').textContent = '测试提示';
  el('toast').classList.add('show');
  ui.drawHud(); ui.drawOverlays();
  // 外壳画 toast 的那段在 game.js 里，这里直接验 ui 暴露的圆角矩形能用
  if (typeof ui.roundRect !== 'function') throw new Error('ui 没有暴露 roundRect 给外壳复用');
  ui.roundRect(10, 10, 100, 28, 14);
  ok('toast 圆角矩形（不走原生 roundRect）');
} catch(e){ fail('toast 绘制', e); }

/* HUD 排版：各列不得重叠，「?」不得被生命图标压住。
   真机截图里出现过「连击」标签重复、生命图标顶到边缘、问号跟它们叠在一起。
   canvas 上画错位不会报任何错，只能靠断言量位置。 */
try {
  // 通关级别的分数 + 攒到很多条命，是最挤的情况
  el('scoreVal').textContent = '1233040';
  el('levelVal').textContent = '6/6';
  el('comboLabel').textContent = '连击 x113';
  el('livesVal').innerHTML = new Array(8).fill('<svg/>').join('');
  const hud = ui.drawHud();
  if (!hud || !hud.help) throw new Error('「?」命中区没生成');
  const L = globalThis.__test.layout;
  if (hud.help.x + hud.help.w > L.W - 8) throw new Error('「?」超出 HUD 右边界');
  if (hud.help.y < L.hudTop) throw new Error('「?」跑到 HUD 上面去了');
  if (hud.help.y + hud.help.h > L.hudTop + L.hudH) throw new Error('「?」超出 HUD 下边界');
  ok('HUD 极限排版（七位分数 + 8 条命 + x113 连击），「?」在 '
     + hud.help.x.toFixed(0) + ',' + hud.help.y.toFixed(0));
  el('scoreVal').textContent = '360';
  el('levelVal').textContent = '1/6';
  el('comboLabel').textContent = '连击 x1';
  el('livesVal').innerHTML = '<svg/><svg/>';
} catch(e){ fail('HUD 排版', e); }

// 分享。真机上那两个按钮灰着写"当前页面未设置分享"，就是漏了 showShareMenu ——
// 只注册 onShareAppMessage 不会让按钮亮起来，两件事都得做。
try {
  const m = globalThis.__shareMenu;
  if (!m) throw new Error('没有调用 wx.showShareMenu，胶囊菜单里的分享按钮会是灰的');
  if (!m.menus || m.menus.indexOf('shareAppMessage') < 0) throw new Error('menus 里缺 shareAppMessage');
  if (m.menus.indexOf('shareTimeline') < 0) throw new Error('menus 里缺 shareTimeline（分享到朋友圈）');
  if (typeof globalThis.__shareCb !== 'function') throw new Error('没有注册 onShareAppMessage');
  const plain = globalThis.__shareCb();
  if (!plain.title) throw new Error('分享标题是空的');
  ok(`分享已开启（${m.menus.join(' + ')}）　默认文案：${plain.title}`);
} catch(e){ fail('分享', e); }

// 分享文案要带上成绩 —— 光一个游戏名没什么点开的理由
try {
  el('scoreVal').textContent = '43210';
  const s1 = globalThis.__test.shareContent();
  if (s1.title.indexOf('43210') < 0) throw new Error('有分数时标题没带上：' + s1.title);
  el('overTitle').textContent = '通关！全 6 关';
  el('overOverlay').classList.remove('hidden');
  const s2 = globalThis.__test.shareContent();
  if (s2.title.indexOf('通关') < 0) throw new Error('通关时标题没体现：' + s2.title);
  el('overOverlay').classList.add('hidden');
  ok(`分享文案随成绩变化：「${s1.title}」/「${s2.title}」`);
} catch(e){ fail('分享文案', e); }

// 存档：写一条成绩再读回来
try {
  const before = game.loadScores().length;
  game.recordScore({ score: 12345, level: 3, combo: 7, won: false, name: '冒烟测试' });
  const after = game.loadScores();
  if (after.length !== before + 1) throw new Error(`写入后条数 ${before} -> ${after.length}`);
  if (!after.some(r => r.name === '冒烟测试')) throw new Error('名字没存进去');
  ok(`排行榜存档：写入并读回成功（共 ${after.length} 条，走的是 wx.setStorageSync）`);
} catch(e){ fail('排行榜存档', e); }

/* 真死一局，把 endGame 整条路径跑一遍。
   这是最该盯死的一条路：玩家报过的"死一条命后直接黑屏"，根子就是 endGame
   里某一步在真机上抛了异常（当时是 roundRect 的参数），而异常一抛，整个
   渲染循环就停在黑屏上。只调 recordScore 是绕开了这条路径的。 */
try {
  const before = game.gameState;
  for (let i = 0; i < 4000 && game.gameState === 'playing'; i++){
    for (const gh of game.ghosts){
      if (gh.state === 'chase' || gh.state === 'scatter'){ gh.x = game.player.x; gh.y = game.player.y; }
    }
    game.update(1/60);
  }
  if (game.gameState !== 'over') throw new Error(`撞不死，gameState=${game.gameState}（进来时 ${before}）`);
  // 结算画面还要能画出来，不能一画就炸
  game.render();
  const title = el('overTitle').textContent;
  if (!title) throw new Error('结算标题是空的');
  ok(`死到结算并画出结算页（「${title}」，${el('finalScore').textContent} 分）`);
} catch(e){ fail('结算路径', e); }

// 音效：小游戏用 wx.createWebAudioContext，别在这里炸
try { game.Audio2.unlock(); game.Audio2.eatPellet && game.Audio2.eatPellet(); ok('音效引擎（wx WebAudio）'); }
catch(e){ fail('音效引擎', e); }

console.log(process.exitCode ? '\n冒烟测试有失败项。' : '\n冒烟测试全部通过。');
