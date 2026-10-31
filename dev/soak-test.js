'use strict';
/* ============================================================================
 * 压力 / 稳定性测试：随机乱点乱操作 + 长时间对局
 * 目的：找出崩溃、NaN、状态损坏、越界、上限失效等「会让游戏玩不下去」的问题
 *   1. 随机 API 调用（合法与非法混着来）
 *   2. 完整对局跑到决胜时刻
 *   3. 每步检查状态不变量
 * ========================================================================== */
var C = require('../src/logic.js');
var pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '   → ' + extra : '')); }
}

/* ---------------- 状态不变量检查 ---------------- */
function invariants(s, where) {
  var bad = [];
  // 1. 所有建筑血量不能是 NaN
  s.buildings.forEach(function (b) {
    if (isNaN(b.hp) || isNaN(b.hpMax) || b.hpMax <= 0) bad.push('建筑 ' + b.key + ' 血量异常 hp=' + b.hp + '/' + b.hpMax);
    if (b.hp > b.hpMax + 0.001) bad.push('建筑 ' + b.key + ' 血量超过上限');
    if (!(b.level >= 1)) bad.push('建筑 ' + b.key + ' 等级异常 ' + b.level);
  });
  // 2. 单位
  s.units.forEach(function (u) {
    if (isNaN(u.hp) || u.hp <= 0) bad.push('单位 ' + u.key + ' 血量异常 ' + u.hp);
    if (!(u.row >= 0 && u.row <= C.ROWS + 1)) bad.push('单位 ' + u.key + ' 行越界 ' + u.row);
    if (!(u.col >= 1 && u.col <= C.COLS)) bad.push('单位 ' + u.key + ' 列越界 ' + u.col);
  });
  // 3. 金币
  ['red', 'blue'].forEach(function (t) {
    if (isNaN(s.res[t])) bad.push(t + ' 金币 NaN');
    if (s.res[t] < -0.001) bad.push(t + ' 金币为负 ' + s.res[t]);
  });
  // 4. 网格与建筑表一致
  for (var r = 1; r <= C.ROWS; r++) {
    for (var c = 1; c <= C.COLS; c++) {
      var b = s.grid[r][c];
      if (!b) continue;
      if (s.buildings.indexOf(b) < 0) bad.push('格子 r' + r + 'c' + c + ' 指向已不存在的建筑');
      if (b.refs.indexOf(C.toRef(r, c)) < 0) bad.push('建筑 refs 与格子不一致 r' + r + 'c' + c);
    }
  }
  // 5. 大本营必须一直在（除非对局结束）
  ['red', 'blue'].forEach(function (t) {
    if (!s.over && !C.ownBase(s, t)) bad.push(t + ' 大本营在未结束的对局里消失了');
  });
  // 6. 路线图：每个可达格必须有方向（除非是 0 距离的攻击位）
  ['red', 'blue'].forEach(function (t) {
    var f = s.field[t];
    for (var r2 = 0; r2 <= C.ROWS + 1; r2++) {
      for (var c2 = 1; c2 <= C.COLS; c2++) {
        var d = f.dist[r2][c2];
        if (d === 0 || d >= 1e9) continue;
        if (f.dir[r2][c2] === null && !C.wallAtTeam(s, t, r2 + (t === 'blue' ? 1 : -1), c2)) {
          // 前方是墙时 dir 为 null 是正常的；其余情况应当有方向
          bad.push(t + ' 路线图 r' + r2 + 'c' + c2 + ' 有距离 ' + d + ' 但没有方向');
        }
      }
    }
  });
  if (bad.length) check('状态不变量（' + where + '）', false, bad.slice(0, 3).join('; '));
  return bad.length === 0;
}

