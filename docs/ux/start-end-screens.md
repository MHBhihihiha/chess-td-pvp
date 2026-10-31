> **v18 微调（只动两处几何/可见度，结构不变）**
> - `.dock` 上移：`bottom 74 → 96px`（三档同步 88 / 74 / 104），按钮与两角小控件离得更开。
> - 两角更清楚：难度胶囊与图鉴胶囊底色 `.62 → .76`、边框 `.44 → .58`、加一层很轻的外发光。
>   仍然没有卡片底板、没有分割线 —— 只是"看得清"，不是"变重"。
> 截图：`dev/_shots/v18/start_1440.png` / `start_1280.png`。

> **v16 改版（海报式主菜单）—— 先读这一节，下面 §3/§4 的「规则卡片 / 难度卡 / 兵种带」描述已过时。**
>
> 玩家要求：不要厚重绿色方框、不要密密麻麻的信息面板；标题放大放上半区；
> 对战说明 / 难度 / 图鉴缩小弱化、半透明悬浮底部角落；构图重心交给建筑与兵种。
>
> 现结构（`index.html` 内 `#start`）：
>
> | 层 | 元素 | 说明 |
> |---|---|---|
> | 底 | `.poster` | `art/v9/start_poster.jpg`（AI 生成的主视觉：浮空主城 + 兵种环绕 + 底层棋盘），`cover` 铺满；`::before/::after` 两段柔和压暗给文字让位 |
> | 上 | `.mast` | `.kicker`（BOARD TOWER DEFENSE）+ `.title`（棋盘塔防，`clamp(46px,7.2vw,88px)`）+ `.tag` |
> | 中下 | `.dock` | `#startbtn`「开始对战」胶囊 + 一行 `.meta` 规则提示 |
> | 左下 | `.corner-l` | `.diff` 难度小胶囊（只留名字，描述/角标已隐藏）+ `.cur` 当前难度 |
> | 右下 | `.corner-r` | `.ghost` 图鉴入口 |
>
> 铁律：**没有卡片、没有分隔线、没有信息块**；所有压暗都是渐变，不许出现硬边。
> 已退役：`.rules`（5 条规则卡）、`.roster`（底部兵种展示带）、`.slabel`、`.hero/.brand`。
> 契约：`dev/ui-contract-test.js` 第 7 节锁新结构，并**反向断言**旧卡片不许回潮。

# 开始 / 结束界面 UX 重构规格

> **任务**：T4-UX-STARTEND · **负责**：文策渊（design-strategist）· **主理人**：游承峰
> **对象**：`game/index.html` 的 `#start`（开始界面）与 `#over`（结束界面）
> **对标标准**：王国保卫战 / Bloons TD 主菜单质感 —— 层级清晰、有仪式感、信息分组明确、CTA 突出
> **性质**：UX 规格文档，不含最终代码；所有 CSS / HTML / JS 片段为"可直接照抄进 index.html"的实施级写法
> **遮罩定位**：双模态——视口高 ≤900px 时 `#start` / `#over` 为 `position: fixed`，盖住整个视口（含顶栏+面板）；>900px 时维持 `position: absolute`，只遮棋盘区（§2.1；T4-UX-REVISE-SHORTVIEW 用户拍板）
> **状态**：已实施（index.html；dom 40 / headless 83 全绿）；§2.1 定位规则与 §9.2 验收 #1 随双模态拍板修订，其余拍板项见 §10

---

## 0. 术语表与代码事实（规格的事实来源）

| 术语 | 含义 | 代码依据 |
|---|---|---|
| 大本营 | 双方各一座，摧毁即胜 | `logic.js` `addBase` / `ownBase(state, team)` |
| 自己半场 | 蓝方 = 行 6–10（建筑只准建在这） | 面板文案 / `rebuildFields` |
| 行A / 行B | 棋盘外出兵通道：行A（行0）= 红方通道；**行B（行11）= 蓝方通道，玩家点这里派兵** | `logic.js:11-12, 29` |
| 决胜时刻 | 5 分钟（300s）后双方大本营开始持续掉血（6 DPS，逐档加剧） | `logic.js:43-44, 2036-2041` |
| 平局 | 仅 60 分钟模拟上限触发（`MAX_SIM_SECONDS`） | `logic.js:45, 2216` |
| 战绩数据 | `state.stats[team] = {spent, income, kills, produced}`；`kills` = 该方**建筑**击杀的敌单位数 | `logic.js:477-479, 1208` |
| 阵营常量 | `ME='blue'`（玩家）/ `FOE='red'`（电脑） | `index.html:673` |
| 难度默认值 | `'normal'`（普通） | `index.html:223` |

**现有 bug（必须随本次重构修复）**：`index.html:2509`
```js
'击败敌方单位：' + (state.stats[FOE].produced ? '—' : '—') + '　我方已派兵：' + ...
```
恒显示 `—`。正确数据源是 `state.stats[ME].kills`（我方建筑击杀数）。规格中的修复方案见 §5.2。

---

## 1. 设计目标与对标法则

从 Kingdom Rush / Bloons TD 主菜单提炼的 4 条法则，本次重构逐条落地：

| 法则 | 本次落地 |
|---|---|
| **F1 三层视觉层级** | 每屏只有一个"最大字"（开始=标题 44px / 结束=结果 30px），其余元素字号、字重、颜色全部让位 |
| **F2 信息分组带标签** | 开始界面分 6 区，规则区与难度区各有带装饰线的分区标签（`对战手册` / `选择难度`），不使用裸文字堆叠 |
| **F3 CTA 一眼可辨** | 全屏唯一实心亮色大按钮（林绿渐变 + 外发光），次级操作一律幽灵按钮 |
| **F4 仪式感三件套** | 入场逐区上升动画 + 贴图兵种带（"亮出军队"）+ 结束界面背后终局棋盘的高斯模糊（"看到自己打下的江山"） |

**红线自检**：无主导策略（纯展示层，不改数值）；无经济改动；无认知过载（开始界面每区 ≤5 条信息，规则一条一句话）；支柱不漂移（林绿 palette 与棋盘视觉语言一致延伸）。

---

## 2. 总体结构改动（overlay 层级）

### 2.1 关键结构决策：`#start` / `#over` 双模态定位（矮屏 fixed 全屏 / 高屏 absolute 棋盘区）

**决策演进**：本规格原定 `position: fixed` 全屏遮罩（§10-5 方案 A）；实施期用户选择"只遮棋盘区"（方案 B），工程按 `position: absolute; inset: 0; z-index: 30` 落地。768p 验收实测：棋盘区（`#board-wrap`）可用高度仅约 414px（768 − 顶栏约 30 − 底部三行卡片面板约 324），而开始界面全尺寸内容约 725px（主列 625 + 兵种带 100）、紧凑模式（≤760px）也约 540px——absolute 遮罩在矮屏必触发滚动条，§9.2 验收标准 #1 不达标。

**现拍板（双模态，覆盖原单一形态；切换规则见 §8.3）**：

