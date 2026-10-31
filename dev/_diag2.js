/* TEMP DIAGNOSTIC — normal (red AI) vs the human proxy (blue) from ai-difficulty2.js */
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
function snap(s) {
  function f(team) {
    var mines = s.buildings.filter(function (b) { return b.team === team && b.key === 'mine'; }).length;
    var bld = s.buildings.filter(function (b) { return b.team === team && b.def.atk && !b.def.isBase; });
    var towers = bld.length;
    var ace = null; bld.forEach(function (b) { if (!ace || (b.level || 1) > (ace.level || 1)) ace = b; });
    var army = s.units.filter(function (u) { return u.team === team && u.hp > 0; }).length;
    var base = C.ownBase(s, team);
    var plan = (s.aiPlan && s.aiPlan[team]) || {};
    return { mines: mines, towers: towers, aceLv: ace ? (ace.level || 1) : 0, army: army,
             baseLv: C.baseLevelOf(s, team), baseHp: base ? Math.round(base.hp / base.hpMax * 100) : 0,
             stance: plan.stance, allIn: (s.aiPush && s.aiPush[team] && s.time < s.aiPush[team]) ? 1 : 0 };
  }
  return { red: f('red'), blue: f('blue') };
}
var N = parseInt(process.argv[2] || '5', 10);
var aw = 0, bw = 0, dr = 0, allInCount = 0;
for (var i = 0; i < N; i++) {
  var s = C.createState({ seed: 1000 + i * 37, difficulty: 'normal' });
  s.suddenDeath = false;
  var t = 0, humanTimer = 0, aiPushed = 0;
  while (!s.over && t < 20 * 600) {
    C.update(s, C.DT); C.aiUpdate(s, 'red', C.DT);
    humanTimer += C.DT;
    if (humanTimer >= 1.0) { humanTimer = 0; humanTurn(s, 'blue'); }
    if (s.aiPush && s.aiPush.red && s.time < s.aiPush.red) aiPushed++;
    t++;
  }
  var sn = snap(s);
  if (s.winner === 'red') aw++; else if (s.winner === 'blue') bw++; else dr++;
  if (i === 0) {
    for (var tt = 0; tt < 600; tt += 60) { /* noop, just log end */ }
    console.log('  final: R towers=' + sn.red.towers + ' ace=' + sn.red.aceLv + ' mines=' + sn.red.mines +
      ' army=' + sn.red.army + ' base=' + sn.red.baseLv + '(' + sn.red.baseHp + '%)' +
      ' || B towers=' + sn.blue.towers + ' mines=' + sn.blue.mines + ' army=' + sn.blue.army +
      ' base=' + sn.blue.baseLv + '(' + sn.blue.baseHp + '%)');
  }
  console.log('  game' + i + ': winner=' + s.winner + ' time=' + Math.round(s.time) +
    's  redPushedTicks=' + aiPushed);
}
console.log('  -> 电脑(red)胜 ' + aw + ' / 真人(blue)胜 ' + bw + ' / 平 ' + dr);
