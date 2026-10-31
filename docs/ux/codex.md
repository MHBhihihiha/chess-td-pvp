> **v18：图鉴数值行与「战斗中的建筑详情面板」合并成同一个出口**
> `index.html` 里新增 `bldStatRows(def, st, nxt, opts)` / `baseStatRows(lv, spells, opts)`，
> 返回 `{k, v, next, gold}` 行数组：
> - 图鉴详情 → `cxKV(k, v, next, gold)` 小卡；
> - 战斗面板 → `<tr><td class="k">k</td><td class="v">v → next</td></tr>`。
> 好处：改一次数值两边同时变，不会出现 v14 那种「面板写 40%、实际 20%」的错位。
> 连带修正：防御塔（没有 atk）不再显示「攻击力/攻击方式」；千分位统一走 `fmtNum`。
> `dev/dom-test.js` 里有 4 条断言锁死「同一栋楼两处标签集合完全一致」。

> **v15 改版（两级索引）—— 先读这一节，下面 §「三 Tab + 单页卡片」的实现细节已部分过时。**
>
> 图鉴从「一页铺开所有条目」改成 **列表 → 详情** 两级：
>
> | 层 | 内容 | 生成函数（纯字符串，可在 node 下断言） |
> |---|---|---|
> | ① 列表 | 小图（56px）+ 名称 + 两行精简信息（造价/等级、职能/收入） | `codexIndexHTML(kind)` |
> | ② 详情 | 左：大图（底座 + 武器两层，与棋盘同比例）；右：当前等级数值 + 全等级表 | `codexDetailHTML(kind, key, lv, branch)` |
>
> - `kind ∈ {base, bld, unit}`；`base` 的列表只有 1 条，等级交给详情页的**滑动轨**。
> - 建筑/大本营：大图下方是 `<input type="range">` 等级轨（1..maxLevel）+ 刻度行，
>   拖动只重绘「大图 + 右侧数值 + 刻度高亮」，滑轨节点本身不重建（否则拖动会断）。
> - 建筑在 L5 起出现分支切换（`水晶塔 / 碉堡塔` …），切换只换武器层贴图，不换底座。
> - 大图贴图**不另写一套取图规则**：造一个假建筑 `{def, level, branch, team:'blue'}` 复用
>   `ART.baseFile / ART.topFile`，保证「图鉴里的大楼 = 棋盘上的那栋楼」。
> - 调试口：地址栏 `#codex`、`#codex=bld`、`#codex=bld,ward,5`、`#codex=unit,archer`
>   可直接打开对应层级（截图/自测用，不影响正常流程）。
> - 断言入口：`window.__game.codexIndexHtml(kind)` / `window.__game.codexDetailHtml(kind,key,lv,branch)`
>   （`dev/dom-test.js` 用它验证「水晶塔 L5 = 5×5 / 20%」这类数值没标错）。
>
> 截图存档：`dev/_shots/`（开始界面 / 760 高 / 图鉴列表 / 防御塔 L7 详情）。

# 单位图鉴（Codex）UX 规格

> **任务**：T6-UX-CODEX · **负责**：文策渊（design-strategist）· **主理人**：游承峰
> **对象**：在开始界面（`#start`）下方新增「📖 单位图鉴」入口，打开一个覆盖层（`#codex`），展示**大本营 / 建筑 / 兵种**三类实体的详细数据，每个条目含**每级数值 + 对应图片**。
> **对接基准**：`docs/ux/start-end-screens.md`（林绿 palette、六区结构、装饰线分区标签 `.slabel`、难度卡、CTA、兵种展示带 roster）——本规格只新增 `#codex`，**不重定义**已有 class / 视觉 token。
> **性质**：UX 规格文档，**不含最终代码**；所有 HTML / CSS / JS 片段为"可直接照抄进 index.html"的实施级写法（同 start-end-screens.md 惯例）。
> **数据事实来源**：`src/logic.js`（`C = window.GameCore` 已暴露全部所需 API），UI 层用 `C.DATA` / `C.statsForLevel` / `C.buildingUpgradeCost` / `C.globalMulOf` 实时取数，**零硬编码数值**。
> **状态**：草案（待工程实施；§13 列拍板项）。

---

## 0. 术语与代码事实（本规格的事实来源）

| 项 | 取值 / 来源 | 备注 |
|---|---|---|
| 大本营等级表 | `C.DATA.baseLevels`（6 项 `{level,hp,income,upgradeCost}`） | L6 `upgradeCost:null`；图片 `art/v9/base_L{n}.png`（n=1..6，512×512 底部锚定） |
| 建筑顺序 | `BUILD_ORDER = ['mine','cannon','arrow','mage','mortar','tesla','ward']` | 全部无 tier 限制、可建造 |
| 建筑字段 | `C.DATA.buildings[key]`：`name,glyph,color,cost,hp,armor,atk(可空),atkInterval,range,targets,mode,splash(部分),aura(ward),desc`；金矿额外 `income,incomeByLevel:[2,3,4,5,8]` | `mine` 无 `atk/atkInterval/range`；`ward` 无 `atk/atkInterval/range` 但有 `aura` |
| 建筑升级规则 | `C.statsForLevel(def, level, branchKey)` → `{hp,armor,atk,atkInterval,range,targets,mode,splash,income,auraDR,branch,branchName}` | 1-4 级 ×1.10（hp/atk）；4→5 级出分支（分支 `commitAt=5`）；5-9 级 ×1.30；9→10 级 ×1.60；建筑 `maxLevel`：`mine=5`，其余 `=10` |
| 建筑分支 | `C.DATA.branches`（每建筑 2 分支，`parent` 指回建筑 key） | 仅 `cannon/arrow/mage/mortar/tesla/ward` 有分支；`mine` 无分支 |
| 建筑升级花费 | `C.buildingUpgradeCost({def:def, level:L})` → 升 L→L+1 花费；到 `maxLevel` 返回 `null` | 与分支无关（公式只认 `def.cost` 与 `L`） |
| 兵种顺序 | `UNIT_ORDER = ['infantry','heavy','siege','ram','archer','balloon','airship','dragon']` | 无单兵等级 |
| 兵种字段 | `C.DATA.units[key]`：`name,glyph,color,air,cost,deployCd,hp,armor,atk,atkInterval,range,speed,priority,targets,desc` | `priority:'field'`→清兵 / `'siege'`→拆迁；`air:true`→飞行；`targets:'ground'`→仅对地 / `'both'`→对地+对空 |
| 全局科技 | `C.DATA.globalUpgrades = {bAtk,bHp,uAtk,uHp}`（各 1-10 级） | 士兵攻/血：`uAtk/uHp` 用 `C.globalMulOf(lv,0.15,0.30)`（1-4 级 +15%、5-9 级 +30%）；建筑攻/血：`bAtk/bHp` 用 `globalMulOf(lv,0.10,0.20)` |
| 全局倍率 | `C.globalMulOf(lv, lowStep, highStep)`：`lv` 夹取 0..10；`l=1..lv` 累乘 `1+(l<=4?low:high)` | 返回倍率（lv0→1.0） |
| 建筑图标合成 | `paintBuildingIcon(cv, key)`（index.html:2361）：canvas 内 base 0.78S 底边居中 + top 0.90S 居中 | 文件映射见 `buildingIconFiles(key)`（index.html:2355）：`mine→mine_L1.png`(无 top)；`ward→ward_body_e1.png`+`ward_bunker_top_e3.png`；其余 `{key}_base_e1.png`+`{key}_top_e1.png` |
| 兵种图片 | `art/v9/unit_{key}_blue_idle.png`（8 张均存在） | 底部锚定 |
| palette | 复用 start-end-screens §7 字面量（见 §10） | 不新增任何色值（除已定的 `--gold-hi/--ember` 等） |

