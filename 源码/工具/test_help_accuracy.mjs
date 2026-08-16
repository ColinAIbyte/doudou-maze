// 玩法说明里的数字，必须和代码里的常量对得上。
//   用法: node test_help_accuracy.mjs
//
// 说明文档是会腐烂的：改了一个常量，说明里那个数还停在旧值上，而且不会有
// 任何报错。这次就抓到一条 —— 连击规则早改成"跑动 1.6 秒"，说明里还写着
// "超过约 1 秒"。玩家照着做发现不是那么回事，比没有说明更糟。
//
// 而且说明有**两份**（网页 HTML 一份、小游戏 canvas 一份），改一处忘另一处
// 是必然会发生的事，这里一起核。
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../pacman_fragment.html', import.meta.url), 'utf8');
const ui  = readFileSync(new URL('../../微信小游戏版/js/ui.js', import.meta.url), 'utf8');

/* 只在**说明那一段**里找，不能在整个文件里找。
   第一版就是拿整个文件搜的，结果 `const COMBO_WINDOW = 2.4;` 这行常量声明
   本身就能让检查通过 —— 测试永远是绿的，等于没测。 */
const helpStart = src.indexOf('<div class="help-doc">');
const helpEnd   = src.indexOf('id="helpCloseBtn"');
if (helpStart < 0 || helpEnd < 0) throw new Error('定位不到网页版的说明段落');
const helpHtml = src.slice(helpStart, helpEnd);

const num = (re, what) => {
  const m = src.match(re);
  if (!m) throw new Error('在代码里找不到' + what + '：' + re);
  return Number(m[1]);
};

// —— 从代码里读出真值 ——
const MULT   = num(/const SCORE_MULT = ([\d.]+);/, '总倍率');
const PELLET = num(/pelletsLeft--; addPelletScore\((\d+)\);\s*\n[\s\S]{0,80}?ch==='o'/, '豆子基础分')
               || 10;
const BONUS_LINE = src.match(/const BONUS = \{([^}]+)\}/)[1];
const bonus = k => Number(BONUS_LINE.match(new RegExp(k + ':\\s*(\\d+)'))[1]);
const fright = JSON.parse(src.match(/const FRIGHT_BY_LEVEL = (\[[^\]]+\])/)[1]);
const dash   = num(/const MOMENTUM_MAX = ([\d.]+);/, '冲刺倍率');
const pSpeed = num(/const FRIGHT_PLAYER_SPEED_MULT = ([\d.]+);/, '恐惧期玩家加速');
const gSpeed = num(/const FRIGHT_GHOST_SPEED_MULT = ([\d.]+);/, '恐惧期幽灵减速');
const bounty = num(/const GHOST_BOUNTY_STEP = (\d+);/, '悬赏步长');
const comboWin  = num(/const COMBO_WINDOW = ([\d.]+);/, '连击窗口');
const portalCd  = num(/const PORTAL_COOLDOWN_SECONDS = ([\d.]+);/, '传送门冷却');
const comboIdle = num(/const COMBO_IDLE_DECAY = ([\d.]+);/, '停下衰减倍率');

// —— 期望：每个数值都要**带上下文**去核 ——
/* 光找"这个数出现过没有"是不行的，两次栽在同一个坑上：
     第一次 —— 拿整个文件搜，`const COMBO_WINDOW = 2.4;` 这行声明自己就让检查通过；
     第二次 —— 只搜说明段落，可 String(2.0) 是 "2"，而悬赏那行 "1万 → 2万 → 3万"
               里就有个孤零零的 2，照样通过。传送门冷却因此真的漏过一次：
               代码 2.0、说明 1.2，测试全绿。
   所以每一条都写清楚"这个数该出现在哪句话里"。麻烦一点，但这才叫核对。
   \uFFFF 是占位符，构造正则时替换成真实数值。 */
