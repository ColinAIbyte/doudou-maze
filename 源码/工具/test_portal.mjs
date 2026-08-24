// 传送门冷却：按颜色分开算，红门冷却时蓝门照样能用。
//   用法: node test_portal.mjs
//
// 冷却存在的唯一理由是"别刚落地就被弹回去"，而落点永远是同色的另一头。
// 所以按颜色分开是安全的——但**必须验**：万一某张图上两种颜色挨在一起，
// 分开算就可能出现连环弹射，玩家会被甩得莫名其妙。这里六关全扫一遍。
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
const noop=()=>{};
const fakeCtx=()=>new Proxy({},{get:(_,k)=>{
  if(k==='measureText')return t=>({width:String(t).length*7});
  if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop:noop});
  return noop;}});
const fakeCanvas=(w=494,h=546)=>({width:w,height:h,getContext:()=>fakeCtx()});
const store=new Map(); globalThis.GameGlobal=globalThis;
globalThis.location={href:'https://example.com/'};
globalThis.wx={createCanvas:()=>fakeCanvas(),getSystemInfoSync:()=>({windowWidth:390,windowHeight:844,pixelRatio:3}),
 getStorageSync:k=>store.has(k)?store.get(k):'',setStorageSync:(k,v)=>store.set(k,v),removeStorageSync:k=>store.delete(k),
 createWebAudioContext:()=>({currentTime:0,state:'running',resume:noop,destination:{},
  createOscillator:()=>({type:'',frequency:{setValueAtTime:noop,exponentialRampToValueAtTime:noop},connect:d=>d,start:noop,stop:noop}),
  createGain:()=>({gain:{setValueAtTime:noop,exponentialRampToValueAtTime:noop},connect:d=>d})}),
 onTouchStart:noop,onTouchEnd:noop,onTouchMove:noop,showKeyboard:noop,hideKeyboard:noop,
 onKeyboardInput:noop,onKeyboardConfirm:noop,onShow:noop,onHide:noop,showShareMenu:noop,
 onShareAppMessage:noop,onShareTimeline:noop};
globalThis.requestAnimationFrame=()=>0;
const html=readFileSync(new URL('../pacman_fragment.html',import.meta.url),'utf8');
let body=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')).trim()
  .replace(/^\(function\(\)\s*\{\s*(?:"use strict";|'use strict';)?/,'').replace(/\}\)\(\);?$/,'').trim();
const dir=mkdtempSync(join(tmpdir(),'pt-')); const mp=join(dir,'c.mjs');
writeFileSync(mp,`export function createGame(env){
 const document=env.document,window=env.window,localStorage=env.localStorage,
   getComputedStyle=env.getComputedStyle,requestAnimationFrame=env.requestAnimationFrame,
   cancelAnimationFrame=env.cancelAnimationFrame,performance=env.performance;
${body}
 return { fullNewGame, resetLevel, checkPortal, tileAt, COLS, ROWS, DIRS, canEnter,
   PORTAL_COOLDOWN_SECONDS, WARP_CHOICE_SECONDS, update, requestDir,
   get ghosts(){return ghosts;},
   get player(){return player;}, set level(v){level=v;}, set gameState(v){gameState=v;} };\n}\n`);
const {installShim}=await import(new URL('../微信小游戏版/js/shim.js',import.meta.url));
const shim=installShim({maze:fakeCanvas(),fx:fakeCanvas(1,1)});
const {createGame}=await import(mp);
const g=createGame(shim.env);
const fail=[];

function portals(ch){
  const out=[];
  for(let y=0;y<g.ROWS;y++) for(let x=0;x<g.COLS;x++) if(g.tileAt(x,y)===ch) out.push({x,y});
  return out;
}

console.log('冷却时长', g.PORTAL_COOLDOWN_SECONDS, '秒（按颜色分开算）\n');

