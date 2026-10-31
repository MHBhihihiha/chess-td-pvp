/* 扫描困难档参数，找真人胜率落在 25% 附近的配置 */
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

function measure(diff, n) {
  var win = 0;
  for (var i = 0; i < n; i++) {
    var s = C.createState({ seed: 1000 + i * 37, difficulty: diff });
    var t = 0, ht = 0;
    while (!s.over && t < 20 * 900) {
      C.update(s, C.DT); C.aiUpdate(s, 'red', C.DT);
      ht += C.DT; if (ht >= 1.0) { ht = 0; humanTurn(s, 'blue'); }
      t++;
    }
    if (s.winner === 'blue') win++;
  }
  return Math.round(win / n * 100);
}

var base = C.AI_PRESETS.hard;
var variants = [
  { label: '当前困难档', p: {} },
  { label: '矿4 塔5 主塔Lv5 犯错11% 留12', p: { maxMines: 4, maxTowers: 5, aceTarget: 5, mistakeRate: 0.11, reserve: 12, upgradeBudget: 0.72, thinkEvery: 1.0 } },
  { label: '矿3 塔4 主塔Lv4 犯错13% 留20', p: { maxMines: 3, maxTowers: 4, aceTarget: 4, mistakeRate: 0.13, reserve: 20, upgradeBudget: 0.65, thinkEvery: 1.1 } },
  { label: '矿3 塔4 主塔Lv3 犯错15% 留30', p: { maxMines: 3, maxTowers: 4, aceTarget: 3, mistakeRate: 0.15, reserve: 30, upgradeBudget: 0.60, thinkEvery: 1.2 } },
  { label: '矿2 塔3 主塔Lv3 犯错18% 留40', p: { maxMines: 2, maxTowers: 3, aceTarget: 3, mistakeRate: 0.18, reserve: 40, upgradeBudget: 0.55, thinkEvery: 1.4 } },
  { label: '矿2 塔3 主塔Lv2 犯错22% 留50', p: { maxMines: 2, maxTowers: 3, aceTarget: 2, mistakeRate: 0.22, reserve: 50, upgradeBudget: 0.50, thinkEvery: 1.6 } }
];

var N = parseInt(process.argv[2] || '8', 10);
console.log('=== 困难档参数扫描（目标：真人胜率 ≈ 25%）===');
variants.forEach(function (v) {
  var p = JSON.parse(JSON.stringify(base));
  Object.keys(v.p).forEach(function (k) { p[k] = v.p[k]; });
  C.AI_PRESETS.scan = p;
  var pct = measure('scan', N);
  console.log('  ' + v.label.padEnd(34) + ' 真人胜率 ' + String(pct).padStart(3) + '%   ' +
    (pct >= 15 && pct <= 40 ? '← 接近目标' : ''));
});
delete C.AI_PRESETS.scan;
