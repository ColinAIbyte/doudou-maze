// 触屏手感的两条底线。
//   用法: node test_touch_feel.mjs
//
// 一、滑动必须在 touchmove 阶段就转向，不能等 touchend。
//     原来是等抬手的：一次滑动手势 100~250ms，而玩家 5.4~6.9 格/秒 —— 手指还
//     没离开屏幕，人已经越过路口 0.8~1.0 格，而转角辅助只救得了 0.45 格。
//     业主的原话是"手机触屏滑动，感觉没有方向键好控制"，根因就在这里：不是
//     触屏天生不如按键，是判定时机放错了（方向键走的是按下即响应）。
//     这条错不会抛异常、不影响任何逻辑，只是玩起来慢半拍，所以只能这样钉住。
//
// 二、尾迹按距离采样，不按帧。
//     按帧采的话，第六关满冲刺 8.37 格/秒、60 帧下相邻两点只差 0.14 格，七个点
//     铺开 0.84 格 —— 正好是吃豆人的直径，看起来是七个叠在身上的重影而不是尾巴
//     （业主："跑的时候手机有个影子，看起来有点晕"）。而且按帧采意味着 120Hz
//     手机上间距再减半，同一份代码在不同设备上观感不同。
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../pacman_fragment.html', import.meta.url), 'utf8');
const fail = [];