**红线自检**：纯展示层，不改任何数值 / 经济 / 玩法 → 无主导策略、无经济失衡、无认知过载（每 tab 信息分组清晰、表格化）、支柱不漂移（林绿 palette 与开始界面同语言延伸）。

---

## 1. 设计目标与对接法则

| 法则 | 落地 |
|---|---|
| **F2 信息分组带标签** | 三 Tab 切换；每个条目用「标题行 + 数值表」结构，复用开始界面 `.slabel` 装饰线分区语言 |
| **F3 CTA 一眼可辨** | 入口为**幽灵按钮**（次级操作，不与「开始游戏」实心 CTA 抢戏），沿用 `#over .acts .g` 幽灵语言 |
| **视觉连续** | 复用林绿 palette、`#start` 同款背景辉光、`.ic`/`.gt` 图标盒（草地光斑 + 汉字兜底）与 `.slabel` 装饰线 |
| **数据即真相** | 所有数值由 `C.*` API 实时算；改 `logic.js` 配置后图鉴自动同步，不维护第二份硬编码表 |

---

## 2. 入口与 overlay 定位（双模态复用 start-end-screens §2.1）

### 2.1 入口位置
在 `#start .stack` 内、`.cta-wrap` **之后**插入一个幽灵按钮（紧贴 CTA 下方、兵种展示带 `.roster` 之上）：

```html
<!-- 插入位置：index.html:423 的 </div> (.cta-wrap 结束) 之后，427 </div> (.stack 结束) 之前 -->
<button type="button" class="g codex-open" id="codexopen"
        aria-haspopup="dialog" aria-controls="codex">
  <span aria-hidden="true">📖</span> 单位图鉴
</button>
```

```css
/* 复用 #over .acts .g 幽灵语言（原规则 #over 作用域，#start 下镜像一份，不新增 token） */
#start .g.codex-open {
  margin-top: 10px;
  background: transparent; color: #c4d8c0; border: 1px solid #44664b;
  border-radius: 9px; padding: 8px 22px; cursor: pointer;
  font-size: 13px; font-weight: 700; letter-spacing: .12em; text-indent: .12em;
  transition: background .15s ease, filter .15s ease;
}
#start .g.codex-open:hover { background: rgba(68,102,75,.22); }
#start .g.codex-open:active { filter: brightness(.96); }
#start .g.codex-open:focus-visible { outline: 2px solid #8fe06a; outline-offset: 2px; }
```

- emoji `📖` 设为 `aria-hidden`、**装饰性**；按钮有可见文字「单位图鉴」，读屏播报正常（规避 start-end-screens §8.2 的 emoji 噪音红线，但保留图标视觉）。
- 点击 `codexopen` → 打开 `#codex`（见 §3）。

### 2.2 双模态定位（与 `#start`/`#over` 完全一致）
`#codex` 作为 `#board-wrap` 子节点（DOM 顺序在 `#start` 之后，确保同 `z-index` 下叠在其上），复用 start-end-screens §2.1 的双模态规则：

```css
#codex {
  position: absolute; inset: 0; z-index: 30;          /* 同 #start/#over 现行值 */
  display: none; flex-direction: column;
  /* 背景复用开始界面：页面底 + 顶部草绿辉光 */
  background:
    radial-gradient(1100px 460px at 50% -8%, rgba(93,160,74,.16), transparent 62%),
    #0e140d;
}
#codex:not([hidden]) { display: flex; }
@media (max-height: 900px) { #codex { position: fixed; } }   /* 矮屏接管全屏，与 #start 同档 */
```

- **>900px**：`position:absolute` 只遮棋盘区（顶栏 + 底部面板在遮罩外可见），边界感与开始界面一致。
- **≤900px**：`position:fixed` 盖住整个视口（含顶栏 + 面板），避免绝对定位在矮屏溢出。
- **DOM 结构树衔接**：`#codex` 挂在 `#board-wrap` 下，与 `#start`/`#over` 同级（start-end-screens §2.2）。

---

## 3. overlay 结构（顶栏 + 三 Tab + 滚动内容区）

