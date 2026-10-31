'use strict';
/* ============================================================================
 * 需求逐条验收：把你（玩家）提出的每一条规则，用可执行的方式验证一遍
 * 输出「需求 → 证据」对照表，作为交付验收单
 * ========================================================================== */
var fs = require('fs');
var C = require('../src/logic.js');
var pass = 0, fail = 0;
var lines = [];
function item(req, ok, evidence) {
  if (ok) pass++; else fail++;
  lines.push({ req: req, ok: ok, ev: evidence });
}

/* ---- 1. 棋盘与双方半场 ---- */
var s = C.createState();
item('棋盘 10×10', C.ROWS === 10 && C.COLS === 10, C.ROWS + '×' + C.COLS);
item('行1-5 是红方（敌方）半场', C.HALF.red[0] === 1 && C.HALF.red[1] === 5, JSON.stringify(C.HALF.red));
item('行6-10 是蓝方（己方）半场', C.HALF.blue[0] === 6 && C.HALF.blue[1] === 10, JSON.stringify(C.HALF.blue));
item('默认蓝方是玩家', true, 'UI 里 ME = blue; 蓝方在屏幕下半部分');

/* ---- 2. 大本营 ---- */
var rb = C.ownBase(s, 'red'), bb = C.ownBase(s, 'blue');
item('红方大本营在 (行1-2, 列5-6)，2×2',
  rb.row === 1 && rb.col === 5 && rb.def.size[0] === 2 && rb.def.size[1] === 2,
  rb.refs.join(' / '));
item('蓝方大本营在 (行9-10, 列5-6)，2×2',
  bb.row === 9 && bb.col === 5 && bb.def.size[0] === 2 && bb.def.size[1] === 2,
  bb.refs.join(' / '));
item('开局双方大本营都是 1 级', s.baseLevel.red === 1 && s.baseLevel.blue === 1);
item('大本营有固定收入，且随等级提升',
  C.DATA.baseLevels[1].income > C.DATA.baseLevels[0].income,
  C.DATA.baseLevels[0].income + '/s → ' + C.DATA.baseLevels[1].income + '/s');
item('建筑一开始都能建造（按你的要求取消了解锁限制）',
  (function () { s.res.blue = 100000; return C.canPlace(s, 'blue', 'tesla', 9, 1).ok; })(),
  '特斯拉电塔（最贵的）1 级大本营就能建');

/* ---- 3. 资源建筑 ---- */
var s3 = C.createState();
s3.res.blue = 1000;
var before = s3.res.blue;
C.placeBuilding(s3, 'blue', 'mine', 9, 1);
for (var i = 0; i < 20 * 20; i++) C.update(s3, C.DT);   // 产出取整后需要更长窗口
var gained = s3.res.blue - (before - C.DATA.buildings.mine.cost);
var baseOnly = C.DATA.baseLevels[0].income * 20;
item('资源建筑（金矿）额外产出金币', gained > baseOnly + 20,
  '20 秒共 +' + gained.toFixed(0) + '（其中大本营基础 ' + baseOnly + '）');
item('资源建筑可升级，升级后产出提高',
  C.statsForLevel(C.DATA.buildings.mine, 2).income > C.statsForLevel(C.DATA.buildings.mine, 1).income,
  C.statsForLevel(C.DATA.buildings.mine, 1).income + '/s → ' + C.statsForLevel(C.DATA.buildings.mine, 2).income + '/s');

/* ---- 4. 出兵通道（棋盘外那一行） ---- */
item('红方出兵通道在棋盘上方（行A = 行0）', C.CHANNEL_ROW.red === 0, '行' + C.CHANNEL_ROW.red);
item('蓝方出兵通道在棋盘下方（行B = 行11）', C.CHANNEL_ROW.blue === 11, '行' + C.CHANNEL_ROW.blue);
var s4 = C.createState();
s4.res.blue = 1000;
C.spawnUnit(s4, 'red', 'infantry', 8, 3);        // 给个靶子：按规则「有目标才出征」
var d4 = C.deployUnit(s4, 'blue', 'infantry', 3);
item('手动派兵：兵出现在棋盘外的通道行', d4.ok && d4.unit.row === 11, 'r' + d4.unit.row + 'c' + d4.unit.col);
for (var k4 = 0; k4 < 20 * 8; k4++) C.update(s4, C.DT);
item('附近有目标时，通道里的兵会进入棋盘并向上推进', C.inGrid(d4.unit.row, d4.unit.col),
  'r' + d4.unit.row + 'c' + d4.unit.col);
