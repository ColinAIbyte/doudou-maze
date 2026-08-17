// 标签必须闭合配对。
//   用法: node test_markup.mjs
//
// 为什么值得单独一条：多一个 </div> 不会报错，浏览器会默默替你收拾残局 ——
// 而它收拾的办法是把后面的内容挪到上一层去。这次的真实事故是把玩法说明里的
// 折叠区摊开时多留了一个 </div>：.help-doc 提前闭合，后面的 .pad-area 直接
// 成了 body 的孩子、跑到 .cabinet 外面，于是 375px 的手机上整页横向溢出 79px，
// 标题和 HUD 两侧被裁掉。
//
// 而当时 23 个测试全绿：它们测的是逻辑和数值，没有一条看结构。逻辑测试再多，
// 也测不出"标签少了一个"。构建脚本也不会拦 —— 它只搬字符串，不解析 HTML。
//
// 只查这一件事，所以不引第三方解析器：真正会犯的错是"多一个/少一个闭合标签"，
// 一个栈就够，而且报得出是哪一行。
import { readFileSync } from 'node:fs';

const VOID = new Set(['area','base','br','col','embed','hr','img','input','link',
                      'meta','param','source','track','wbr']);

/** 返回不平衡的地方；空数组表示配对正确。 */
function checkBalance(markup, label){
  // 注释里有成对的示例标签（比如说明文字里提到 <details>），必须先去掉，
  // 否则注释自己就会把栈搞乱。
  const clean = markup.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
  const stack = [];
  const bad = [];
  const lineOf = (idx) => clean.slice(0, idx).split('\n').length;

  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m;
  while ((m = re.exec(clean))){
    const [, slash, rawName, attrs, selfClose] = m;
    const name = rawName.toLowerCase();
    if (VOID.has(name) || selfClose === '/') continue;
    if (!slash){
      stack.push({ name, line: lineOf(m.index) });
    } else {
      if (!stack.length){
        bad.push(`${label} 第 ${lineOf(m.index)} 行：多出一个 </${name}>，这里已经没有未闭合的标签了`);
        continue;
      }
      const top = stack[stack.length - 1];
      if (top.name === name){ stack.pop(); continue; }
      // 名字对不上：要么少闭合了里面那个，要么这个闭合标签是多余的
      const depth = stack.map(s => s.name).lastIndexOf(name);
      if (depth === -1){
        bad.push(`${label} 第 ${lineOf(m.index)} 行：多出一个 </${name}>（当前未闭合的是 <${top.name}>，开在第 ${top.line} 行）`);
      } else {
        const unclosed = stack.slice(depth + 1).map(s => `<${s.name}>(第 ${s.line} 行)`).join('、');
        bad.push(`${label} 第 ${lineOf(m.index)} 行遇到 </${name}>，但里面还有没闭合的：${unclosed}`);
        stack.length = depth;
      }
    }
  }
  for (const s of stack) bad.push(`${label}：<${s.name}>（第 ${s.line} 行）一直没有闭合`);
  return bad;
}

const fail = [];

/* 网页版：只查 </style> 到 <script> 之间那段真正的标记。
   样式和脚本里都有 < 和 >（比如 a < b、箭头函数），拿去当标签解析必然乱。 */
const src = readFileSync(new URL('../pacman_fragment.html', import.meta.url), 'utf8');
const mStart = src.indexOf('</style>') + '</style>'.length;
const mEnd   = src.indexOf('<script>');
if (mStart <= 0 || mEnd < 0 || mEnd <= mStart){
  fail.push('定位不到网页版的标记段落（</style> … <script>）');
} else {
  const head = src.slice(0, mStart).replace(/[^\n]/g, ' ');   // 保住行号
  fail.push(...checkBalance(head + src.slice(mStart, mEnd), '网页版'));
}

// 小程序版的 WXML 整份都是标记，直接查
const wxml = readFileSync(new URL('../../微信小程序版/pages/game/game.wxml', import.meta.url), 'utf8');
fail.push(...checkBalance(wxml, '小程序 WXML'));

if (fail.length){
  console.log('标签不配对：');
  fail.forEach(f => console.log('  ✗ ' + f));
  console.log('\n浏览器不会报错，它会把后面的内容挪到上一层去 —— 表现是布局莫名溢出或错位。');
  process.exit(1);
}
console.log('网页版与小程序 WXML 的标签都配对正确。');
