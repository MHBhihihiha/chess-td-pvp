/* 视角镜像专项测试（v21）
 * ----------------------------------------------------------------------------
 * 用户需求：「红方视角镜像做一下，然后双方都看自己是蓝方，看对面是红方」。
 *
 * 这个功能全是坐标数学，出错的表现都很阴间：
 *   · 红方玩家点第 3 列，兵从第 8 列出来（列没翻）
 *   · 红方玩家的兵往前走，贴图却是背对镜头（朝向没翻）
 *   · 红方看到自己的大本营被涂成红色（阵营色调没翻）
 * 所以这里逐条把「映射必须是双射 / 必须对合 / 双方对称」钉死。
 *
 * 检查分四层：
 *   一、view.js 的纯数学（可注入尺寸）
 *   二、index.html 真的用了这套数学（静态接线检查）
 *   三、两端视角对称性：同一局逻辑状态下，两名玩家看到的画面语义一致
 *   四、回归：单机（蓝方视角）什么都不该变
 */
'use strict';
var fs = require('fs');
var path = require('path');
var C = require('../src/logic.js');
var V = require('../src/view.js');

var pass = 0, fail = 0;
function item(name, ok, extra) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  [' + extra + ']' : '')); }
}
var ROWS = C.ROWS, COLS = C.COLS;
var HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/* ========================================================================== */
console.log('=== 一、镜像映射的数学性质 ===');

V.setSize(ROWS, COLS);
item('尺寸注入与 logic.js 一致（10×10）', (function () {
  var z = V.size(); return z.rows === ROWS && z.cols === COLS;
})(), JSON.stringify(V.size()));

/* 1.1 行域 0..ROWS+1 双射且对合 */
(function () {
  var bad = [], anti = [];
  for (var r = 0; r <= ROWS + 1; r++) {
    var v = V.flipRow(r, true);
    if (v < 0 || v > ROWS + 1) bad.push(r + '→' + v);
    if (V.flipRow(v, true) !== r) anti.push(r + '→' + v + '→' + V.flipRow(v, true));
  }
  item('行映射保持行域 0..' + (ROWS + 1) + '（不越界）', bad.length === 0, bad.join(','));
  item('行映射是对合（翻两次回到原行）', anti.length === 0, anti.join(','));
})();

/* 1.2 列域 1..COLS 双射且对合 */
(function () {
  var seen = {}, bad = [];
  for (var c = 1; c <= COLS; c++) {
    var v = V.flipCol(c, true);
    if (v < 1 || v > COLS) bad.push(c + '→' + v);
    if (seen[v]) bad.push('重复命中列 ' + v);
    seen[v] = 1;
    if (V.flipCol(v, true) !== c) bad.push('非对合 c=' + c);
  }
  item('列映射是 1..' + COLS + ' 上的双射且对合', bad.length === 0, bad.join(','));
})();

/* 1.3 关键锚点：大本营、通道必须落到「下方」 */
(function () {
  var bb = C.BASE_RECT ? C.BASE_RECT.blue : null;
  /* BASE_RECT 不一定导出，直接用自己实测出来的常量兜底 */
  var RB = { red: { r1: 1, r2: 2 }, blue: { r1: 9, r2: 10 } };
  var CH = { red: 0, blue: ROWS + 1 };

  /* 蓝方视角（不翻）：蓝家大本营在下半场、通道在第 11 行（最底） */
  item('蓝方视角：蓝方大本营在下半场（屏幕行 ≥ 6）', V.flipRow(RB.blue.r1, false) >= 6,
    '行' + V.flipRow(RB.blue.r1, false));
  item('蓝方视角：蓝方通道 = 最后一行（屏幕行 11）', V.flipRow(CH.blue, false) === ROWS + 1);

  /* 红方视角（翻）：红方大本营必须落到下半场、通道落到最底行 */
  item('红方视角：红方大本营翻到下半场（行1→行10）',
    V.flipRow(RB.red.r1, true) === ROWS && V.flipRow(RB.red.r2, true) === ROWS - 1,
    '行' + V.flipRow(RB.red.r1, true) + '/' + V.flipRow(RB.red.r2, true));
  item('红方视角：红方通道（行0）翻到最底行 11', V.flipRow(CH.red, true) === ROWS + 1,
    '行' + V.flipRow(CH.red, true));
  item('红方视角：蓝方大本营翻到上半场（行9→行2）',
    V.flipRow(RB.blue.r1, true) === 2 && V.flipRow(RB.blue.r2, true) === 1,
    '行' + V.flipRow(RB.blue.r1, true) + '/' + V.flipRow(RB.blue.r2, true));

  /* 两端玩家看到的「自家大本营占哪几行」必须完全一样 —— 这才是"对等"的定义。
   * 注意不能只比单边：大本营是 2 行高，红方占行1-2（行1贴着通道行0），
   * 蓝方占行9-10（行10贴着通道行11）。翻转后红方必须正好落到 9-10，
   * 与蓝方在蓝方视角下占据的行完全重合。 */
  var blueRows = [V.flipRow(RB.blue.r1, false), V.flipRow(RB.blue.r2, false)].sort(function (a, b) { return a - b; });
  var redRows = [V.flipRow(RB.red.r1, true), V.flipRow(RB.red.r2, true)].sort(function (a, b) { return a - b; });
  item('两端对等：自家大本营在屏幕上占据的行完全相同',
    blueRows[0] === redRows[0] && blueRows[1] === redRows[1],
    '[' + blueRows.join(',') + '] vs [' + redRows.join(',') + ']');
  /* 同理，双方通道在各自视角下都必须是最底行 */
  item('两端对等：自家出兵通道都在屏幕最底行',
    V.flipRow(CH.blue, false) === V.flipRow(CH.red, true),
    V.flipRow(CH.blue, false) + ' vs ' + V.flipRow(CH.red, true));
})();