for(let lv=1; lv<=6; lv++){
  g.fullNewGame(); g.level=lv; g.resetLevel(false); g.gameState='playing';
  const red=portals('1'), blue=portals('2');
  if(red.length!==2||blue.length!==2){ fail.push(`第${lv}关传送门数量不对：红${red.length} 蓝${blue.length}`); continue; }

  // 两色不能挨在同一格（那样分开算才可能出问题）
  for(const r of red) for(const b of blue)
    if(r.x===b.x && r.y===b.y) fail.push(`第${lv}关有红蓝同格 (${r.x},${r.y})`);

  const P=g.player;
  // 走红门
  P.x=red[0].x; P.y=red[0].y; P.warpCd=0; P.warpCdCh=null;
  g.checkPortal(P);
  const wentRed = (P.x===red[1].x && P.y===red[1].y);
  if(!wentRed) fail.push(`第${lv}关红门没传送`);

  // 落地后马上再踩同色：不该再传（防弹回）
  const bx=P.x, by=P.y;
  g.checkPortal(P);
  if(P.x!==bx||P.y!==by) fail.push(`第${lv}关红门落地后被立刻弹回去了`);

  // 红门冷却中，直接放到蓝门上：**应当照传不误**
  P.x=blue[0].x; P.y=blue[0].y;
  g.checkPortal(P);
  const wentBlue = (P.x===blue[1].x && P.y===blue[1].y);
  if(!wentBlue) fail.push(`第${lv}关红门冷却期间蓝门也被锁住了`);

  console.log(`第${lv}关  红 (${red[0].x},${red[0].y})→(${red[1].x},${red[1].y}) ✓　`
    + `落地不弹回 ✓　红冷却中走蓝门 ${wentBlue?'✓':'✗'}`);
}

/* 落地之后必须是"能马上走"的状态。
   原先朝向照搬穿越前的方向，而多数落点只有一个出口——玩家几乎每次都是
   朝着一堵墙、满速、还带着一个过期转向指令落地的，难控是必然的。 */
console.log('\n落地状态检查（朝向 / 待转向 / 冲刺蓄力）：');
for(let lv=1; lv<=6; lv++){
  g.fullNewGame(); g.level=lv; g.resetLevel(false); g.gameState='playing';
  const P=g.player;
  for(const ch of ['1','2']){
    const ps=[];
    for(let y=0;y<g.ROWS;y++) for(let x=0;x<g.COLS;x++) if(g.tileAt(x,y)===ch) ps.push({x,y});
    for(const from of ps){
      // 用一个**故意错的**朝向进门：落点几乎不可能还是这个方向
      for(const bad of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]){
        P.x=from.x; P.y=from.y; P.dir={...bad}; P.want={...bad};
        P.straightTiles=99; P.warpCd=0; P.warpCdCh=null;
        g.checkPortal(P);
        const moved = (P.x!==from.x||P.y!==from.y);
        if(!moved) continue;
        const cx=Math.round(P.x), cy=Math.round(P.y);
        const exits=[]; for(const k in g.DIRS) if(g.canEnter(P,cx+g.DIRS[k].x,cy+g.DIRS[k].y)) exits.push(k);
        /* 玩家落地就该**停住**——把选方向的时间还给他，这是这一版的核心。
           （幽灵不停，那条在下面的思考时间用例里单独覆盖。） */
        if(P.dir.x||P.dir.y) fail.push(`第${lv}关 落到(${cx},${cy}) 没停住，直接跑了`);
        if(exits.length===0) fail.push(`第${lv}关 落到(${cx},${cy}) 是个死格子，一个出口都没有`);
        if(P.want.x||P.want.y) fail.push(`第${lv}关 落地后还留着过期的待转向`);
        if(P.straightTiles!==0) fail.push(`第${lv}关 落地后冲刺蓄力没清零(${P.straightTiles})`);
      }
    }
  }
  console.log(`  第${lv}关 ✓`);
}

/* 落地要给玩家**选方向的时间**。
   之前是"只有一个出口就替他转过去、立刻满速跑起来"——人被瞬间挪到地图另一角，
   还没看清自己在哪、幽灵在哪就已经在跑了，传送门反而成了最容易送命的地方。
   三条都要成立：落地站住 / 按下就走（不能有延迟）/ 一直不按也不会站死。 */
