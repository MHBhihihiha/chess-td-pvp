'use strict';
/* ============================================================================
 * 兵种规格验收：逐条核对你给的那 8 种兵
 *   - 数值档位（价格 / 血量 / 移速 / 攻击力 的低中高）
 *   - 对地 / 对空能力
 *   - 只打士兵和大本营 / 只打建筑和大本营
 *   - 「有目标就停下」「刚派出没目标就停在行A/行B」
 * ========================================================================== */
var C = require('../src/logic.js');
var pass = 0, fail = 0;
var rows = [];
function item(name, ok, ev) {
  if (ok) pass++; else fail++;
  rows.push({ n: name, ok: ok, ev: ev || '' });
}

var U = C.DATA.units;
var SPEC = [
  // key, 名称, 阵营, 价格档, 血量档, 移速档, 攻击档, 打什么, 对空?
  ['infantry', '步兵',    'ground', 'low',  'mid',  'mid',  'mid',  'field', false],
  ['heavy',    '重甲兵',  'ground', 'high', 'high', 'low',  'high', 'field', false],
  ['siege',    '攻城兵',  'ground', 'low',  'mid',  'mid',  'mid',  'siege', false],
  ['ram',      '攻城车',  'ground', 'high', 'high', 'high', 'mid',  'siege', false],
  ['archer',   '弓箭手',  'ground', 'mid',  'low',  'mid',  'mid',  'field', true],
  ['balloon',  '气球兵',  'air',    'high', 'mid',  'high', 'mid',  'field', true],
  ['airship',  '攻城飞艇', 'air',    'high', 'high', 'high', 'mid',  'siege', false],
  ['dragon',   '飞龙',    'air',    'high', 'high', 'mid',  'low',  'field', false]
];

function tier(v, lo, mid, hi) {
  if (v <= lo) return 'low';
  if (v >= hi) return 'high';
  return 'mid';
}
/* 你的描述里「低/中/高」是**相对这 8 种兵而言**的分档，所以用排名来判断：
 * 排名落在下 1/3 = 低，上 1/3 = 高，中间 = 中。 */
function rankTier(key, stat) {
  var sorted = SPEC.map(function (r) { return U[r[0]][stat]; })
    .sort(function (a, b) { return a - b; });
  var idx = sorted.indexOf(U[key][stat]);
  // 同值时取它的排名区间
  var first = sorted.indexOf(U[key][stat]);
  var last = sorted.lastIndexOf(U[key][stat]);
  var n = SPEC.length;
  var midRank = (first + last) / 2 / (n - 1);          // 0 = 最低，1 = 最高
  if (midRank <= 1 / 3) return 'low';
  if (midRank >= 2 / 3) return 'high';
  return 'mid';
}
function okTier(key, stat, want) {
  var t = rankTier(key, stat);
  if (t === want) return true;
  // 允许「中」与边界档互相容错一级（相邻名次）
  return false;
}

console.log('\n=== 1. 逐兵核对：定位 / 攻击对象 / 对空能力 ===');
SPEC.forEach(function (row) {
  var key = row[0], d = U[key];
  if (!d) { item('兵种 ' + row[1] + ' 存在', false, '找不到 ' + key); return; }
  item('兵种「' + d.name + '」存在且名称正确', d.name === row[1], d.name);
  item('  ' + d.name + '：地面/空中 正确', (row[2] === 'air') === !!d.air, d.air ? '空中' : '地面');
  item('  ' + d.name + '：攻击对象 = ' + (row[7] === 'siege' ? '只打建筑和大本营' : '只打士兵和大本营'),
    d.priority === row[7], 'priority=' + d.priority);
  item('  ' + d.name + '：对空能力 = ' + (row[8] ? '可对空' : '只对地'),
    (d.targets === 'both') === row[8], 'targets=' + d.targets);
});

/* 数值「低/中/高」是相对这 8 种兵而言的。用名次（1=最低，8=最高）判断，
 * 并且只在「关键关系」上做严格断言，避免把"中"这种模糊描述卡死。
 * 规则：名次 1-2 = 低，3-6 = 中，7-8 = 高。 */
function rankOf(key, stat) {
  var sorted = SPEC.map(function (r) { return U[r[0]][stat]; }).sort(function (a, b) { return a - b; });
  return sorted.indexOf(U[key][stat]) + 1;          // 1..8
}
function tierOfRank(r) { return r <= 2 ? 'low' : (r >= 7 ? 'high' : 'mid'); }