/* 1.4 朝向映射：四向全覆盖 + 对合 */
(function () {
  var F = ['up', 'down', 'left', 'right'];
  item('朝向映射四向全覆盖（没有漏项变成原值）',
    F.every(function (f) { return V.facing(f, true) !== f; }),
    F.map(function (f) { return f + '→' + V.facing(f, true); }).join(' '));
  item('朝向映射对合（翻两次回原朝向）',
    F.every(function (f) { return V.facing(V.facing(f, true), true) === f; }));
  item('不翻时朝向原样透传', F.every(function (f) { return V.facing(f, false) === f; }));
  item('逻辑朝上 = 屏幕朝下（红方视角）', V.facing('up', true) === 'down');
})();

/* 1.5 视觉阵营 */
(function () {
  item('蓝方玩家：自己的兵显蓝、对手显红',
    V.vTeam('blue', 'blue') === 'blue' && V.vTeam('red', 'blue') === 'red');
  item('红方玩家：自己的兵同样显蓝、对手显红',
    V.vTeam('red', 'red') === 'blue' && V.vTeam('blue', 'red') === 'red');
  /* 这是需求的核心：两端对「我方」的颜色认知必须一致 */
  item('两端一致：我方恒为 blue（只需换 me 参数）',
    V.vTeam('blue', 'blue') === V.vTeam('red', 'red') && V.vTeam('red', 'blue') === V.vTeam('blue', 'red'));
})();

/* ========================================================================== */
console.log('\n=== 二、index.html 接线（静态检查）===');

function has(re) { return re.test(HTML); }

item('引入了 src/view.js', has(/<script src="src\/view\.js"><\/script>/));
item('有 FLIP 状态位', has(/var FLIP = false;/));
item('cellRectF 走 vRow/vCol', /function cellRectF[\s\S]{0,220}?vCol\(col\)[\s\S]{0,120}?vRow\(row\)/.test(HTML));
/* 多格建筑：2×2 的大本营在镜像后左上角会变成右下角，必须对四角取 min，
 * 否则整块建筑向右下错一格 —— 红方视角下大本营会压到最底那条通道行上。 */
item('cellRect 支持多格 span（对四角取 min）',
  has(/Math\.min\(vr, vRow\(row \+ sr - 1\)\)/) && has(/Math\.min\(vc, vCol\(col \+ sc - 1\)\)/));
item('建筑绘制时把 def.size 传给 cellRect',
  has(/cellRect\(b\.row, b\.col, b\.def\.size\[0\], b\.def\.size\[1\]\)/));
item('选中框中心也按 span 算',
  has(/cellRect\(sb\.row, sb\.col, sb\.def\.size\[0\], sb\.def\.size\[1\]\)/));
