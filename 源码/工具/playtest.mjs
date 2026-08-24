// 无头试玩：在 node 里让机器人把六关跑一遍，报通关率。
//   用法: node playtest.mjs [每关局数]
//
// 原来这套只能在浏览器控制台里跑（测试版.html + __dbg.sim + __bot.policy）。
// 搬到 node 有两个实在的好处：
//   * 不再受浏览器摆布。标签页不在前台时 rAF 会被暂停，游戏看着像卡死；后来
//     连 localhost 都被策略挡了。判断"这关能不能过"不该依赖这些。
//   * 一条命令就能跑，改完难度顺手验一次的成本几乎为零。
//
// 测的是 pacman_fragment.html 本身，不是副本。
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const TRIALS = Number(process.argv[2]) || 20;

// —— 假环境（与 test_phase.mjs 同一套）——
const noop = () => {};
const fakeCtx = () => new Proxy({}, {
  get: (_, k) => {
    if (k === 'measureText') return (t)=>({width:String(t).length*7});
    if (k === 'createLinearGradient' || k === 'createRadialGradient')
      return ()=>({addColorStop:noop});
    if (k === 'canvas') return undefined;
    return noop;
  },
});
const fakeCanvas = (w=494,h=546) => ({ width:w, height:h, getContext:()=>fakeCtx() });
const store = new Map();
globalThis.GameGlobal = globalThis;
globalThis.wx = {
  createCanvas:()=>fakeCanvas(),
  getSystemInfoSync:()=>({windowWidth:390,windowHeight:844,pixelRatio:3}),
  getStorageSync:(k)=>store.has(k)?store.get(k):'',
  setStorageSync:(k,v)=>store.set(k,v),
  removeStorageSync:(k)=>store.delete(k),
  createWebAudioContext:()=>{
    const param=()=>({setValueAtTime:noop,linearRampToValueAtTime:noop,
                      exponentialRampToValueAtTime:noop,cancelScheduledValues:noop,value:0});
    const node=(x)=>Object.assign({connect:(d)=>d,disconnect:noop},x);
    return { currentTime:0,state:'running',resume:noop,destination:node({}),
             createOscillator:()=>node({type:'square',frequency:param(),detune:param(),
                                        start:noop,stop:noop,onended:null}),
             createGain:()=>node({gain:param()}) };
  },
  onTouchStart:noop,onTouchEnd:noop,onTouchMove:noop,showKeyboard:noop,hideKeyboard:noop,
  onKeyboardInput:noop,onKeyboardConfirm:noop,onShow:noop,onHide:noop,
};
globalThis.requestAnimationFrame = () => 0;
globalThis.performance = globalThis.performance || { now: () => Date.now() };

const html = readFileSync(here('../pacman_fragment.html'), 'utf8');
let bodyJs = html.slice(html.indexOf('<script>')+8, html.lastIndexOf('</script>')).trim();
bodyJs = bodyJs.replace(/^\(function\(\)\s*\{\s*(?:"use strict";|'use strict';)?/, '')
               .replace(/\}\)\(\);?$/, '').trim();
const dir = mkdtempSync(join(tmpdir(), 'doudou-pt-'));
const modPath = join(dir, 'core.mjs');
writeFileSync(modPath, `export function createGame(){\n${bodyJs}\n
  return { update, requestDir, fullNewGame, resetLevel, tileAt, COLS, ROWS, MAX_LEVEL,
           get grid(){return grid;}, get player(){return player;}, get ghosts(){return ghosts;},
           get level(){return level;}, set level(v){level=v;},
           get lives(){return lives;}, get score(){return score;},
           get gameState(){return gameState;}, set gameState(v){gameState=v;},
           get pelletsLeft(){return pelletsLeft;}, get frightTimer(){return frightTimer;},
           get combo(){return combo;} };\n}\n`);

const { installShim } = await import(here('../微信小游戏版/js/shim.js'));
installShim({ maze: fakeCanvas(), fx: fakeCanvas(1,1) });
const { createGame } = await import(modPath);
const g = createGame();