| 视口高度 | 定位 | 遮罩范围 | 理由 |
|---|---|---|---|
| ≤ 900px | `position: fixed; inset: 0` | 整个视口（含顶栏 + 底部面板） | 可用 768px / 900px > 内容 725px，无滚动；矮屏下"菜单嵌在棋盘区"必然溢出，不如让菜单接管全屏 |
| > 900px | `position: absolute; inset: 0`（维持现状） | 只遮棋盘区 | 尊重用户原选择：菜单边界感——顶栏与面板在菜单外围可见，菜单像一块嵌在棋盘上的面板，不与整个应用抢层级 |

- **切换条件**：视口高度 ≤900px 走 fixed、>900px 走 absolute，由 `@media (max-height: 900px)` 纯 CSS 实现；JS 与 class 钩子完全不变（`#start` 默认显示、`.hide` 收起；`#over` 默认隐藏、`.show` 弹出）。
- **紧凑模式保留**：已有 `max-height: 760px / 660px` 两档紧凑规则不动，作为 fixed 分支内的二级压缩（760px 档内容 ≈540px，仍小于 768px 视口，无滚动）。
- **z-index**：统一 `z-index: 30`（工程现行值），高于 `#detail`（fixed，20）与棋盘，压得住，无需回到原方案的 40。
- `#over` 维持 `backdrop-filter: blur(3px)`：终局棋盘作为"背景板"透出，是 F4 仪式感的核心一笔（fixed 分支透出视口级终局棋盘，效果等价）。
- **结构树不变**（§2.2）：`#start` / `#over` 仍是 `#board-wrap` 子节点，absolute 分支直接可用；fixed 分支相对视口定位、脱离父级约束，DOM 零改动。

### 2.2 结构树（目标态）

```
#app
├── #topbar            （被遮罩盖住，菜单态不可见）
├── #board-wrap
│   ├── #cv #hint #detail
│   ├── #over          ← 改为 fixed 全屏，§5
│   └── #start         ← 改为 fixed 全屏，§3
└── #panel             （被遮罩盖住）
```

---

## 3. 开始界面（#start）

### 3.1 线框图与信息架构

```
┌────────────────────────────────────────────────────────┐
│              ┌──┐  B O A R D   T O W E R   D E F E N S E│  ① 徽标行（30px）
│                 │  │  base_L1 徽标 + 英文微标            │
│                                                        │
│                    棋 盘 塔 防                          │  ② 主标题区（44px 渐变）
│        蓝方（你） vs 红方（AI）· 10×10 棋盘 · 双通道出兵   │     tagline 13px
│                                                        │
│        ── 对 战 手 册 ──                                │  ③ 规则手册区（标签+面板）
│   ┌──────────────────────────────────────────────┐      │
│   │ 01 目标 ……      02 经营 ……                   │      │     两列网格 5 条
│   │ 03 派兵 ……      04 法术 ……                   │      │
│   │ 05 全局 ……（通栏）                            │      │
│   └──────────────────────────────────────────────┘      │
│        ── 选 择 难 度 ──                                │  ④ 难度选择区
│   ┌────────┐   ┌────────┐   ┌────────┐                 │
│   │ 普通   │   │ 困难   │   │ 地狱   │                 │     三卡 196px
│   └────────┘   └────────┘   └────────┘                 │
│                  ▐ 开 始 游 戏 ▐                        │  ⑤ CTA 区
│              当前难度：普通                              │
├────────────────────────────────────────────────────────┤
│  [步][甲][攻][车][弓][球][艇][龙]                        │  ⑥ 兵种展示带（贴底）
│   步兵75  重甲280  攻城120 ……                          │
└────────────────────────────────────────────────────────┘
```

**分区信息密度上限**：①1 项 / ②2 项 / ③5 条 / ④3 卡（每卡 4 行）/ ⑤2 项 / ⑥8 单元（每单元 3 行）。

### 3.2 间距节奏（8px 基准）

| 位置 | 值 |
|---|---|
| overlay 内边距 | `padding: 26px 20px 0`（兵种带贴底，不参与主列内边距） |
| 主列（`.stack`）区间隔 | `gap: 18px` |
| 主列最大宽度 | `760px`（居中） |
| 分区标签与内容间距 | `8px` |
| 规则面板内边距 | `14px 18px 15px` |
| CTA 与提示行间距 | `4px` |
| 兵种带高度预算 | `≈100px`（56px 图标槽 + 2 行 10px 文字 + padding） |

### 3.3 分区规格

#### ① 徽标行 `.brand`

```html
<div class="brand">
  <span class="em"><img src="art/v9/base_L1.png" alt=""></span>
  <span class="wm">BOARD TOWER DEFENSE</span>
</div>
```

```css
#start .brand { display: flex; align-items: center; justify-content: center; gap: 10px; }
#start .brand .em {
  width: 30px; height: 30px; border: 1px solid #44664b; border-radius: 7px;
  background: linear-gradient(#243829, #1b2b1f);
  display: flex; align-items: center; justify-content: center; overflow: hidden;
}
#start .brand .em img { width: 24px; height: 24px; object-fit: contain; display: block; }
#start .brand .wm {
  font-size: 10px; font-weight: 700; letter-spacing: .42em; text-indent: .42em; color: #9db89a;
}
```

- `base_L1.png`（512×512，底部锚定）在 24px 盒内 `object-fit:contain`，作为徽标足够辨识。
- `letter-spacing` 会产生尾随空格使视觉中心左偏，统一用 `text-indent` 同值补偿（本规格所有加字距处同款处理）。

#### ② 主标题区 `.title` + `.tag`

```html
<h1 class="title">棋盘塔防</h1>
<div class="tag">蓝方（你） vs 红方（AI）· 10×10 棋盘 · 双通道出兵</div>
```

```css
#start .title {
  margin: 2px 0 0; font-size: 44px; font-weight: 800; line-height: 1.12;
  letter-spacing: .18em; text-indent: .18em; color: #8fe06a;   /* 渐变字失效时的回退色 */
  filter: drop-shadow(0 3px 14px rgba(143,224,106,.22));
}
@supports (-webkit-background-clip: text) {
  #start .title {
    background: linear-gradient(180deg, #eafccd 6%, #8fe06a 58%, #5da04a 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
}
#start .tag { font-size: 13px; color: #a8c3a4; letter-spacing: .08em; margin-top: 7px; }
```

- 渐变字顶色取金绿高光 `#eafccd`（`#ffe9a8` 与 `#8fe06a` 的中间提亮，见 §7 新增色说明）、中段强调色、根部草地色——"从草里长出来"的质感，与棋盘草地同源。
- 标题即全屏最大字（F1），44px；副标题 13px 明确让位。

#### ③ 规则手册区 `.slabel` + `.rules`

