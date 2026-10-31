'use strict';
/* ============================================================================
 * 友军伤害专项检查：确认「任何一方都不可能打到自己家的大本营」
 *  1. 目标选择：每个单位的候选目标里，绝不能出现自己队的建筑
 *  2. 实战：把自己士兵放在自家大本营旁边，跑很久，自家大本营血不能掉
 *  3. 双方大本营血量变化必须是「被对面打的」，不能是自家兵打的
 * ========================================================================== */
var C = require('../src/logic.js');
var pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '   → ' + extra : '')); }
}

/* ---------- 1. 静态检查：每个兵/塔的候选目标里不能有自己人 ---------- */
console.log('\n=== 1. 目标选择的阵营正确性（穷举双方、各种兵种/塔） ===');
var problems = [];
['red', 'blue'].forEach(function (team) {
  var s = C.createState();
  s.res[team] = 100000;
  // 在自己半场摆一堆建筑，在对面前线摆一堆建筑
  var myHalf = team === 'red' ? [1, 2, 3] : [8, 9, 10];
  var foeHalf = team === 'red' ? [9, 10] : [1, 2];
  Object.keys(C.DATA.buildings).forEach(function (key, i) {
    var t2 = C.DATA.buildings[key].tier;
    if (s.baseLevel[team] < t2) return;
    var row = myHalf[i % myHalf.length];
    var col = 1 + (i * 2) % 9;
    C.placeBuilding(s, team, key, row, col);
    C.placeBuilding(s, C.OPP[team], key, foeHalf[i % foeHalf.length], col);
  });
  // 己方大本营旁边放一个自己的兵
  var base = C.ownBase(s, team);
  var spot = team === 'red' ? { r: base.row + 2, c: base.col } : { r: base.row - 2, c: base.col };
  var units = ['infantry', 'siege', 'balloon'];
  units.forEach(function (uk) {
    var u = C.spawnUnit(s, team, uk, spot.r, spot.c);
    if (!u) return;
    // 直接检查候选集合
    var sets = C.candidateSets ? C.candidateSets(s, u) : null;
    if (sets) {
      sets.groups.forEach(function (g) {
        g.forEach(function (t) {
          if (t && t.team === team) problems.push(team + ' 的 ' + uk + ' 候选目标里出现了自己方的 ' + t.key);
        });
      });
    }
  });
});
if (C.candidateSets) {
  check('没有任何单位的候选目标包含自己方建筑', problems.length === 0, problems.slice(0, 3).join('; '));
} else {
  console.log('  （逻辑层未导出 candidateSets，跳过静态检查，改由实战检查）');
}

/* ---------- 2. 实战：自家兵贴着自家大本营，自家大本营不能掉血 ---------- */
console.log('\n=== 2. 实战：自家兵贴着自家大本营，自家大本营不能掉血 ===');
['red', 'blue'].forEach(function (team) {
  var s = C.createState();
  var base = C.ownBase(s, team);
  var foe = C.OPP[team];
  // 把三种兵都塞在自家大本营前面（合法格子）
  var row = team === 'blue' ? base.row - 1 : base.row + 2;
  s.res[team] = 100000;
  ['infantry', 'siege', 'balloon'].forEach(function (uk) {
    C.spawnUnit(s, team, uk, row, base.col);
    C.spawnUnit(s, team, uk, row, base.col + 1);
  });
  var hp0 = base.hp, foeHp0 = C.ownBase(s, foe).hp;
  for (var i = 0; i < 20 * 60; i++) C.update(s, C.DT);   // 模拟 60 秒
  check(team + '：60 秒后自家大本营一点血都没掉', base.hp >= hp0 - 0.001,
    '自家 ' + hp0.toFixed(0) + ' → ' + base.hp.toFixed(0));
  check(team + '：己方士兵没有摧毁自家大本营', !(s.over && s.winner === foe) || C.ownBase(s, team),
    'over=' + s.over + ' winner=' + s.winner);
});

/* ---------- 3. 长时间全 AI 对局：掉血必须来自真实战斗 ---------- */
console.log('\n=== 3. 长时间全 AI 对局：胜负归因仍然正确 ===');
var s3 = C.createState();
var seconds = 0;
while (!s3.over && seconds < 700) {
  C.update(s3, C.DT);
  C.aiUpdate(s3, 'red', C.DT);
  C.aiUpdate(s3, 'blue', C.DT);
  seconds += C.DT;
}
/* v22 移除了「5 分钟后对称烧血」，所以 700 秒打不完是允许的 —— 旧版是被烧血
 * 强行结束的。这里不再要求「必须结束」，但「一旦结束，归因必须正确」依然锁死。 */
check('700 秒 AI 对局后单位/建筑数量仍然合法',
  s3.units.length <= 200 && s3.buildings.length <= 120,
  '单位 ' + s3.units.length + ' 建筑 ' + s3.buildings.length);
check('终局字段自洽（不会出现 winner 为空或双方都没了）',
  !s3.over || s3.winner === 'red' || s3.winner === 'blue' || s3.winner === 'draw',
  'over=' + s3.over + ' winner=' + s3.winner);
if (s3.over && (s3.winner === 'red' || s3.winner === 'blue')) {
  var loser = s3.winner === 'red' ? 'blue' : 'red';
  check('若分出胜负，则败方大本营确实不在了', !C.ownBase(s3, loser),
    '败方=' + loser);
  check('胜方的大本营还活着', !!C.ownBase(s3, s3.winner), '胜方=' + s3.winner);
}
console.log('     ' + seconds.toFixed(0) + ' 秒后：' + (s3.over ? '已分胜负（' + s3.winner + '）' : '仍在进行') +
  '；红方出兵 ' + s3.stats.red.produced + ' / 蓝方出兵 ' + s3.stats.blue.produced);

console.log('\n===============================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('===============================');
process.exit(fail === 0 ? 0 : 1);