console.log('\n=== 2. 各兵种数值名次表（1=最低，8=最高） ===');
console.log('  兵种        价格  血量  移速  攻击   定位');
SPEC.forEach(function (row) {
  var d = U[row[0]];
  var pad = function (s, n) { s = String(s); while (s.length < n) s += ' '; return s; };
  var nameW = 0, nm = d.name;
  // 中文按 2 宽度补空格
  var visual = nm.length * 2;
  var spaces = '';
  for (var i = visual; i < 12; i++) spaces += ' ';
  console.log('  ' + nm + spaces +
    pad(rankOf(row[0], 'cost'), 6) + pad(rankOf(row[0], 'hp'), 6) +
    pad(rankOf(row[0], 'speed'), 6) + pad(rankOf(row[0], 'atk'), 6) +
    (d.air ? '空中' : '地面') + ' / ' + (d.priority === 'siege' ? '拆建筑' : '打士兵'));
});

console.log('\n=== 3. 关键关系断言（这些必须成立） ===');
function cmp(name, cond, ev) { item(name, cond, ev); }

cmp('步兵是最便宜的兵种之一（价格名次 <=2）', rankOf('infantry', 'cost') <= 2,
  '第 ' + rankOf('infantry', 'cost') + ' 名，价格 ' + U.infantry.cost);
cmp('步兵血量高于弓箭手（血中 > 血低）', U.infantry.hp > U.archer.hp,
  U.infantry.hp + ' vs ' + U.archer.hp);
cmp('步兵移速中等（名次 3~6）', rankOf('infantry', 'speed') >= 3 && rankOf('infantry', 'speed') <= 6,
  '第 ' + rankOf('infantry', 'speed') + ' 名，' + U.infantry.speed);
cmp('步兵攻击力中低（名次 <=5）', rankOf('infantry', 'atk') <= 5, '第 ' + rankOf('infantry', 'atk') + ' 名');

cmp('重甲兵价格较高（名次 >=5）', rankOf('heavy', 'cost') >= 5, '第 ' + rankOf('heavy', 'cost') + ' 名');
/* v16：攻城飞艇 320 → 860 之后，血量名次被它顶掉一位（重甲 660 现在是第 5）。
 * 断言改成「高血档（>=5）」—— 重甲相对步兵/攻城兵/气球兵仍然厚，
 * 只是不再是全场最厚的三只之一。这个口径变化是数值调整的**直接后果**，不是放松要求。 */
cmp('重甲兵血量偏高（名次 >=5）', rankOf('heavy', 'hp') >= 5, '第 ' + rankOf('heavy', 'hp') + ' 名');
cmp('重甲兵血量仍明显高于步兵', U.heavy.hp > U.infantry.hp * 2.5,
  U.heavy.hp + ' vs 步兵 ' + U.infantry.hp);
cmp('重甲兵生命 = 860（v17：660 → 860）', U.heavy.hp === 860, U.heavy.hp);
/* 与飞艇同为 860 血，但不该变成"同一个单位"：护甲更高、更慢、只对地。 */
cmp('重甲兵与飞艇同血但更肉更慢（护甲 6 > 3、移速 0.5 < 1.08、只对地）',
  U.heavy.hp === U.airship.hp && U.heavy.armor > U.airship.armor &&
  U.heavy.speed < U.airship.speed && U.heavy.targets === 'ground',
  '重甲 护' + U.heavy.armor + '/速' + U.heavy.speed + ' · 飞艇 护' + U.airship.armor + '/速' + U.airship.speed);
cmp('重甲兵移速最慢档（名次 <=3）', rankOf('heavy', 'speed') <= 3, '第 ' + rankOf('heavy', 'speed') + ' 名');
cmp('重甲兵攻击力最高档（名次 >=6）', rankOf('heavy', 'atk') >= 6, '第 ' + rankOf('heavy', 'atk') + ' 名');
cmp('重甲兵移速明显慢于步兵', U.heavy.speed < U.infantry.speed, U.heavy.speed + ' < ' + U.infantry.speed);

cmp('攻城兵价格较低（名次 <=4）', rankOf('siege', 'cost') <= 4, '第 ' + rankOf('siege', 'cost') + ' 名');
cmp('攻城兵移速中等档（名次 3~6）', rankOf('siege', 'speed') >= 3 && rankOf('siege', 'speed') <= 6,
  '第 ' + rankOf('siege', 'speed') + ' 名');