```html
<div class="slabel">对战手册</div>
<div class="rules">
  <div class="r"><span class="num">01</span><div><span class="k">目标</span>——先摧毁对方<b>大本营</b>；5 分钟后进入<b>决胜时刻</b>，双方大本营持续掉血</div></div>
  <div class="r"><span class="num">02</span><div><span class="k">经营</span>——建筑只能建在<b>自己半场</b>（行 6–10）；点已有建筑可升级、选分支或拆除返还</div></div>
  <div class="r"><span class="num">03</span><div><span class="k">派兵</span>——点击底部<b>行B</b>通道派兵；兵种独立冷却，价格越高冷却越久</div></div>
  <div class="r"><span class="num">04</span><div><span class="k">法术</span>——随大本营等级解锁，选中后点击棋盘落点释放</div></div>
  <div class="r wide"><span class="num">05</span><div><span class="k">全局</span>——「<b>总体升级</b>」为只作用于己方的科技，逐级强化全建筑与全士兵的攻击与生命</div></div>
</div>
```

```css
/* 分区标签组件（③④ 共用）：文字 + 两侧渐隐装饰线 */
#start .slabel {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  font-size: 12px; font-weight: 700; letter-spacing: .3em; text-indent: .3em; color: #9db89a;
}
#start .slabel::before, #start .slabel::after { content: ''; width: 28px; height: 1px; }
#start .slabel::before { background: linear-gradient(90deg, transparent, #3c5c44); }
#start .slabel::after  { background: linear-gradient(90deg, #3c5c44, transparent); }

#start .rules {
  width: 100%; max-width: 640px; text-align: left;
  background: linear-gradient(#243829, #1b2b1f); border: 1px solid #3c5c44; border-radius: 12px;
  padding: 14px 18px 15px;
  display: grid; grid-template-columns: 1fr 1fr; gap: 9px 22px;
}
#start .rules .r { display: flex; gap: 9px; font-size: 12px; line-height: 1.65; color: #c4d8c0; }
#start .rules .r.wide { grid-column: 1 / -1; }
#start .rules .num {
  flex: 0 0 auto; width: 18px; height: 18px; border-radius: 5px; margin-top: 1px;
  background: rgba(93,160,74,.16); border: 1px solid #3c5c44;
  color: #8fe06a; font-size: 10px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
}
#start .rules .k { color: #8fe06a; font-weight: 700; margin-right: 1px; }
#start .rules b { color: #ffd479; font-weight: 700; }
```

**文案定稿逻辑**：每条 = `分类词（金绿）—— 一句话`；术语（大本营 / 自己半场 / 行B / 决胜时刻 / 总体升级）用金色 `<b>` 提亮，与游戏内提示语保持一致，不看规则也能在棋盘上认出这些词。

#### ④ 难度选择区（完整规格见 §4）

```html
<div class="slabel">选择难度</div>
<div class="diffs" id="diffs" role="radiogroup" aria-label="选择难度"></div>
```

卡片由 `buildDiffCards()` 生成，结构与样式见 §4.3 / §4.4。

#### ⑤ CTA 区

```html
<div class="cta-wrap">
  <button class="cta" id="startbtn">开始游戏</button>
  <div class="cta-hint">当前难度：<b id="diffhint">普通</b></div>
</div>
```

```css
#start .cta-wrap { display: flex; flex-direction: column; align-items: center; gap: 4px; }
#start .cta {
  border: 0; border-radius: 10px; padding: 13px 52px; cursor: pointer;
  font-size: 16px; font-weight: 800; letter-spacing: .2em; text-indent: .2em; color: #fff;
  background: linear-gradient(180deg, #6fb855, #4d8b3c);
  box-shadow: 0 1px 0 rgba(255,255,255,.18) inset, 0 8px 22px rgba(77,139,60,.32);
  transition: transform .15s ease, box-shadow .15s ease, filter .15s ease;
}
#start .cta:hover  { transform: translateY(-1px); filter: brightness(1.07);
  box-shadow: 0 1px 0 rgba(255,255,255,.22) inset, 0 10px 26px rgba(77,139,60,.42); }
#start .cta:active { transform: translateY(0); filter: brightness(.96); }
#start .cta:focus-visible { outline: 2px solid #8fe06a; outline-offset: 3px; }
#start .cta-hint { font-size: 11px; color: #9db89a; }
#start .cta-hint b { color: #ffd479; }
```

- CTA 用草地绿渐变（GRASS_A→GRASS_B 提亮一档），是全场唯一大实心亮块（F3）；金色留给"货币/术语"语义，不抢戏。
- `#diffhint` 在难度切换时同步更新（JS 见 §4.5），给玩家"我的选择生效了"的确认反馈。
- 备选：CTA 改金色渐变（`#ffd479→#e8b34b` + 深字 `#1a1206`）溢价感更强，但与"金=金币"语义冲突——列为拍板项 B 方案（§10-1）。

#### ⑥ 兵种展示带 `.roster`

```html
<div class="roster"></div>   <!-- JS 填充，见 §6.2 -->
```

```css
#start .roster {
  flex: 0 0 auto; width: 100%; max-width: 860px;
  border-top: 1px solid rgba(60,92,68,.7);
  padding: 10px 0 14px;
  display: flex; align-items: flex-end; justify-content: center; gap: 14px;
}
#start .roster .ru { width: 64px; display: flex; flex-direction: column; align-items: center; gap: 3px; }
#start .roster .ru .ic {
  width: 56px; height: 56px; display: flex; align-items: flex-end; justify-content: center;
  background: radial-gradient(ellipse 26px 13px at 50% 82%, rgba(140,200,110,.22), rgba(0,0,0,0) 72%);
  border-radius: 8px;
}
#start .roster .ru img { width: 52px; height: 52px; object-fit: contain; display: block; }
#start .roster .ru .gt { font-size: 20px; font-weight: 700; line-height: 52px; color: #a8c3a4; }
#start .roster .ru img ~ .gt { display: none; }        /* 与底部卡片同款渐进增强 */
#start .roster .ru .n { font-size: 10px; color: #c4d8c0; white-space: nowrap; }
#start .roster .ru .c { font-size: 10px; color: #ffd479; font-weight: 700; }
#start .roster .ru .c::before {   /* 复用卡片金币币丸 */
  content: ''; display: inline-block; width: 6px; height: 6px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ffe9a8, #e0a52c);
  margin-right: 2px; vertical-align: -0.5px;
}
```

- 图标槽完全复用底部卡片的 `.ic` 语言（椭圆草地光斑托底），菜单与对局界面视觉连贯。
- 52px 是"能看清兵种剪影"的最小实用尺寸；8 × 64px + 7 × 14px = 630px，760px 主列放得下。

### 3.4 动效规格（纯 CSS）

```css
/* 入场：逐区上升，stagger 60ms 起 */
@keyframes rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
#start .brand   { animation: rise .5s .05s both cubic-bezier(.2,.7,.3,1); }
#start .title   { animation: rise .5s .12s both cubic-bezier(.2,.7,.3,1); }
#start .tag     { animation: rise .5s .20s both cubic-bezier(.2,.7,.3,1); }
#start .slabel  { animation: rise .5s .28s both cubic-bezier(.2,.7,.3,1); }
#start .rules   { animation: rise .5s .34s both cubic-bezier(.2,.7,.3,1); }
#start .diffs   { animation: rise .5s .42s both cubic-bezier(.2,.7,.3,1); }
#start .cta-wrap{ animation: rise .5s .50s both cubic-bezier(.2,.7,.3,1); }
#start .roster  { animation: rise .6s .58s both cubic-bezier(.2,.7,.3,1); }

/* 兵种待机浮动：错峰，像军队在呼吸 */
@keyframes ru-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
#start .roster .ru .ic { animation: ru-bob 3.2s ease-in-out infinite; }
#start .roster .ru:nth-child(2n) .ic { animation-delay: .45s; }
#start .roster .ru:nth-child(3n) .ic { animation-delay: .9s; }
#start .roster .ru:nth-child(5n) .ic { animation-delay: 1.35s; }

/* 返回主菜单时 #start 重新 display，动画自动重放——正是想要的效果 */
```