```html
<!-- 插入位置：#board-wrap 内、#start 之后（与 #over 同级） -->
<div id="codex" role="dialog" aria-modal="true" aria-label="单位图鉴" hidden>
  <div class="cx-bar">
    <div class="cx-title">单位图鉴</div>
    <button type="button" class="g cx-close" id="codexclose" aria-label="关闭图鉴">✕</button>
  </div>
  <div class="cx-tabs" role="tablist" aria-label="图鉴分类">
    <button type="button" class="cx-tab on" role="tab" aria-selected="true"  data-tab="base">大本营</button>
    <button type="button" class="cx-tab"    role="tab" aria-selected="false" data-tab="bld"  tabindex="-1">建筑</button>
    <button type="button" class="cx-tab"    role="tab" aria-selected="false" data-tab="unit" tabindex="-1">兵种</button>
  </div>
  <div class="cx-body">
    <section class="cx-pane on" data-pane="base" aria-labelledby="cxh-base"></section>
    <section class="cx-pane"    data-pane="bld"  aria-labelledby="cxh-bld" hidden></section>
    <section class="cx-pane"    data-pane="unit" aria-labelledby="cxh-unit" hidden></section>
  </div>
</div>
```

```css
#codex .cx-bar {
  flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 12px;
}
#codex .cx-title {
  font-size: 22px; font-weight: 800; letter-spacing: .14em; text-indent: .14em; color: #8fe06a;
  filter: drop-shadow(0 2px 10px rgba(143,224,106,.20));
}
#codex .cx-close {
  background: transparent; color: #c4d8c0; border: 1px solid #44664b;
  border-radius: 8px; width: 30px; height: 30px; cursor: pointer; font-size: 14px; line-height: 1;
  transition: background .15s ease;
}
#codex .cx-close:hover { background: rgba(68,102,75,.22); }
#codex .cx-close:focus-visible { outline: 2px solid #8fe06a; outline-offset: 2px; }

#codex .cx-tabs {                       /* 复用 .slabel 装饰线语言：两侧渐隐线 + 标签感 */
  flex: 0 0 auto; display: flex; gap: 8px; justify-content: center;
  padding: 0 20px 10px; border-bottom: 1px solid rgba(60,92,68,.7);
}
#codex .cx-tab {
  font: inherit; color: #9db89a; background: transparent; border: 0; cursor: pointer;
  padding: 8px 18px; font-size: 13px; font-weight: 700; letter-spacing: .14em; text-indent: .14em;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
  transition: color .15s ease, border-color .15s ease;
}
#codex .cx-tab:hover { color: #c4d8c0; }
#codex .cx-tab.on { color: #8fe06a; border-bottom-color: #8fe06a; }
#codex .cx-tab:focus-visible { outline: 2px solid #8fe06a; outline-offset: 2px; border-radius: 4px; }

#codex .cx-body { flex: 1 1 auto; overflow-y: auto; padding: 14px 20px 24px; }
#codex .cx-pane { display: none; }
#codex .cx-pane.on { display: block; }
```

**Tab 切换 JS（规格级，工程照此实现）**：
```js
function openCodex()  { var el = document.getElementById('codex'); el.hidden = false; el.classList.add('show'); }
function closeCodex() { var el = document.getElementById('codex'); el.hidden = true; el.classList.remove('show'); }
document.getElementById('codexopen').onclick  = openCodex;
document.getElementById('codexclose').onclick = closeCodex;
// Tab：点击切 .on / aria-selected / 显隐对应 pane；方向键左右漫游（可选增强）
document.querySelectorAll('#codex .cx-tab').forEach(function (t) {
  t.onclick = function () {
    document.querySelectorAll('#codex .cx-tab').forEach(function (x) {
      var on = x === t; x.classList.toggle('on', on);
      x.setAttribute('aria-selected', on ? 'true' : 'false');
      x.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll('#codex .cx-pane').forEach(function (p) {
      var on = p.dataset.pane === t.dataset.tab;
      p.classList.toggle('on', on); p.hidden = !on;
    });
  };
});
// Esc 关闭（可访问性）
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !document.getElementById('codex').hidden) closeCodex(); });
```

---

## 4. Tab 1 · 大本营

**布局**：6 张卡片横向网格（窄屏单列），每张 = 左侧 `base_L{n}.png` 缩略图 + 右侧三列数值（HP / 收入 / 升级花费）。

```html
<div class="cx-grid cx-grid-base"></div>   <!-- JS 填充 -->
```

```css
#codex .cx-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
#codex .cx-card {
  display: flex; gap: 12px; align-items: center;
  background: linear-gradient(#243829, #1b2b1f); border: 1px solid #3c5c44; border-radius: 12px;
  padding: 12px 14px;
}
#codex .cx-card .ic {                      /* 复用 .ic 视觉：方块盒 + 草地光斑 + 汉字兜底 */
  flex: 0 0 auto; width: 64px; height: 64px; display: flex; align-items: flex-end; justify-content: center;
  background: radial-gradient(ellipse 30px 15px at 50% 82%, rgba(140,200,110,.22), rgba(0,0,0,0) 72%);
  border-radius: 8px; overflow: hidden;
}
#codex .cx-card .ic img { width: 60px; height: 60px; object-fit: contain; display: block; }
#codex .cx-card .meta { flex: 1 1 auto; }
#codex .cx-card .lv { font-size: 12px; color: #9db89a; letter-spacing: .1em; }
#codex .cx-card .lv b { color: #8fe06a; }
#codex .cx-card .rows { margin-top: 4px; display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; font-size: 12px; }
#codex .cx-card .rows .k { color: #a8c3a4; }
#codex .cx-card .rows .v { color: #e8f0e6; text-align: right; font-weight: 700; }
#codex .cx-card .rows .v.gold { color: #ffd479; }
```

**数据提取（零硬编码）**：
```js
function fillBasePane() {
  var wrap = document.querySelector('#codex [data-pane="base"]');
  var rows = C.DATA.baseLevels.map(function (b) {
    var img = 'art/v9/base_L' + b.level + '.png';
    return '<div class="cx-card">' +
      '<div class="ic"><img src="' + img + '" alt="" onerror="this.remove()">' +
        '<span class="gt" style="color:#8fe06a;font-size:20px;font-weight:800;line-height:64px">基</span></div>' +
      '<div class="meta">' +
        '<div class="lv">大本营 <b>Lv' + b.level + '</b></div>' +
        '<div class="rows">' +
          '<span class="k">生命</span><span class="v">' + b.hp.toLocaleString() + '</span>' +
          '<span class="k">收入</span><span class="v gold">' + b.income + ' /秒</span>' +
          '<span class="k">升级花费</span><span class="v gold">' + (b.upgradeCost != null ? b.upgradeCost + ' 金' : '已满级') + '</span>' +
        '</div>' +
      '</div></div>';
  }).join('');
  wrap.innerHTML = '<div class="cx-grid cx-grid-base">' + rows + '</div>';
}
```

