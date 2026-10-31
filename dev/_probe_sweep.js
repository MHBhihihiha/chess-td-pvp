/* 一次性扫描：科技窗口/放养窗口的配比，同时看科技等级、出兵数、兵种数 */
var C = require('../src/logic.js');
var KEYS = ['infantry','heavy','siege','ram','archer','balloon','airship','dragon'];
function play(cfg, seed) {
  var s = C.createState({ seed: seed });
  s.suddenDeath = false; s.aiPreset.red = cfg[0];
  if (cfg[1]) s.aiPreset.blue = cfg[1];
  s.aiTeam = 'red';
  var seen = {};
  for (var t = 0; t < 420 * 20 && !s.over; t++) {
    C.update(s, C.DT); C.aiUpdate(s, 'red', C.DT);
    if (cfg[1]) C.aiUpdate(s, 'blue', C.DT);
    s.units.forEach(function (u) { if (u.team === 'red') seen[u.key] = (seen[u.key] || 0) + 1; });
  }
  var x = s.globalUp.red || {}, sum = 0;
  ['bAtk','bHp','uAtk','uHp'].forEach(function (k) { sum += x[k] || 0; });
  var n = 0, types = 0;
  Object.keys(seen).forEach(function (k) { n += seen[k]; if (KEYS.indexOf(k) >= 0) types++; });
  return { sum: sum, units: n, types: types, seen: seen };
}
var combos = [[26,8],[20,12],[14,18],[10,20]];
var seeds = [1000,1037,1074,2000,2037,2074];
combos.forEach(function (c) {
  C.AI_PRESETS.hard.techWindow = c[0]; C.AI_PRESETS.hard.techCool = c[1];
  C.AI_PRESETS.hell.techWindow = c[0]; C.AI_PRESETS.hell.techCool = c[1];
  var agg = { hard: { sum:0, units:0, types:0, n:0 }, hell: { sum:0, units:0, types:0, n:0 } };
  seeds.forEach(function (sd) {
    [['hard',null],['hell','hard']].forEach(function (m) {
      var r = play(m, sd);
      var a = agg[m[0]];
      a.sum += r.sum; a.units += r.units; a.types += r.types; a.n++;
    });
  });
  var h = agg.hard, e = agg.hell;
  console.log('win=' + c[0] + ' cool=' + c[1] +
    ' | 困难 科技 ' + (h.sum/h.n).toFixed(1) + ' 级 · 出兵 ' + (h.units/h.n).toFixed(0) + ' 只 · ' + (h.types/h.n).toFixed(1) + ' 种' +
    ' | 地狱 科技 ' + (e.sum/e.n).toFixed(1) + ' 级 · 出兵 ' + (e.units/e.n).toFixed(0) + ' 只 · ' + (e.types/e.n).toFixed(1) + ' 种');
});