/* ---------------- 1. 随机乱操作 ---------------- */
console.log('\n=== 1. 随机乱点乱操作（合法/非法混着来，共 8000 次） ===');
var s = C.createState();
var rnd = (function () { var seed = 12345; return function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; })();
var buildKeys = Object.keys(C.DATA.buildings);
var unitKeys = Object.keys(C.DATA.units);
var ops = { place: 0, placeOk: 0, upgradeB: 0, upgradeBOk: 0, deploy: 0, deployOk: 0, upgradeBase: 0, upgradeBaseOk: 0, update: 0 };
var errors = [];
for (var i = 0; i < 8000; i++) {
  try {
    s.res.red = 3000; s.res.blue = 3000;   // 保证有钱，才能测到「放置/升级」这两类操作
    var dice = rnd();
    if (dice < 0.30) {
      ops.place++;
      var r1 = C.placeBuilding(s, rnd() < 0.5 ? 'blue' : 'red', buildKeys[Math.floor(rnd() * buildKeys.length)],
        Math.floor(rnd() * 12) - 1, Math.floor(rnd() * 12) - 1);
      if (r1 && r1.ok) ops.placeOk++;
    } else if (dice < 0.50) {
      ops.upgradeB++;
      var list = s.buildings;
      if (list.length) {
        var r2 = C.upgradeBuilding(s, list[Math.floor(rnd() * list.length)]);
        if (r2 && r2.ok) ops.upgradeBOk++;
      }
    } else if (dice < 0.70) {
      ops.deploy++;
      var r3 = C.deployUnit(s, rnd() < 0.5 ? 'blue' : 'red', unitKeys[Math.floor(rnd() * unitKeys.length)],
        Math.floor(rnd() * 12) - 1);
      if (r3 && r3.ok) ops.deployOk++;
    } else if (dice < 0.78) {
      ops.upgradeBase++;
      var r4 = C.upgradeBase(s, rnd() < 0.5 ? 'blue' : 'red');
      if (r4 && r4.ok) ops.upgradeBaseOk++;
    } else {
      ops.update++;
      C.update(s, C.DT);
      C.aiUpdate(s, rnd() < 0.5 ? 'red' : 'blue', C.DT);
    }
    if (i % 500 === 0) {
      s.res.red = Math.min(s.res.red, 5000);   // 防止金币无限增长影响测试
      s.res.blue = Math.min(s.res.blue, 5000);
      invariants(s, '第 ' + i + ' 次操作后');
    }
  } catch (e) {
    errors.push('第 ' + i + ' 次操作抛异常: ' + e.message);
    break;
  }
}
check('8000 次随机操作没有抛任何异常', errors.length === 0, errors[0]);
check('随机操作后状态不变量全部成立', invariants(s, '乱操作结束'));
console.log('     操作统计: 放置 ' + ops.placeOk + '/' + ops.place + ' 成功，' +
  '建筑升级 ' + ops.upgradeBOk + '/' + ops.upgradeB + '，' +
  '派兵 ' + ops.deployOk + '/' + ops.deploy + '，' +
  '大本营升级 ' + ops.upgradeBaseOk + '/' + ops.upgradeBase + '，' +
  '推进 ' + ops.update + ' 帧');
check('合法操作确实有生效（不是全部被拒）',
  ops.placeOk > 0 && ops.deployOk > 0 && ops.upgradeBOk > 0,
  JSON.stringify({ place: ops.placeOk, deploy: ops.deployOk, up: ops.upgradeBOk }));

/* ---------------- 2. 完整对局长时间运行 ---------------- */
console.log('\n=== 2. 完整对局稳定性（v22 起没有决胜时刻，不再被强制结束） ===');
var s2 = C.createState();
var seconds = 0, badAt = null;
while (!s2.over && seconds < 800) {
  C.update(s2, C.DT);
  C.aiUpdate(s2, 'red', C.DT);
  C.aiUpdate(s2, 'blue', C.DT);
  seconds += C.DT;
  if (Math.abs(seconds - Math.round(seconds)) < 0.026 && Math.round(seconds) % 60 === 0) {
    if (!invariants(s2, '对局第 ' + Math.round(seconds) + ' 秒') && !badAt) badAt = Math.round(seconds);
  }
}
check('对局过程中状态始终一致', badAt === null, badAt ? ('第 ' + badAt + ' 秒出现问题') : '');
/* 旧版靠 5 分钟对称烧血保证「一定结束」；移除后 AI 对 AI 可能长期僵持（实测 800 秒
 * 双方大本营都还是满血）。所以这里不再要求必须分出胜负，只要求终局字段自洽 —— 
 * 「能不能结束」是平衡问题，不是稳定性问题。 */