const num2 = v => String(v).replace('.', '\\.');
const expect = [
  // 词条和数值之间隔着 </dt><dd> 之类的标签，所以用有界的任意字符，
  // 不能用 [^<]*（跨不过标签），也不能用 [\\s\\S]*（会一路匹配到别人家去）
  ['豆子',       `豆子[\\s\\S]{0,20}?<b>\uFFFF</b>`,     10 * MULT],
  ['能量豆分数', `能量豆[\\s\\S]{0,20}?<b>\uFFFF</b>`,    50 * MULT],
  ['水果',       `神秘水果[\\s\\S]{0,40}?<b>\uFFFF</b>`, 300 * MULT],
  ['整关无伤',   `整关无伤[\\s\\S]{0,20}?<b>\uFFFF</b>`, bonus('PERFECT_LEVEL') * MULT],
  /* 全灭是**最终分**，不乘 SCORE_MULT（awardBonus 的 raw），所以这里不能
     跟着乘 —— 乘了会去找 150000，而说明里写的是 10 万。
     写成「10万」而不是「100,000」：招牌数字要读得出口。 */
  ['全灭幽灵',   `全灭幽灵[\\s\\S]{0,20}?<b>\uFFFF万</b>`, bonus('GHOST_SWEEP') / 10000],
  ['通关剩余命', `通关剩余命[\\s\\S]{0,20}?<b>\uFFFF</b>`, bonus('LIFE_LEFT')    * MULT],
  ['全程无伤',   `全程无伤[\\s\\S]{0,20}?<b>\uFFFF</b>`, bonus('FLAWLESS_RUN')  * MULT],
  // 说明改成分层结构后这两句重写过，模式跟着改；仍然要求数字和"能量豆时长"
  // 出现在同一句里，不是满篇找一个孤零零的 9
  ['恐惧起始秒', `能量豆时长[\\s\\S]{0,30}?<b>\uFFFF 秒</b>`, fright[0]],
  ['恐惧末关秒', `第 6 关只剩 <b>\uFFFF 秒</b>`,       fright[fright.length-1]],
  ['冲刺倍率',   `提速到 <b>\uFFFF 倍</b>`,            dash],
  ['玩家加速%',  `你快 \uFFFF%`,                       Math.round((pSpeed-1)*100)],
  ['幽灵减速%',  `幽灵慢 \uFFFF%`,                     Math.round((1-gSpeed)*100)],
  ['连击窗口',   `约 <b>\uFFFF 秒</b>没吃到才断`,      comboWin],
  ['传送门冷却', `冷却 <b>\uFFFF 秒</b>`,              portalCd],
];

const fail = [];
for (const [what, pat, v] of expect){
  const re = new RegExp(pat.replace(/\uFFFF/g, num2(v)));
  if (!re.test(helpHtml)) fail.push(`网页说明里「${what}」和代码对不上（代码是 ${v}）`);
}
// 小游戏那份是纯文本，格式不同，只核关键几个数值出现在同一句话里
const uiChecks = [
  ['豆子',       `豆子[\\s\\S]{0,20}?${num2(10*MULT)} 分`],
  ['恐惧起始秒', `${num2(fright[0])} 秒`],
  ['冲刺倍率',   `${num2(dash)} 倍`],
  ['连击窗口',   `${num2(comboWin)} 秒没吃到`],
  ['传送门冷却', `冷却 ${num2(portalCd)} 秒`],
];
for (const [what, pat] of uiChecks){
  if (!new RegExp(pat).test(ui)) fail.push(`小游戏那份说明里「${what}」和代码对不上`);
}

console.log('从代码读到的真值：');
console.log(`  倍率 ${MULT}　豆子 ${10*MULT}　能量豆 ${50*MULT}　水果 ${300*MULT}`);
console.log(`  奖励 无伤${bonus('PERFECT_LEVEL')*MULT} 全灭${bonus('GHOST_SWEEP')*MULT} 剩命${bonus('LIFE_LEFT')*MULT} 全程${bonus('FLAWLESS_RUN')*MULT}`);
console.log(`  恐惧 ${fright[0]}→${fright[fright.length-1]} 秒　冲刺 ${dash}x　连击 ${comboWin}s（停下 ${comboIdle}x）　传送门冷却 ${portalCd}s`);
console.log('\n' + (fail.length ? '说明与代码对不上:\n  ' + fail.join('\n  ') : '两份说明里的数字都和代码一致。'));
process.exit(fail.length ? 1 : 0);