```css
/* 可访问性：减少动态 */
@media (prefers-reduced-motion: reduce) {
  #start *, #over * { animation: none !important; transition: none !important; }
}
```

**动效边界**：只用 `opacity/transform/filter`（合成器属性，不触发重排）；不循环大于 3.5s 的元素；无动画遮挡 CTA 点击（`.cta-wrap` 动画 `both` 结束后 `transform: none`）。

### 3.5 文案定稿汇总（开始界面）

| 元素 | 定稿文案 |
|---|---|
| 英文微标 | `BOARD TOWER DEFENSE` |
| 主标题 | `棋盘塔防` |
| Tagline | `蓝方（你） vs 红方（AI）· 10×10 棋盘 · 双通道出兵` |
| 分区标签 1 | `对战手册` |
| 规则 01 目标 | 先摧毁对方**大本营**；5 分钟后进入**决胜时刻**，双方大本营持续掉血 |
| 规则 02 经营 | 建筑只能建在**自己半场**（行 6–10）；点已有建筑可升级、选分支或拆除返还 |
| 规则 03 派兵 | 点击底部**行B**通道派兵；兵种独立冷却，价格越高冷却越久 |
| 规则 04 法术 | 随大本营等级解锁，选中后点击棋盘落点释放 |
| 规则 05 全局 | 「**总体升级**」为只作用于己方的科技，逐级强化全建筑与全士兵的攻击与生命 |
| 分区标签 2 | `选择难度` |
| CTA | `开始游戏` |
| CTA 提示行 | `当前难度：{普通/困难/地狱}`（随选择实时更新） |

---

## 4. 难度卡规格（.diff）

### 4.1 三档数据表（文案 + accent 色定稿）

| 档位 | 英文微标 | 胜率标注 | 一句话描述 | 角标 | accent（`--tier`） |
|---|---|---|---|---|---|
| 普通 | `NORMAL` | 真人胜率约 60% | AI 反应偏慢、会失误，适合熟悉规则与经济节奏 | `推荐首战` | `#8fe06a`（强调金绿） |
| 困难 | `HARD` | 真人胜率约 25% | AI 会针对你的兵种构成做出反制，几乎不犯低级错误 | `标准对局` | `#ffd479`（金） |
| 地狱 | `HELL` | 真人胜率约 0.1% | 满算力 AI：针对性布防、卡冷却连续推进——别指望赢 | `硬核挑战` | `#f0703c`（炽橙，新增色，见 §7） |

> 角标给每档一个"身份词"，同时把信息密度拉齐到 4 行/卡，避免普通卡显得空。地狱档若不希望新增颜色，退回现有 `#ff7a7a`（拍板项 §10-2）。

### 4.2 视觉层级与三态

| 状态 | 规则 |
|---|---|
| 默认 | 1px `#3c5c44` 边 + 卡片渐变底；档名用 `--tier` 色；其余文字中性 |
| 悬停 | `translateY(-2px)` + 边框升 `#44664b`；**不加阴影**（阴影留给选中态，避免两态混淆） |
| 选中 | `border-color: var(--tier)` + `box-shadow: 0 0 0 1px var(--tier) inset, 0 6px 18px rgba(0,0,0,.35)` + 底色提亮一档；档名下方的胜率点变实色 |
| 键盘焦点 | `outline: 2px solid #8fe06a; outline-offset: 2px`（全局焦点色，不随档位变） |

**信息密度**：每卡固定 4 行文字（EN 徽 / 档名 / 胜率 / 描述），描述限 1 行高度 ×2 行宽度（`min-height: 34px` 防三卡高度不齐）；角标绝对定位贴右上，不占流内空间。

### 4.3 卡片 HTML（由 buildDiffCards 生成）

```html
<button type="button" class="diff on" data-k="normal" role="radio" aria-checked="true"
        style="--tier:#8fe06a">
  <span class="tg">推荐首战</span>
  <span class="en">NORMAL</span>
  <span class="dn">普通</span>
  <span class="dp">真人胜率约 60%</span>
  <span class="dd">AI 反应偏慢、会失误，适合熟悉规则与经济节奏</span>
</button>
```

### 4.4 卡片 CSS

```css
#start .diffs { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
#start .diff {
  position: relative; width: 196px; text-align: left; font: inherit; color: inherit;
  border: 1px solid #3c5c44; border-radius: 12px;
  background: linear-gradient(#243829, #1b2b1f);
  padding: 12px 14px 13px; cursor: pointer;
  transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease, background .15s ease;
}
#start .diff:hover { transform: translateY(-2px); border-color: #44664b; }
#start .diff:focus-visible { outline: 2px solid #8fe06a; outline-offset: 2px; }
#start .diff.on {
  border-color: var(--tier); background: linear-gradient(#2c442f, #20362a);
  box-shadow: 0 0 0 1px var(--tier) inset, 0 6px 18px rgba(0,0,0,.35);
}
#start .diff .en { display: block; font-size: 9px; font-weight: 700; letter-spacing: .26em; color: #9db89a; }
#start .diff .dn { display: block; font-size: 18px; font-weight: 800; line-height: 1.2; color: var(--tier); margin: 1px 0 4px; }
#start .diff .dp { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: #e0efe0; }
#start .diff .dp::before {
  content: ''; width: 6px; height: 6px; border-radius: 50%;
  background: var(--tier); box-shadow: 0 0 6px var(--tier);
}
#start .diff .dd { display: block; font-size: 11px; color: #a8c3a4; line-height: 1.55; margin-top: 6px; min-height: 34px; }
#start .diff .tg {
  position: absolute; top: 0; right: 0; font-size: 9px; font-weight: 700; color: #16221a;
  background: var(--tier); border-radius: 0 11px 0 8px; padding: 2px 7px;
}
```

### 4.5 JS 钩子（替换 index.html:687-703）

