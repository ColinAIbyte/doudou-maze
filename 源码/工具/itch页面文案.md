# itch.io 上架资料（中英双语）

> 放在 `工具/` 而不是 `itch上传包/`：那个目录是 build_itch.mjs 的产出目录，
> 会被重新打包覆盖。（第一版就放在那儿，重跑一次打包直接被删了。）

游戏本身**保持中文**，只有这个展示页做双语。
所以 itch 的语言标记必须是 **Chinese (Simplified)**，不要勾 English ——
itch 的质量规范要求语言标记和实际内容一致，标错会影响推荐展示。
等以后游戏内加了中英切换，再回来把 English 补上。

---

## 1. Title（标题栏）

```
Doudou Maze / 豆豆迷宫
```

英文在前：itch 的浏览和搜索以英文用户为主，`Doudou Maze` 让人一眼知道这是
个迷宫游戏；后面跟中文原名，中文玩家也认得。

## 2. Short description / tagline（列表页那一行，限 120 字符）

```
A neon maze arcade game a dad built with his son. 一个爸爸和儿子一起做的霓虹迷宫游戏。
```

92 字符，安全。

---

## 3. 详情正文（贴进 itch 的富文本编辑器）

英文在上、中文在下：海外用户先读到英文，中文朋友往下一眼就看到。

---

### Doudou Maze 豆豆迷宫

My son wanted a game that was simple but exciting, so we made one together.
He played and told me what was wrong; I fixed it, a little at a time.
Later his friends joined the playtesting — and that's how Doudou Maze and
its six levels came to be.

儿子想玩一个简单又刺激的小游戏，于是我们一起把它做了出来。
他负责试玩和提意见，我负责一点点修改完善。后来，几个小朋友也加入了试玩，
才有了现在的《豆豆迷宫》和六个关卡。

**— 超级奶爸 (Super Dad)**

---

#### How to play 玩法

**Use Arrow Keys or WASD to move. Swipe to change direction on mobile.
Eat all the pellets to clear the maze.**

电脑用方向键或 WASD 移动，手机在迷宫上滑动转向。吃光豆子即可过关。

---

#### Features 游戏特色

- **Combo scoring** — keep eating without a break and the multiplier climbs, no cap.
  **连击计分** —— 连着吃倍率一直涨，上不封顶。
- **Power pellets** — turn the tables and eat the ghosts. Each one within a single
  power-up is worth more than the last.
  **能量豆** —— 反过来吃幽灵，同一颗能量豆内吃得越多，赏金越高。
- **Four ghost personalities** — a chaser, an ambusher, a shy one that flees, and a
  patroller that ignores you entirely.
  **四种幽灵** —— 追击者、伏击者、怕生鬼、巡逻者，各有各的脾气。
- **Portals, dashes and wall-phasing** — paired portals at the corners, a speed boost
  for running straight, and a fruit that lets you walk through walls.
  **传送门 · 冲刺 · 穿墙** —— 四角成对的传送门，直线越跑越快，神秘水果让你穿墙。
- **Ghost fusion** — two frightened ghosts colliding merge into a Super Ghost.
  **幽灵融合** —— 两只受惊的幽灵相撞会合成「超级幽灵」。
- **Six levels, six mazes** — plus a practice mode, so you never have to restart from
  level one.
  **六关六张地图** —— 外加练习模式，不必每次都从第一关重来。

---

#### Note 说明

The game's interface is in **Chinese**. The controls are simple enough to play
without reading — move, eat, avoid the ghosts — and the icons speak for themselves.
An English version may come later.

游戏界面是中文的。

Your scores are saved **in your own browser only** — there is no online leaderboard,
and nothing is uploaded anywhere.

成绩只存在你自己的浏览器里，没有在线排行榜，不会上传到任何地方。

---

#### Feedback 反馈

Found a bug, or have an idea? I'd love to hear it.
如果你有任何建议，或在游戏中发现了问题，欢迎来信告诉我。

**Email: 2685897@qq.com**

---

## 4. itch 表单逐项怎么填

