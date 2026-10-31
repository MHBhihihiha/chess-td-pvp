/* 探针：三档 AI 的「出兵数 / 经济」对比（v18 预算策略前后差异定位用）
 * 运行: node dev/_probe_budget_ab.js [局数=6] [秒数=420]
 *
 * 只看一件事：三个难度档在一局里各出多少兵、建几座矿/塔、大本营几级。
 * 目的：确认 v18 的预算分配策略没有把某一档「饿死」或「喂肥」。 */
var C = require('../src/logic.js');

var N = parseInt(process.argv[2] || '6', 10);
var SECS = parseInt(process.argv[3] || '420', 10);

function play(aDiff, bDiff, seed) {
  var s = C.createState({ seed: seed });
  s.aiPreset.red = aDiff;
  s.aiPreset.blue = bDiff;
  s.aiTeam = 'red';
  var born = { red: 0, blue: 0 };
  var seen = {};
  var t = 0;
  while (!s.over && t < 20 * SECS) {
    C.update(s, C.DT);
    C.aiUpdate(s, 'red', C.DT);
    C.aiUpdate(s, 'blue', C.DT);
    s.units.forEach(function (u) {
      if (!seen[u.id]) { seen[u.id] = 1; born[u.team]++; }
    });
    t++;
  }
  function snap(team) {
    var mines = 0, towers = 0, lvl = 1;
    s.buildings.forEach(function (b) {
      if (b.team !== team) return;
      if (b.key === 'mine') mines++;
      else if (b.def.atk && !b.def.isBase) towers++;
      if (b.def.isBase) lvl = b.level || 1;
    });
    var tech = 0;
    Object.keys(C.DATA.globalUpgrades).forEach(function (k) {
      tech += (s.globalUp[team] && s.globalUp[team][k]) || 0;
    });
    return { units: born[team], mines: mines, towers: towers, lvl: lvl, tech: tech };
  }
  return { over: s.over, winner: s.winner, t: s.time, red: snap('red'), blue: snap('blue') };
}

function label(key) {
  var p = C.AI_PRESETS[key];
  return (p ? p.name : key) + '(' + key + ')';
}

[['hard', 'normal'], ['hell', 'hard'], ['hell', 'normal']].forEach(function (pair) {
  var agg = { red: { units: 0, mines: 0, towers: 0, lvl: 0, tech: 0 }, blue: { units: 0, mines: 0, towers: 0, lvl: 0, tech: 0 } };
  var wins = { red: 0, blue: 0, draw: 0 };
  for (var i = 0; i < N; i++) {
    var r = play(pair[0], pair[1], 3000 + i * 37);
    if (r.winner === 'red') wins.red++;
    else if (r.winner === 'blue') wins.blue++;
    else wins.draw++;
    ['red', 'blue'].forEach(function (side) {
      Object.keys(agg[side]).forEach(function (k) { agg[side][k] += r[side][k]; });
    });
  }
  function fmt(side) {
    var o = agg[side];
    return '出兵 ' + (o.units / N).toFixed(1) + ' | 矿 ' + (o.mines / N).toFixed(1) +
      ' | 塔 ' + (o.towers / N).toFixed(1) + ' | 本 ' + (o.lvl / N).toFixed(1) +
      ' | 科技 ' + (o.tech / N).toFixed(1);
  }
  console.log('\n  ' + label(pair[0]) + '  vs  ' + label(pair[1]) + '   （' + N + ' 局）');
  console.log('    红 ' + label(pair[0]).padEnd(14) + fmt('red'));
  console.log('    蓝 ' + label(pair[1]).padEnd(14) + fmt('blue'));
  console.log('    结果：红胜 ' + wins.red + ' / 蓝胜 ' + wins.blue + ' / 平 ' + wins.draw);
});
