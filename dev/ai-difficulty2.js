var C = require('../src/logic.js');
function humanTurn(s, t) {
  var res = s.res[t];
  var mines = s.buildings.filter(function (b) { return b.team === t && b.key === 'mine'; }).length;
  if (mines < 3 && res >= 150) {
    for (var r = 10; r >= 6; r--) for (var c = 1; c <= 10; c++) if (C.placeBuilding(s, t, 'mine', r, c).ok) return;
  }
  var towers = s.buildings.filter(function (b) { return b.team === t && b.def.atk; }).length;
  if (towers < 4 && res >= 120) {
    var kinds = ['cannon', 'arrow', 'mage', 'mortar', 'tesla'];
    var k = kinds[Math.floor(Math.random() * kinds.length)];
    for (var r2 = 6; r2 <= 10; r2++) for (var c2 = 1; c2 <= 10; c2++) if (C.placeBuilding(s, t, k, r2, c2).ok) return;
  }
  if (res >= 400) { if (C.upgradeBase(s, t).ok) return; }
  var order = ['infantry', 'archer', 'siege'];
  for (var i = 0; i < order.length; i++) {
    if (!C.isUnitReady(s, t, order[i])) continue;
    if (res < C.DATA.units[order[i]].cost) continue;
    for (var c3 = 1; c3 <= 10; c3++) if (C.deployUnit(s, t, order[i], c3).ok) return;
  }
}
function playGame(diff, seed, maxSec) {
  var s = C.createState({ seed: seed, difficulty: diff });
  s.suddenDeath = false;                     // 关掉决胜时刻，测真实强度
  var t = 0, humanTimer = 0;
  while (!s.over && t < 20 * maxSec) {
    C.update(s, C.DT); C.aiUpdate(s, 'red', C.DT);
    humanTimer += C.DT;
    if (humanTimer >= 1.0) { humanTimer = 0; humanTurn(s, 'blue'); }
    t++;
  }
  var rb = C.ownBase(s, 'red'), bb = C.ownBase(s, 'blue');
  return { winner: s.winner, over: s.over, time: s.time,
           redHp: rb ? rb.hp : 0, blueHp: bb ? bb.hp : 0,
           redMax: rb ? rb.hpMax : 0, blueMax: bb ? bb.hpMax : 0 };
}
var N = parseInt(process.argv[2] || '10', 10), MAXS = parseInt(process.argv[3] || '600', 10);
['normal', 'hard', 'hell'].forEach(function (d) {
  var win = 0, draw = 0, redWin = 0, times = [];
  for (var i = 0; i < N; i++) {
    var r = playGame(d, 1000 + i * 37, MAXS);
    if (r.winner === 'blue') win++;
    else if (r.winner === 'red') redWin++;
    else draw++;
    times.push(r.time);
  }
  var avg = times.reduce(function (a, b) { return a + b; }, 0) / times.length;
  console.log('  ' + d.padEnd(7) + ' 真人胜 ' + win + ' / 电脑胜 ' + redWin + ' / 未分胜负 ' + draw +
    '  → 真人胜率 ' + Math.round(win / N * 100) + '%   平均 ' + avg.toFixed(0) + 's');
});
