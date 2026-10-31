var C = require('../src/logic.js');
function origTurn(s, t) {
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
function run(diff, seed, turnFn, dbg) {
  var s = C.createState({ seed: seed });
  s.suddenDeath = false;
  s.aiPreset.red = diff;
  if (dbg) s.aiDeployDebug = [];
  var t = 0, ht = 0, deploys = {}, n = 0;
  var seen = {};
  while (!s.over && t < 20 * 420) {
    C.update(s, C.DT); C.aiUpdate(s, 'red', C.DT);
    ht += C.DT; if (ht >= 1.0) { ht = 0; turnFn(s, 'blue'); }
    s.units.forEach(function (u) { if (u.team === 'red' && !seen[u.id]) { seen[u.id] = 1; deploys[u.key] = (deploys[u.key] || 0) + 1; n++; } });
    t++;
  }
  var rb = C.ownBase(s, 'red'), bb = C.ownBase(s, 'blue');
  var gl = s.globalUp.red;
  return { diff: diff, seed: seed, winner: s.winner, time: Math.round(s.time),
           n: n, deploys: deploys, redHp: rb ? Math.round(rb.hp) : 0, blueHp: bb ? Math.round(bb.hp) : 0,
           gl: [gl.bAtk, gl.bHp, gl.uAtk, gl.uHp],
           redTowers: s.buildings.filter(function (b) { return b.team === 'red' && b.def.atk && !b.def.isBase; }).length,
           redMines: s.buildings.filter(function (b) { return b.team === 'red' && b.key === 'mine'; }).length,
           dbgCalls: dbg ? s.aiDeployDebug.length : -1 };
}
console.log('--- 原代理(Math.random) ---');
[['hard',1000],['hard',1037],['hell',2000]].forEach(function (p) {
  var r = run(p[0], p[1], origTurn, true);
  console.log(JSON.stringify(r));
});