```js
var DIFF_INFO = {
  normal: { name: '普通', en: 'NORMAL', pct: '真人胜率约 60%', tier: '#8fe06a', tag: '推荐首战',
            desc: 'AI 反应偏慢、会失误，适合熟悉规则与经济节奏' },
  hard:   { name: '困难', en: 'HARD',   pct: '真人胜率约 25%', tier: '#ffd479', tag: '标准对局',
            desc: 'AI 会针对你的兵种构成做出反制，几乎不犯低级错误' },
  hell:   { name: '地狱', en: 'HELL',   pct: '真人胜率约 0.1%', tier: '#f0703c', tag: '硬核挑战',
            desc: '满算力 AI：针对性布防、卡冷却连续推进——别指望赢' }
};
function buildDiffCards() {
  diffsEl.innerHTML = '';
  Object.keys(DIFF_INFO).forEach(function (k) {
    var d = DIFF_INFO[k];
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'diff' + (k === difficulty ? ' on' : '');
    el.style.setProperty('--tier', d.tier);
    el.setAttribute('role', 'radio');
    el.setAttribute('aria-checked', k === difficulty ? 'true' : 'false');
    el.dataset.k = k;
    el.innerHTML = '<span class="tg">' + d.tag + '</span>' +
      '<span class="en">' + d.en + '</span>' +
      '<span class="dn">' + d.name + '</span>' +
      '<span class="dp">' + d.pct + '</span>' +
      '<span class="dd">' + d.desc + '</span>';
    el.onclick = function () { difficulty = k; buildDiffCards(); syncDiffHint(); };
    diffsEl.appendChild(el);
  });
}
function syncDiffHint() {
  var h = document.getElementById('diffhint');
  if (h) h.textContent = DIFF_INFO[difficulty].name;
}
```

- 从 `div.onclick` 改为 `<button>`：键盘 Tab/Enter 原生可用，无需额外 keydown（方向键漫游 radiogroup 为可选增强，本期不做）。
- 容器加 `role="radiogroup"` + `aria-label`，卡片 `role="radio"` + `aria-checked`，读屏能正确播报"困难，标准对局，已选中"。

---

## 5. 结束界面（#over）

### 5.1 结构与文案

```html
<div id="over">
  <div class="card-r" id="overcard">
    <div class="figs" id="overfigs"></div>
    <div class="t" id="overtext"></div>
    <div class="sub" id="oversub"></div>
    <div class="meta" id="overmeta"></div>
    <div class="stats" id="overstats"></div>
    <div class="acts">
      <button class="p" id="again">再来一局</button>
      <button class="g" id="tomenu">返回主菜单</button>
    </div>
  </div>
</div>
```

```css
#over {
  position: fixed; inset: 0; z-index: 40;
  display: none; align-items: center; justify-content: center; padding: 24px;
  background: rgba(8,10,16,.82);
  -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px);
}
#over.show { display: flex; }
#over .card-r {
  width: 100%; max-width: 520px; text-align: center;
  background: linear-gradient(#1f2f24, #16221a);
  border: 1px solid var(--rc, #44664b); border-radius: 16px;
  padding: 22px 26px 20px;
  box-shadow: 0 18px 60px rgba(0,0,0,.55);
  animation: rise .45s .05s both cubic-bezier(.2,.7,.3,1);
}
#over.show .card-r.win  { --rc: #8fe06a; box-shadow: 0 18px 60px rgba(0,0,0,.55), 0 0 28px rgba(143,224,106,.16); }
#over.show .card-r.lose { --rc: #ff8080; box-shadow: 0 18px 60px rgba(0,0,0,.55), 0 0 28px rgba(255,128,128,.12); }
#over.show .card-r.draw { --rc: #44664b; }

#over .t { font-size: 30px; font-weight: 800; letter-spacing: .3em; text-indent: .3em; line-height: 1.15; }
#over .t.win  { color: #8fe06a; text-shadow: 0 0 18px rgba(143,224,106,.25); }
#over .t.lose { color: #ff8080; }
#over .t.draw { color: #dfe9dc; }
#over .sub  { font-size: 12px; color: #a8c3a4; margin-top: 7px; line-height: 1.65; }
#over .meta { font-size: 11px; color: #9db89a; margin-top: 5px; }
#over .meta b { color: #ffd479; font-weight: 700; }
```

**三套结果文案定稿**（去掉 emoji——读屏噪音 + 不成熟；颜色与文字双通道传达结果，满足可访问性）：

| 结果 | 标题（`.t`） | 副标题（`.sub`，情绪层） | meta 行（数据层） | 卡片类 |
|---|---|---|---|---|
| 胜 | `胜利` | `红方大本营已被摧毁` | `难度 {难} · 用时 {m:ss}`，决胜时刻取胜追加 ` · 决胜时刻拿下` | `card-r win` |
| 负 | `战败` | `蓝方大本营失守——更早布防、升级大本营，稳住经济再谈反推` | `难度 {难} · 用时 {m:ss}`，决胜时刻落败追加 ` · 倒在决胜时刻` | `card-r lose` |
| 平 | `平局` | `战至时限，双方大本营均未被摧毁` | `难度 {难} · 用时 {m:ss}` | `card-r draw` |

> `sub` 只讲"发生了什么"（情绪），`meta` 只讲"数据"（难度/时长），两行分离避免一行里情绪与数据打架。

### 5.2 战绩面板（含 bug 修复）

**字段选型**：双方对比 3 列表 —— 项目 / 蓝方（你）/ 红方（AI）。5 行数据全部来自 `state.stats` 与 `ownBase`，无新增埋点。

```html
<table>
  <thead><tr>
    <th></th>
    <th class="me"><span class="dot"></span>蓝方（你）</th>
    <th class="foe"><span class="dot"></span>红方（AI）</th>
  </tr></thead>
  <tbody>
    <tr><td>大本营</td><td class="me">Lv4 · 3,200/4,200 + HP条</td><td>已摧毁</td></tr>
    <tr><td>累计收入</td><td class="me">1,240 金</td><td>980 金</td></tr>
    <tr><td>总花费</td><td class="me">980 金</td><td>860 金</td></tr>
    <tr><td>派兵数</td><td class="me">38 个</td><td>31 个</td></tr>
    <tr><td>建筑击杀</td><td class="me">24 个</td><td>12 个</td></tr>
  </tbody>
</table>
<div class="note">击杀统计自建筑伤害；收入与花费为对局累计值</div>
```

```css
#over .stats { margin: 14px 0 2px; border: 1px solid #3c5c44; border-radius: 10px; overflow: hidden;
  background: rgba(14,20,13,.5); }
#over .stats table { width: 100%; border-collapse: collapse; font-size: 12px; }
#over .stats th, #over .stats td { padding: 6px 12px; text-align: right; }
#over .stats th:first-child, #over .stats td:first-child { text-align: left; color: #9db89a; width: 30%; }
#over .stats thead th { background: rgba(31,47,36,.9); font-size: 11px; color: #c4d8c0;
  font-weight: 700; border-bottom: 1px solid #3c5c44; }
#over .stats thead .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%;
  margin-right: 5px; vertical-align: 0; }
#over .stats thead .me .dot  { background: #8fe06a; }
#over .stats thead .foe .dot { background: #ff8080; }
#over .stats tbody tr:nth-child(even) { background: rgba(36,56,41,.28); }
#over .stats td { color: #e0efe0; border-top: 1px solid rgba(60,92,68,.5); }
#over .stats td.me { color: #eafce0; font-weight: 700; }
#over .stats .dead { color: #9db89a; }
#over .stats .bar { height: 4px; border-radius: 2px; background: #2e4433; margin-top: 3px; overflow: hidden; }
#over .stats .bar i { display: block; height: 100%; background: #5da04a; }
#over .stats .bar i.low { background: #e0a52c; }     /* HP < 35% 警示（既有深金） */
#over .stats .note { font-size: 10px; color: #9db89a; padding: 5px 12px 7px; text-align: left; }
```

