/* =============================================================================
 * 特斯拉系专项验证
 * 用法: node dev/verify-tesla.js
 *
 * 覆盖玩家这一轮的三个要求：
 *   1. 特斯拉电塔：群攻 → 对空对地**单体**
 *   2. 脉冲塔：自中心向外扩散的**波状攻击**，敌人被波前碰到才受伤
 *      （且波已经过去后再进来的敌人不会被补伤）
 *   3. 大电塔：多目标时闪电在敌人之间**连锁跳跃**（不是三道平行电光）
 * ========================================================================== */
'use strict';
var C = require('../src/logic.js');

var pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '   → ' + extra : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

function hold(u) { u.def = Object.assign({}, u.def, { speed: 0 }); return u; }

/* ---------------------------------------------------------------- 1. 单体 */
section('1. 特斯拉电塔：群攻 → 对空对地单体');
var s1 = C.createState();
s1.res.blue = 1e6;
var t1 = C.placeBuilding(s1, 'blue', 'tesla', 6, 5).building;
check('特斯拉电塔的 mode 是 single', C.statsForLevel(C.DATA.buildings.tesla, 1).mode === 'single',
      C.statsForLevel(C.DATA.buildings.tesla, 1).mode);
check('特斯拉电塔 targets 是 both（对空对地）', C.DATA.buildings.tesla.targets === 'both');

var g1 = hold(C.spawnUnit(s1, 'red', 'infantry', 5, 5));
var g2 = hold(C.spawnUnit(s1, 'red', 'infantry', 5, 5));   // 同一格塞两个
var h1 = g1.hp, h2 = g2.hp;
for (var i = 0; i < 180; i++) C.update(s1, C.DT);
var hurt = [g1, g2].filter(function (u, k) { return u.hp < [h1, h2][k]; }).length;
check('同一格的 2 个敌人只伤 1 个（单体，不再群攻）', hurt === 1, hurt + ' 个受伤');

// 对空：气球兵（air=true）应该能被选中
var s1b = C.createState();
s1b.res.blue = 1e6;
var t1b = C.placeBuilding(s1b, 'blue', 'tesla', 6, 5).building;
var air = C.spawnUnit(s1b, 'red', 'balloon', 5, 5);
var hpAir = air.hp, airProj = null;
for (var j = 0; j < 180; j++) {
  C.update(s1b, C.DT);
  if (!airProj) airProj = s1b.projectiles.filter(function (p) { return p.fromId === t1b.id; })[0];
}
check('特斯拉电塔能打到空中单位（气球兵掉血）', air.hp < hpAir, 'hp ' + air.hp + ' / ' + hpAir);
check('特斯拉系的弹道类型是锯齿闪电 volt',
      !!airProj && airProj.proj.type === 'volt', airProj && airProj.proj.type);

/* ---------------------------------------------------------------- 2. 波状攻击 */
section('2. 脉冲塔：自中心向外扩散的波，碰到才受伤');
var s2 = C.createState();
s2.res.blue = 1e6;
var t2 = C.placeBuilding(s2, 'blue', 'tesla', 8, 5).building;
for (var lv = 0; lv < 4; lv++) C.upgradeBuilding(s2, t2);
C.upgradeBuilding(s2, t2, 'pulse');
check('脉冲塔的 mode 是 wave', C.statsForLevel(C.DATA.buildings.tesla, 5, 'pulse').mode === 'wave');

var nearU = hold(C.spawnUnit(s2, 'red', 'infantry', 7, 5));   // 距塔 1 格
var farU = hold(C.spawnUnit(s2, 'red', 'infantry', 6, 5));    // 距塔 2 格
nearU.hp = farU.hp = 99999; nearU.hpMax = farU.hpMax = 99999;
var tNear = -1, tFar = -1, sawWave = false;
for (var k = 0; k < 200; k++) {
  C.update(s2, C.DT);
  if (s2.waves.length) sawWave = true;
  if (tNear < 0 && nearU.hp < 99999) tNear = k;
  if (tFar < 0 && farU.hp < 99999) tFar = k;
}
check('确实产生了扩散中的电磁波', sawWave);
check('近的敌人先被波前扫到', tNear >= 0 && tFar > tNear, '近=' + tNear + '帧, 远=' + tFar + '帧');
check('两个敌人都被波扫到过', tNear >= 0 && tFar >= 0);

// 波已经过去之后才进入的单位，不应该被补伤
var s3 = C.createState();
s3.res.blue = 1e6;
var t3 = C.placeBuilding(s3, 'blue', 'tesla', 8, 5).building;
for (var lv3 = 0; lv3 < 4; lv3++) C.upgradeBuilding(s3, t3);
C.upgradeBuilding(s3, t3, 'pulse');
hold(C.spawnUnit(s3, 'red', 'infantry', 6, 5));      // 远处目标，保证塔会开火
/* 特斯拉系攻速 1.6s，必须先等塔真的开火（约 96 帧），
 * 之前只等 40 帧，波还没出生就去判断"波还在不在"，是测试写错了。 */
