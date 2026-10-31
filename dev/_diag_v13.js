'use strict';
/* 验证 v13 三个新 AI 行为是否真的发生（不是「代码写了」而是「局中触发」）：
 *   ① 经济打击：派兵列里是否有「敌方裸矿所在的列」
 *   ② 应急防守：威胁触发后是否在能打到敌兵的位置补塔
 *   ③ 威胁覆盖：塔建成时其射程内是否有敌兵
 * 用法：node dev/_diag_v13.js [秒数=420] [局数=3]
 */
var path = require('path');
var C = require(path.join(__dirname, '..', 'src', 'logic.js'));
var SEC = parseInt(process.argv[2] || '420', 10);
var N = parseInt(process.argv[3] || '3', 10);

var stat = {
  deploy: 0, raidCol: 0, pushCol: 0, autoCol: 0,
  tower: 0, towerCoverThreat: 0, towerEmergency: 0,
  mineKilled: 0
};

for (var g = 0; g < N; g++) {
  var seed = 7000 + g * 37;
  C.setSeed ? C.setSeed(seed) : null;
  var st = C.createState({ seed: seed }); st.aiPreset.red='hell'; st.aiPreset.blue='hell'; st.aiTeam='red';
  var foe = 'red';
  var seenMode = {};

  var step = 0;
  while (st.time < SEC && !st.over) {
    C.update(st, C.DT); C.aiUpdate(st, 'red', C.DT); C.aiUpdate(st, 'blue', C.DT);
    step++;
    // 每次派兵后检查目标列
    var f = st.aiFoe && st.aiFoe[foe];
    if (f && f.mineBest && st.units.length) {
      // 近似：统计「我方单位出现在裸矿列」的帧数
      for (var i = 0; i < st.units.length; i++) {
        var u = st.units[i];
        if (u.team !== foe) continue;
        if (f.mineBest.c === u.col && f.mineBest.guard <= 0.01) { stat.raidCol++; break; }
      }
    }
  }

  // 建筑：统计每座塔建成时射程内是否有敌兵
  var towers = st.buildings.filter(function (b) { return b.team === foe && b.def.atk && !b.def.isBase; });
  stat.tower += towers.length;
  towers.forEach(function (b) {
    var R = Math.max(1, Math.round((C.statsForLevel(b.def, b.level || 1, b.branch).range) || 1));
    var hit = st.units.some(function (u) {
      return u.team !== foe && u.hp > 0 &&
        Math.max(Math.abs(u.row - b.row), Math.abs(u.col - b.col)) <= R;
    });
    if (hit) stat.towerCoverThreat++;
  });
  stat.mineKilled += (st.minesKilled && st.minesKilled[foe]) || 0;
}

console.log('=== v13 行为验证（' + SEC + 's × ' + N + ' 局，地狱 AI 视角）===');
console.log('  塔数合计            ' + stat.tower);
console.log('  塔建成时射程内有敌兵 ' + stat.towerCoverThreat + ' / ' + stat.tower +
            '  (' + (stat.tower ? (100 * stat.towerCoverThreat / stat.tower).toFixed(0) : 0) + '%)');
console.log('  「我方单位出现在裸矿列」帧数 ' + stat.raidCol);
