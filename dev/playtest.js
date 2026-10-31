'use strict';
/* ============================================================================
 * 玩家操作流程模拟：把一个真实玩家会做的每个动作都走一遍，看哪里会出问题
 * 同时检查 UI 是否把「现在不能做的事」清楚地标出来了
 * ========================================================================== */
var fs = require('fs');
var path = require('path');
var C = require('../src/logic.js');

var pass = 0, fail = 0, warns = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '   → ' + extra : '')); }
}
function warn(msg) { warns.push(msg); console.log('  ⚠️  ' + msg); }

/* ---------- 1. 开局资源够不够玩家做事？ ---------- */
console.log('\n=== 1. 开局资源与价格是否合理 ===');
var s = C.createState();
var gold0 = s.res.blue;
var inc = C.DATA.baseLevels[0].income;
var cheapest = Math.min.apply(null, Object.keys(C.DATA.buildings).map(function (k) { return C.DATA.buildings[k].cost; }));
check('开局金币能立刻买得起最便宜的建筑', gold0 >= cheapest, gold0 + ' < ' + cheapest);
check('开局所有兵种冷却都好了（立刻能派）',
  Object.keys(C.DATA.units).every(function (k) { return C.isUnitReady(s, 'blue', k); }),
  JSON.stringify(s.unitCd.blue));
console.log('     开局金币 ' + gold0 + '，收入 ' + inc + '/s，最便宜建筑 ' + cheapest +
  '，最便宜兵种 ' + Math.min.apply(null, Object.keys(C.DATA.units).map(function (k) { return C.DATA.units[k].cost; })));
var secToCheapest = (cheapest - 0) / inc;
console.log('     只靠基础收入，攒够最便宜的建筑约需 ' + secToCheapest.toFixed(1) + ' 秒');
check('攒钱时间不至于离谱（< 30 秒）', secToCheapest < 30);

/* ---------- 2. 玩家动作逐步走一遍 ---------- */
console.log('\n=== 2. 玩家操作流程（建塔→点它→升级→派兵→放错地方） ===');
var s2 = C.createState();
// 2.1 放在敌方半场（应被拒绝并有明确原因）
var bad = C.canPlace(s2, 'blue', 'cannon', 3, 3);
check('放在敌方半场被拒绝', !bad.ok);
check('拒绝原因对玩家可读', /半场|占用|金币/.test(bad.why), bad.why);
// 2.2 放在自己半场
s2.res.blue = 500;
var ok1 = C.placeBuilding(s2, 'blue', 'cannon', 8, 3);
check('放在自己半场成功', ok1.ok, ok1.why);
// 2.3 同一格再放一次
var dup = C.placeBuilding(s2, 'blue', 'cannon', 8, 3);
check('同一格重复放置被拒绝', !dup.ok, dup.why);
// 2.4 点开详情
var info = C.buildingInfo(s2, ok1.building);
check('详情里能读到攻击力（玩家想看的数值）', typeof info.atk === 'number' && info.atk > 0, JSON.stringify(info.atk));
check('详情里能读到升级费用', typeof info.upgradeCost === 'number' && info.upgradeCost > 0, info.upgradeCost);
// 2.5 升级
var up = C.upgradeBuilding(s2, ok1.building);
check('升级成功', up.ok, up.why);
// 2.6 钱不够时升级被拒
s2.res.blue = 0;
var up2 = C.upgradeBuilding(s2, ok1.building);
check('金币不足时升级被拒绝且原因可读', !up2.ok && /金币/.test(up2.why), up2.why);
// 2.7 派兵
s2.res.blue = 500;
var dep = C.deployUnit(s2, 'blue', 'infantry', 4);
check('派兵成功（兵出现在行B）', dep.ok && dep.unit.row === C.CHANNEL_ROW.blue, dep.why || '');
// 2.8 同列立刻再派（冷却）
var dep2 = C.deployUnit(s2, 'blue', 'infantry', 4);
check('同列连续派兵被冷却拦住且提示可读', !dep2.ok && /冷却/.test(dep2.why), dep2.why);
// 2.9 兵种冷却中再派（换一列也要等冷却）
var dep3 = C.deployUnit(s2, 'blue', 'infantry', 5);
check('兵种冷却中对任何列派兵都被拒绝且提示可读',
  !dep3.ok && /冷却/.test(dep3.why), dep3.why);
// 2.10 冷却结束后可以再派
var s2b = C.createState();
s2b.res.blue = 5000;
check('测试前置：开局能派步兵', C.deployUnit(s2b, 'blue', 'infantry', 4).ok);
var cdNow = s2b.unitCd.blue.infantry;
check('派兵后立刻进入冷却（步兵 5 秒）', Math.abs(cdNow - C.DATA.units.infantry.deployCd) < 0.01, cdNow + 's');
for (var wi = 0; wi < 20 * 5; wi++) C.update(s2b, C.DT);
check('冷却走完后又能派同一个兵种', C.deployUnit(s2b, 'blue', 'infantry', 5).ok);

