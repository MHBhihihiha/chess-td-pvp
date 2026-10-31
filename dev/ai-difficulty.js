var C = require('../src/logic.js');
/* 模拟一个「真人玩家」：用一套还不错的固定策略跟 AI 打，
   用来测各档难度的相对强度。玩家策略故意比 AI 简单（更像人）。 */
function humanTurn(s, t) {
  var res = s.res[t];
  // 1) 先铺金矿
  var mines = s.buildings.filter(function (b) { return b.team === t && b.key === 'mine'; }).length;
  if (mines < 3 && res >= 150) {
    for (var r = 10; r >= 6; r--) for (var c = 1; c <= 10; c++) {
      if (C.placeBuilding(s, t, 'mine', r, c).ok) return;
    }
  }
  // 2) 保持 4 座塔（随机选种类，模拟真人不太动脑）
  var towers = s.buildings.filter(function (b) { return b.team === t && b.def.atk; }).length;
  if (towers < 4 && res >= 120) {
    var kinds = ['cannon', 'arrow', 'mage', 'mortar', 'tesla'];
    var k = kinds[Math.floor(Math.random() * kinds.length)];
    for (var r2 = 6; r2 <= 10; r2++) for (var c2 = 1; c2 <= 10; c2++) {
      if (C.placeBuilding(s, t, k, r2, c2).ok) return;
    }
  }
  // 3) 升大本营
  if (res >= 400) { if (C.upgradeBase(s, t).ok) return; }
  // 4) 有钱就出兵（三种主力轮着来）
  var order = ['infantry', 'archer', 'siege'];
  for (var i = 0; i < order.length; i++) {
    if (!C.isUnitReady(s, t, order[i])) continue;
    if (res < C.DATA.units[order[i]].cost) continue;
    for (var c3 = 1; c3 <= 10; c3++) if (C.deployUnit(s, t, order[i], c3).ok) return;
  }
}

function playGame(diff, seed) {
  var s = C.createState({ seed: seed, difficulty: diff });
  var t = 0;
  var humanTimer = 0;
  while (!s.over && t < 20 * 900) {
    C.update(s, C.DT);
    C.aiUpdate(s, 'red', C.DT);            // 红方 = 电脑（难度档）
    humanTimer += C.DT;
    if (humanTimer >= 1.0) { humanTimer = 0; humanTurn(s, 'blue'); }   // 真人每秒操作一次
    t++;
  }
  return { winner: s.winner, time: s.time, over: s.over };
}

var N = parseInt(process.argv[2] || '12', 10);
['normal', 'hard', 'hell'].forEach(function (d) {
  var win = 0, played = 0, times = [];
  for (var i = 0; i < N; i++) {
    var r = playGame(d, 1000 + i * 37);
    played++;
    if (r.winner === 'blue') win++;
    times.push(r.time);
  }
  var avg = times.reduce(function (a, b) { return a + b; }, 0) / times.length;
  console.log('  ' + d.padEnd(7) + ' 真人胜率 ' + Math.round(win / played * 100) + '%  (' + win + '/' + played + ')   平均时长 ' + avg.toFixed(0) + 's');
});
