/* 闯关可玩性探针（不是断言，是取数）
 *   node dev/_probe_stage_play.js
 *
 * 场景：电脑（red）按关卡倍率打，玩家（blue）完全不操作。
 * 目的不是「验证平衡」，而是确认三件会致命的事没有发生：
 *   1. 倍率没把数值算崩（NaN / 血量归零 / 金币变负）
 *   2. 后期关卡不是开局就秒推（否则三星机制没意义）
 *   3. 也不是打不动（自己先饿死 / 派不出兵）
 *
 * 玩家不操作 = 下界。真实玩家会造塔反打，所以这里的「存活时间」只当横向比较用。
 */
'use strict';
var C = require('../src/logic.js');

function boostOf(n) {
  return { team: 'red', income: 1 + 0.2 * n, hp: 1 + 0.1 * n, atk: 1 + 0.1 * n };
}

function run(n, seed) {
  var s = C.createState({ seed: seed, difficulty: 'hard', boost: boostOf(n) });
  s.aiTeam = 'red';
  var peakRedUnits = 0, peakRedRes = 0, peakTowers = 0;
  var blueBaseFirstHit = null, over = null;
  var lastTime = 0;

  for (var i = 0; i < 20 * 600; i++) {
    C.update(s, C.DT);
    C.aiUpdate(s, 'red', C.DT);

    var ru = C.unitsOf(s, 'red').length;
    if (ru > peakRedUnits) peakRedUnits = ru;
    if (s.res.red > peakRedRes) peakRedRes = s.res.red;
    var tow = s.buildings.filter(function (b) { return b.team === 'red' && b.def.atk; }).length;
    if (tow > peakTowers) peakTowers = tow;

    var bb = C.ownBase(s, 'blue');
    if (bb && blueBaseFirstHit == null && bb.hp < bb.hpMax) blueBaseFirstHit = s.time;
    if (s.winner && !over) { over = s.time; break; }
    lastTime = s.time;
  }

  var bb = C.ownBase(s, 'blue');
  var rb = C.ownBase(s, 'red');
  var bad = [];
  [s.res.red, s.res.blue].forEach(function (v) { if (!isFinite(v) || v < 0) bad.push('金币异常 ' + v); });
  s.buildings.forEach(function (b) {
    if (!isFinite(b.hp) || !isFinite(b.hpMax) || b.hpMax <= 0) bad.push('建筑血量异常 ' + b.key);
  });
  s.units.forEach(function (u) {
    if (!isFinite(u.hp) || !isFinite(u.hpMax) || u.hpMax <= 0) bad.push('单位血量异常 ' + u.key);
  });

  console.log('第 ' + String(n).padStart(2) + ' 关  ' +
    '金币×' + boostOf(n).income.toFixed(1) + ' 血/攻×' + boostOf(n).hp.toFixed(1));
  console.log('   电脑：峰值单位 ' + String(peakRedUnits).padStart(2) +
    '  峰值金币 ' + Math.round(peakRedRes) +
    '  峰值防御塔 ' + peakTowers +
    '  最终大本营 ' + (rb ? Math.round(rb.hp) + '/' + Math.round(rb.hpMax) : '已毁'));
  console.log('   玩家：大本营 ' + (bb ? Math.round(bb.hp) + '/' + Math.round(bb.hpMax) : '已毁') +
    (bb ? '（' + Math.round(bb.hp / bb.hpMax * 100) + '%）' : '') +
    '  首次被打 ' + (blueBaseFirstHit == null ? '从未' : Math.round(blueBaseFirstHit) + 's') +
    '  结算 ' + (over == null ? '跑到 ' + Math.round(lastTime) + 's 未分胜负' : Math.round(over) + 's'));
  console.log('   数值检查：' + (bad.length ? '❌ ' + bad.slice(0, 4).join(' / ') : '✅ 无 NaN / 负金币 / 零血上限'));
  console.log('');
  return { n: n, over: over, bluePct: bb ? bb.hp / bb.hpMax : 0, bad: bad.length };
}

console.log('════════ 闯关可玩性：玩家完全不操作，纯看电脑推进 ════════\n');
var rows = [];
[1, 3, 5, 7, 10].forEach(function (n) { rows.push(run(n, 7)); });

console.log('──────── 横向 ────────');
rows.forEach(function (r) {
  console.log('  第 ' + String(r.n).padStart(2) + ' 关：' +
    (r.over == null ? '玩家撑满 10 分钟' : '玩家 ' + Math.round(r.over) + 's 被推平') +
    '（大本营剩 ' + Math.round(r.bluePct * 100) + '%）');
});
var flat = rows.some(function (r) { return r.over != null && r.over < 45; });
console.log('');
console.log(flat ? '⚠️ 有某关 45 秒内就被推平 —— 玩家来不及反应，需要回看倍率' : '✅ 没有任何一关是开局秒推');
