var C = require('../src/logic.js');
var RS = 20261027;
function arand() { RS = (RS * 1103515245 + 12345) % 2147483648; return RS / 2147483648; }
function proxyTurn(s, t) {
  var res = s.res[t];
  var mines = s.buildings.filter(function (b) { return b.team === t && b.key === 'mine'; }).length;
  if (mines < 3 && res >= 150) {
    for (var r = 10; r >= 6; r--) for (var c = 1; c <= 10; c++) if (C.placeBuilding(s, t, 'mine', r, c).ok) return;
  }
  var towers = s.buildings.filter(function (b) { return b.team === t && b.def.atk && !b.def.isBase; }).length;
  if (towers < 4 && res >= 120) {
    var kinds = ['cannon', 'arrow', 'mage', 'mortar', 'tesla'];
    var k = kinds[Math.floor(arand() * kinds.length)];
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
var s = C.createState({ seed: 1000 });
s.suddenDeath = false; s.aiPreset.red = 'hard'; s.aiDeployDebug = [];
var seen = {}, n = 0, ht = 0, t = 0;
while (!s.over && t < 20 * 420) {
  C.update(s, C.DT); C.aiUpdate(s, 'red', C.DT);
  ht += C.DT; if (ht >= 1.0) { ht = 0; proxyTurn(s, 'blue'); }
  s.units.forEach(function (u) { if (u.team === 'red' && !seen[u.id]) { seen[u.id] = 1; n++; } });
  t++;
}
var d = s.aiDeployDebug;
var hoard = d.filter(function (x) { return x.hoard; });
var chosen = d.filter(function (x) { return x.chosen; });
console.log('dbg 总数', d.length, '成功派兵', chosen.length, '攒钱决策', hoard.length);
var hk = {}; hoard.forEach(function (x) { hk[x.hoard] = (hk[x.hoard] || 0) + 1; });
console.log('攒钱目标分布', JSON.stringify(hk));
console.log('攒钱时 金币/预算 样本:', hoard.slice(0, 8).map(function (x) { return x.gold + '/' + x.armyBudget + '(' + x.hoard + ')'; }).join(' '));
console.log('金色时间线(每60s):');