> **图片机制**：直接 `<img src="art/v9/base_L{n}.png">`，`onerror` 移除 img 露出汉字兜底「基」（同 start-end-screens §6.3 渐进增强）。无需 canvas。
> **可选增强（非必需，列 §13）**：每级卡追加「解锁法术」——`C.DATA.spells.filter(s=>s.unlockBaseLevel===b.level)`，数据已现成。

---

## 5. Tab 2 · 建筑

**布局**：7 个条目（`BUILD_ORDER`），每个条目 = 标题行（图标 + 名称 + 造价 + `desc`）+ 「每级数值表」（列 = 等级 1..`maxLevel`，行 = 主要数值）+ 分支图例。

**关键语义**：
- 列数 = `def.maxLevel || 10`（`mine=5` → 仅 L1..5；其余 → L1..10），**数据驱动，不写死 10 列**。
- 行的包含规则（数据驱动）：`攻击` 行 ⇔ `def.atk != null`；`攻速` 行 ⇔ `def.atkInterval != null`；`射程` 行 ⇔ `def.range != null`；`收入` 行 ⇔ `def.incomeByLevel`（金矿）；`减伤` 行 ⇔ `def.aura`（防御塔）。
- **L5 分支处理**：L1–L4 为分支前确定值；L5–L10 必须选分支，故每格按「分支 A / 分支 B」双值并列显示（仅当两分支该数值不同时才拆双值，相同则单值）。分支颜色取自 `C.DATA.branches[key].color`。
- `升级花费` 行：L 列显示 `C.buildingUpgradeCost({def:def, level:L})`（升 L→L+1），`maxLevel` 列显示 `—`。

```html
<div class="cx-list cx-list-bld"></div>   <!-- JS 填充 -->
```

```css
#codex .cx-entry { background: linear-gradient(#243829, #1b2b1f); border: 1px solid #3c5c44; border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; }
#codex .cx-head { display: flex; gap: 12px; align-items: center; }
#codex .cx-head .ic { flex: 0 0 auto; width: 56px; height: 56px; display: flex; align-items: flex-end; justify-content: center;
  background: radial-gradient(ellipse 26px 13px at 50% 82%, rgba(140,200,110,.22), rgba(0,0,0,0) 72%); border-radius: 8px; overflow: hidden; }
#codex .cx-head .ic canvas.ci, #codex .cx-head .ic img.ci { width: 52px; height: 52px; object-fit: contain; display: block; }
#codex .cx-head .ic .gt { font-size: 21px; font-weight: 700; line-height: 54px; }
#codex .cx-head .ic img.ci ~ .gt, #codex .cx-head .ic canvas.ci ~ .gt { display: none; }
#codex .cx-name { font-size: 15px; font-weight: 800; color: #e8f0e6; }
#codex .cx-name .gx { color: #9db89a; font-weight: 700; margin-left: 4px; }
#codex .cx-cost { font-size: 12px; color: #ffd479; margin-top: 1px; }
#codex .cx-desc { font-size: 12px; color: #a8c3a4; line-height: 1.5; margin-top: 3px; }

#codex .cx-branch { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin: 8px 0 6px; font-size: 11px; }
#codex .cx-branch .bx { font-weight: 700; }
#codex .cx-branch .bx.a { color: #7fa8f0; }   /* 占位，实际取 DATA.branches[].color，见 JS */
#codex .cx-branch .commit { color: #9db89a; }
#codex .cx-branch .commit b { color: #ffd479; }

#codex .cx-tw { overflow-x: auto; }            /* 窄屏：表格横向滚动，不破版 */
#codex table.cx-lv { border-collapse: collapse; width: 100%; font-size: 11px; min-width: 520px; }
#codex table.cx-lv th, #codex table.cx-lv td { border: 1px solid rgba(60,92,68,.6); padding: 4px 6px; text-align: center; }
#codex table.cx-lv thead th { background: rgba(31,47,36,.9); color: #c4d8c0; font-weight: 700; position: sticky; top: 0; }
#codex table.cx-lv thead th.lv5 { color: #ffd479; }                 /* 高亮分支选择点 */
#codex table.cx-lv td.row { text-align: left; color: #9db89a; background: rgba(36,56,41,.4); white-space: nowrap; }
#codex table.cx-lv td .ba { color: #7fa8f0; font-weight: 700; }     /* 分支 A 值（实际取色） */
#codex table.cx-lv td .bb { color: #c98a6a; font-weight: 700; }     /* 分支 B 值（实际取色） */
#codex table.cx-lv td .sep { color: #9db89a; margin: 0 3px; }
#codex table.cx-lv td.gold { color: #ffd479; font-weight: 700; }
```

