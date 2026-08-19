// 小豆和能量豆必须一眼分得出。
//   用法: node test_pellet_contrast.mjs
//
// 这是一次真实事故的护栏。"剩最后几颗时让豆子喘气"那个效果，把小豆的半径
// 从 2.6 一路胀到 5.1、光晕从 4 涨到 24；而能量豆的半径最小才 3.2、光晕固定 12。
// 于是剩三颗以内时，两种豆子在**大小和亮度上同时**分不出来 —— 而且是反的：
// 最该显眼的能量豆被普通豆子盖过去了。
//
// 这种错不会报任何异常，测试也全绿，画面还挺好看，只有真的玩到最后几颗的人
// 会发现"咦，哪颗是大豆？"。作者就是这么发现的。
//
// 所以这里守两条不变式，直接读源码里的具名常量算：
//     小豆半径（任何时候） <  能量豆最小半径
//     小豆光晕（任何时候） <  能量豆光晕
// 顺带钉住"小豆的半径不随呼吸变化"——那正是当初出事的那一行。
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../pacman_fragment.html', import.meta.url), 'utf8');
const fail = [];

const num = (name) => {
  const m = src.match(new RegExp('const\\s+' + name + '\\s*=\\s*([\\d.]+)'));
  if (!m) { fail.push(`源码里找不到常量 ${name}`); return NaN; }
  return Number(m[1]);
};

const PELLET_R    = num('PELLET_R');
const GLOW        = num('PELLET_GLOW');
const GLOW_SWING  = num('PELLET_GLOW_SWING');
const GLOW_BASE   = num('PELLET_GLOW_BASE_SWING');
const POWER_R     = num('POWER_R');
const POWER_SWING = num('POWER_R_SWING');
const POWER_GLOW  = num('POWER_GLOW');

if (!fail.length){
  // urgency 最大是 1（剩 LAST_PELLET_LOUD 颗以内），beat 最大是 1
  const pelletGlowMax = GLOW + (GLOW_SWING * 1 + GLOW_BASE);
  const powerRMin     = POWER_R - POWER_SWING;
  const powerRMax     = POWER_R + POWER_SWING;

  // —— 不变式一：大小 ——
  if (!(PELLET_R < powerRMin)) {
    fail.push(`小豆半径 ${PELLET_R} 不小于能量豆最小半径 ${powerRMin.toFixed(1)}，`
            + '两种豆子会在尺寸上混淆');
  }
  // 留出足够的差距才叫"一眼分得出"：能量豆至少要有小豆的 1.5 倍
  if (powerRMin / PELLET_R < 1.5) {
    fail.push(`能量豆最小半径只有小豆的 ${(powerRMin/PELLET_R).toFixed(2)} 倍，`
            + '差距太小，扫一眼分不出来（要求 ≥1.5 倍）');
  }

  // —— 不变式二：亮度 ——
  if (!(pelletGlowMax < POWER_GLOW)) {
    fail.push(`小豆最大光晕 ${pelletGlowMax} 不小于能量豆光晕 ${POWER_GLOW}，`
            + '呼吸到最亮时会盖过能量豆 —— 这正是原来那个 bug');
  }

  /* —— 小豆的半径不许再随呼吸变化 ——
     锚点要选**不会被这次改动删掉**的东西。第一版拿 `const r = PELLET_R` 当起点，
     结果模拟"把半径改回会变的"时正好把这行删了，切片落空，报的是"定位不到段落"
     而不是真正的原因 —— 测试红了，但红得看不懂，等于少了一半价值。
     改用绘制循环那两个固定不变的标记来夹。 */
  const a = src.indexOf('if (pelletsLeft <= LAST_PELLET_HINT){');
  const b = src.indexOf('if (anyDot) ctx.fill();');
  if (a < 0 || b < 0 || b <= a) {
    fail.push('定位不到小豆的绘制段落（锚点变了，去 test_pellet_contrast 里改）');
  } else {
    const draw = src.slice(a, b);
    if (!/const r = PELLET_R;/.test(src.slice(Math.max(0, a - 400), b))) {
      fail.push('小豆半径不再是 `const r = PELLET_R;` —— 要么没用这个常量，要么它变成了可改的');
    }
    // 段落里出现对 r 的赋值（不含 const 声明），就说明半径又会动了
    const assigns = draw.match(/^\s*r\s*=[^=]/gm);
    if (assigns) {
      fail.push(`小豆的半径在绘制过程中被重新赋值了（${assigns.length} 处）—— 它必须恒定，`
              + '一变就会撞进能量豆的尺寸区间');
    }
  }

  console.log('两种豆子的对比：');
  console.log(`  小豆    半径 ${PELLET_R}（恒定）   光晕 ${GLOW} ~ ${pelletGlowMax}`);
  console.log(`  能量豆  半径 ${powerRMin.toFixed(1)} ~ ${powerRMax.toFixed(1)}      光晕 ${POWER_GLOW}`);
  console.log(`  尺寸差距 ${(powerRMin/PELLET_R).toFixed(2)} 倍（最不利时刻）`);
}

console.log('\n' + (fail.length
  ? '两种豆子分不出来：\n  ✗ ' + fail.join('\n  ✗ ')
  : '小豆和能量豆在任何时刻都分得出：能量豆永远更大、也永远更亮。'));
process.exit(fail.length ? 1 : 0);