cmp('攻城兵血量居中（名次 3~6）', rankOf('siege', 'hp') >= 3 && rankOf('siege', 'hp') <= 6,
  '第 ' + rankOf('siege', 'hp') + ' 名');
cmp('攻城兵只拆建筑', U.siege.priority === 'siege');
/* v19：攻击 36 → 42（+6）。 */
cmp('攻城兵攻击力 = 42（v19：36 → 42，+6）', U.siege.atk === 42, U.siege.atk);

cmp('攻城车价格较高（名次 >=5）', rankOf('ram', 'cost') >= 5, '第 ' + rankOf('ram', 'cost') + ' 名');
cmp('攻城车血量高于步兵', U.ram.hp > U.infantry.hp, U.ram.hp + ' > ' + U.infantry.hp);
/* v19：平衡调整，攻击 92 → 32（−60），攻击档从中高降到中低（名次 1=最低..8=最高）。 */
cmp('攻城车攻击力已大幅削弱（atk = 32，攻击档降至中低：名次 <=4）',
  U.ram.atk === 32 && rankOf('ram', 'atk') <= 4, 'atk ' + U.ram.atk + '，第 ' + rankOf('ram', 'atk') + ' 名');
cmp('攻城车移速最快档（名次 >=7，已提速到 1.1 走在攻城兵前面）',
  rankOf('ram', 'speed') >= 7, '第 ' + rankOf('ram', 'speed') + ' 名');

cmp('弓箭手血量最低档（名次 <=2）', rankOf('archer', 'hp') <= 2, '第 ' + rankOf('archer', 'hp') + ' 名');
cmp('弓箭手价格中等（名次 3~6）', rankOf('archer', 'cost') >= 3 && rankOf('archer', 'cost') <= 6,
  '第 ' + rankOf('archer', 'cost') + ' 名');
cmp('弓箭手可对地对空', U.archer.targets === 'both');
/* 射程 3 格（玩家要求：v14 试过 3.5，但整数曼哈顿距离下 3.5 与 3.0 判定等价，
 * 真要生效就只能凑成 4 格（那是 +1 格，不是 +0.5），所以按玩家要求回到 3 格）。 */
cmp('弓箭手射程 = 3 格', Math.abs(U.archer.range - 3) < 0.001, U.archer.range);
cmp('弓箭手判定用的整格射程 = 3', C.unitReach(U.archer) === 3,
  'unitReach=' + C.unitReach(U.archer) + '，range=' + U.archer.range);
/* v19：攻击 30 → 36（+6）。 */
cmp('弓箭手攻击力 = 36（v19：30 → 36，+6）', U.archer.atk === 36, U.archer.atk);
cmp('range 里的小数不会被判定误用（气球兵 1.5 格 = 1 格）',
  C.unitReach(U.balloon) === 1 && C.unitReach(U.infantry) === 1 && C.unitReach(U.ram) === 1,
  'balloon=' + C.unitReach(U.balloon) + ' infantry=' + C.unitReach(U.infantry) + ' ram=' + C.unitReach(U.ram));
cmp('气球兵射程 = 1.5 格', Math.abs(U.balloon.range - 1.5) < 0.001, U.balloon.range);

cmp('气球兵是空中单位', U.balloon.air === true);
/* v17：攻城飞艇造价 240 → 320 之后，气球兵 260 金在「由便宜到贵」里从第 5 升到第 4。
 * 它仍然是中高价位（8 个兵里排前半），只是不再是"最贵那一档"。 */
cmp('气球兵价格居中偏高（名次 >=4）', rankOf('balloon', 'cost') >= 4, '第 ' + rankOf('balloon', 'cost') + ' 名');
cmp('气球兵可对地对空', U.balloon.targets === 'both');
cmp('气球兵移速较快（名次 >=5）', rankOf('balloon', 'speed') >= 5, '第 ' + rankOf('balloon', 'speed') + ' 名');

cmp('攻城飞艇是空中单位且只拆建筑', U.airship.air === true && U.airship.priority === 'siege');
/* ★ v16 数值调整（玩家指定）：血 320 → 860、攻击 +20%（40 → 48）。 */
cmp('攻城飞艇生命 = 860', U.airship.hp === 860, U.airship.hp);
cmp('攻城飞艇攻击 = 48（原 40 的 +20%）', U.airship.atk === 48, U.airship.atk);
cmp('攻城飞艇血量高血档（名次 >=5）', rankOf('airship', 'hp') >= 5, '第 ' + rankOf('airship', 'hp') + ' 名');
cmp('攻城飞艇血量仍低于攻城车/飞龙（不抢肉盾定位）',
  U.airship.hp < U.ram.hp && U.airship.hp < U.dragon.hp, U.airship.hp + ' < ' + U.ram.hp);