/* ---------- 3. UI 卡片是否把「不能买」标清楚了 ---------- */
console.log('\n=== 3. 卡片锁定状态（玩家能不能一眼看出哪些买不起/没解锁） ===');
var s3 = C.createState();
s3.res.blue = 0;
var lockedCount = 0, total = 0;
Object.keys(C.DATA.buildings).forEach(function (k) {
  var d = C.DATA.buildings[k];
  total++;
  var lv = C.baseLevelOf(s3, 'blue');
  var locked = lv < d.tier || s3.res.blue < d.cost;
  if (locked) lockedCount++;
});
check('零金币时所有需付费建筑都处于锁定态', lockedCount === total, lockedCount + '/' + total);
s3.res.blue = 100000;
var stillLocked = Object.keys(C.DATA.buildings).filter(function (k) {
  return !C.canPlace(s3, 'blue', k, 10, 1).ok && C.canPlace(s3, 'blue', k, 9, 1).why &&
    /等级|解锁/.test(C.canPlace(s3, 'blue', k, 10, 1).why);
});
check('所有建筑都不再有等级锁定（按最新规则）', stillLocked.length === 0, '锁定: ' + stillLocked.join(','));
console.log('     一级大本营时被等级锁住的建筑: ' + (stillLocked.length ? stillLocked.join(', ') : '无'));

/* ---------- 4. 长时间对局里的极端情况 ---------- */
console.log('\n=== 4. 极端情况：单位堆满、上限保护 ===');
var s4 = C.createState();
s4.res.blue = 1e9;
for (var i = 0; i < 40; i++) {
  s4.reserve.blue.infantry = 5;
  C.deployUnit(s4, 'blue', 'infantry', 1 + (i % 10));
  for (var t = 0; t < 30; t++) C.update(s4, C.DT);
}
var unitCount = C.unitsOf(s4, 'blue').length;
check('单位数量被上限保护住', unitCount <= C.UNIT_CAP, '实际 ' + unitCount + ' / 上限 ' + C.UNIT_CAP);
// 极端推进：直接冲基地
var s5 = C.createState();
s5.res.blue = 1e6;
var bb = C.ownBase(s5, 'red');
for (var k = 0; k < 30; k++) C.spawnUnit(s5, 'blue', 'siege', 3, 5);
for (var k2 = 0; k2 < 20 * 30; k2++) C.update(s5, C.DT);
check('大量攻城兵能在 30 秒内打掉敌方大本营（游戏能结束）', s5.over === true && s5.winner === 'blue',
  'over=' + s5.over + ' winner=' + s5.winner + ' 敌方基地血=' + (bb.hp > 0 ? bb.hp.toFixed(0) : '已毁'));

/* ---------- 5. 所有建筑一开始就能建（按新规则没有解锁限制） ---------- */
console.log('\n=== 5. 所有建筑一开始就能建，且能升级到分支 ===');
var s7 = C.createState();
s7.res.blue = 100000;
Object.keys(C.DATA.buildings).forEach(function (key, i) {
  // 红方半场不能建，所以固定在自己半场换行放
  // 行6~9（行10 是入场行，不能建造）
  var r = C.placeBuilding(s7, 'blue', key, 6 + (i % 4), 1 + Math.floor(i / 4));
  check('建筑「' + C.DATA.buildings[key].name + '」一级大本营就能建造', r.ok, r.why);
});
// 大本营可以一路升到 6 级
var s8 = C.createState();
s8.res.blue = 1e6;
var upCount = 0;
while (C.buildingInfo(s8, C.ownBase(s8, 'blue')).upgradeCost != null && upCount < 20) {
  if (!C.upgradeBase(s8, 'blue').ok) break;
  upCount++;
}
check('大本营能一路升到 6 级', s8.baseLevel.blue === C.DATA.baseLevels.length,
  '实际 Lv' + s8.baseLevel.blue);
check('6 级大本营解锁全部 6 个法术', C.spellsAvailable(s8, 'blue').length === 6,
  C.spellsAvailable(s8, 'blue').map(function (x) { return x.name; }).join('、'));
// 气球兵能真的飞出去并打到东西
var scout = C.spawnUnit(s8, 'blue', 'balloon', 11, 3);
for (var k9 = 0; k9 < 20 * 20; k9++) C.update(s8, C.DT);
check('气球兵无视建筑飞进红方半场', scout.row <= 5 || scout.hp <= 0, '实际行 ' + scout.row);

/* ---------- 6. 渲染压力（单位/建筑很多时画面是否还画得动） ---------- */
console.log('\n=== 6. 渲染压力（单位/建筑很多时画面是否还画得动） ===');
var s6 = C.createState();
s6.res.blue = 1e6;
for (var c = 1; c <= 10; c++) { C.placeBuilding(s6, 'blue', 'cannon', 8, c); C.placeBuilding(s6, 'blue', 'mine', 9, c); }
for (var u2 = 0; u2 < 60; u2++) { C.spawnUnit(s6, 'blue', 'infantry', 10, 1 + (u2 % 10)); C.spawnUnit(s6, 'red', 'infantry', 1, 1 + (u2 % 10)); }
var t0 = Date.now();
for (var f = 0; f < 200; f++) C.update(s6, C.DT);
var ms = Date.now() - t0;
check('120 单位 + 20 建筑时每帧 < 5ms', ms / 200 < 5, (ms / 200).toFixed(2) + 'ms/帧');

console.log('\n===============================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项' + (warns.length ? '，提示 ' + warns.length + ' 条' : ''));
console.log('===============================');
process.exit(fail === 0 ? 0 : 1);