**数据提取（核心算法，零硬编码）**：
```js
function fmt(v) { return (v == null) ? '—' : (typeof v === 'number' ? (Math.round(v * 10) / 10).toLocaleString() : v); }

function bldBranches(key) {
  return Object.keys(C.DATA.branches).map(function (k) { return C.DATA.branches[k]; })
    .filter(function (b) { return b.parent === key; });
}
/* 取某等级某数值；branches.length>=2 时 L>=5 返回 {a, b}（两分支值），否则单值 */
function lvCell(def, L, stat, branches) {
  if (branches.length < 2 || L <= 4) return { single: true, v: C.statsForLevel(def, L, null)[stat] };
  var va = C.statsForLevel(def, L, branches[0].key)[stat];
  var vb = C.statsForLevel(def, L, branches[1].key)[stat];
  return { single: (va === vb), a: va, b: vb };
}
function cellHTML(def, L, stat, branches) {
  var c = lvCell(def, L, stat, branches);
  if (c.single) return fmt(c.v);
  return '<span class="ba" style="color:' + branches[0].color + '">' + fmt(c.a) + '</span>' +
         '<span class="sep">/</span>' +
         '<span class="bb" style="color:' + branches[1].color + '">' + fmt(c.b) + '</span>';
}

function fillBldPane() {
  var wrap = document.querySelector('#codex [data-pane="bld"]');
  var html = BUILD_ORDER.map(function (key) {
    var def = C.DATA.buildings[key];
    var branches = bldBranches(key);
    var maxLv = def.maxLevel || C.DATA.upgrade.maxLevel;

    // 行定义（数据驱动包含规则）
    var rows = [];
    rows.push({ label: '生命', stat: 'hp' });
    if (def.atk != null)        rows.push({ label: '攻击', stat: 'atk' });
    if (def.atkInterval != null) rows.push({ label: '攻速(秒)', stat: 'atkInterval' });
    if (def.range != null)     rows.push({ label: '射程(格)', stat: 'range' });
    if (def.incomeByLevel)     rows.push({ label: '收入/秒', stat: 'income' });
    if (def.aura)              rows.push({ label: '减伤', stat: 'auraDR' });

    // 表头：等级 1..maxLv（L5 高亮为分支点）
    var th = '<th>数值 \\ 等级</th>';
    for (var L = 1; L <= maxLv; L++) th += '<th class="' + (L === 5 && branches.length >= 2 ? 'lv5' : '') + '">L' + L + '</th>';

    // 数值行
    var body = '';
    rows.forEach(function (r) {
      var tds = '';
      for (var L = 1; L <= maxLv; L++) tds += '<td>' + cellHTML(def, L, r.stat, branches) + '</td>';
      body += '<tr><td class="row">' + r.label + '</td>' + tds + '</tr>';
    });
    // 升级花费行（L→L+1；满级列 '—'）
    var costTds = '';
    for (var L = 1; L <= maxLv; L++) {
      var c = (L < maxLv) ? C.buildingUpgradeCost({ def: def, level: L }) : null;
      costTds += '<td class="gold">' + (c != null ? c + ' 金' : '—') + '</td>';
    }
    body += '<tr><td class="row">升级花费</td>' + costTds + '</tr>';

    // 分支图例
    var legend = '';
    if (branches.length >= 2) {
      legend = '<div class="cx-branch">' +
        '<span class="bx a" style="color:' + branches[0].color + '">A · ' + branches[0].name + '（' + branches[0].desc + '）</span>' +
        '<span class="bx b" style="color:' + branches[1].color + '">B · ' + branches[1].name + '（' + branches[1].desc + '）</span>' +
        '<span class="commit">L5 选择分支（<b>commitAt=5</b>），此后数值按所选分支成长</span></div>';
    }

    // 标题行图标（canvas 复用 paintBuildingIcon，见 §7）
    return '<div class="cx-entry" data-key="' + key + '">' +
      '<div class="cx-head">' +
        '<div class="ic"><canvas class="ci" width="96" height="96"></canvas>' +
          '<span class="gt" style="color:' + def.color + '">' + def.glyph + '</span></div>' +
        '<div class="meta">' +
          '<div class="cx-name">' + def.name + ' <span class="gx">' + def.glyph + '</span></div>' +
          '<div class="cx-cost">造价 ' + def.cost + ' 金</div>' +
          '<div class="cx-desc">' + def.desc + '</div>' +
        '</div>' +
      '</div>' + legend +
      '<div class="cx-tw"><table class="cx-lv"><thead><tr>' + th + '</tr></thead><tbody>' + body + '</tbody></table></div>' +
    '</div>';
  }).join('');
  wrap.innerHTML = '<div class="cx-list cx-list-bld">' + html + '</div>';

  // 图标：复用 paintBuildingIcon（与底部面板同款），失败入 iconRetry 重试/兜底
  wrap.querySelectorAll('.ic canvas.ci').forEach(function (cv) {
    var key = cv.closest('.cx-entry').dataset.key;
    if (!paintBuildingIcon(cv, key)) { /* iconRetry.push({cv:cv,key:key}) 复用现有重试机制 */ }
    else { var gt = cv.parentNode.querySelector('.gt'); if (gt) gt.style.display = 'none'; }
  });
}
```

> **数值来源 API**：`C.statsForLevel(def, L, branchKey)`（HP/攻击/攻速/射程/收入/减伤）、`C.buildingUpgradeCost({def,level})`（升级花费）、`C.DATA.branches`（分支名/描述/颜色/commitAt）、`C.DATA.upgrade.maxLevel`（满级）。**全部实时计算，无硬编码**。

---

## 6. Tab 3 · 兵种

**布局**：8 条目（`UNIT_ORDER`），每条 = 标题行（兵种图 + 名称 + 造价 + 职能/说明）+ 基础数值网格 + 一张「士兵总体升级」小表。

**关键语义**：兵种**无单兵等级**；强度完全由全局科技 `uAtk/uHp`（1-10 级）决定。小表展示 `uAtk/uHp` 各等级加成%，并明确注释「兵种靠全局科技变强，而非单兵升级」。

```html
<div class="cx-list cx-list-unit"></div>   <!-- JS 填充 -->
```