**JS 填充规格（替换 index.html:2495-2511，含 2509 bug 修复）**：

```js
if (state.over && !overEl.classList.contains('show')) {
  var res = state.winner === ME ? 'win' : state.winner === FOE ? 'lose' : 'draw';
  overCard.className = 'card-r ' + res;
  overText.textContent = { win: '胜利', lose: '战败', draw: '平局' }[res];
  overText.className = 't ' + res;
  overSub.textContent = {
    win:  '红方大本营已被摧毁',
    lose: '蓝方大本营失守——更早布防、升级大本营，稳住经济再谈反推',
    draw: '战至时限，双方大本营均未被摧毁'
  }[res];
  var mm = Math.floor(state.time / 60), ss = ('0' + Math.floor(state.time % 60)).slice(-2);
  var sudden = state.suddenDeath !== false && state.time > 300;
  overMeta.innerHTML = '难度 <b>' + DIFF_INFO[difficulty].name + '</b> · 用时 <b>' + mm + ':' + ss + '</b>' +
    (sudden ? ' · <b>' + (res === 'win' ? '决胜时刻拿下' : res === 'lose' ? '倒在决胜时刻' : '决胜时刻仍未破局') + '</b>' : '');
  function n(v) { return Math.floor(v).toLocaleString(); }
  function baseCell(team) {
    var b = C.ownBase(state, team);
    if (!b) return '<span class="dead">已摧毁</span>';
    var hp = Math.max(0, Math.floor(b.hp)), pct = Math.max(0, hp / b.hpMax);
    return 'Lv' + C.baseLevelOf(state, team) + ' · ' + n(hp) + '/' + n(b.hpMax) +
      '<div class="bar"><i class="' + (pct < .35 ? 'low' : '') + '" style="width:' + (pct * 100).toFixed(1) + '%"></i></div>';
  }
  overStats.innerHTML =
    '<table><thead><tr><th></th>' +
    '<th class="me"><span class="dot"></span>蓝方（你）</th>' +
    '<th class="foe"><span class="dot"></span>红方（AI）</th></tr></thead><tbody>' +
    '<tr><td>大本营</td><td class="me">' + baseCell(ME) + '</td><td>' + baseCell(FOE) + '</td></tr>' +
    '<tr><td>累计收入</td><td class="me">' + n(state.stats[ME].income) + ' 金</td><td>' + n(state.stats[FOE].income) + ' 金</td></tr>' +
    '<tr><td>总花费</td><td class="me">' + n(state.stats[ME].spent) + ' 金</td><td>' + n(state.stats[FOE].spent) + ' 金</td></tr>' +
    '<tr><td>派兵数</td><td class="me">' + state.stats[ME].produced + ' 个</td><td>' + state.stats[FOE].produced + ' 个</td></tr>' +
    '<tr><td>建筑击杀</td><td class="me">' + state.stats[ME].kills + ' 个</td><td>' + state.stats[FOE].kills + ' 个</td></tr>' +
    '</tbody></table><div class="note">击杀统计自建筑伤害；收入与花费为对局累计值</div>';
  fillFigs(res);
  overEl.classList.add('show');
}
```

> **bug 修复点**：`建筑击杀` 行由原来的 `(state.stats[FOE].produced ? '—' : '—')`（恒 `—`）改为 `state.stats[ME].kills`（我方建筑击杀）与 `state.stats[FOE].kills`（敌方建筑击杀），两侧均为真实数字。

### 5.3 装饰图 `.figs`（结果剪影）

胜 = 展示"被你击败的红方"（3 个红方 idle 压暗）；负 = 展示"己方蓝方残部"（3 个蓝方 idle 压暗去饱和）；平 = 蓝红步兵对峙。

```css
#over .figs { display: flex; align-items: flex-end; justify-content: center; gap: 12px; height: 52px; margin-bottom: 8px; }
#over .figs .fg {
  width: 46px; height: 46px; display: flex; align-items: flex-end; justify-content: center;
  background: radial-gradient(ellipse 21px 11px at 50% 84%, rgba(140,200,110,.18), rgba(0,0,0,0) 72%);
  border-radius: 7px;
}
#over .figs .fg img { width: 42px; height: 42px; object-fit: contain; display: block; }
#over .figs .fg .gt { font-size: 17px; font-weight: 800; line-height: 42px; color: #a8c3a4; }
#over .figs .fg img ~ .gt { display: none; }
#over .figs.win  .fg img { opacity: .9;  filter: drop-shadow(0 2px 6px rgba(255,128,128,.28)); }
#over .figs.lose .fg img { opacity: .75; filter: grayscale(.2) brightness(.78); }
#over .figs.draw .fg img { opacity: .85; }
```

```js
function fillFigs(res) {
  var figs = document.getElementById('overfigs');
  figs.className = 'figs ' + res;
  var keys = res === 'draw' ? ['infantry', 'infantry'] : ['infantry', 'heavy', 'siege'];
  figs.innerHTML = keys.map(function (k, i) {
    var t = res === 'draw' ? (i === 0 ? 'blue' : 'red') : (res === 'win' ? 'red' : 'blue');
    var d = C.DATA.units[k];
    return '<div class="fg"><img src="art/v9/unit_' + k + '_' + t + '_idle.png" alt="" onerror="this.remove()">' +
      '<span class="gt" style="color:' + d.color + '">' + d.glyph + '</span></div>';
  }).join('');
}
```

### 5.4 按钮区

```css
#over .acts { display: flex; gap: 10px; justify-content: center; margin-top: 16px; }
#over .acts button {
  border-radius: 9px; padding: 10px 26px; cursor: pointer;
  font-size: 14px; font-weight: 700; letter-spacing: .1em;
  transition: filter .15s ease, transform .15s ease, background .15s ease;
}
#over .acts .p {   /* 主操作：同难度直接再来（F3：唯一实心亮块） */
  border: 0; color: #fff; background: linear-gradient(180deg, #6fb855, #4d8b3c);
  box-shadow: 0 1px 0 rgba(255,255,255,.16) inset, 0 6px 16px rgba(77,139,60,.28);
}
#over .acts .p:hover { filter: brightness(1.08); transform: translateY(-1px); }
#over .acts .g {   /* 次操作：回主菜单换难度 */
  background: transparent; color: #c4d8c0; border: 1px solid #44664b;
}
#over .acts .g:hover { background: rgba(68,102,75,.22); }
#over .acts button:focus-visible { outline: 2px solid #8fe06a; outline-offset: 2px; }
```

```js
document.getElementById('tomenu').onclick = function () {
  overEl.classList.remove('show');
  startEl.classList.remove('hide');   // #start 重新 display，入场动画自动重放
  syncDiffHint();
};
```

