/* 让网页版的游戏脚本能在微信小游戏里原样运行的适配层。
 *
 * 为什么是"垫片"而不是重写：网页版那 1642 行里，真正碰 DOM 的只有 22 个
 * 元素 id、7 处 localStorage、1 处 getComputedStyle、click 和 keydown。逻辑
 * 部分——迷宫、移动、幽灵 AI、计分——一行都不依赖浏览器。手抄一遍等于凭空
 * 造出第二份会各自漂移的实现：网页版改了难度，小游戏版还是旧的，两边永远
 * 对不上。所以这里把那一小片 DOM 表面补出来，核心脚本由 build.mjs 从
 * pacman_fragment.html 机械提取，两边永远同源。
 *
 * 垫片里的元素不渲染任何东西，只是状态容器；ui.js 每帧读它们，把 HUD 和
 * 弹层画到 canvas 上。小游戏没有 DOM，界面只能画出来。
 */

const PALETTE = {
  '--void': '#0a0612', '--void-deep': '#050308',
  '--panel': '#130b26', '--panel-border': '#2f2058',
  '--wall': '#8a6bff', '--wall-core': '#4b2fce',
  '--amber': '#ffcf5c', '--amber-glow': 'rgba(255,207,92,.55)',
  '--danger': '#ff4d6d', '--pink': '#ff8fd0', '--tang': '#ffa552',
  '--cyan': '#5be3ff', '--text': '#ece7fb', '--text-dim': '#9c8fc9',
  '--mega': '#ffffff',
};

class ClassList {
  constructor(owner){ this.owner = owner; this.set = new Set(); }
  add(c){ this.set.add(c); }
  remove(c){ this.set.delete(c); }
  contains(c){ return this.set.has(c); }
  toggle(c, force){
    const want = force === undefined ? !this.set.has(c) : !!force;
    if (want) this.set.add(c); else this.set.delete(c);
    return want;
  }
}

class El {
  constructor(id){
    this.id = id;
    this._text = '';
    this._html = '';
    this.value = '';
    this.classList = new ClassList(this);
    this.style = {};
    this.listeners = {};
  }
  get textContent(){ return this._text; }
  set textContent(v){ this._text = String(v); }
  get innerHTML(){ return this._html; }
  set innerHTML(v){ this._html = String(v); this._text = stripTags(this._html); }
  addEventListener(type, fn){ (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn){
    const l = this.listeners[type]; if (!l) return;
    const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1);
  }
  dispatch(type, ev){ (this.listeners[type] || []).forEach(fn => fn(ev || {})); }
  /* 真 DOM 上 click() 会派发 click 事件。逻辑里的 Enter 快捷键就是靠
     btn.click() 复用按钮已有的处理器 —— 少了它，那条路径在这个垫片下会抛
     "click is not a function"。微信端虽然不产生键盘事件，但共享同一份逻辑，
     缺了这个方法就等于埋一颗只在某些路径上才炸的雷。 */
  click(){ this.dispatch('click', {}); }
  focus(){}
  querySelectorAll(){ return []; }
  getBoundingClientRect(){ return { width: this.width || 0, height: this.height || 0, left:0, top:0 }; }
  /**
   * The web build attaches its swipe handlers to the maze canvas's parent, so
   * every element needs a parent that at least accepts listeners. Returning a
   * shared stage stub keeps that code loading; the listeners registered on it
   * are simply never fired, because the WeChat build feeds direction from
   * wx.onTouchStart / wx.onTouchEnd in game.js instead.
   */
  get parentElement(){ return (El._stage ||= new El('__stage')); }
  get parentNode(){ return this.parentElement; }
  appendChild(c){ return c; }
  removeChild(c){ return c; }
  contains(){ return false; }
  setAttribute(k, v){ (this._attrs ||= {})[k] = String(v); }
  getAttribute(k){ return (this._attrs || {})[k] ?? null; }
  removeAttribute(k){ delete (this._attrs ||= {})[k]; }
  hasAttribute(k){ return k in (this._attrs || {}); }
  /** Used to flip the mute icon's two line groups; must exist or the game
   *  throws while painting the HUD, which on WeChat is a blank screen. */
  toggleAttribute(k, force){
    const want = force === undefined ? !this.hasAttribute(k) : !!force;
    if (want) this.setAttribute(k, ''); else this.removeAttribute(k);
    return want;
  }
}

/** innerHTML is used for the leaderboard and the score breakdown; the canvas UI
 *  needs the words without the markup, and <br> has to survive as a line break. */