// —— 机器人（与 工具/autoplay.js 同一套策略）——
const DIRS = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
const NAME = new Map([['1,0','right'],['-1,0','left'],['0,1','down'],['0,-1','up']]);
const COLS = g.COLS, ROWS = g.ROWS, TUNNEL = 10;
const walkable = (x,y) => {
  if (y<0||y>=ROWS) return false;
  let nx=x; if(nx<0)nx=COLS-1; if(nx>=COLS)nx=0;
  const ch = g.grid[y][nx];
  return ch!=='#' && ch!=='g' && ch!=='D';
};
function bfs(sx,sy,blocked){
  const dist=Array.from({length:ROWS},()=>new Array(COLS).fill(-1));
  const from=Array.from({length:ROWS},()=>new Array(COLS).fill(null));
  dist[sy][sx]=0; const q=[[sx,sy]];
  for(let h=0;h<q.length;h++){
    const [x,y]=q[h];
    for(const d of DIRS){
      const ny=y+d.y; if(ny<0||ny>=ROWS) continue;
      let nx=x+d.x;
      if(nx<0||nx>=COLS){ if(y!==TUNNEL) continue; nx=nx<0?COLS-1:0; }
      if(dist[ny][nx]!==-1||!walkable(nx,ny)) continue;
      if(blocked&&blocked.has(nx+','+ny)) continue;
      dist[ny][nx]=dist[y][x]+1; from[ny][nx]=[x,y]; q.push([nx,ny]);
    }
  }
  return {dist,from};
}
function stepToward(sx,sy,from,tx,ty){
  let cur=[tx,ty], prev=null;
  while(cur && !(cur[0]===sx&&cur[1]===sy)){ prev=cur; cur=from[cur[1]][cur[0]]; }
  if(!prev) return null;
  let dx=prev[0]-sx, dy=prev[1]-sy;
  if(dx>1) dx=-1; if(dx<-1) dx=1;
  return NAME.get(dx+','+dy) || null;
}
function dangerSet(radius){
  const s=new Set();
  for(const gh of g.ghosts){
    if(gh.state==='eaten'||gh.state==='house'||gh.state==='fused-hidden') continue;
    if(g.frightTimer>0) continue;
    const gx=Math.round(gh.x), gy=Math.round(gh.y);
    if(!walkable(gx,gy)) continue;
    const {dist}=bfs(gx,gy,null);
    for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)
      if(dist[y][x]>=0&&dist[y][x]<=radius) s.add(x+','+y);
  }
  return s;
}
function nearest(dist,pick){
  let best=null,bd=Infinity;
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
    if(dist[y][x]<0||dist[y][x]>=bd) continue;
    if(!pick(g.grid[y][x])) continue;
    bd=dist[y][x]; best=[x,y];
  }
  return best?{tile:best,d:bd}:null;
}
function policy(){
  const sx=Math.round(g.player.x), sy=Math.round(g.player.y);
  if(!walkable(sx,sy)) return null;
  const isPellet=c=>c==='.'||c==='o', isPower=c=>c==='o';
  for(const radius of [3,2,1,0]){
    const blocked = radius?dangerSet(radius):null;
    const {dist,from}=bfs(sx,sy,blocked);
    if(g.frightTimer>0.6){
      let bg=null,bd=Infinity;
      for(const gh of g.ghosts){
        if(gh.state==='eaten'||gh.state==='house'||gh.state==='fused-hidden') continue;
        const gx=Math.round(gh.x),gy=Math.round(gh.y);
        if(gy<0||gy>=ROWS||gx<0||gx>=COLS) continue;
        if(dist[gy][gx]>=0&&dist[gy][gx]<bd){bd=dist[gy][gx];bg=[gx,gy];}
      }
      if(bg&&bd<=10) return stepToward(sx,sy,from,bg[0],bg[1]);
    }
    const threat=g.ghosts.some(gh=>g.frightTimer<=0&&gh.state!=='eaten'&&gh.state!=='house'&&
      Math.abs(Math.round(gh.x)-sx)+Math.abs(Math.round(gh.y)-sy)<=6);
    if(threat){
      const p=nearest(dist,isPower);
      if(p&&p.d<=12) return stepToward(sx,sy,from,p.tile[0],p.tile[1]);
    }
    const t=nearest(dist,isPellet);
    if(t) return stepToward(sx,sy,from,t.tile[0],t.tile[1]);
  }
  return null;
}

function sim(maxSeconds){
  const l0=g.level, v0=g.lives;
  const ticks=Math.round(maxSeconds*60);
  for(let t=0;t<ticks;t++){
    if(g.gameState!=='playing') break;
    const d=policy(); if(d) g.requestDir(d);
    g.update(1/60);
    if(g.level!==l0||g.lives!==v0||g.gameState!=='playing') break;
  }
  const won = g.gameState==='over' && g.pelletsLeft<=0;
  return { cleared: g.level!==l0 || won, won, state:g.gameState,
           livesLost: v0-g.lives, level:g.level, score:g.score };
}

// —— 跑 ——
console.log(`每关 ${TRIALS} 局 + 完整六关 ${TRIALS} 局\n`);
console.log('关卡  通关率   平均死亡');
for(let lv=1; lv<=6; lv++){
  let cleared=0, deaths=0;
  for(let t=0;t<TRIALS;t++){
    g.fullNewGame(); g.level=lv; g.resetLevel(false); g.gameState='playing';
    for(let life=0;life<6;life++){
      const r=sim(200);
      if(r.cleared){ cleared++; break; }
      if(r.state!=='playing') break;
      if(r.livesLost) deaths+=r.livesLost; else break;
    }
  }
  console.log(`  ${lv}    ${String(Math.round(cleared/TRIALS*100)).padStart(3)}%     ${(deaths/TRIALS).toFixed(2)}`);
}

let wins=0; const stuck={};
for(let t=0;t<TRIALS;t++){
  g.fullNewGame(); g.gameState='playing';
  let guard=0, won=false;
  while(guard++<80){
    const r=sim(200);
    if(r.won){ won=true; break; }
    if(r.state!=='playing') break;
    if(!r.cleared && !r.livesLost) break;
  }
  if(won) wins++; else stuck[g.level]=(stuck[g.level]||0)+1;
}
console.log(`\n完整六关: ${wins}/${TRIALS} = ${Math.round(wins/TRIALS*100)}%`);
if(Object.keys(stuck).length) console.log('失败卡在:', JSON.stringify(stuck));