// —— 一、滑动 ——
const mv = src.match(/stage\.addEventListener\('touchmove'[\s\S]*?\}, \{ passive: false \}\);/);
if (!mv) {
  fail.push('找不到 touchmove 监听（锚点变了，去 test_touch_feel 里改）');
} else if (!/acceptSwipe\(/.test(mv[0])) {
  fail.push('touchmove 里没有 acceptSwipe —— 转向又回到抬手才判定了，'
          + '手感会比方向键慢将近一格');
} else if (!/swipeFrom = \{/.test(mv[0])) {
  fail.push('touchmove 判定后没有重置起点 —— 按着不放没法连续拐弯，'
          + '每转一次都得抬手重划');
}

const accept = src.match(/function acceptSwipe\(dx, dy\)\{[\s\S]*?\n\}/);
if (!accept || !/requestDir\(swipeDir\(dx, dy\)\)/.test(accept[0]))
  fail.push('通过阈值的滑动没有立即送进 requestDir');
if (!accept || !/markHintSeen\('move'\)/.test(accept[0]))
  fail.push('首次成功滑动后没有记住教学已完成');
const hintDraw = src.slice(src.indexOf('function drawSwipeHint'), src.indexOf('function markHintSeen'));
if (/markHintSeen\('move'\)/.test(hintDraw))
  fail.push('滑动教学刚显示就被记成已完成；必须等玩家真的滑动');

const swipeMin = Number((src.match(/const SWIPE_MIN_PX = ([\d.]+)/) || [])[1]);
const hintSeconds = Number((src.match(/const SWIPE_HINT_SECONDS = ([\d.]+)/) || [])[1]);
if (swipeMin !== 24) fail.push(`滑动阈值应为 24px，实际 ${swipeMin}`);
if (hintSeconds !== 2) fail.push(`首次滑动动画应为 2 秒，实际 ${hintSeconds}`);

// —— 二、尾迹 ——
const num = (name) => {
  const m = src.match(new RegExp('const\\s+' + name + '\\s*=\\s*([\\d.]+)'));
  if (!m) { fail.push(`源码里找不到常量 ${name}`); return NaN; }
  return Number(m[1]);
};
const SPACING = num('TRAIL_SPACING');
const MAX     = num('TRAIL_MAX');

if (!fail.length){
  // 采样必须看 distTravelled，不能每帧无条件 push
  const push = src.match(/if \(wind > 0\.15 && moved < 1\.5\)\{[\s\S]{0,400}?\n  \}/);
  if (!push) fail.push('找不到尾迹采样那段');
  else if (!/distTravelled - player\.trailAt >= TRAIL_SPACING/.test(push[0]))
    fail.push('尾迹又变回按帧采样了 —— 高刷手机上会糊成重影，且不同设备观感不一样');

  /* 尾巴总长必须明显超过角色直径，否则它就是叠在身上的重影而不是尾巴。
     吃豆人半径 TILE*0.42，直径 0.84 格。 */
  const span = SPACING * (MAX - 1);
  if (span < 1.0)
    fail.push(`尾巴总长只有 ${span.toFixed(2)} 格，没有明显超过角色直径 0.84 格，`
            + '还是会看成重影（要求 ≥1.0 格）');

  // 最亮/最大的那一个都不许喧宾夺主
  const draw = src.slice(src.indexOf('if (wind > 0.15 && player.trail'), src.indexOf('// The bite is driven'));
  // 空格随手写，别在正则里假设：源码里是 `k*0.30` 而不是 `k * 0.30`，
  // 第一版就因为多写了两个空格，报的是"写法变了"而不是真正的结论。
  /* 括号也别在正则里假设。改回旧写法时那两个数是 `0.05 + k * 0.22 * wind`
     （没有括号），第一版的正则要求必须有括号，于是报的是"写法变了"而不是
     "太亮了 0.27" —— 测试红了，但红得看不懂，等于少了一半价值。 */
  const alpha = draw.match(/globalAlpha = \(?([\d.]+)\s*\+\s*k\s*\*\s*([\d.]+)/);
  const radius = draw.match(/TILE\*0\.42\*\(([\d.]+)\s*\+\s*k\s*\*\s*([\d.]+)\)/);
  if (!alpha || !radius) fail.push('读不出尾迹的透明度/半径（绘制那段的写法变了）');
  else {
    const aMax = Number(alpha[1]) + Number(alpha[2]);
    const rMax = Number(radius[1]) + Number(radius[2]);
    if (aMax > 0.20) fail.push(`尾迹最亮 ${aMax.toFixed(2)}，超过 0.20 会开始抢角色`);
    if (rMax > 0.65) fail.push(`尾迹最大 ${(rMax*100).toFixed(0)}% 本体，超过 65% 就像第二个吃豆人`);
    if (!fail.length){
      console.log('尾迹（方案 B）：');
      console.log(`  间距 ${SPACING} 格 × ${MAX} 点 = 铺开 ${span.toFixed(2)} 格（角色直径 0.84）`);
      console.log(`  最亮 ${aMax.toFixed(2)}　最大 ${(rMax*100).toFixed(0)}% 本体`);
      console.log('滑动：touchmove 阶段即转向，且判定后重置起点（可连划）');
    }
  }
}

/* —— 三、闪烁频率 ——
   无敌和穿墙都靠"闪"表示状态。WCAG 2.1 的通用闪烁阈值是每秒 3 次，而原来两处
   都是硬切方波：穿墙 5Hz、无敌 7Hz，在 0.4 和 1 之间跳，穿墙还一持续就是 10 秒。
   业主说"看起来有点晕"时我先归因到尾迹，其实这里更严重。
   钉住三件事：频率不超过 3Hz、下限不许再压到 0.5 以下、必须是正弦不是方波
   （同样频率下方波的边沿更刺激）。 */
const hz = (name) => {
  const m = src.match(new RegExp('const\\s+' + name + '\\s*=\\s*([\\d.]+)'));
  if (!m) { fail.push(`源码里找不到常量 ${name}`); return NaN; }
  return Number(m[1]);
};
const PHASE_HZ = hz('PHASE_PULSE_HZ');
const INVULN_HZ = hz('INVULN_PULSE_HZ');
if (Number.isFinite(PHASE_HZ) && PHASE_HZ > 3)
  fail.push(`穿墙闪烁 ${PHASE_HZ}Hz 超过 WCAG 的每秒 3 次，而它一持续就是 10 秒`);
if (Number.isFinite(INVULN_HZ) && INVULN_HZ > 3)
  fail.push(`无敌闪烁 ${INVULN_HZ}Hz 超过 WCAG 的每秒 3 次`);

const alphaLine = src.match(/ctx\.globalAlpha = player\.phase > 0[\s\S]{0,220}?;/);
if (!alphaLine) {
  fail.push('定位不到玩家的透明度那几行（写法变了，去 test_touch_feel 里改）');
} else {
  if (/Math\.floor\(elapsed\s*\*\s*\d+\)\s*%\s*2/.test(alphaLine[0]))
    fail.push('玩家的闪烁又变回方波硬切了 —— 同样频率下方波比正弦难受得多');
  const los = [...alphaLine[0].matchAll(/pulse\([A-Z_]+,\s*([\d.]+)\)/g)].map(m=>Number(m[1]));
  if (!los.length) fail.push('读不出闪烁的下限');
  else {
    const worst = Math.min(...los);
    if (worst < 0.4) fail.push(`闪烁最暗到 ${worst}，太接近消失；下限不该低于 0.4`);
    else console.log(`闪烁：穿墙 ${PHASE_HZ}Hz、无敌 ${INVULN_HZ}Hz，正弦，最暗 ${worst}`);
  }
}

console.log('\n' + (fail.length
  ? '触屏手感有问题：\n  ✗ ' + fail.join('\n  ✗ ')
  : '触屏手感的两条底线都守住了。'));
process.exit(fail.length ? 1 : 0);