for (var m = 0; m < 160 && !s3.waves.length; m++) C.update(s3, C.DT);
check('塔确实放出了电磁波（测试前提）', s3.waves.length > 0);
/* 等波前推到 1.3 格之外（用半径判断，不写死帧数 —— DT 变了也不会失效） */
for (var n = 0; n < 60 && s3.waves.length && s3.waves[0].radius < 1.3; n++) C.update(s3, C.DT);
var late = C.spawnUnit(s3, 'red', 'infantry', 8, 4);  // 距塔 1 格，但波前早已扫过这里
late.hp = 99999; late.hpMax = 99999;
var lateHp = late.hp, stillWave = s3.waves.length > 0;
for (var q = 0; q < 5; q++) C.update(s3, C.DT);
check('波还没消失（测试前提成立）', stillWave);
check('波前扫过之后才进来的敌人不会被补伤', late.hp === lateHp, 'hp ' + late.hp);

/* ---------------------------------------------------------------- 3. 链式闪电 */
section('3. 大电塔：闪电在敌人之间连锁跳跃');
var s4 = C.createState();
s4.res.blue = 1e6;
var t4 = C.placeBuilding(s4, 'blue', 'tesla', 8, 5).building;
for (var lv4 = 0; lv4 < 4; lv4++) C.upgradeBuilding(s4, t4);
C.upgradeBuilding(s4, t4, 'bigtesla');
var tg = [
  hold(C.spawnUnit(s4, 'red', 'heavy', 7, 5)),
  hold(C.spawnUnit(s4, 'red', 'heavy', 7, 6)),
  hold(C.spawnUnit(s4, 'red', 'heavy', 6, 5))
];
tg.forEach(function (u) { u.hp = 99999; u.hpMax = 99999; });
var shots = null;
for (var r = 0; r < 200 && !shots; r++) {
  C.update(s4, C.DT);
  var mine = s4.projectiles.filter(function (p) { return p.fromId === t4.id; });
  if (mine.length >= 3) shots = mine;
}
check('大电塔一次打出 3 道闪电', !!shots && shots.length === 3, shots && shots.length);
if (shots) {
  shots.sort(function (a, b) { return a.chain - b.chain; });
  check('3 道闪电带 0/1/2 链序号', shots[0].chain === 0 && shots[1].chain === 1 && shots[2].chain === 2,
        shots.map(function (p) { return p.chain; }).join(','));
  check('第 1 道从塔顶发出',
        Math.hypot(shots[0].from.row - 8, shots[0].from.col - 5) < 0.6,
        'from=(' + shots[0].from.row.toFixed(2) + ',' + shots[0].from.col.toFixed(2) + ')');
  check('第 2 道起点 = 第 1 道的目标位置（跳过去）',
        near(shots[1].from.row, shots[0].to.row, 0.01) && near(shots[1].from.col, shots[0].to.col, 0.01),
        '第2道起点 (' + shots[1].from.row + ',' + shots[1].from.col + ') vs 第1道终点 (' + shots[0].to.row + ',' + shots[0].to.col + ')');
  check('第 3 道起点 = 第 2 道的目标位置',
        near(shots[2].from.row, shots[1].to.row, 0.01) && near(shots[2].from.col, shots[1].to.col, 0.01),
        '第3道起点 (' + shots[2].from.row + ',' + shots[2].from.col + ') vs 第2道终点 (' + shots[1].to.row + ',' + shots[1].to.col + ')');
  /* 追踪移动目标（B-01）：链式闪电必须带 fromUnitId，让渲染层能跟着上一环的敌人实时走 */
  check('第 2 道 fromUnitId = 第 1 道的目标单位',
        shots[1].fromUnitId === shots[0].targetId,
        '第2道 fromUnitId ' + shots[1].fromUnitId + ' vs 第1道 targetId ' + shots[0].targetId);
  check('第 3 道 fromUnitId = 第 2 道的目标单位',
        shots[2].fromUnitId === shots[1].targetId,
        '第3道 fromUnitId ' + shots[2].fromUnitId + ' vs 第2道 targetId ' + shots[1].targetId);
  check('每道闪电都是 volt 类型', shots.every(function (p) { return p.proj.type === 'volt'; }));
  var ids = shots.map(function (p) { return p.targetId; });
  check('3 道闪电分别打 3 个不同目标', new Set(ids).size === 3);
}

/* ---------------------------------------------------------------- 4. 单体塔不受连锁影响 */
section('4. 回归：只有大电塔走连锁，单体塔仍是单发');
var s5 = C.createState();
s5.res.blue = 1e6;
var t5 = C.placeBuilding(s5, 'blue', 'tesla', 8, 5).building;
hold(C.spawnUnit(s5, 'red', 'heavy', 7, 5));
hold(C.spawnUnit(s5, 'red', 'heavy', 7, 6));
hold(C.spawnUnit(s5, 'red', 'heavy', 6, 5));
var shots5 = null;
for (var v = 0; v < 200 && !shots5; v++) {
  C.update(s5, C.DT);
  var mine5 = s5.projectiles.filter(function (p) { return p.fromId === t5.id; });
  if (mine5.length) shots5 = mine5;
}
check('基础特斯拉一次只发 1 道', !!shots5 && shots5.length === 1, shots5 && shots5.length);

console.log('\n===============================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('===============================');
process.exit(fail ? 1 : 0);