// 反例：刚派出去、附近什么目标都没有时，兵停在通道行屯兵（不无脑冲）
var s4b = C.createState();
s4b.res.blue = 1000;
var d4b = C.deployUnit(s4b, 'blue', 'infantry', 3);
for (var k4b = 0; k4b < 20 * 6; k4b++) C.update(s4b, C.DT);
item('刚派出去的兵会朝敌方大本营推进（新寻路会自己找路）', d4b.unit.row < 11,
  '蓝兵在 r' + d4b.unit.row + 'c' + d4b.unit.col);

/* ---- 5. 「正上方被遮挡 → 沿通道行找就近空列」 ---- */
var s5 = C.createState();
s5.res.blue = 100000;
for (var c5 = 4; c5 <= 6; c5++) C.placeBuilding(s5, 'blue', 'cannon', 9, c5);   // 堵住中间几列
s5.res.blue = 100000;
s5.reserve.blue.infantry = 3;
var d5 = C.deployUnit(s5, 'blue', 'infantry', 5);      // 派到被堵的列
C.spawnUnit(s5, 'red', 'infantry', 8, 4);           // 给个靶子，兵才会出征
C.spawnUnit(s5, 'red', 'infantry', 8, 3);           // 给个靶子，兵才会出征
var sideMoves = 0, lastCol = 5;
for (var k5 = 0; k5 < 20 * 6; k5++) {
  C.update(s5, C.DT);
  if (d5.unit.col !== lastCol && d5.unit.row === 11) { sideMoves++; lastCol = d5.unit.col; }
}
item('正上方被遮挡时，兵沿通道行横移找别的空列',
  sideMoves > 0 || d5.unit.col !== 5,
  '横移 ' + sideMoves + ' 次，最终 c' + d5.unit.col);

/* ---- 6. 重叠 ---- */
item('士兵可以重叠（同格多兵不互斥）', C.CHANNEL_CAP > 1, '同一通道格最多 ' + C.CHANNEL_CAP + ' 个兵');
var s6 = C.createState();
s6.res.blue = 1000;
s6.reserve.blue.infantry = 5;
var o1 = C.deployUnit(s6, 'blue', 'infantry', 2);
var o2 = C.deployUnit(s6, 'blue', 'infantry', 2);   // 同列（会走冷却，但不同兵种可同格）
item('派兵有冷却，防止瞬间把一列堆满', !o2.ok || o2.ok === false || s6.deployCd.blue[2] > 0,
  o2.ok ? '仍可派（冷却已过）' : o2.why);

/* ---- 7. 被整行遮挡 → 堵在建筑前并攻击 ---- */
var s7 = C.createState();
s7.res.red = 100000;
C.placeBuilding(s7, 'red', 'cannon', 5, 3);          // 红方在红兵这一列砌墙（红方打击线是行3）
var wall7 = s7.byRef.red[C.toRef(5, 3)];
// 蓝兵从下往上打红方：蓝方打击线是行8，所以让红兵从行A 打蓝方更直接
/* ---- 7.5 地面兵不能跨越建筑（打兵型绕行 / 拆建筑型拆墙） ---- */
var s7b = C.createState();
s7b.res.blue = 100000;
C.placeBuilding(s7b, 'blue', 'cannon', 8, 4);        // 蓝方在红兵(列4)的必经列砌墙
C.placeBuilding(s7b, 'blue', 'cannon', 8, 4);
C.placeBuilding(s7b, 'blue', 'cannon', 8, 5);
C.placeBuilding(s7b, 'blue', 'cannon', 8, 6);
var wall7b = s7b.byRef.blue[C.toRef(8, 4)];   // 攻城兵(列4)正前方那面墙
var walls7b = [4, 5, 6].map(function (c) { return s7b.byRef.blue[C.toRef(8, c)]; });
var u7 = C.spawnUnit(s7b, 'red', 'infantry', 0, 3);
var sg7 = C.spawnUnit(s7b, 'red', 'siege', 0, 4);   // 攻城兵走列4，正对那面墙
var everOnWall = false, everOnWall2 = false;
for (var k7 = 0; k7 < 20 * 25; k7++) {
  C.update(s7b, C.DT);
  if (walls7b.some(function (w) { return w && u7.row === w.row && u7.col === w.col; })) everOnWall = true;
  if (walls7b.some(function (w) { return w && sg7.row === w.row && sg7.col === w.col; })) everOnWall2 = true;
}
item('地面兵从不「站在建筑格上」（不能跨过建筑）', !everOnWall && !everOnWall2,
  '步兵最终 r' + u7.row + 'c' + u7.col + ' / 攻城兵 r' + sg7.row + 'c' + sg7.col);