| 字段 | 填什么 | 为什么 |
|---|---|---|
| Kind of project | **HTML** | 网页游戏 |
| Uploads | `doudou-maze-itch.zip`，勾 **This file will be played in the browser** | 不勾就变成"下载"而不是"在线玩" |
| Embed options | **Manually set size**：宽 `720`、高 `900` | 实测出来的，见下 |
| Fullscreen button | **勾上** | 棋盘越高越大，全屏明显更好 |
| Mobile friendly | **勾上**，方向 **Portrait**（竖屏） | 手机上有虚拟方向键，竖屏是对的 |
| Genre | **Puzzle**（次选 Action） | |
| Tags | `arcade` `maze` `pacman-like` `neon` `retro` `singleplayer` `html5` `mobile` | 别加 `english`，界面不是英文 |
| **Language** | **Chinese (Simplified)** ← 只选这一个 | 界面是中文，标 English 属于标错 |
| Input | Keyboard, Mouse, Touchscreen | 三种都支持 |
| Accessibility | 留空 | 没有色盲模式和字幕，别乱勾 |
| Pricing | **No payments**（免费） | |
| Visibility | 先 **Draft**，自测通过再 **Public** | |

### 为什么是 720 × 900

棋盘是 19:21 的**竖长方形**，宽度富余没用，高度才决定棋盘多大。实测同一版游戏
在不同嵌入尺寸下棋盘的实际大小：

| 嵌入尺寸 | 棋盘大小 |
|---|---|
| 960 × 640（itch 常见默认） | 357 × 395 |
| 800 × 600 | 321 × 355 |
| 640 × 800 | 502 × 555 |
| **720 × 900** | **593 × 655** ← 最大 |

宽扁的默认尺寸最吃亏：960 宽反而只得到 357 的棋盘。六个尺寸都测过，横竖都没有
溢出和滚动条。

---

## 5. 上传步骤

1. 打包：
   ```
   cd ~/吃豆豆/v1-发布版/工具 && node build_itch.mjs
   ```
   产物在 `~/吃豆豆/itch上传包/doudou-maze-itch.zip`（92 KB）。
2. 到 https://itch.io/game/new 新建项目（要先登录你自己的账号）。
3. 按上表填写，正文粘贴第 3 节。
4. 上传 zip，勾 **This file will be played in the browser**。
5. 先存 **Draft**，用预览链接自测（第 6 节）。
6. 通过后改 **Public**。
7. **拿到正式地址后再打一次包并重新上传**：
   ```
   cd ~/吃豆豆/v1-发布版/工具 && node build_itch.mjs https://你的名字.itch.io/doudou-maze
   ```

### 第 7 步为什么不能省

itch 把游戏放在 `html-classic.itch.zone` 的 iframe 里跑。游戏内「分享成绩」默认
按当前地址生成链接，在 itch 上拿到的就是 CDN 里那个 html 文件的地址 —— 别人点开
是一个没有介绍、没有作者、随时可能换地址的裸游戏页。链接点得开、不报错，只是
落错了地方，除非真去点一次否则发现不了。

带上正式地址重新打包会注入 `window.DOUDOU_SHARE_URL`，分享链接就落到你的 itch
页面上。第一次上传时还没有地址，所以只能分两次。

---

## 6. 上线前自测清单

在 Draft 的预览页上逐条过：

- [ ] 游戏能加载，标题和「投币」正常显示
- [ ] 点「开始游戏」能玩，方向键 / WASD 都好使
- [ ] 点全屏按钮，棋盘变大且不变形，退出全屏能回到原样
- [ ] 手机上打开：竖屏、有虚拟方向键、滑动能转向
- [ ] 手机上页面**不左右滑动**
- [ ] 「玩法」和「♥ 关于」两个弹层都能开能关
- [ ] 关于弹层里的邮箱能点（手机上会打开邮件 App）
- [ ] 死一局能进结算页，能「再来一局」
- [ ] 打一局后刷新，最高纪录还在（**若不在**：见下，不是 bug）
- [ ] 分享成绩生成的链接指向你的 itch 页面，不是 itch.zone

### 已知限制（心里有数，不必修）

Safari 和 Firefox 的严格隐私模式会**拦截第三方 iframe 里的本地存储**，而 itch 的
游戏正跑在第三方 iframe 里。所以在这些浏览器上，最高纪录、本机榜单、练习模式的
关卡解锁都**不会保存**，每次打开都是新的。

游戏本身不会崩 —— 所有存储访问都有兜底，`test_edge_cases.mjs` 里有一条专门验
"localStorage 全程抛异常也能开局、能跑、能结算"。这是平台限制，不是游戏的问题。
你自己的网址（colinaibyte.github.io）是第一方页面，不受影响。
