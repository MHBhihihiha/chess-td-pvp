/* 一次性探针：按来源统计地狱档 120~420s 的钱都花到哪去了 */
var C = require('../src/logic.js');
var s = C.createState({ seed: 20261027 });
s.suddenDeath = false; s.aiPreset.red = 'hell'; s.aiPreset.blue = 'hard'; s.aiTeam = 'red';
s.aiSpendDebug = [];
for (var t = 0; t < 420 * 20 && !s.over; t++) { C.update(s, C.DT); C.aiUpdate(s, 'red', C.DT); C.aiUpdate(s, 'blue', C.DT); }
var red = s.aiSpendDebug.filter(function (e) { return e.t >= 120; });
var by = {};
red.forEach(function (e) { by[e.fn] = (by[e.fn] || 0) + e.cost; });
var total = 0; Object.keys(by).forEach(function (k) { total += by[k]; });
console.log('红方 120s 后总支出 ' + Math.round(total) + ' 金');
Object.keys(by).sort(function (a, b) { return by[b] - by[a]; }).forEach(function (k) {
  console.log('  ' + k + ': ' + Math.round(by[k]) + ' 金 (' + Math.round(by[k] / total * 1000) / 10 + '%)');
});
console.log('科技', JSON.stringify(s.globalUp.red));
