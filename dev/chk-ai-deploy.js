var C = require('../src/logic.js');
var s = C.createState({ seed: 7, difficulty: process.argv[2] || 'hell' });
s.aiTeam = 'red';
var deployLog = [];
var orig = C.deployUnit;
// 记录电脑每次派了什么
var counts = {};
var lastPos = {};
for (var t = 0; t < 20 * 240; t++) {
  C.update(s, C.DT);
  var before = C.unitsOf(s, 'red').length;
  C.aiUpdate(s, 'red', C.DT);
  var after = C.unitsOf(s, 'red').length;
  if (after > before) {
    var newest = C.unitsOf(s, 'red')[C.unitsOf(s, 'red').length - 1];
    counts[newest.key] = (counts[newest.key] || 0) + 1;
    lastPos[newest.col] = (lastPos[newest.col] || 0) + 1;
    if (deployLog.length < 14) deployLog.push('t=' + s.time.toFixed(0) + ' ' + newest.key + '@c' + newest.col);
  }
}
console.log('电脑 240 秒内派兵统计:');
Object.keys(counts).forEach(function (k) { console.log('   ' + k + ': ' + counts[k] + ' 个'); });
console.log('派兵列分布: ' + JSON.stringify(lastPos));
console.log('前几次: ' + deployLog.join('  |  '));
console.log('');
console.log('电脑当前金币: ' + s.res.red.toFixed(0));
console.log('电脑建筑: ' + s.buildings.filter(function (b) { return b.team === 'red'; }).length +
  ' 座，塔 ' + s.buildings.filter(function (b) { return b.team === 'red' && b.def.atk; }).length);
console.log('电脑大本营等级: ' + s.baseLevel.red);