- `再来一局` = 现有 `startGame`（保持当前难度）；`返回主菜单` = 新增退路，否则玩家想换难度只能刷新页面。两者构成完整"再来一局"循环。
- `state.over` 仍为 `true`，主菜单期间不会推进模拟；点开始游戏走 `newGame()` 全量重置，无残留。

---

## 6. 贴图使用总方案

### 6.1 资产清单与尺寸

| 用途 | 文件 | 源尺寸 | 展示尺寸 | 说明 |
|---|---|---|---|---|
| 徽标 | `art/v9/base_L1.png` | 512×512 RGBA | 24px（30px 盒） | `object-fit:contain` |
| 兵种带 ×8 | `art/v9/unit_{infantry,heavy,siege,ram,archer,balloon,airship,dragon}_blue_idle.png` | 512×512 RGBA | 52px（56px 盒） | 顺序 = `UNIT_ORDER` |
| 胜利装饰 ×3 | `unit_{infantry,heavy,siege}_red_idle.png` | 512×512 RGBA | 42px（46px 盒） | 红方 = 色相重映射产物，0 生成成本 |
| 战败装饰 ×3 | 同 §3.3⑥ 的蓝方 idle 前三 | 512×512 RGBA | 42px | 压暗去饱和 |
| 平局装饰 ×2 | `unit_infantry_{blue,red}_idle.png` | 512×512 RGBA | 42px | 蓝红对峙 |

### 6.2 兵种带 JS 填充

```js
var rosterEl = document.querySelector('#start .roster');
UNIT_ORDER.forEach(function (key) {
  var d = C.DATA.units[key];
  var el = document.createElement('div');
  el.className = 'ru';
  el.innerHTML = '<div class="ic"><img src="art/v9/unit_' + key + '_blue_idle.png" alt=""' +
    ' onerror="this.remove()"><span class="gt" style="color:' + d.color + '">' + d.glyph + '</span></div>' +
    '<div class="n">' + d.name + '</div><div class="c">' + d.cost + '</div>';
  rosterEl.appendChild(el);
});
```

### 6.3 对齐 / 间距 / 兜底规则

1. **对齐**：所有 idle 贴图均为"底部锚定"生成（地面线统一，见 `ART-SPEC-V9.md` 归一化规则），因此一律 `align-items: flex-end` + 方形盒 `object-fit:contain`——兵自然"站"在草地光斑上，与底部卡片 `.ic` 完全同款。
2. **间距**：兵种带单元 64px 宽、gap 14px；结束界面装饰单元 46px 宽、gap 12px。
3. **加载兜底**：`onerror="this.remove()"` 后汉字 glyph（`.gt`）自然露出（复用卡片既有渐进增强模式），兵种带退化为 8 个汉字圆片，不错位。
4. **零额外请求**：上述文件均已在 `art/v9/assets.js` 清单内，`ART.load()` 启动时全量预载，菜单不产生新网络请求（工程可用 `ART.img('unit_infantry_red_idle.png')` 验证红方 idle 已入清单）。

---

## 7. 林绿 palette 映射表

> 现有 token 全部取自 index.html 已用值；新增仅 2 个（金高光 `#ffe9a8` 由卡片币丸径向内色提升为正式 token；炽橙 `#f0703c` 仅地狱档 accent，可退回现有 `#ff7a7a`）。

| # | 界面元素 | Token | 色值 | 来源/备注 |
|---|---|---|---|---|
| 1 | 遮罩底（开始） | `--bg-page` | `#0e140d` + 顶部 `radial-gradient(1100px 460px at 50% -8%, rgba(93,160,74,.16), transparent 62%)` | 页面底；顶部草绿辉光呼应棋盘 |
| 2 | 遮罩底（结束） | `--bg-over` | `rgba(8,10,16,.82)` + `blur(3px)` | 透出终局棋盘 |
| 3 | 结束面板底 | `--bg-panel` | `linear-gradient(#1f2f24, #16221a)` | 面板渐变 |
| 4 | 规则面板/难度卡底 | `--bg-card` | `linear-gradient(#243829, #1b2b1f)` | 卡片渐变 |
| 5 | 选中态卡底 | `--bg-card-on` | `linear-gradient(#2c442f, #20362a)` | 提亮一档 |
| 6 | 默认边框 | `--bd-1` | `#3c5c44` | 卡片/面板/表格线 |
| 7 | 强边框/幽灵按钮 | `--bd-2` | `#44664b` | hover 态、次按钮 |
| 8 | 主文本 | `--tx-1` | `#e8f0e6` | 标题兜底/正文 |
| 9 | 次文本 | `--tx-2` | `#9db89a` | 分区标签、meta、note |
| 10 | 三级文本 | `--tx-3` | `#a8c3a4` | tagline、描述 |
| 11 | 规则正文 | `--tx-4` | `#c4d8c0` | 规则条目 |
| 12 | 强调金绿 | `--accent` | `#8fe06a` | 选中环、胜利、焦点、序号 |
| 13 | 草地 A/B | `--grass-a/b` | `#5da04a` / `#4d8b3c` | CTA 渐变、HP 条、光斑 |
| 14 | 金色 | `--gold` | `#ffd479` | 费用、术语加粗、困难档 accent |
| 15 | **金高光（新增①）** | `--gold-hi` | `#ffe9a8` | 标题渐变顶端、金币币丸高光 |
| 16 | 深金 | `--gold-deep` | `#e0a52c` | 币丸根部、HP 低警示 |
| 17 | 危险红 | `--danger` | `#ff8080` | 战败标题、红方列表头、败方剪影 |
| 18 | **炽橙（新增②）** | `--ember` | `#f0703c` | 仅地狱档 `--tier`；不新增则退回 `#ff7a7a` |
| 19 | 平局中性 | `--draw` | `#dfe9dc` | 平局标题 |
| 20 | 蓝方标识点 | `--dot-me` | `#8fe06a` | 战绩表"蓝方（你）"圆点（语义=己方，不引入蓝色破坏 palette） |

**档位 accent 汇总**：普通 `#8fe06a` → 困难 `#ffd479` → 地狱 `#f0703c`，明度/饱和度递减递"危险"，与胜率 60%→25%→0.1% 同向。

---

## 8. 边缘情况与可访问性

### 8.1 边缘情况

| # | 场景 | 处理 |
|---|---|---|
| E1 | 视口高 < 760px（如 1366×768） | 紧凑模式：标题 36px、规则字号 11px、卡片宽 178px、`.dd { min-height: 0 }`、兵种带缩至 48px 槽（CSS 见 §8.3） |
| E2 | 视口高 < 660px | 兵种带整体 `display:none`（装饰性，信息在底部面板有完整版），保证 CTA 不被挤出 |
| E3 | 视口宽 < 620px | 规则面板切单列；难度卡 `width:100%; max-width:340px`；兵种带 gap 收窄 |
| E4 | 贴图加载失败 | `onerror` 移除 img → 汉字 glyph 兜底（§6.3）；菜单功能零损失 |
| E5 | 平局（60 分钟上限） | 走中性文案；不用"未分胜负"等误导表述；战绩表正常渲染 |
| E6 | 决胜时刻终局（time > 300s） | meta 行追加 `决胜时刻拿下 / 倒在决胜时刻 / 决胜时刻仍未破局`；用 `state.suddenDeath !== false` 判断，尊重玩家关掉决胜的选项 |
| E7 | 从结束界面「返回主菜单」再开局 | `state.over` 保持 `true` 不推进模拟；`开始游戏` → `newGame()` 全量重置；`#start` 重显时入场动画自动重放 |
| E8 | 超宽屏（≥1920px） | 主列 `max-width:760px`、兵种带 `max-width:860px` 居中，不拉伸 |

