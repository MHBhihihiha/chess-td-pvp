/* TEMP DIAGNOSTIC — not part of test suite. Pits two presets and logs metrics. */
var C = require('../src/logic.js');
function snap(s, t) {
  function f(team) {
    var mines = s.buildings.filter(function (b) { return b.team === team && b.key === 'mine'; }).length;
    var bld = s.buildings.filter(function (b) { return b.team === team && b.def.atk && !b.def.isBase; });
    var towers = bld.length;
    var ace = null;
    bld.forEach(function (b) { if (!ace || (b.level || 1) > (ace.level || 1)) ace = b; });
    var army = s.units.filter(function (u) { return u.team === team && u.hp > 0; }).length;
    var base = C.ownBase(s, team);
    var lvl = C.baseLevelOf(s, team);
    var plan = (s.aiPlan && s.aiPlan[team]) || {};
    return { mines: mines, towers: towers, aceLv: ace ? (ace.level || 1) : 0, army: army,
             baseLv: lvl, baseHp: base ? Math.round(base.hp / base.hpMax * 100) : 0,
             income: Math.round((base ? base.income : 0)), stance: plan.stance, phase: plan.phase,
             allIn: (s.aiPush && s.aiPush[team] && s.time < s.aiPush[team]) ? 1 : 0,
             ratio: plan.ratio };
  }
  return { red: f('red'), blue: f('blue') };
}
function play(a, b, seed, maxSec, log) {
  var s = C.createState({ seed: seed });
  s.aiPreset.red = a; s.aiPreset.blue = b; s.aiTeam = 'red';
  var t = 0, lastLog = -1;
  while (!s.over && t < 20 * (maxSec || 800)) {
    C.update(s, C.DT); C.aiUpdate(s, 'red', C.DT); C.aiUpdate(s, 'blue', C.DT);
    if (log && Math.floor(s.time / 60) > lastLog) {
      lastLog = Math.floor(s.time / 60);
      var sn = snap(s);
      console.log('  t=' + String(s.time).padStart(3) +
        ' | R towers=' + sn.red.towers + ' ace=' + sn.red.aceLv + ' mines=' + sn.red.mines +
        ' army=' + sn.red.army + ' base=' + sn.red.baseLv + '(' + sn.red.baseHp + '%) stance=' + sn.red.stance +
        ' allIn=' + sn.red.allIn + ' ratio=' + sn.red.ratio +
        ' || B towers=' + sn.blue.towers + ' ace=' + sn.blue.aceLv + ' mines=' + sn.blue.mines +
        ' army=' + sn.blue.army + ' base=' + sn.blue.baseLv + '(' + sn.blue.baseHp + '%) stance=' + sn.blue.stance +
        ' allIn=' + sn.blue.allIn + ' ratio=' + sn.blue.ratio);
    }
    t++;
  }
  return s;
}
var N = parseInt(process.argv[4] || '3', 10);
var A = process.argv[2] || 'hell', B = process.argv[3] || 'hard';
console.log('=== ' + A + ' (red) vs ' + B + ' (blue), N=' + N + ' ===');
var aw = 0, bw = 0, dr = 0;
for (var i = 0; i < N; i++) {
  var s = play(A, B, 1000 + i * 37, 800, i === 0);
  if (s.winner === 'red') aw++; else if (s.winner === 'blue') bw++; else dr++;
  console.log('  game' + i + ': winner=' + s.winner + ' time=' + Math.round(s.time) + 's');
}
console.log('  -> ' + A + ' win ' + aw + ' / ' + B + ' win ' + bw + ' / draw ' + dr);
