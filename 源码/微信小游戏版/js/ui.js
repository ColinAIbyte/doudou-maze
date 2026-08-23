/* 把 HUD 和弹层画到 canvas 上。
 *
 * 小游戏没有 DOM，网页版那些 <div> 一个都用不了。但游戏逻辑照旧往垫片里的
 * 元素上写 textContent / innerHTML / classList——这里每帧读那些元素的状态，
 * 再画出来。好处是逻辑那 1600 行完全不用动：它以为自己还在操作 DOM。
 *
 * 文案一律用垫片 stripTags 之后的纯文本，所以排行榜和结算明细里的 <br> 会变成
 * 换行，画的时候按行拆。
 */
const { PALETTE } = require('./shim.js');

const C = PALETTE;
const FONT = (px, bold) => `${bold ? 'bold ' : ''}${px}px sans-serif`;

function createUI(ctx, el, layout){
  const { W, H, hudTop, hudH, hudBottom, boardX, boardY, boardW, boardH,
          padH, bottomInset, capsuleLeft } = layout;

  function roundRect(x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y,   x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x,   y+h, r);
    ctx.arcTo(x,   y+h, x,   y,   r);
    ctx.arcTo(x,   y,   x+w, y,   r);
    ctx.closePath();
  }

  /* 把命中区撑到至少 44×44，视觉尺寸不动。
     苹果和微信的建议都是 44pt；HUD 那两个图标画出来只有 28，直接照着画的大小
     做热区，手指粗一点就点不中。撑的时候要留意别和邻居叠上 —— 叠上比太小更糟，
     因为点哪个都是同一个，而看起来完全正常。smoke 里有一条专门查重叠。 */
  const TAP_MIN = 44;
  function tap(r, minW, minH){
    const w = Math.max(r.w, minW || TAP_MIN), h = Math.max(r.h, minH || TAP_MIN);
    return { x: r.x + (r.w - w)/2, y: r.y + (r.h - h)/2, w, h };
  }

  /* 暂停原因由外壳（game.js）设置：它才知道这次暂停是玩家按的还是被打断的。
     默认空串 —— 空的时候 drawOverlay 的 body 传 null，那一块整个不画。 */
  let pauseReason = '';
  function pauseReasonText(){ return pauseReason; }

  function drawHud(){
    /* 整条 HUD 从 hudTop 开始 —— 那是刘海和微信胶囊按钮的下沿。
       胶囊是微信自己画的，盖不住也移不动，只能让开。 */
    const pad = 8;
    const boxY = hudTop;
    const boxH = hudH - 6;
    ctx.fillStyle = C['--panel'];
    roundRect(pad, boxY, W - pad*2, boxH, 12); ctx.fill();
    ctx.strokeStyle = C['--panel-border']; ctx.lineWidth = 1; ctx.stroke();

    /* 先把「?」的位置定下来，四项数值再在剩下的宽度里分。
       反过来做就会像上一版那样：数值按比例铺满，「?」只能硬塞进去，
       结果跟生命图标叠在一起。 */
    const helpSize = Math.min(28, boxH - 14);
    const help = { x: W - pad - 10 - helpSize, y: boxY + (boxH - helpSize)/2,
                   w: helpSize, h: helpSize };
    /* 暂停挪到 HUD 里，排在「?」左边。
       它原本嵌在方向键正中，而方向键 2026-08-21 整个去掉了 —— 不在这儿补一个，
       手机上就只剩"打完这局"一种停下来的办法。 */
    // 间隙从 8 拉到 18：两个 28 的图标各撑到 44 要吃掉 16，留 2px 余量
    const pause = { x: help.x - 18 - helpSize, y: help.y, w: helpSize, h: helpSize };

    const innerL = pad + 14;
    const innerR = pause.x - 12;
    const span = Math.max(120, innerR - innerL);

    // 分数最长（通关能到七位数），给的份额也最大
    const colScore = innerL;
    const colCombo = innerL + span * 0.30;
    const colLevel = innerL + span * 0.585;
    const colLives = innerL + span * 0.775;

    const yLabel = boxY + 15;
    const yValue = boxY + 36;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    ctx.fillStyle = C['--text-dim']; ctx.font = FONT(10);
    ctx.fillText('分数', colScore, yLabel);
    ctx.fillText('连击', colCombo, yLabel);
    ctx.fillText('关卡', colLevel, yLabel);
    ctx.fillText('生命', colLives, yLabel);

    ctx.fillStyle = C['--text']; ctx.font = FONT(18, true);
    ctx.fillText(el('scoreVal').textContent || '0', colScore, yValue);
    ctx.fillText(el('levelVal').textContent || '1/6', colLevel, yValue);

    /* 连击只显示倍率。逻辑给的是完整的「连击 x1」，直接画会和上面那个
       「连击」表头重复，屏幕上就成了"连击 / 连击 x1"。 */
    const comboText = (el('comboLabel').textContent || '连击 x1').replace(/^连击\s*/, '') || 'x1';
    ctx.fillText(comboText, colCombo, yValue);

    // 连击条紧贴在倍率下面，宽度到下一列为止
    const barW = Math.max(44, colLevel - colCombo - 16);
    const barY = boxY + boxH - 12;
    ctx.fillStyle = '#1c1436';
    roundRect(colCombo, barY, barW, 4, 2); ctx.fill();
    const pct = parseFloat(el('comboFill').style.width || '0') / 100;
    if (pct > 0){
      /* 快断了整条变红并加光晕。判据来自逻辑层（它给 comboFill 加 urgent 类，
         阈值是剩不到 35%），跟网页版和小程序版完全一致。
         这是"你的连击快断了"的唯一提示 —— 没有它，倍率断在哪一刻只能靠猜，
         而连击是这游戏的核心计分系统（倍率上不封顶）。 */
      const urgent = el('comboFill').classList.contains('urgent');
      if (urgent){
        ctx.save();
        ctx.shadowColor = C['--danger']; ctx.shadowBlur = 6;
        ctx.fillStyle = C['--danger'];
      } else {
        const g = ctx.createLinearGradient(colCombo, 0, colCombo+barW, 0);
        g.addColorStop(0, C['--tang']); g.addColorStop(1, C['--danger']);
        ctx.fillStyle = g;
      }
      roundRect(colCombo, barY, Math.max(3, barW*pct), 4, 2); ctx.fill();
      if (urgent) ctx.restore();
    }

    /* 生命。每过一关加一条，后期能攒到七八条 —— 一个一个画会溢出到
       「?」上面去。超过 4 条就改成「豆 ×N」，宽度从此固定。 */
    const n = (el('livesVal').innerHTML.match(/<svg/g) || []).length;
    const drawBean = (cx, cy, r) => {
      ctx.fillStyle = C['--amber'];
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI*0.15, Math.PI*1.85);
      ctx.lineTo(cx, cy);
      ctx.closePath(); ctx.fill();
    };
    if (n <= 4){
      for (let i=0;i<n;i++) drawBean(colLives + 6 + i*15, yValue, 6);
    } else {
      drawBean(colLives + 6, yValue, 6);
      ctx.fillStyle = C['--text']; ctx.font = FONT(14, true);
      ctx.fillText('×' + n, colLives + 16, yValue);
    }

    // 「?」竖直居中放在 HUD 最右，不贴右上角 —— 那里正对微信胶囊按钮，
    // 手指过去会先点到微信的菜单。
    ctx.strokeStyle = C['--panel-border']; ctx.lineWidth = 1;
    roundRect(help.x, help.y, help.w, help.h, 8); ctx.stroke();
    ctx.fillStyle = C['--text-dim'];
    ctx.font = FONT(15, true);
    ctx.textAlign = 'center';
    ctx.fillText('?', help.x + help.w/2, help.y + help.h/2 + 1);
    // 暂停图标：两道竖杠，和网页版 HUD 里那个同形
    ctx.strokeStyle = C['--text-dim']; ctx.lineWidth = 2; ctx.lineCap = 'round';
    const px = pause.x + pause.w/2, py = pause.y + pause.h/2, ph = pause.h*0.3;
    ctx.beginPath();
    ctx.moveTo(px - 4, py - ph); ctx.lineTo(px - 4, py + ph);
    ctx.moveTo(px + 4, py - ph); ctx.lineTo(px + 4, py + ph);
    ctx.stroke();
    ctx.lineCap = 'butt';

    return { help: tap(help), pause: tap(pause) };
  }

  function wrapLines(text, maxW, font){
    ctx.font = font;
    const out = [];
    for (const para of String(text).split('\n')){
      if (!para){ out.push(''); continue; }
      let line = '';
      for (const chn of para){
        if (ctx.measureText(line + chn).width > maxW && line){ out.push(line); line = chn; }
        else line += chn;
      }
      if (line) out.push(line);
    }
    return out;
  }

  /** 半透明遮罩 + 居中文字块。返回按钮的点击区，交给 input.js 命中测试。
   *
   *  button2 是并排的次要按钮（描边款），返回值随之变成 {main, second}。
   *  加它是为了把「玩法说明」摆到玩家视线已经落着的地方 —— 原先只有右上角
   *  一个 25px 的「?」，还得先读一句"点右上角 ?"、再回头去找、还要猜到它是
   *  规则，三道弯下来基本没人走得完。暂停页尤其需要：开打之后标题栏收起，
   *  「?」跟着一起没了，而暂停正是玩家想不起规则时唯一会主动打开的界面。 */
  function drawOverlay({ title, titleColor, big, body, hint, button, button2, extra }){
    ctx.fillStyle = 'rgba(5,3,8,0.88)';
    ctx.fillRect(0, hudBottom, W, H - hudBottom);

    const cx = W/2;
    let y = hudBottom + (H - hudBottom) * 0.14;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    ctx.fillStyle = titleColor || C['--amber'];
    ctx.font = FONT(30, true);
    ctx.fillText(title, cx, y);
    y += 46;

    if (big != null){
      ctx.fillStyle = C['--text']; ctx.font = FONT(40, true);
      ctx.fillText(String(big), cx, y);
      y += 48;
    }

    if (body){
      ctx.fillStyle = C['--text-dim']; ctx.font = FONT(13);
      for (const line of wrapLines(body, W - 64, FONT(13))){
        ctx.fillText(line, cx, y); y += 20;
      }
      y += 8;
    }

    if (hint){
      ctx.fillStyle = C['--tang']; ctx.font = FONT(11);
      for (const line of wrapLines(hint, W - 64, FONT(11))){
        ctx.fillText(line, cx, y); y += 17;
      }
      y += 6;
    }

    if (extra) y = extra(y, cx);

    let btnRect = null, btn2Rect = null;
    if (button){
      const bh = 44;
      // 两个按钮并排时各自窄一些，中间留 10 的缝；只有一个时维持原来的 150
      const bw = button2 ? 128 : 150;
      const gap = 10;
      const totalW = button2 ? bw*2 + gap : bw;
      const left = cx - totalW/2;
      const by = Math.min(y + 8, H - padH - bottomInset - bh - 12);

      const g = ctx.createLinearGradient(0, by, 0, by+bh);
      g.addColorStop(0, '#ffdd8a'); g.addColorStop(1, C['--amber']);
      ctx.fillStyle = g; roundRect(left, by, bw, bh, 10); ctx.fill();
      ctx.fillStyle = '#2a1a05'; ctx.font = FONT(16, true);
      ctx.fillText(button, left + bw/2, by + bh/2);
      btnRect = { x:left, y:by, w:bw, h:bh };

      if (button2){
        const x2 = left + bw + gap;
        ctx.fillStyle = 'rgba(138,107,255,.10)';
        roundRect(x2, by, bw, bh, 10); ctx.fill();
        ctx.strokeStyle = C['--panel-border']; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = C['--text']; ctx.font = FONT(15, true);
        ctx.fillText(button2, x2 + bw/2, by + bh/2);
        btn2Rect = { x:x2, y:by, w:bw, h:bh };
      }
    }
    // 只有一个按钮时照旧直接返回它，免得所有老调用点都得改
    return button2 ? { main: btnRect, second: btn2Rect } : btnRect;
  }

  /**
   * 玩法说明。
   *
   * 排成「词条 | 说明」两列而不是一段段长文字：玩家是来查东西的，不是来
   * 读文章的，对齐的左列一眼就能扫到自己要找的那条。
   *
   * 分数一律写真实数值，不写"可获得分数"这种空话 —— 数值直接来自代码里的
   * 常量（豆子 10×1.5、幽灵 200×2^n×1.5 等），改了倍率这里要跟着改。
   */
  const HELP = [
    /* 顺序刻意和网页版一致：**第一屏只回答"怎么开始玩"**。
       canvas 上做不了折叠，但至少能做到分层——快速上手排在最前，
       参数细节沉到最后，玩家滚不到也不影响他开始玩。
       网页版那份用的是原生 <details>，两边内容要保持一致，改一处记得改两处。 */
    { t:'怎么玩', rows:[
      ['移动',   '手指在迷宫上滑动；也可以点下方的方向键'],
      ['吃豆',   '吃光豆子就过关；连着吃，倍率越叠越高'],
      ['躲幽灵', '碰到少一条命；吃下能量豆就能反过来吃它们'],
      ['还有',   '传送门 · 冲刺 · 穿墙 · 幽灵融合'],
      ['',       '这些不用记，边玩边撞见'],
    ]},
    { t:'连击', rows:[
      ['怎么涨', '每吃一颗涨一级，上不封顶；吃幽灵、吃水果同样算'],
      ['怎么断', '一边跑一边吃，约 1.6 秒没吃到才断；停下不动约 0.5 秒就断'],
    ]},
    { t:'四种幽灵', ghosts:[
      [C['--danger'], '追击者', '直线朝你追过来'],
      [C['--pink'],   '伏击者', '预判你的去向，提前拦截'],
      [C['--tang'],   '怕生鬼', '你一靠近它就跑'],
      [C['--cyan'],   '巡逻者', '沿固定路线绕，不理你'],
    ]},
    { t:'特殊机关', rows:[
      ['能量豆',   '短时间内幽灵可以反吃'],
      ['传送门',   '地图四角成对，颜色相同的两个互通'],
      ['冲刺',     '直线一直跑会越跑越快，一转弯就归零'],
      ['神秘水果', '十秒之内可以穿墙走'],
      ['幽灵融合', '两只蓝幽灵相撞会合成超级幽灵'],
    ]},
    { t:'能拿多少分', rows:[
      ['豆子',     '15 分 × 连击'],
      ['能量豆',   '75 分 × 连击'],
      ['神秘水果', '450 分 × 连击'],
      ['幽灵',     '1万 → 2万 → 3万…（同一颗能量豆内第几只就是几万）'],
    ]},
    /* 以下是参数细节。放在最后是有意的：第一次玩的人不需要记住
       "第 6 关 5 秒""1.22 倍"这些数，真要刷纪录的人才会滚到这儿。 */
    { t:'完整计分与参数', rows:[
      ['整关无伤',   '1500 × 关卡号（第 6 关 9000）'],
      ['全灭幽灵',   '10万　一次能量豆内吃光全场'],
      ['通关剩余命', '2250 × 条数'],
      ['全程无伤',   '15000'],
      ['能量豆时长', '9 秒起，每过一关缩短，第 6 关只剩 5 秒'],
      ['',           '期间你快 15%，幽灵慢 15%'],
      ['冲刺',       '直线连走 5 格提速到 1.22 倍'],
      ['传送门',     '冷却 0 秒，落地会停一下等你选方向'],
      ['穿墙',       '10 秒；期间移动放慢，转向随按随到'],
      ['幽灵融合',   '吃掉超级幽灵会放出里面那只，两只各算一档悬赏'],
    ]},
  ];

  /* 「关于这个游戏」自己一页，不混在玩法说明里 —— 玩法说明只讲玩法，
     来查规则的人要的是"传送门怎么用"。
     内容与网页版 #aboutOverlay、小程序版 game.wxml 的 about 弹层保持一致，
     test_help_accuracy 会三处一起核。作者原话，不要替他改写或压缩。 */
  const ABOUT = [
    /* 第一节**不带小标题**：内容紧接页面标题「关于《豆豆迷宫》」，
       再画一个同名小标题就是同一句话写两遍（之前正是这样）。
       署名跟在正文后面 —— 这段话是他写的，落款就该在话说完的地方。 */
    { rows:[
      ['', '暑期，儿子想玩一款简单刺激的小游戏，于是我们一起把它做出来。他负责试玩和提意见，我负责修改完善。后来，其它小朋友也加入试玩队伍，才有了现在的《豆豆迷宫》及其6个关卡。'],
      ['', '超级奶爸', 'sign'],
    ]},
    /* 小游戏这边画在 canvas 上，点不出 mailto，所以邮箱只是文字。
       网页版那份是可点的 mailto 链接。 */
    { rule:true, t:'反馈与建议', rows:[
      ['', '如果你有任何建议，或在游戏中发现了问题，欢迎来信告诉我。'],
      ['邮箱', '2685897@qq.com'],
    ]},
  ];

  /* 量高和画图必须走同一段代码，所以先排一遍版、得到每一项的坐标和总高，
     再照着画。
     原来是两处各算一遍：docContentHeight 按「rows 有几条就是几行文字」估高，
     可真画的时候文字会折行 —— 375px 屏上「关于」实际 9 行，它只算 5 行，少算
     72px。少算的直接后果是滚动上限被卡死，最下面那几行（正好是邮箱）永远
     滚不出来。两份各算各的迟早对不上，这类错还不会报任何异常。 */
  function layoutDoc(sections, single){
    const left   = 20;
    /* 玩法说明是「词条 + 解释」两栏，所以正文要让出左边一栏。
       「关于」那几段没有词条，套两栏模板的话左边 126px 全空着、正文被挤进
       右边 233px（只占屏宽 62%）—— 网页版早就改成通栏了，这边一直没跟上。 */
    const colGap = single ? 0 : Math.min(96, W * 0.26);
    const descX  = single ? left : left + colGap + 10;
    const descW  = W - descX - 16;
    const items  = [];
    let y = 0;

    items.push({ k:'title', y });
    y += 34;

    for (const sec of sections){
      if (sec.rule){ items.push({ k:'rule', y, x:left, w:W - left - 16 }); y += 14; }
      if (sec.t){
        /* 通栏模式下不画小标题前面那条竖线：网页版的「反馈与建议」和它下面的
           正文共用一条左边缘，多一条竖线就得把文字右推，边缘又对不齐了。 */
        items.push({ k:'head', t:sec.t, x:single ? left : left + 9,
                     bar: single ? null : left, y });
        y += 26;
      }
      if (sec.ghosts){
        for (const [color, name, desc] of sec.ghosts){
          items.push({ k:'ghost', color, name, desc, y,
                       dotX:left + colGap - 4, nameX:left + colGap - 12, descX });
          y += 18;
        }
      } else {
        for (const [term, desc, opt] of sec.rows){
          const sign = opt === 'sign';
          if (term) items.push({ k:'term', t:term, x:left + colGap, y });
          /* 落款靠右，再往里空四个字。canvas 没有 em，按字号折算（11.5 × 4）。 */
          const x = sign ? (descX + descW - 11.5 * 4) : descX;
          for (const line of wrapLines(desc, descW, FONT(11.5))){
            items.push({ k:'line', t:line, x, y, sign });
            y += 18;
          }
        }
      }
      y += 8;
    }
    return { items, height: y };
  }

  /* 玩法说明和「关于这个游戏」是同一套排版，只有内容和标题不同。
     参数化而不是复制一份：这边每一行都是手算坐标的（裁剪窗口、滚动上限、
     按钮位置），复制出去的那份迟早在某次调间距时和这份错开。 */
  function drawDoc(scroll, sections, title, single){
    // 不透明底：说明可以从开始页上点开，半透明会让下面那层文字透上来糊成一片
    ctx.fillStyle = '#0a0614';
    ctx.fillRect(0, hudBottom, W, H - hudBottom);

    const cx = W/2;
    const btnH = 40;
    const viewTop = hudBottom + 8;
    const viewBottom = H - bottomInset - padH * 0.25 - btnH - 20;

    const L = layoutDoc(sections, single);
    const maxScroll = Math.max(0, L.height - (viewBottom - viewTop));
    const off = Math.max(0, Math.min(scroll || 0, maxScroll));
    const y0 = viewTop + 16 - off;

    ctx.save();
    // 裁掉视窗以外的部分，滚动时上下不会糊出去
    ctx.beginPath();
    ctx.rect(0, viewTop, W, viewBottom - viewTop);
    ctx.clip();
    ctx.textBaseline = 'middle';

    for (const it of L.items){
      const y = y0 + it.y;
      // 视窗外的整行直接跳过：滚动时每帧都在画，能省一半以上的 fillText
      if (y < viewTop - 24 || y > viewBottom + 24) continue;
      switch (it.k){
        case 'title':
          ctx.textAlign = 'center';
          ctx.fillStyle = C['--amber']; ctx.font = FONT(21, true);
          ctx.fillText(title, cx, y);
          break;
        case 'rule':
          // 和网页版那条 <hr class="about-rule"> 对应：分隔要有，但要弱
          ctx.save();
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = C['--text-dim'];
          ctx.fillRect(it.x, y, it.w, 1);
          ctx.restore();
          break;
        case 'head':
          ctx.fillStyle = C['--amber'];
          if (it.bar != null) ctx.fillRect(it.bar, y - 6, 3, 12);
          ctx.textAlign = 'left'; ctx.font = FONT(11.5, true);
          ctx.fillText(it.t, it.x, y);
          break;
        case 'ghost':
          ctx.fillStyle = it.color;
          ctx.beginPath(); ctx.arc(it.dotX, y, 4, 0, Math.PI*2); ctx.fill();
          ctx.textAlign = 'right';
          ctx.fillStyle = C['--text']; ctx.font = FONT(11.5, true);
          ctx.fillText(it.name, it.nameX, y);
          ctx.textAlign = 'left';
          ctx.fillStyle = C['--text-dim']; ctx.font = FONT(11.5);
          ctx.fillText(it.desc, it.descX, y);
          break;
        case 'term':
          ctx.textAlign = 'right';
          ctx.fillStyle = C['--text']; ctx.font = FONT(11.5, true);
          ctx.fillText(it.t, it.x, y);
          break;
        case 'line':
          /* 落款整行靠右、用琥珀色。靠右之后它和正文的左边缘错开，一眼就分得出
             「这不是正文的最后一句」。做成排版选项而不是按文字去认行（比如
             indexOf '超级奶爸'），是因为按内容认会在改文案的那天悄悄失效。 */
          ctx.textAlign = it.sign ? 'right' : 'left';
          ctx.fillStyle = it.sign ? C['--amber'] : C['--text-dim'];
          ctx.font = FONT(11.5);
          ctx.fillText(it.t, it.x, y);
          break;
      }
    }
    ctx.restore();

    // 还能往下滚时给个提示，否则玩家不知道下面还有内容
    if (off < maxScroll - 1){
      ctx.textAlign = 'center';
      ctx.fillStyle = C['--text-dim']; ctx.font = FONT(10);
      ctx.fillText('▼ 上滑查看更多', cx, viewBottom - 6);
    }

    // 「知道了」
    ctx.textAlign = 'center';
    const bw = 130, bx = cx - bw/2, by = viewBottom + 14;
    const g = ctx.createLinearGradient(0, by, 0, by+btnH);
    g.addColorStop(0, '#ffdd8a'); g.addColorStop(1, C['--amber']);
    ctx.fillStyle = g; roundRect(bx, by, bw, btnH, 10); ctx.fill();
    ctx.fillStyle = '#2a1a05'; ctx.font = FONT(15, true);
    ctx.textBaseline = 'middle';
    ctx.fillText('知道了', cx, by + btnH/2);
    return { close: { x:bx, y:by, w:bw, h:btnH }, maxScroll };
  }

  /** 「练习 1 2 3 4 5 6」那一排。网页版开始页早就有，小游戏这边一直没画。
   *
   *  哪几关解锁了不在这儿判断 —— 逻辑层的 renderLevelSelect 已经把答案写进
   *  levelSel 的 innerHTML 了（解锁的是数字，没解锁的带 disabled）。照着读，
   *  比在外壳里再抄一遍 maxLevelReached 的规则安全：抄出来的那份迟早和它错开。
   *  整块没解锁时（只通到第一关）逻辑层会给容器加 hidden，这里就一行都不画。
   */
  function drawPractice(y, cx, hits){
    const box = el('levelSel');
    if (!box || box.classList.contains('hidden')) return y;
    const html = box.innerHTML || '';
    const items = [];
    const re = /<button[^>]*class="lv"[^>]*data-lv="(\d+)"([^>]*)>/g;
    let m;
    while ((m = re.exec(html))) items.push({ lv:Number(m[1]), locked:/disabled/.test(m[2]) });
    if (!items.length) return y;

    /* 34 + 10 = 44 的步距，正好等于建议的最小热区 —— 这样每个方块的热区撑到
       44 之后刚好与邻居贴边而不重叠。原来是 26 + 7（步距 33），热区最多撑到 31，
       六个并排怎么排都不够。方块画大一点本身也更像"可以点"。
       六个 34 + 五个 10 + 「练习」二字 ≈ 284，320 的窄屏也放得下。 */
    const chip = 34, gap = 10;
    ctx.font = FONT(11);
    const kw = ctx.measureText('练习').width + 10;
    const total = kw + items.length * chip + (items.length - 1) * gap;
    let x = cx - total / 2;
    const cy = y + chip / 2;

    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C['--text-dim'];
    ctx.fillText('练习', x, cy);
    x += kw;

    hits.practice = [];
    for (const it of items){
      ctx.fillStyle = it.locked ? 'rgba(138,107,255,.10)' : 'rgba(138,107,255,.20)';
      roundRect(x, y, chip, chip, 7); ctx.fill();
      ctx.strokeStyle = it.locked ? 'rgba(138,107,255,.18)' : 'rgba(138,107,255,.42)';
      ctx.lineWidth = 1; ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = it.locked ? C['--text-dim'] : C['--text'];
      ctx.font = FONT(14, !it.locked);
      ctx.fillText(it.locked ? '·' : String(it.lv), x + chip/2, cy);
      /* 没解锁的也留热区：点上去什么都不做，但**不能**穿透到下面去。
         少了这一条，点一个锁着的关卡会命中它后面的东西。 */
      /* 宽度撑满一个步距（chip + gap = 44）。相邻两个热区正好贴边、不重叠 ——
         贴边是好事：两个方块之间不留死区，点在缝里也会命中就近那个。 */
      const t = tap({ x, y, w:chip, h:chip }, chip + gap, TAP_MIN);
      hits.practice.push({ ...t, lv:it.lv, locked:it.locked });
      x += chip + gap;
    }
    ctx.textAlign = 'center';
    return y + chip + 12;
  }

  /** 排行榜。逻辑把它写进 innerHTML，这里拆成行画出来。 */
  function drawBoard(startY, cx, html){
    const text = html.replace(/<div class="board-row[^"]*">/g, '\n')
                     .replace(/<[^>]+>/g, ' ')
                     .replace(/[ \t]+/g, ' ');
    const rows = text.split('\n').map(s=>s.trim()).filter(Boolean).slice(0, 9);
    ctx.font = FONT(11); ctx.textAlign = 'center';
    let y = startY;
    for (let i=0;i<rows.length;i++){
      ctx.fillStyle = i === 1 ? C['--amber'] : C['--text-dim'];
      ctx.fillText(rows[i], cx, y);
      y += 17;
    }
    return y + 6;
  }

  return {
    roundRect,   // 给外壳复用，避免两处各写一份圆角矩形
    drawHud,
    setPauseReason(t){ pauseReason = t || ''; },
    /** 每帧调用。返回当前可点区域，供 input.js 命中测试。 */
    drawOverlays(helpScroll){
      const hits = {};
      const hidden = id => el(id).classList.contains('hidden');

      // 两个整屏文档页排在最前面判断：它们可以从开始页上点开，
      // 两层同时"未隐藏"时该显示的是后开的那层。
      if (!hidden('helpOverlay')){
        const r = drawDoc(helpScroll, HELP, '玩法说明');
        hits.helpClose = r.close;
        hits.helpMaxScroll = r.maxScroll;
      } else if (!hidden('aboutOverlay')){
        // 复用同一个滚动量：两页不会同时开着，各记一份反而要多一套状态
        // 通栏：「关于」那几段没有词条，套玩法的两栏模板会把正文挤到右边一半
        const r = drawDoc(helpScroll, ABOUT, '关于《豆豆迷宫》', true);
        hits.aboutClose = r.close;
        hits.helpMaxScroll = r.maxScroll;
      } else if (!hidden('startOverlay')){
        // 与网页版一致：开始页只留一句，详细规则进「玩法说明」按钮。原来这里
        // 硬编码着六行说明，加上榜单和署名会把「开始」按钮挤出屏幕；那句
        // "点右上角 ?" 也一并去掉了——现在按钮就在开始键旁边，不用再指路。
        // 最高分用 big 那一档字号，跟网页版一样摆在标题下面最显眼的位置。
        // 逻辑层已经把它写进 bestLine 了（renderBest），这里只负责画；
        // 没有任何记录时那个元素是空的，big 传 null 就整块不画。
        const bestTxt = el('bestLine') ? (el('bestLine').textContent || '') : '';
        /* 开始页第一句用逻辑层写好的欢迎语（renderWelcome），不再写死一句操作说明。
           第一次来和再回来说的不是同一句，而这游戏的玩家是同一个小孩和他的朋友，
           他们会一次次回来 —— 那就该认得出他们。这行字网页版早就有了，小游戏
           这边一直没接，白白空着一句。 */
        const welcome = el('welcomeLine') ? (el('welcomeLine').textContent || '') : '';
        const boardHtml = el('startBoard') ? el('startBoard').innerHTML : '';
        /* 操作说明只给新玩家看，和网页版同一条规矩（那边是 .start-tip 跟着
           有没有纪录显隐）。老玩家早就会走了，这行占掉的高度正是那句故事需要的。
           「有没有纪录」直接看榜单是不是空的 —— 小游戏没有 DOM，查不了 .start-tip。 */
        const played = !!boardHtml.trim();
        const tip = '手指滑动屏幕　或　点下方方向键移动';
        const r = drawOverlay({
          title: '投币',
          big: bestTxt || null,
          body: welcome ? (played ? welcome : welcome + '\n' + tip) : tip,
          button: '开始',
          button2: '玩法说明',
          extra: (y, cx) => {
            y = drawPractice(y, cx, hits);
            y = drawBoard(y, cx, boardHtml);
            /* 署名这行本身就是「关于《豆豆迷宫》」的入口。
               网页版和小程序版把它放在副标题旁边（和「玩法」并排），这边不行：
               小游戏没有副标题那一行，HUD 只有一条、而且已经挤到极限（有测试
               盯着不许重叠），再塞一个图标就会压到生命图标上。
               所以退到开始页这一行 —— 一行字不占高度，用琥珀色，足够看出可点、
               又不抢「开始」。
               2026-08-21 业主把文案从"♥ 一个爸爸和儿子一起做的小游戏"改成
               「怀旧游戏」，那颗心一并去掉；那段自述完整留在「关于」里。 */
            ctx.textBaseline = 'middle';
            ctx.font = FONT(10);
            const label = '怀旧游戏';
            const lw = ctx.measureText(label).width;
            ctx.textAlign = 'center';
            ctx.fillStyle = C['--amber'];
            ctx.fillText(label, cx, y + 6);
            // 热区按整行算，且上下各放宽 —— 10px 的字太细，只按字高做热区点不中
            hits.about = tap({ x:cx - lw/2 - 8, y:y - 6, w:lw + 16, h:24 });
            return y + 22;
          },
        });
        hits.start = r.main; hits.help = r.second;
      } else if (!hidden('pauseOverlay')){
        /* 不是玩家自己按的那种暂停，要说明原因 —— 手机上被通知或来电打断很常见，
           回来看到一个光秃秃的「暂停」，第一反应是"我按到什么了"。 */
        const r = drawOverlay({ title: '暂停', body: pauseReasonText() || null,
                                button: '继续', button2: '玩法说明' });
        hits.resume = r.main; hits.help = r.second;
      } else if (!hidden('overOverlay')){
        const won = el('overTitle').textContent.includes('通关');
        hits.restart = drawOverlay({
          title: el('overTitle').textContent || '游戏结束',
          titleColor: won ? C['--amber'] : C['--danger'],
          big: el('finalScore').textContent,
          body: el('overSub').textContent,
          button: '再来一局',
          extra: (y, cx) => {
            if (!el('nameRow').classList.contains('hidden')){
              const bw = 200, bh = 34, bx = cx - bw/2;
              ctx.fillStyle = 'rgba(138,107,255,.14)';
              roundRect(bx, y, bw, bh, 8); ctx.fill();
              ctx.strokeStyle = C['--amber']; ctx.lineWidth = 1; ctx.stroke();
              const v = el('nameInput').value;
              ctx.fillStyle = v ? C['--text'] : C['--text-dim'];
              ctx.font = FONT(13); ctx.textAlign = 'center';
              ctx.fillText(v || '点这里留下名字', cx, y + bh/2);
              hits.name = { x:bx, y, w:bw, h:bh };
              y += bh + 10;
            } else if (el('nameRow').textContent){
              ctx.fillStyle = C['--amber']; ctx.font = FONT(12); ctx.textAlign='center';
              ctx.fillText(el('nameRow').textContent, cx, y); y += 22;
            }
            return drawBoard(y, cx, el('overBoard') ? el('overBoard').innerHTML : '');
          },
        });
      }
      return hits;
    },

    /**
     * 底部虚拟方向键。与网页版一致：左右键做宽、上下键做厚（拇指在屏幕上是
     * 横向扫的，左右转向也最频繁），暂停占十字正中，右上角是显隐开关。
     * 返回所有命中区，开关那个即使在隐藏状态下也返回——否则按一下连它自己
     * 都没了，再也开不回来。
     */
    drawPad(hidden){
      const cx = W/2, cy = H - bottomInset - padH/2;
      const gap = 7;
      /* 高度由外壳分给方向键的那条带子（padH）决定，不是由屏宽决定。
         短屏（iPhone SE 那类）上棋盘优先，方向键只拿到剩下的一百来像素，
         若还按屏宽算键高就会溢出这条带子、盖到棋盘上。
         54:50 是上下键与中间行的高度比，按这个比例分配剩余高度。 */
      const inner = Math.max(60, padH - 24);          // 减去两道 gap 和呼吸位
      const hSide = Math.min(54, inner * 54 / 158);
      const hMid  = Math.min(50, inner * 50 / 158);
      const wSide = Math.min(96, W*0.26), wMid = Math.min(84, W*0.23);

      ctx.textAlign='center'; ctx.textBaseline='middle';

      // 显隐开关：跟上方向键并排，放在它右边
      const tb = { x: cx + wMid/2 + gap, y: cy - hMid/2 - gap - hSide, w: 38, h: 38 };
      ctx.fillStyle = 'rgba(138,107,255,.10)';
      roundRect(tb.x, tb.y, tb.w, tb.h, 9); ctx.fill();
      ctx.strokeStyle = C['--panel-border']; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = hidden ? C['--panel-border'] : C['--text-dim'];
      ctx.font = FONT(17);
      ctx.fillText('✛', tb.x + tb.w/2, tb.y + tb.h/2);

      if (hidden) return { padToggle: tb };

      const keys = {
        up:    { x: cx - wMid/2,             y: cy - hMid/2 - gap - hSide, w: wMid,  h: hSide, label:'▲' },
        down:  { x: cx - wMid/2,             y: cy + hMid/2 + gap,         w: wMid,  h: hSide, label:'▼' },
        left:  { x: cx - wMid/2 - gap - wSide, y: cy - hMid/2,             w: wSide, h: hMid,  label:'◀' },
        right: { x: cx + wMid/2 + gap,       y: cy - hMid/2,               w: wSide, h: hMid,  label:'▶' },
        pause: { x: cx - wMid/2,             y: cy - hMid/2,               w: wMid,  h: hMid,  label:'‖', quiet:true },
      };
      for (const k of Object.keys(keys)){
        const b = keys[k];
        ctx.fillStyle = b.quiet ? 'transparent' : 'rgba(138,107,255,.12)';
        if (!b.quiet){ roundRect(b.x, b.y, b.w, b.h, 11); ctx.fill(); }
        ctx.strokeStyle = C['--panel-border']; ctx.lineWidth = 1;
        roundRect(b.x, b.y, b.w, b.h, 11); ctx.stroke();
        ctx.fillStyle = C['--text-dim']; ctx.font = FONT(b.quiet ? 15 : 19);
        ctx.fillText(b.label, b.x + b.w/2, b.y + b.h/2);
      }
      keys.padToggle = tb;
      return keys;
    },
  };
}

module.exports = { createUI };