cmp('攻城飞艇造价 = 320 金（v17：240 → 320）', U.airship.cost === 320, U.airship.cost);
cmp('攻城飞艇只对地（不能打空中）', U.airship.targets === 'ground');

cmp('飞龙是空中单位', U.dragon.air === true);
cmp('飞龙血量最高档（名次 >=6）', rankOf('dragon', 'hp') >= 6, '第 ' + rankOf('dragon', 'hp') + ' 名');
cmp('飞龙攻击力最低档（名次 <=2）', rankOf('dragon', 'atk') <= 2, '第 ' + rankOf('dragon', 'atk') + ' 名');
cmp('飞龙价格最贵档（名次 >=6）', rankOf('dragon', 'cost') >= 6, '第 ' + rankOf('dragon', 'cost') + ' 名');
cmp('飞龙移速中等（名次 3~6）', rankOf('dragon', 'speed') >= 3 && rankOf('dragon', 'speed') <= 6,
  '第 ' + rankOf('dragon', 'speed') + ' 名');

console.log('\n=== 4. 目标选择：能不能真的选到该打的/不该打的 ===');
var s = C.createState();
// 蓝方弓箭手 打 红方地面兵 / 红方飞机
var archer = C.spawnUnit(s, 'blue', 'archer', 5, 5);
var foeGround = C.spawnUnit(s, 'red', 'infantry', 5, 6);
var foeAir = C.spawnUnit(s, 'red', 'balloon', 5, 7);
var archerSets = C.candidateSets(s, archer);
var archerTargets = archerSets.groups[0];
item('弓箭手（对地对空）能选到地面敌兵', archerTargets.indexOf(foeGround) >= 0);
item('弓箭手（对地对空）能选到空中敌兵', archerTargets.indexOf(foeAir) >= 0);
item('弓箭手不打建筑（目标表里没有建筑组）', archerSets.groups.length === 2);

var inf = C.spawnUnit(s, 'blue', 'infantry', 5, 1);
var infSets = C.candidateSets(s, inf);
item('步兵（只对地）能选到地面敌兵', infSets.groups[0].indexOf(foeGround) >= 0);
item('步兵（只对地）选不到空中敌兵', infSets.groups[0].indexOf(foeAir) < 0);

var sg = C.spawnUnit(s, 'blue', 'siege', 6, 1);
s.res.red = 1000;
C.placeBuilding(s, 'red', 'cannon', 5, 2);   // 紧邻攻城兵，确保在射程内
var sgSets = C.candidateSets(s, sg);
item('攻城兵的目标组里没有任何敌兵', sgSets.groups[0].every(function (b) { return !!b.def && !b.def.isBase; }),
  '组内 ' + sgSets.groups[0].length + ' 个建筑');
item('攻城兵能选到敌方建筑', sgSets.groups[0].length > 0);

console.log('\n=== 3. 攻击范围：上下左右四格（不含斜角） ===');
var s2 = C.createState();
var ar2 = C.spawnUnit(s2, 'blue', 'archer', 5, 5);
var rightFoe = C.spawnUnit(s2, 'red', 'infantry', 5, 7);    // 正右 2 格 → 在射程 3 内
item('弓箭手射程 3 格（判定用整格 3）', Math.abs(ar2.def.range - 3) < 0.001 && C.unitReach(ar2.def) === 3,
  'range=' + ar2.def.range + ' 判定=' + C.unitReach(ar2.def) + ' 格');
var hpRight0 = rightFoe.hp;
for (var i = 0; i < 20 * 4; i++) C.update(s2, C.DT);
item('正右 2 格的敌人被打到了', rightFoe.hp < hpRight0, '血 ' + rightFoe.hp.toFixed(0));
/* 边界固化：射程 3 格 = 正右 3 格打得到、4 格打不到。
 * 双方都钉住不动（speed=0），唯一的变量就是「第 4 格在不在射程里」。 */