```css
#codex .cx-unit { background: linear-gradient(#243829,#1b2b1f); border:1px solid #3c5c44; border-radius:12px; padding:12px 14px; margin-bottom:12px; }
#codex .cx-unit .cx-head .ic { flex:0 0 auto; width:56px; height:56px; display:flex; align-items:flex-end; justify-content:center;
  background: radial-gradient(ellipse 26px 13px at 50% 82%, rgba(140,200,110,.22), rgba(0,0,0,0) 72%); border-radius:8px; overflow:hidden; }
#codex .cx-unit .cx-head .ic img { width:52px; height:52px; object-fit:contain; display:block; }
#codex .cx-unit .cx-head .ic .gt { font-size:20px; font-weight:700; line-height:54px; }
#codex .cx-unit .cx-head .ic img ~ .gt { display:none; }
#codex .cx-stats { margin-top:8px; display:grid; grid-template-columns: repeat(auto-fit, minmax(96px,1fr)); gap:4px 10px; font-size:11px; }
#codex .cx-stats .s { display:flex; justify-content:space-between; gap:6px; background:rgba(14,20,13,.4); border:1px solid rgba(60,92,68,.5); border-radius:6px; padding:3px 7px; }
#codex .cx-stats .s .k { color:#9db89a; }
#codex .cx-stats .s .v { color:#e8f0e6; font-weight:700; }
#codex .cx-stats .s .v.gold { color:#ffd479; }
#codex .cx-note { font-size:11px; color:#9db89a; margin-top:8px; line-height:1.5; }
#codex .cx-note b { color:#8fe06a; }

#codex .cx-gup { margin-top:8px; overflow-x:auto; }
#codex table.cx-g { border-collapse:collapse; font-size:11px; min-width:480px; }
#codex table.cx-g th, #codex table.cx-g td { border:1px solid rgba(60,92,68,.6); padding:3px 6px; text-align:center; }
#codex table.cx-g thead th { background:rgba(31,47,36,.9); color:#c4d8c0; font-weight:700; }
#codex table.cx-g td.lv { color:#9db89a; text-align:left; }
#codex table.cx-g td.pct { color:#ffd479; font-weight:700; }
```

**数据提取（零硬编码）**：
```js
function funcLabel(priority, air, targets) {
  var role = priority === 'siege' ? '拆迁（只拆建筑与大本营）' : '清剿（只打敌兵与大本营）';
  var dom  = targets === 'both' ? '对地+对空' : '仅对地';
  return role + (air ? ' · 飞行' : '') + ' · ' + dom;
}

function fillUnitPane() {
  var wrap = document.querySelector('#codex [data-pane="unit"]');
  var html = UNIT_ORDER.map(function (key) {
    var d = C.DATA.units[key];
    var stats =
      stat('造价', d.cost + ' 金', true) +
      stat('出兵冷却', d.deployCd + ' 秒') +
      stat('生命', d.hp) +
      stat('护甲', d.armor) +
      stat('攻击', d.atk) +
      stat('攻速', d.atkInterval + ' 秒') +
      stat('射程', d.range + ' 格') +
      stat('移速', d.speed) +
      stat('职能', funcLabel(d.priority, d.air, d.targets));
    function stat(k, v, gold) { return '<div class="s"><span class="k">' + k + '</span><span class="v' + (gold ? ' gold' : '') + '">' + v + '</span></div>'; }

    // 士兵总体升级小表：uAtk / uHp 1..10 级加成%（C.globalMulOf(lv,0.15,0.30)）
    var ghead = '<th class="lv">科技 \\ 等级</th>';
    for (var L = 0; L <= 10; L++) ghead += '<th>Lv' + L + '</th>';
    var pct = function (lv) { return Math.round((C.globalMulOf(lv, 0.15, 0.30) - 1) * 100); };
    function grow(name) {
      var tds = '<td class="lv">' + name + '</td>';
      for (var L = 0; L <= 10; L++) tds += '<td class="pct">+' + pct(L) + '%</td>';
      return '<tr>' + tds + '</tr>';
    }
    var gup = '<div class="cx-gup"><table class="cx-g"><thead><tr>' + ghead + '</tr></thead><tbody>' +
      grow('士兵攻击 (uAtk)') + grow('士兵生命 (uHp)') + '</tbody></table></div>';

    return '<div class="cx-unit" data-key="' + key + '">' +
      '<div class="cx-head">' +
        '<div class="ic"><img src="art/v9/unit_' + key + '_blue_idle.png" alt="" onerror="this.remove()">' +
          '<span class="gt" style="color:' + d.color + '">' + d.glyph + '</span></div>' +
        '<div class="meta">' +
          '<div class="cx-name">' + d.name + ' <span class="gx">' + d.glyph + '</span></div>' +
          '<div class="cx-desc">' + d.desc + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="cx-stats">' + stats + '</div>' +
      gup +
      '<div class="cx-note">兵种<b>无单兵等级</b>；强度完全由「总体升级 · 士兵攻击 / 士兵生命」决定（上方 1-10 级加成%）。建筑攻击 / 建筑生命同理，使用 +10%/+20% 档（见 DATA.globalUpgrades.bAtk/bHp）。</div>' +
    '</div>';
  }).join('');
  wrap.innerHTML = '<div class="cx-list cx-list-unit">' + html + '</div>';
}
```

> **数值来源 API**：`C.DATA.units[key]`（基础数值/职能/说明）、`C.globalMulOf(lv,0.15,0.30)`（uAtk/uHp 加成）、`C.DATA.globalUpgrades`（科技名/描述/档位说明）。
> **图片机制**：直接 `<img src="art/v9/unit_{key}_blue_idle.png">` + `onerror` 汉字兜底（同 roster）。

---

## 7. 图片使用方案（canvas 复用 vs img 兜底）

| 类别 | 推荐方案 | 兜底方案 | 尺寸 | 汉字兜底 |
|---|---|---|---|---|
| 大本营 | `<img src="art/v9/base_L{n}.png">` | `onerror` 移除 img | 60px / 64px 盒（`object-fit:contain`，底部锚定） | 「基」 |
| 建筑 | **canvas 复用 `paintBuildingIcon(cv, key)`**（与底部面板同款，自动处理 `mine`/`ward` 特例） | canvas 失败时入现有 `iconRetry` 重试；最终留 `.gt` 汉字 | 52px / 56px 盒 | `def.glyph`（金/炮/箭…） |
| 建筑（备选 img 法） | `art/v9/{buildingIconFiles(key).base}`（+ `.top`） | `onerror` | 同 canvas | 同上 |
| 兵种 | `<img src="art/v9/unit_{key}_blue_idle.png">` | `onerror` 移除 img | 52px / 56px 盒 | `def.glyph` |