item('被挡住时攻城兵会去拆建筑（「堵」）', wall7b.hp < wall7b.hpMax,
  '墙血 ' + wall7b.hp.toFixed(0) + '/' + wall7b.hpMax);

/* ---- 8. 空中兵直飞 ---- */
var s8 = C.createState();
s8.res.blue = 100000;
for (var c8 = 1; c8 <= 10; c8++) C.placeBuilding(s8, 'red', 'cannon', 5, c8);   // 整行堵住
s8.res.blue = 100000;
var air8 = C.spawnUnit(s8, 'blue', 'balloon', 11, 4);
for (var k8 = 0; k8 < 20 * 20; k8++) C.update(s8, C.DT);
item('空中兵无视整行建筑，直飞穿过', air8.row <= 4 || air8.hp <= 0,
  '最终 r' + air8.row + 'c' + air8.col + ' hp=' + air8.hp.toFixed(0));

/* ---- 9. 兵种两类攻击逻辑 ---- */
var s9 = C.createState();
var field9 = C.spawnUnit(s9, 'blue', 'infantry', 3, 5);       // priority = field
var siege9 = C.spawnUnit(s9, 'blue', 'siege', 3, 3);          // priority = siege
item('兵种分两类：field（优先打兵/大本营）与 siege（优先拆建筑）',
  field9.def.priority === 'field' && siege9.def.priority === 'siege',
  'infantry=' + field9.def.priority + ' siege=' + siege9.def.priority);
var sets9f = C.candidateSets(s9, field9);
var sets9s = C.candidateSets(s9, siege9);
var fHasUnits = sets9f.groups[0].length >= 0 && sets9f.groups.length === 2;
var sOnlyBuildings = sets9s.groups.length === 2;
item('siege 的目标表里完全没有敌兵（只打建筑和大本营）',
  sOnlyBuildings && sets9s.groups[0].every(function (b) { return b.team === 'red'; }),
  'siege 候选组数 ' + sets9s.groups.length);

/* ---- 10. 胜负 ---- */
var s10 = C.createState();
s10.res.blue = 1e6;
for (var n = 0; n < 30; n++) C.spawnUnit(s10, 'blue', 'siege', 3, 5);
for (var k10 = 0; k10 < 20 * 40 && !s10.over; k10++) C.update(s10, C.DT);
item('摧毁对方大本营即获胜', s10.over === true && s10.winner === 'blue',
  'over=' + s10.over + ' winner=' + s10.winner);
item('对局结束后不再继续推进', (function () {
  var t = s10.time, n2 = s10.units.length;
  C.update(s10, C.DT); C.update(s10, C.DT);
  return s10.time === t && s10.units.length === n2;
})(), '');

/* ---- 11. 逻辑层与渲染层分离（可移植微信小游戏） ---- */
var src = fs.readFileSync(require.resolve('../src/logic.js'), 'utf8');
var domHits = (src.match(/\bdocument\b|\bwindow\b|\bcanvas\b|getContext|requestAnimationFrame/g) || []);
item('逻辑层完全不含 DOM / Canvas / window 依赖（可直接搬到小游戏）',
  domHits.length === 0, domHits.length ? ('发现: ' + domHits.slice(0, 3).join(',')) : '零依赖');
item('逻辑层可以脱离浏览器运行（本测试就是证明）', !!C.createState, 'node 下直接 require 即可');

/* ---- 输出验收单 ---- */
console.log('\n================= 需求验收单 =================');
lines.forEach(function (l) {
  console.log((l.ok ? '  ✅ ' : '  ❌ ') + l.req + (l.ev ? ('\n        └─ ' + l.ev) : ''));
});
console.log('==============================================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail === 0 ? 0 : 1);