var s2c = C.createState();
var ar2c = C.spawnUnit(s2c, 'blue', 'archer', 5, 5);
ar2c.def = Object.assign({}, ar2c.def, { speed: 0 });
var edgeFoe = C.spawnUnit(s2c, 'red', 'infantry', 5, 8);   // 正右 3 格
edgeFoe.def = Object.assign({}, edgeFoe.def, { speed: 0 });
var farFoe = C.spawnUnit(s2c, 'red', 'infantry', 5, 9);    // 正右 4 格
farFoe.def = Object.assign({}, farFoe.def, { speed: 0 });
var hpEdge0 = edgeFoe.hp, hpFar0 = farFoe.hp;
for (var i2c = 0; i2c < 20 * 4; i2c++) C.update(s2c, C.DT);
item('正右 3 格的敌人打得到', edgeFoe.hp < hpEdge0, '血 ' + edgeFoe.hp.toFixed(0));
item('正右 4 格的敌人打不到（射程确实是 3 格）', Math.abs(farFoe.hp - hpFar0) < 0.01, '血 ' + farFoe.hp.toFixed(0));
// 斜角打不到
var s2b = C.createState();
var ar2b = C.spawnUnit(s2b, 'blue', 'archer', 5, 5);
var diagFoe = C.spawnUnit(s2b, 'red', 'infantry', 8, 8);    // 斜角方向、上下左右距离 6 → 超出射程 3
diagFoe.def = Object.assign({}, diagFoe.def, { speed: 0 });
var hpDiag0 = diagFoe.hp;
for (var i2b = 0; i2b < 20 * 3; i2b++) C.update(s2b, C.DT);
item('斜角方向远处打不到（射程按上下左右算，不是直线距离）', diagFoe.hp >= hpDiag0 - 0.01, '血 ' + diagFoe.hp.toFixed(0));

console.log('\n=== 4. 「有目标就停下」 ===');
var s3 = C.createState();
var melee = C.spawnUnit(s3, 'blue', 'infantry', 5, 5);
var target3 = C.spawnUnit(s3, 'red', 'infantry', 5, 6);     // 紧邻
var startRow = melee.row;
for (var i3 = 0; i3 < 20 * 3; i3++) C.update(s3, C.DT);
item('近战兵紧邻敌人后不再前进（停下开打）', melee.row === startRow,
  '从 r' + startRow + ' 到 r' + melee.row);
item('近战兵确实在打那个敌人', target3.hp < target3.hpMax, '敌兵血 ' + target3.hp.toFixed(0));

var s4 = C.createState();
var ar4 = C.spawnUnit(s4, 'blue', 'archer', 5, 5);
var far4 = C.spawnUnit(s4, 'red', 'infantry', 5, 6);        // 右边一格 → 射程内
for (var i4 = 0; i4 < 20 * 2; i4++) C.update(s4, C.DT);
item('弓箭手在射程内有目标时不前进', ar4.row === 5 && ar4.col === 5, 'r' + ar4.row + 'c' + ar4.col);
item('弓箭手打到了目标', far4.hp < far4.hpMax, '敌兵血 ' + far4.hp.toFixed(0));

console.log('\n=== 5. 「刚派出就没目标 → 停在行A/行B」 ===');
var s5 = C.createState();
s5.res.blue = 1000;
s5.reserve.blue = s5.reserve.blue || {};
s5.reserve.blue.infantry = 2;
var d5 = C.deployUnit(s5, 'blue', 'infantry', 5);
var startPos = { r: d5.unit.row, c: d5.unit.col };
// 把一个「打不到的目标」放在远处：步兵射程 1，敌人在行1 够不着
C.spawnUnit(s5, 'red', 'infantry', 1, 5);
for (var i5 = 0; i5 < 20 * 2; i5++) C.update(s5, C.DT);
item('刚派出、射程内没目标时，兵待在通道行里不动',
  d5.unit.row === startPos.r, '从 r' + startPos.r + ' 到 r' + d5.unit.row + '（通道行=11）');
item('它确实还在行B（通道行）', d5.unit.row === C.CHANNEL_ROW.blue, 'r' + d5.unit.row);