- **建筑优先 canvas 复用**：`paintBuildingIcon` 已封装底座 0.78S + 武器 0.90S 的合成与 `mine_L1`/`ward_body_e1` 特例，零重复实现；资产在 `ART.load()` 已预载，菜单不触发新网络请求（与 start-end-screens §6.3 一致）。
- **所有 idle/贴图均为底部锚定**（见 `ART-SPEC-V9.md` 归一化），统一 `align-items:flex-end` + 方形盒 `object-fit:contain`，兵自然"站"在草地光斑上，与 roster / 面板卡片视觉连续。
- **兜底兜底原则**：`onerror` 后汉字 glyph 自然露出，图鉴功能零损失、不错位（沿用 start-end-screens E4 模式）。

---

## 8. 数据提取总方案（JS，避免硬编码）

> 三条 pane 的填充函数 `fillBasePane() / fillBldPane() / fillUnitPane()` 在**首次打开图鉴时**调用一次（数据不变，无需每次重算）；若 `logic.js` 配置变更需刷新，重新调用即可。

**用到的 `C.*` API 一览（数值来源 API）**：

| 需求 | 调用 | 返回 |
|---|---|---|
| 大本营每级 | `C.DATA.baseLevels`（数组） | `{level,hp,income,upgradeCost}` |
| 建筑定义 | `C.DATA.buildings[key]` | 字段全集 |
| 建筑每级数值 | `C.statsForLevel(def, L, branchKey)` | `{hp,armor,atk,atkInterval,range,targets,mode,splash,income,auraDR,branch,branchName}` |
| 建筑升级花费 | `C.buildingUpgradeCost({def, level:L})` | 升 L→L+1 花费（满级 `null`） |
| 建筑分支 | `C.DATA.branches`（按 `parent===key` 过滤） | `{key,name,parent,color,commitAt,mods,atkMul,hpMul,desc}` |
| 满级 | `def.maxLevel \|\| C.DATA.upgrade.maxLevel` | `mine=5`，其余 `10` |
| 兵种定义 | `C.DATA.units[key]` | 字段全集 |
| 全局科技加成 | `C.globalMulOf(lv, 0.15, 0.30)`（兵）/ `0.10,0.20`（建筑） | 倍率 |
| 建筑图标 | `paintBuildingIcon(cv, key)` / `buildingIconFiles(key)` | canvas 合成 / 文件名映射 |

**红线**：任何单元格数值均来自上述 API；**不得**在图鉴中写死 `3200`、`+15%` 等字面量（改 `logic.js` 后图鉴应自动同步）。

---

## 9. 文案定稿

| 元素 | 定稿 |
|---|---|
| 入口按钮 | `📖 单位图鉴`（📖 装饰、`aria-hidden`） |
| overlay 标题 | `单位图鉴` |
| 关闭按钮 | `✕`（`aria-label="关闭图鉴"`） |
| Tab 1 | `大本营` |
| Tab 2 | `建筑` |
| Tab 3 | `兵种` |
| 大本营卡片字段 | `生命` / `收入` / `升级花费`（满级显示「已满级」） |
| 建筑表头 | `数值 \ 等级`（L1..maxLv；L5 高亮为分支点） |
| 建筑行标签 | `生命` / `攻击` / `攻速(秒)` / `射程(格)` / `收入/秒`（金矿）/ `减伤`（防御塔）/ `升级花费` |
| 建筑分支图例 | `A · {分支名}（{desc}）` `B · {分支名}（{desc}）` `L5 选择分支（commitAt=5），此后数值按所选分支成长` |
| 兵种字段 | `造价 / 出兵冷却 / 生命 / 护甲 / 攻击 / 攻速 / 射程 / 移速 / 职能` |
| 兵种职能 | `清剿（只打敌兵与大本营）` 或 `拆迁（只拆建筑与大本营）` + `· 飞行`（若有）+ `· 对地+对空`/`仅对地` |
| 兵种升级表 | `士兵攻击 (uAtk)` / `士兵生命 (uHp)`，列 `Lv0..Lv10`，值 `+N%` |
| 兵种注释 | `兵种无单兵等级；强度完全由「总体升级 · 士兵攻击 / 士兵生命」决定（上方 1-10 级加成%）。建筑攻击 / 建筑生命同理，使用 +10%/+20% 档。` |

- 所有条目「说明」列**直接沿用 `DATA.desc`**，不另写文案，避免与游戏内术语脱节。
- 术语（大本营 / 分支 / 总体升级 / 兵种职能）与开始界面、底部面板保持一致。

---

## 10. palette 与视觉 · 与 start-end-screens.md 衔接点

**复用（不重定义）**：
- 背景：`#0e140d` + 顶部 `radial-gradient(1100px 460px at 50% -8%, rgba(93,160,74,.16), transparent 62%)`（同开始界面 `--bg-page`）。
- 卡片底：`linear-gradient(#243829, #1b2b1f)`（同 `--bg-card`）。
- 边框：`#3c5c44`（默认）/ `#44664b`（强边框、幽灵按钮，同 `--bd-1/--bd-2`）。
- 强调金绿：`#8fe06a`；金色：`#ffd479`；文本：`#e8f0e6`/`#c4d8c0`/`#a8c3a4`/`#9db89a`（同 `--tx-*`）。
- 装饰线分区标签 `.slabel`（§3 `cx-tabs` 用同款两侧渐隐线 + 标签感语言）。
- 图标盒 `.ic`（方块 + 草地光斑 + `.gt` 汉字兜底，复用 roster / 面板卡片视觉；原 `.ic` 规则为 `.card`/`#start .roster` 作用域，本规格在 `#codex` 下**镜像**同款规则，不新增 token）。
- 幽灵按钮 `.g`（`#over .acts .g` 视觉，在 `#start .codex-open` / `#codex .cx-close` 下镜像）。
- 焦点环：`outline: 2px solid #8fe06a; outline-offset`（全局焦点色，同 start-end-screens §8.2）。
- 双模态定位 `@media (max-height: 900px){ position: fixed }` + `z-index:30`（同 §2.1）。

**不新增任何色值 / class 语义**；仅新增 `#codex` 作用域下的布局规则（网格、表格、贴底图标），全部建立在上述既有 token 之上。

---

## 11. 边缘情况与可访问性