console.log('\n落地思考时间（'+g.WARP_CHOICE_SECONDS+'s）：');
{
  g.fullNewGame(); g.level=1; g.resetLevel(false); g.gameState='playing';
  const P=g.player;
  const warp=()=>{ P.x=1;P.y=3; P.dir={x:-1,y:0}; P.want={x:-1,y:0};
                   P.warpCd=0; P.warpCdCh=null; P.warpChoiceUntil=0; g.checkPortal(P); };

  // 1) 落地就该站住
  warp();
  if(P.dir.x||P.dir.y) fail.push('落地没有停住，直接跑了');
  else console.log('  落地站住 ✓');

  // 2) 按下方向要**立刻**动，不能等思考时间走完
  warp();
  g.requestDir('down');
  const y0=P.y;
  g.update(1/60);
  if(P.y<=y0) fail.push('按了方向还不动，思考时间变成了强制等待');
  else console.log(`  按下即走 ✓（一帧内前进 ${(P.y-y0).toFixed(3)} 格）`);

  // 3) 一直不按，过了思考时间要自己走（唯一出口）
  warp();
  let moved=false;
  for(let i=0;i<Math.ceil((g.WARP_CHOICE_SECONDS+0.4)*60);i++){
    g.update(1/60);
    if(P.dir.x||P.dir.y){ moved=true; break; }
  }
  if(!moved) fail.push('一直不按就站死在传送门上了');
  else console.log('  不按也不会站死 ✓');

  // 4) 思考时间内确实是静止的
  warp();
  const sx=P.x, sy=P.y;
  for(let i=0;i<Math.floor(g.WARP_CHOICE_SECONDS*60)-4;i++) g.update(1/60);
  if(Math.abs(P.x-sx)>0.01||Math.abs(P.y-sy)>0.01) fail.push('思考时间内人还是飘走了');
  else console.log('  思考期间静止 ✓');
}

/* 站在落地的那扇门上**不该**再次触发，无论等多久。
   这条曾经是真 bug：落在有岔路的门上、玩家没按方向（正在看局面），
   冷却一到就被传回去，来回弹个不停——第二关干等 6 秒能弹 9 次。
   靠调长冷却只能让它弹得慢一点，治标不治本，而且代价是真想再用一次
   传送门时得干等。 */
console.log('\n站在门上干等 6 秒（不该被自己传走）：');
for(let lv=1; lv<=6; lv++){
  g.fullNewGame(); g.level=lv; g.resetLevel(false); g.gameState='playing';
  const P=g.player;
  for(const ch of ['1','2']){
    const ps=[]; for(let y=0;y<g.ROWS;y++) for(let x=0;x<g.COLS;x++) if(g.tileAt(x,y)===ch) ps.push({x,y});
    P.x=ps[0].x; P.y=ps[0].y; P.dir={x:0,y:0}; P.want={x:0,y:0};
    P.warpCd=0; P.warpCdCh=null; P.warpChoiceUntil=0; P.warpStandingOn=null;
    g.checkPortal(P);
    const landed={x:Math.round(P.x),y:Math.round(P.y)};
    const exits=[]; for(const k in g.DIRS) if(g.canEnter(P,landed.x+g.DIRS[k].x,landed.y+g.DIRS[k].y)) exits.push(k);
    if(exits.length<2) continue;   // 单出口会自动走掉，不适用
    // 幽灵关起来：站着不动必然被抓，而死亡重生也是位置变化，会混淆判断
    g.ghosts.forEach(gh=>{ gh.state='house'; gh.releaseAt=1e9; });
    let moves=0, last={...landed};
    for(let i=0;i<60*6;i++){
      P.want={x:0,y:0};
      g.update(1/60);
      const now={x:Math.round(P.x),y:Math.round(P.y)};
      if(now.x!==last.x||now.y!==last.y){ moves++; last=now; }
    }
    if(moves>0) fail.push(`第${lv}关 站在(${landed.x},${landed.y})干等，被自己传走了 ${moves} 次`);
  }
  console.log(`  第${lv}关 ✓`);
}

console.log('\n'+(fail.length?'失败:\n  '+fail.join('\n  '):'六关的传送门：冷却按色独立、落地有思考时间、站着不会自我弹射。'));
process.exit(fail.length?1:0);