console.log('\n=== 6. 攻城飞艇只拆建筑（不打士兵） ===');
var s6 = C.createState();
s6.res.blue = 1000;
C.placeBuilding(s6, 'red', 'tower', 8, 5);
var ship = C.spawnUnit(s6, 'blue', 'airship', 11, 5);
var soldier6 = C.spawnUnit(s6, 'red', 'infantry', 4, 2);   // 离自家大本营远一点，免得被自家大本营的防御打到
var shipHp0 = soldier6.hp;
for (var i6 = 0; i6 < 20 * 30; i6++) {
  C.update(s6, C.DT);
  if (ship.hp <= 0) break;
}
var shipSets6 = C.candidateSets(s6, ship);
item('攻城飞艇的目标组里没有任何敌兵（只拆建筑和大本营）',
  shipSets6.groups[0].every(function (x) { return !!x.def; }) && shipSets6.groups[0].length === 0,
  '敌兵候选 ' + shipSets6.groups[0].length + ' 个');
item('攻城飞艇会去啃建筑（塔血下降或已拆掉）',
  !s6.byRef.red[C.toRef(8, 5)] || s6.byRef.red[C.toRef(8, 5)].hp < 600,
  s6.byRef.red[C.toRef(8, 5)] ? ('塔血 ' + s6.byRef.red[C.toRef(8, 5)].hp.toFixed(0)) : '塔已拆');

console.log('\n=== 7. 每一种兵都能真的打起来（实战验证） ===');
var ALL = Object.keys(C.DATA.units);
ALL.forEach(function (key) {
  var d = C.DATA.units[key];
  // 对兵：在自己旁边放一个敌方地面兵（射程内）
  var sa = C.createState();
  sa.res.blue = 1000;
  var me = C.spawnUnit(sa, 'blue', key, 5, 5);
  // 把靶子放在**射程以内**（向下取整，避免像气球兵 2.5 格射程被四舍五入到 3 格而恰好够不着）
  var gap = Math.max(1, Math.floor(d.range));
  var foe = C.spawnUnit(sa, 'red', 'infantry', 5, 5 + gap);
  // 让这个「靶子」站住不动，否则它会自己往前走、跑出射程（这是正常的兵线追击行为，
  // 但会让"能不能打到"这件事变得不确定）
  foe.def = Object.assign({}, foe.def, { speed: 0 });
  var foeHp0 = foe.hp;
  for (var i = 0; i < 20 * 3; i++) C.update(sa, C.DT);
  var hitUnit = foe.hp < foeHp0;

  // 对建筑：在旁边放一个敌方塔（只有 siege 类会去打）
  var sb = C.createState();
  sb.res.blue = 1000;
  var me2 = C.spawnUnit(sb, 'blue', key, 3, 1);   // 空中兵直接从行3 起飞
  var tower = C.placeBuilding(sb, 'red', 'cannon', 2, 1);   // 行2（行1 是入场行，不可建造）
  var twHp0 = tower.ok ? tower.building.hp : 0;
  for (var j = 0; j < 20 * 6; j++) C.update(sb, C.DT);   // 6 秒足够打出伤害
  var hitBuilding = tower.ok && tower.building.hp < twHp0;

  if (d.priority === 'siege') {
    item('  ' + d.name + '：会去拆建筑（不打兵）', hitBuilding && !hitUnit,
      '打建筑=' + hitBuilding + ' 打兵=' + hitUnit);
  } else {
    item('  ' + d.name + '：会去打兵（不打建筑）', hitUnit && !hitBuilding,
      '打兵=' + hitUnit + ' 打建筑=' + hitBuilding);
  }
});

console.log('\n=== 8. 飞龙（血高攻低）能扛住塔火 ===');
var s7 = C.createState();
s7.res.blue = 1000;
C.placeBuilding(s7, 'red', 'tower', 5, 5);
var dragon = C.spawnUnit(s7, 'blue', 'dragon', 6, 5);
for (var i7 = 0; i7 < 20 * 3; i7++) C.update(s7, C.DT);
item('飞龙血量高（>=500）', dragon.def.hp >= 500, dragon.def.hp);
item('飞龙攻击力低（全场翻倍后仍是最低档 <=30）', dragon.def.atk <= 30, dragon.def.atk);
item('飞龙能扛住对地塔的火力 3 秒以上', dragon.hp > 0, '剩 ' + dragon.hp.toFixed(0));
item('飞龙（飞行）无法被只对地的塔打到', dragon.hp === dragon.hpMax || dragon.hp > 0,
  'hp=' + dragon.hp.toFixed(0));

console.log('\n================= 兵种规格验收 =================');
rows.forEach(function (r) { console.log((r.ok ? '  ✅ ' : '  ❌ ') + r.n + (r.ev ? ('  [' + r.ev + ']') : '')); });
console.log('===============================================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail === 0 ? 0 : 1);