function stripTags(html){
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function makeCanvasEl(id, canvas){
  const el = new El(id);
  el._canvas = canvas;
  el.getContext = (t) => canvas.getContext(t);
  Object.defineProperty(el, 'width',  { get:()=>canvas.width,  set:v=>{ canvas.width = v; } });
  Object.defineProperty(el, 'height', { get:()=>canvas.height, set:v=>{ canvas.height = v; } });
  return el;
}

/** 取屏幕像素比。IDE 刚启动时 jsbridge 可能还没就绪，getSystemInfoSync 会失败，
 *  拿不到就退回 1 —— 为了一个缩放系数让整个垫片崩掉不值得。 */
function dpr(){
  try { return wx.getSystemInfoSync().pixelRatio || 1; } catch (e) { return 1; }
}

/**
 * @param {object} canvases  { maze, fx } — real wx canvases created by the caller
 * @returns the shimmed globals, so ui.js and input.js can read the same elements
 */
function installShim(canvases){
  const els = new Map();
  const el = (id) => {
    if (!els.has(id)) {
      els.set(id, id === 'mazeCanvas' ? makeCanvasEl(id, canvases.maze)
                : id === 'fxCanvas'   ? makeCanvasEl(id, canvases.fx)
                : new El(id));
    }
    return els.get(id);
  };
  // pre-create so ui.js can hold references before the game script runs
  ['mazeCanvas','fxCanvas','scoreVal','levelVal','livesVal','comboLabel','comboFill',
   'toast','startOverlay','pauseOverlay','overOverlay','helpOverlay','aboutOverlay','overTitle','overSub',
   'finalScore','startBtn','restartBtn','resumeBtn','pauseBtn','muteBtn','helpBtn',
   'helpCloseBtn','padBtn','nameRow','nameInput','nameSaveBtn'].forEach(el);

  /**
   * These carry class="overlay hidden" in the web markup — they start closed.
   * The shim invents its elements from nothing and so misses that initial
   * class, leaving every one of them reading as "currently showing". ui.js
   * picks the first non-hidden overlay to draw, so the pause screen would
   * appear over the board the moment the start screen was dismissed.
   */
  ['pauseOverlay','overOverlay','helpOverlay','aboutOverlay','nameRow'].forEach(id => el(id).classList.add('hidden'));

  const doc = {
    documentElement: { style:{} },
    /* 逻辑用 document.body.classList 来切"开打时收起标题"这个状态。
       垫片里没有 body 的话，那一句每帧都会抛 —— 而它在 render() 里，
       等于游戏一开打就崩。这里的 body 不渲染任何东西，只是接住 classList。 */
    body: new El('body'),
    getElementById: el,
    /**
     * Returns a stand-in element for any selector rather than null. The web
     * build looks up containers by class (`.cabinet`, `.overlay`) to toggle
     * layout state; handing back null makes the very next `.classList` throw
     * during startup, which on WeChat shows as a blank screen with no clue.
     * A stub absorbs those calls — the mini game draws its own UI, so the
     * class flags it records are simply never read.
     */
    querySelector: (sel) => {
      if (sel.includes('overlay')) return el('startOverlay');
      return el('__q:' + sel);
    },
    querySelectorAll: (sel) => {
      if (sel.includes('overlay')) return [el('startOverlay'), el('pauseOverlay'), el('overOverlay')];
      if (sel.includes('dpad')) return [];
      return [];
    },
    addEventListener(){}, removeEventListener(){},
    createElement(){ return new El('detached'); },
    hidden: false, visibilityState: 'visible',
  };

  const storage = {
    getItem(k){ try { const v = wx.getStorageSync(k); return v === '' ? null : v; } catch { return null; } },
    setItem(k, v){ try { wx.setStorageSync(k, String(v)); } catch {} },
    removeItem(k){ try { wx.removeStorageSync(k); } catch {} },
  };

  const win = GameGlobal;

  /**
   * 往全局上挂东西必须用这个，不能直接赋值。
   *
   * 新版基础库（3.17 起）把 GameGlobal 上的 window / document 定义成了
   * **只读的 getter**，直接赋值会抛
   *   TypeError: Cannot set property window of #<Window> which has only a getter
   * 而这句在垫片最前面，一抛整个游戏就死在加载阶段 —— 一片黑屏。
   * 基础库版本一变行为就变，所以不假设任何一个键可写。
   *
   * 返回**最终生效的那个值**：可能是我们的，也可能是宿主原来那个（替换失败时）。
   * 调用方必须看这个返回值，不能想当然以为自己那份装上了。
   */
  function put(key, value){
    if (win[key] === value) return value;
    try {
      win[key] = value;
      if (win[key] === value) return value;
    } catch (e) { /* 只读属性，往下试 */ }
    try {
      Object.defineProperty(win, key, { value, writable: true, configurable: true });
      if (win[key] === value) return value;
    } catch (e) { /* 锁死了 */ }
    return win[key];
  }

  /**
   * 装不上就把方法补到宿主那个对象上。
   *
   * 这是踩出来的：基础库自带一个 document 桩，但那份**没有 getElementById**。
   * put() 替换不掉它（只读），原先的兜底注释写着"锁死了就用宿主自己那份"——
   * 想当然地以为宿主那份是能用的。结果是游戏加载时炸在
   *   TypeError: document.getElementById is not a function
   * 替换不了不等于该让步；把缺的方法直接补到那个对象上就行，它是可写的。
   */
  function putObject(key, ours){
    const active = put(key, ours);
    if (active === ours) return ours;          // 换成功了，不用管
    if (!active || typeof active !== 'object') return ours;
    // 换不掉：把我们这份的每一项都盖上去。宿主那个 document 对小游戏而言
    // 没有任何实际用途（没有真的 DOM），覆盖它不会弄坏什么，而漏掉一个
    // 方法就是一次加载即崩。
    for (const k of Object.keys(ours)){
      try { active[k] = ours[k]; } catch (e) { /* 该项只读，只能跳过 */ }
    }
    return active;
  }

  // 逻辑里有四处直接写了 window.（AudioContext、matchMedia、devicePixelRatio、
  // addEventListener）。新基础库已经自带 window，那就正好不用管。
  put('window', win);
  const activeDoc = putObject('document', doc);
  put('devicePixelRatio', dpr());
  putObject('localStorage', storage);
  put('getComputedStyle', () => ({
    getPropertyValue: (name) => PALETTE[name] || '',
  }));
  // wx exposes a Web-Audio-compatible context; the game only uses oscillators
  // and gain nodes, which it supports. Wrapped as a constructor because the
  // game does `new AC()`.
  //
  // The nodes are additionally wrapped so connect() always returns its
  // destination. The game chains `osc.connect(g).connect(ac.destination)`, which
  // the Web Audio spec supports — but that return value is easy for a host
  // implementation to omit, and if it is missing every sound in the game throws
  // instead of playing. Guaranteeing it here costs nothing and cannot regress.
  put('AudioContext', function(){
    const ac = wx.createWebAudioContext();
    const chainable = (n) => {
      if (!n || n.__chained) return n;
      const orig = n.connect && n.connect.bind(n);
      if (orig) n.connect = (dst, ...rest) => { const r = orig(dst, ...rest); return r || dst; };
      n.__chained = true;
      return n;
    };
    for (const m of ['createOscillator','createGain','createBiquadFilter']){
      if (typeof ac[m] === 'function'){
        const orig = ac[m].bind(ac);
        ac[m] = (...a) => chainable(orig(...a));
      }
    }
    return ac;
  });
  put('matchMedia', () => ({ matches:false, addEventListener(){}, removeEventListener(){} }));
  // 这两个只在宿主没提供时才补：新基础库自带，硬盖掉可能弄坏它自己的事件派发
  if (typeof win.addEventListener !== 'function') put('addEventListener', () => {});
  if (typeof win.removeEventListener !== 'function') put('removeEventListener', () => {});

  let onFrameError = null;

  /* env 是给核心逻辑用的一整套浏览器全局。核心把它们声明成局部变量，
     从而彻底绕开宿主那些只读的 window / document —— 装不装得上全局都无所谓了。
     全局那边照旧尽力装，是为了万一有别的代码按老办法访问。 */
  const env = {
    document: doc,            // 一定是我们这份，不是宿主那个残缺的
    window: win,
    localStorage: storage,
    getComputedStyle: () => ({ getPropertyValue: (name) => PALETTE[name] || '' }),
    /* 每个 rAF 回调都包一层。核心自己那条循环是
         function loop(t){ update(); render(); requestAnimationFrame(loop); }
       —— update 或 render 一抛异常，最后那句就执行不到，循环从此断掉，
       画面定格在最后一帧，而且不留任何痕迹。这里抓住它并上报，
       让外壳能把错误画到屏幕上。 */
    requestAnimationFrame: (fn) => win.requestAnimationFrame((t) => {
      try { fn(t); }
      catch (err) { if (onFrameError) onFrameError(err); else throw err; }
    }),
    /** 外壳用它注册"帧内出错"的处理函数 */
    onFrameError(handler){ onFrameError = handler; },
    cancelAnimationFrame: (id) => win.cancelAnimationFrame && win.cancelAnimationFrame(id),
    performance: win.performance || { now: () => Date.now() },
  };

  return { doc, env, el, els, PALETTE, stripTags };
}

module.exports = { installShim, PALETTE, stripTags };
