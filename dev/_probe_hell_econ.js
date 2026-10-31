/* 一次性探针：地狱档「大本营攒钱 / 兵种多样性 / 阶梯」三者一起看
 * 种子：阶梯用官方序列 1000+i*37；兵种用 _diag_ai 的三个 seed(2000/2037/2074)。 */
var C = require('../src/logic.js');
var KEYS = ['infantry','heavy','siege','ram','archer','balloon','airship','dragon'];
function play(a, b, sd, secs) {
  var s = C.createState({ seed: sd });
  s.aiPreset.red = a; s.aiPreset.blue = b; s.aiTeam = 'red';
  var seen = {};
  for (var t = 0; t < secs * 20 && !s.over; t++) {
    C.update(s, C.DT); C.aiUpdate(s, 'red', C.DT); C.aiUpdate(s, 'blue', C.DT);
    s.units.forEach(function (u) { if (u.team === 'red') seen[u.key] = 1; });
  }
  var types = 0; KEYS.forEach(function (k) { if (seen[k]) types++; });
  return { w: s.winner, types: types };
}
function measure(label) {
  var f = 0, n = 20;
  for (var i = 0; i < n; i++) if (play('hell', 'hard', 1000 + i * 37, 600).w === 'red') f++;
  var ty = 0;
  [2000, 2037, 2074].forEach(function (sd) { ty += play('hell', 'hard', sd, 420).types; });
  console.log('地狱>困难 ' + Math.round(f / n * 100) + '% · 地狱兵种 ' + (ty / 3).toFixed(1) + ' 种 ← ' + label);
}
var h = C.AI_PRESETS.hell, save = { baseSave: h.baseSave, baseCap: h.baseCap };
[ {baseSave:false}, {baseSave:true}, {baseSave:true, baseCap:2}, {baseSave:true, baseCap:3} ].forEach(function (o) {
  h.baseSave = save.baseSave; h.baseCap = save.baseCap;
  Object.keys(o).forEach(function (k) { h[k] = o[k]; });
  measure(Object.keys(o).map(function (k) { return k + '=' + o[k]; }).join(','));
});