| # | 场景 | 处理 |
|---|---|---|
| E1 | 矮屏（≤900px） | `#codex` 转 `fixed` 盖全屏；`.cx-body` `overflow-y:auto` 独立滚动，顶栏 + Tab 栏 `flex:0 0 auto` 常驻（sticky 感） |
| E2 | 内容超长 | `.cx-body` 滚动；建筑/兵种每级表 `.cx-tw`/`.cx-gup` 横向 `overflow-x:auto`，**不撑破布局**（窄屏表格内滚动，列数由 `maxLevel` 决定） |
| E3 | 窄屏（≤620px） | `.cx-grid` / `.cx-stats` 走 `auto-fill`/`auto-fit` 自然单列；三 Tab 仍横排（仅占一行）；表格横向滚动 |
| E4 | 贴图缺失 | `onerror` 移除 img / canvas 重试后留 `.gt` 汉字兜底；建筑 canvas 入 `iconRetry` 复用现有重试机制；功能零损失 |
| E5 | `mine` 无分支 | `bldBranches('mine')` 返回 `[]` → 表格仅 L1..5、无分支图例、所有单元格单值 |
| E6 | `ward` 无攻击 | 不渲染「攻击/攻速/射程」行，改渲染「减伤」行；L5+ 减伤按 `crystal`(半径)/`bunker`(固定 DR) 双值 |
| E7 | `prefers-reduced-motion` | 图鉴本身无循环动画；若加入场 `rise`，在 `@media (prefers-reduced-motion: reduce){ #codex *{animation:none!important;transition:none!important} }` 关闭（同 start-end-screens §3.4） |
| E8 | 键盘 / 读屏 | overlay `role="dialog" aria-modal`；Tab `role="tab"` + `aria-selected`；关闭按钮 `aria-label`；入口按钮 `aria-haspopup="dialog" aria-controls="codex"`；`Esc` 关闭；所有可交互元素 `:focus-visible` 金绿环 |
| E9 | 打开图鉴期间 | 不触发 `startGame`、不推进模拟（纯展示）；关闭后回到开始界面原状 |

---

## 12. 工程改动清单与验收标准

### 12.1 改动映射（index.html）
| 位置 | 改为 |
|---|---|
| `#board-wrap` 内、`#start` 之后 | 新增 `#codex` overlay 结构（§3） |
| `#start .stack` 内、`.cta-wrap` 之后 | 新增幽灵按钮 `#codexopen`（§2.1） |
| `<style>` | 新增 §2.2 / §3 / §4 / §5 / §6 / §10 / §11 全部 `#codex` 作用域 CSS（镜像 `.ic`/`.g`/`.slabel` 视觉，不重定义 token） |
| `<script>` | 新增 `openCodex/closeCodex`、Tab 切换、`fillBasePane/fillBldPane/fillUnitPane`（§3/§4/§5/§6/§8），首次打开时调用填充；绑定 `#codexopen`/`#codexclose`/`Esc` |

### 12.2 验收标准
1. 开始界面 CTA 下方出现「📖 单位图鉴」幽灵按钮；点击打开 `#codex`，关闭回到开始界面。
2. 三 Tab（大本营/建筑/兵种）切换正常；`role=tab/tablist` + `aria-selected` 正确。
3. **大本营**：6 卡，每卡 `base_L{n}.png` + 生命/收入/升级花费，L6 显示「已满级」；数值与 `C.DATA.baseLevels` 完全一致。
4. **建筑**：7 条目；每级表列数 = `maxLevel`（`mine` 5 列、其余 10 列）；L5 高亮为分支点；L5–L10 分支数值按 A/B 双值显示（颜色取 `DATA.branches[].color`）；`mine` 无分支则全单值；`ward` 显示「减伤」行而非攻击行；升级花费行末列 `—`。
5. **兵种**：8 条目；基础数值齐全；`uAtk/uHp` 升级表 Lv0..Lv10 加成% 与 `C.globalMulOf(lv,0.15,0.30)` 计算一致；注释明确"无单兵等级"。
6. 所有数值来自 `C.*` API，**搜索 index.html 图鉴相关代码无硬编码数值字面量**（除列标签/单位"秒/格/金"等展示后缀）。
7. 贴图缺失时退化为汉字圆片/方框，无破版（E4）。
8. 矮屏（≤900px）`#codex` 转 fixed 全屏、内容区可滚动；窄屏（≤620px）单列 + 表格横向滚动（E1/E3）。
9. `prefers-reduced-motion` 下无位移动画（E7）；全屏焦点环可见（E8）。
10. 视觉走查：图鉴与开始界面 palette / 图标盒 / 装饰线语言连续，无"第二套皮肤"感（§10）。

---

## 13. 待拍板项

| # | 事项 | 选项 | 规格方建议 |
|---|---|---|---|
| 1 | 大本营卡是否追加「解锁法术」 | A 追加（来自 `C.DATA.spells.filter(unlockBaseLevel===L)`，已有数据）/ B 仅 HP/收入/花费（本规格默认） | **A**：信息更完整、零额外成本；但会让卡片略高，需确认是否超出 §11 E1 滚动预算 |
| 2 | 建筑每级表横向滚动 vs 折叠 | A 横向滚动保留全 10 列（默认）/ B 默认折叠 L6-10、点"展开" | **A**：一屏看全成长曲线，符合"图鉴"预期 |
| 3 | 兵种升级表是否含 `bAtk/bHp` | A 仅 `uAtk/uHp`（默认，贴合任务）/ B 四行全列（士兵+建筑） | **A**：聚焦"兵种靠科技变强"叙事；B 可作「总体升级」总览（另议） |
| 4 | 入口按钮 emoji | A 保留 `📖`（默认，视觉锚点）/ B 去掉 emoji 纯文字 | **A**：emoji 为装饰且伴随可见文字，读屏无噪音 |

---

*规格完。实施由 engineering-lead 依 §12 映射表执行；如需调整任何分区，回报文策渊修订对应章节，避免多处改动失同步。本规格与 `docs/ux/start-end-screens.md` 为同一视觉体系，新增 `#codex` 不重定义其已有 class / token。*