(function () {
  var m = HTML.match(/function cellRect\([\s\S]{0,700}?\n  \}/);
  var body = m ? m[0] : '';
  item('cellRect 走 vRow/vCol', /vRow\(/.test(body) && /vCol\(/.test(body), body ? body.split('\n')[0] : '未找到函数体');
})();
item('pointToCell 反向映射回逻辑格', /function pointToCell[\s\S]{0,420}?return \{ row: vRow\(row\), col: vCol\(col\) \}/.test(HTML));
item('单位贴图阵营走 vTeam（不再按逻辑阵营取图）',
  /var team = vTeam\(u\.team\)/.test(HTML) && !/var team = u\.team === 'blue' \? 'blue' : 'red'/.test(HTML));
item('阵营装饰件走 vTeam', /var team = vTeam\(b\.team\)/.test(HTML));
item('朝向取值走 vFacing（两处：选图 + 绘制）',
  (HTML.match(/POSE\[vFacing\(lastFacing\[u\.id\] \|\| 'down'\)\]/g) || []).length === 2);
item('pvpBegin 里按角色置 FLIP', has(/setFlip\(ME === 'red'\)/));
item('pvpLeave 里复位 FLIP', /pvpLeave[\s\S]{0,600}?setFlip\(false\)/.test(HTML));
item('newGame 里复位 ME/FLIP（单机不走红方视角）', /function newGame[\s\S]{0,320}?setFlip\(false\)/.test(HTML));
item('背景板的阵营色调跟着视角翻', has(/var yRedBand = FLIP \? \(by \+ s \* 6\) : \(by \+ s\)/));
item('通道标签跟着视角翻（走 vRow）', has(/var y = by \+ vRow\(row\) \* s;/));
item('通道标签按「我方/对手」给文案，不写死行号',
  has(/chanLabel\(C\.CHANNEL_ROW\[ME\], '行B · 蓝方通道'/) &&
  has(/chanLabel\(C\.CHANNEL_ROW\[FOE\], '行A · 红方通道'/));
item('背景板缓存 key 含 FLIP/ME（否则切视角不重画）',
  has(/\[W, H, s, layout\.ox, layout\.oy, dpr, FLIP \? 1 : 0, ME, PVP\.active \? 1 : 0\]/));
item('不再残留按 ME 反推方位/阵营的文案',
  !has(/ME === 'blue' \? '最下面' : '最上面'/) &&
  !has(/var meName = \(ME === 'blue' \? '蓝方' : '红方'\)/));

/* 坐标口子必须唯一：除了 buildBackground（画静态草地）与 computeLayout，
 * 不该再有别处直接拿 layout.ox/oy 当格子坐标用 —— 否则镜像会漏那一处。 */
(function () {
  var lines = HTML.split('\n');
  var offenders = [];
  lines.forEach(function (ln, i) {
    if (!/layout\.(ox|oy)/.test(ln)) return;
    if (/layout\.ox = |layout\.oy = /.test(ln)) return;                    // computeLayout
    if (/layout\.ox, layout\.oy, dpr/.test(ln)) return;                    // 缓存 key
    if (/var bx = layout\.ox, by = layout\.oy;/.test(ln)) return;          // buildBackground
    if (/layout\.ox \+ \(?vCol|layout\.oy \+ vRow/.test(ln)) return;         // cellRect(F)
    if (/layout\.ox \+ \(vc|layout\.oy \+ vr/.test(ln)) return;             // cellRect（多格 span 版）
    if (/px - layout\.ox|py - layout\.oy/.test(ln)) return;                // pointToCell
    if (/W - cell \* C\.COLS/.test(ln)) return;
    offenders.push((i + 1) + ': ' + ln.trim().slice(0, 70));
  });
  item('没有绕过 cellRect/pointToCell 的裸 layout.ox/oy 用法', offenders.length === 0, offenders.join(' | '));
})();

/* ========================================================================== */
console.log('\n=== 三、同一局里两端视角对称 ===');

/* 造一局真实对局，取「蓝方视角」和「红方视角」两套屏幕坐标，
 * 检查：① 每个单位在两端都出现在画面内；② 双方大本营都落在下方；
 *      ③ 玩家看到的「我的兵」永远在屏幕下半场之外/之内关系一致。 */
(function () {
  var st = C.createState({ seed: 20261028, difficulty: 'hard' });
  st.aiTeam = null;
  st.res.blue = 1e6; st.res.red = 1e6;
  C.deployUnit(st, 'blue', 'infantry', 3);
  C.deployUnit(st, 'blue', 'archer', 7);
  C.deployUnit(st, 'red', 'infantry', 4);
  C.deployUnit(st, 'red', 'heavy', 8);
  for (var i = 0; i < 20 * 8; i++) C.update(st, C.DT);

  var blueBase = C.ownBase(st, 'blue'), redBase = C.ownBase(st, 'red');
  question1: {
    var br = V.flipRow(blueBase.row, false);      // 蓝方玩家看到的蓝家大本营行
    var rr = V.flipRow(redBase.row, true);        // 红方玩家看到的红家大本营行
    item('蓝方玩家眼里自己大本营在下半场', br >= (ROWS + 1) / 2, '屏幕行' + br);
    item('红方玩家眼里自己大本营在下半场', rr >= (ROWS + 1) / 2, '屏幕行' + rr);
    item('红方玩家眼里的对手（蓝家）在上半场', V.flipRow(blueBase.row, true) < (ROWS + 1) / 2,
      '屏幕行' + V.flipRow(blueBase.row, true));
  }

  /* 逐个单位检查：两端看到的位置都必须在 0..ROWS+1 行、1..COLS 列内 */
  var outOfBoard = [];
  st.units.forEach(function (u) {
    [false, true].forEach(function (flip) {
      var p = V.cellToView(u.row, u.col, flip);
      if (p.row < 0 || p.row > ROWS + 1 || p.col < 1 || p.col > COLS) {
        outOfBoard.push(u.key + '@' + u.row + ',' + u.col + ' flip=' + flip + ' → ' + p.row + ',' + p.col);
      }
    });
  });
  item('所有单位在两端视角下都落在画面内', outOfBoard.length === 0, outOfBoard.join(' | '));

  /* 「我方推进」在两端屏幕上必须同向：都朝屏幕上方（屏幕行减小） */
  var mine = st.units.filter(function (u) { return u.team === 'blue'; })[0];
  var before = V.flipRow(mine.row, false);
  var r0 = mine.row;
  for (var k = 0; k < 20 * 3; k++) C.update(st, C.DT);
  var afterBlueView = V.flipRow(mine.row, false);
  item('蓝方玩家眼里自己的兵朝屏幕上方推进（行号减小）', afterBlueView < before || mine.row === r0,
    before + ' → ' + afterBlueView);

  /* 红方视角用同一台摄像机：把同一个位移喂给 flipRow(true) 看方向 */
  var redUnit = C.spawnUnit(st, 'red', 'infantry', 4, 5);
  var rb0 = redUnit.row;
  for (var k2 = 0; k2 < 20 * 3; k2++) C.update(st, C.DT);
  var redBefore = V.flipRow(rb0, true), redAfter = V.flipRow(redUnit.row, true);
  item('红方玩家眼里自己的兵同样朝屏幕上方推进（行号减小）',
    redAfter < redBefore || redUnit.row === rb0, redBefore + ' → ' + redAfter);
})();

/* ========================================================================== */
console.log('\n=== 四、单机（蓝方视角）零回归 ===');

(function () {
  /* 不翻的时候，映射必须是恒等 —— 这是"绝不破坏原单机"的形式化保证 */
  var bad = [];
  for (var r = 0; r <= ROWS + 1; r++) {
    if (V.flipRow(r, false) !== r) bad.push('row' + r);
    if (V.flipRow(r, undefined) !== r) bad.push('row(undef)' + r);
  }
  for (var c = 1; c <= COLS; c++) {
    if (V.flipCol(c, false) !== c) bad.push('col' + c);
  }
  item('FLIP=false 时行/列映射是恒等变换', bad.length === 0, bad.join(','));
  item('FLIP=false 时视觉阵营 = 逻辑阵营',
    V.vTeam('blue', 'blue') === 'blue' && V.vTeam('red', 'blue') === 'red');

  /* 真实对局跑一遍，确认没被这套改动影响：蓝方大本营仍在行 9-10、通道仍在行 11 */
  var st = C.createState({ seed: 7, difficulty: 'normal' });
  var bb = C.ownBase(st, 'blue');
  item('蓝方大本营逻辑行仍为 9（未被视角层污染）', bb.row === 9, bb.row);
  item('蓝方通道行仍为 11', C.CHANNEL_ROW.blue === ROWS + 1, C.CHANNEL_ROW.blue);
  item('红方通道行仍为 0', C.CHANNEL_ROW.red === 0, C.CHANNEL_ROW.red);

  /* view.js 绝不能反过来改 logic.js 的常量（纯函数模块的边界） */
  item('view.js 不引用 GameCore（不会反向改逻辑）',
    !/GameCore|require\(.*logic/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'view.js'), 'utf8')));
})();

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