check('终局字段自洽（结束后必须有合法 winner）',
  !s2.over || s2.winner === 'red' || s2.winner === 'blue' || s2.winner === 'draw',
  'over=' + s2.over + ' winner=' + s2.winner);
console.log('     ' + (s2.over ? '用时 ' + seconds.toFixed(0) + ' 秒分出胜负，胜者 ' + s2.winner
                           : '跑了 ' + seconds.toFixed(0) + ' 秒仍在进行（无决胜时刻，属预期）') +
  '；红方建筑 ' + s2.buildings.filter(function (b) { return b.team === 'red'; }).length +
  ' / 蓝方建筑 ' + s2.buildings.filter(function (b) { return b.team === 'blue'; }).length +
  '；大本营血量 红 ' + (C.ownBase(s2, 'red') ? C.ownBase(s2, 'red').hp.toFixed(0) : '已毁') +
  ' 蓝 ' + (C.ownBase(s2, 'blue') ? C.ownBase(s2, 'blue').hp.toFixed(0) : '已毁'));

/* ---------------- 3. 对局中/结束后继续调用不能出事 ---------------- */
console.log('\n=== 3. 对局中或结束后继续乱调 API ===');
var afterErrors = [];
try {
  for (var k = 0; k < 500; k++) {
    C.update(s2, C.DT);
    C.aiUpdate(s2, 'red', C.DT);
    C.placeBuilding(s2, 'blue', 'tower', 9, 1);
    C.deployUnit(s2, 'blue', 'infantry', 5);
    if (s2.buildings.length) C.upgradeBuilding(s2, s2.buildings[0]);
    C.upgradeBase(s2, 'blue');
  }
} catch (e) { afterErrors.push(e.message); }
check('结束后再调 500 次 API 不抛异常', afterErrors.length === 0, afterErrors[0]);
check('结束后状态依然一致', invariants(s2, '结束后'));

/* ---------------- 4. 超长时间静止局面（v22：没有决胜时刻，也不再烧血） ---------------- */
console.log('\n=== 4. 超长静止局面（谁都不动手就一直打下去，血一点不掉） ===');
var s3 = C.createState();
s3.res.blue = 1e6;
C.placeBuilding(s3, 'blue', 'mine', 9, 1);
var hp0 = C.ownBase(s3, 'blue').hp;
var hpR0 = C.ownBase(s3, 'red').hp;
/* 跑满 25 分钟虚拟时间。旧版在 5 分钟处开始对称烧血、十几分钟内必分胜负；
 * v22 移除该机制后，这里应当一个血点都不掉，且对局一直继续。 */
for (var q = 0; q < 20 * 1500; q++) C.update(s3, C.DT);
check('25 分钟后蓝方大本营血量分毫未变', Math.abs(C.ownBase(s3, 'blue').hp - hp0) < 0.001,
  hp0.toFixed(2) + ' → ' + C.ownBase(s3, 'blue').hp.toFixed(2));
check('25 分钟后红方大本营血量分毫未变', Math.abs(C.ownBase(s3, 'red').hp - hpR0) < 0.001,
  hpR0.toFixed(2) + ' → ' + C.ownBase(s3, 'red').hp.toFixed(2));
check('双方都不动手时对局不会自己结束（去掉决胜时刻的直接结果）', s3.over === false,
  'over=' + s3.over + ' winner=' + s3.winner);
check('事件日志不会无限增长', s3.events.length <= 400, '事件数 ' + s3.events.length);
check('单位/建筑数量没有异常膨胀', s3.units.length <= 200 && s3.buildings.length <= 100,
  '单位 ' + s3.units.length + ' 建筑 ' + s3.buildings.length);

console.log('\n===============================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('===============================');
process.exit(fail === 0 ? 0 : 1);
