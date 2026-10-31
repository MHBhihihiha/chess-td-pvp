/* 一次性探针：低成本旋钮对阶梯的影响（只调地狱档，不动任何数值）
 * 种子序列与 dev/ai-ladder.js 完全一致（1000 + i*37），否则样本噪声会盖住差异。 */
var C = require('../src/logic.js');
var hell = C.AI_PRESETS.hell;
var saved = { techWindow: hell.techWindow, techCool: hell.techCool,
              armyShare: hell.armyShare, reserveRatio: hell.reserveRatio, techLock: hell.techLock };
function play(a, b, seed) {
  var s = C.createState({ seed: seed });
  s.aiPreset.red = a; s.aiPreset.blue = b; s.aiTeam = 'red';
  var t = 0;
  while (!s.over && t < 20 * 600) { C.update(s, C.DT); C.aiUpdate(s, 'red', C.DT); C.aiUpdate(s, 'blue', C.DT); t++; }
  return s;
}
function rates(n) {
  var f = 0, r = 0;
  for (var i = 0; i < n; i++) {
    var sd = 1000 + i * 37;
    if (play('hell', 'hard', sd).winner === 'red') f++;
    if (play('hard', 'hell', sd).winner === 'blue') r++;
  }
  return { fwd: Math.round(f / n * 100), rev: Math.round(r / n * 100) };
}
function apply(o) {
  Object.keys(saved).forEach(function (k) { if (saved[k] === undefined) delete hell[k]; else hell[k] = saved[k]; });
  Object.keys(o).forEach(function (k) { hell[k] = o[k]; });
  return Object.keys(o).map(function (k) { return k + '=' + o[k]; }).join(',') || 'baseline';
}
var N = parseInt(process.argv[2] || '20', 10);
[ {}, { reserveRatio: 0.25 }, { techWindow: 16, techCool: 16 },
  { techWindow: 14, techCool: 20 }, { armyShare: 0.55 },
  { techLock: 0.6 }, { pushTech: false } ].forEach(function (o) {
  var label = apply(o);
  var res = rates(N);
  console.log('地狱>困难 ' + String(res.fwd).padStart(3) + '% · 反向 ' + String(res.rev).padStart(3) + '%   ← ' + label);
});