### 8.2 可访问性

- **键盘**：难度卡用 `<button role="radio">` + 容器 `role="radiogroup"`；所有可交互元素有 `:focus-visible` 金绿焦点环。
- **读屏**：标题用 `<h1>`；去掉 emoji（原 `🎉/💥` 是读屏噪音）；结果不只靠颜色——标题文字本身即"胜利/战败/平局"。
- **对比度**：`--tx-2 #9db89a` on `#16221a` ≈ 5.5:1、`--tx-3 #a8c3a4` on `#1b2b1f` ≈ 6:1、`--gold #ffd479` on `#1b2b1f` ≈ 8:1，正文全部 ≥ 4.5:1；10px 文字仅用于装饰性次要信息（兵种名/费用/note）。
- **减少动态**：`prefers-reduced-motion` 下全部 animation/transition 关闭（§3.4）。

### 8.3 响应式 CSS（附加）

```css
/* 双模态定位切换（§2.1）：视口高 ≤900px 时 #start / #over 改 fixed，盖住整个视口；
 * >900px 走基础规则的 absolute，只遮棋盘区。基础规则已含 inset:0 与 z-index:30，
 * 本档只需翻转 position（追加在基础规则之后，同特异性后者胜）。 */
@media (max-height: 900px) {
  #start, #over { position: fixed; }
}
@media (max-height: 760px) {
  #start { padding-top: 18px; }
  #start .stack { gap: 12px; }
  #start .title { font-size: 36px; }
  #start .rules { padding: 11px 14px 12px; gap: 7px 18px; }
  #start .rules .r { font-size: 11px; line-height: 1.55; }
  #start .diff { width: 178px; padding: 10px 12px 11px; }
  #start .roster { padding: 8px 0 10px; }
  #start .roster .ru { width: 58px; }
  #start .roster .ru .ic { width: 48px; height: 48px; }
  #start .roster .ru img { width: 44px; height: 44px; }
}
@media (max-height: 660px) { #start .roster { display: none; } }
@media (max-width: 620px) {
  #start .rules { grid-template-columns: 1fr; }
  #start .diff { width: 100%; max-width: 340px; }
  #start .roster { gap: 8px; }
  #start .roster .ru { width: 52px; }
}
```

**≤900px 切换档说明**：
- fixed 相对视口定位：`#start` 的 `padding: 26px 20px 0`、主列 `margin:auto` 垂直居中与兵种带贴底逻辑（`.stack` + `.roster` flex 布局）原样生效，fixed 分支不需要任何内部规则改动。
- `z-index: 30`（基础规则）仍压得住 `#detail`（fixed，20）与棋盘；本档不引入新层级，也不影响 760px / 660px 紧凑档——后者作为 fixed 分支内的二级压缩继续生效。

---

## 9. 工程改动清单与验收标准

### 9.1 改动映射（index.html）

| 现有位置 | 现状 | 改为 |
|---|---|---|
| CSS `#over`/`#start` 块（约 115–143 行） | 旧蓝灰 palette、absolute 遮罩 | §2.1 / §3.3 / §4.4 / §5.1–5.4 全部规则；新增 `@keyframes rise/ru-bob`、`@media` 四档（含 900px 双模态切换档，§8.3）、`@supports` 渐变字回退 |
| `#over` HTML（160–165 行） | t/sub/stats/button 四行裸元素 | §5.1 结构（card-r + figs/t/sub/meta/stats/acts） |
| `#start` HTML（166–179 行） | 蓝字标题 + 5 行文字 + diffs + 按钮 | §3.1 结构（brand/title/tag/slabel+rules×2/diffs/cta-wrap/roster） |
| `DIFF_INFO` + `buildDiffCards`（687–703 行） | div 卡片、旧文案 | §4.1 / §4.5（button + role + --tier + 新文案 + `syncDiffHint`） |
| over 填充逻辑（2495–2511 行） | emoji 标题、裸 stats、**2509 行 bug** | §5.2 完整替换（表格 + kills 修复 + meta + fillFigs） |
| 按钮绑定（2458–2459 行） | again/startbtn → startGame | 增加 `tomenu` 绑定（§5.4） |
| 新增 | — | 兵种带填充（§6.2，可放在 `buildDiffCards()` 调用处旁） |

### 9.2 验收标准

1. 双路径验收：1366×768 走 fixed 分支（视口高 ≤900px）主列无滚动条；1920×1080 走 absolute 分支（>900px）主列无滚动条；两档均无遮挡——fixed 档遮罩盖住顶栏+面板，absolute 档只遮棋盘区且顶栏/面板正常露出；660px 高时兵种带隐藏且 CTA 完整可见。
2. 三档难度可 Tab 聚焦、Enter/Space 选中，`aria-checked` 正确；CTA 提示行同步更新。
3. 结束界面"建筑击杀"两列均为真实数字（原 `—` bug 消除）；大本营行 HP 条比例与实际一致。
4. 难度切换 → 开始 → 终局，meta 行难度与所选一致。
5. 断网/贴图缺失时，兵种带退化为汉字圆片，无破版。
6. `prefers-reduced-motion` 下无位移动画；全屏无 emoji。
7. 视觉走查：全屏只有一个最大字（F1）、一个实心大 CTA（F3）、两处带装饰线分区标签（F2）。

---

## 10. 待用户拍板项

| # | 事项 | 选项 | 规格方建议 |
|---|---|---|---|
| 1 | CTA 配色 | A 林绿渐变 `#6fb855→#4d8b3c`（本规格默认） / B 金色渐变 `#ffd479→#e8b34b` + 深字 | **A**：主题一致；B 溢价感强但与"金=金币"语义打架 |
| 2 | 地狱档 accent | A 新增炽橙 `#f0703c` / B 退回现有 `#ff7a7a` | **A**：与金绿/金形成完整档位色阶；B 零新增色 |
| 3 | 次按钮 | A 结束界面加「返回主菜单」 / B 维持只有「再来一局」 | **A**：换难度不必刷新页面 |
| 4 | 兵种带 | A 默认显示、<660px 高隐藏（本规格默认） / B 始终显示 / C 不设兵种带 | **A**：仪式感与矮屏安全的平衡 |
| 5 | 遮罩范围 | A `fixed` 全屏盖住顶栏+面板（本规格默认） / B 维持只遮棋盘区 | **A**：主菜单完整性；B 改动更小 |

---

*规格完。实施由 engineering-lead 依 §9 映射表执行；如需调整任何分区，回报文策渊修订对应章节，避免多处改动失同步。*
