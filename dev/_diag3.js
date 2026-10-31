/* TEMP DIAGNOSTIC (not part of suite): fine-grained economy/army timeline for A(red) vs B(blue). */
var C = require('../src/logic.js');
function snap(s, t) {
  var pw = C.assessPower(s, t);
  var bld = s.buildings.filter(function (b) { return b.team === t && b.def.atk && !b.def.isBase; });
  var ace = null; bld.forEach(function (b) { if (!ace || (b.level || 1) > (ace.level || 1)) ace = b; });
  var base = C.ownBase(s, t);
  var plan = (s.aiPlan && s.aiPlan[t]) || {};
  var typed = {};
  s.units.forEach(function (u) { if (u.team === t) typed[u.key] = (typed[u.key] || 0) + 1; });
  return {
    res: Math.round(s.res[t]), inc: Math.round(pw.me.income), score: Math.round(pw.me.score),
    mines: s.buildings.filter(function (b) { return b.team === t && b.key === 'mine'; }).length,
    towers: bld.length, ace: ace ? (ace.level || 1) : 0,
    army: s.units.filter(function (u) { return u.team === t && u.hp > 0; }).length,
    armyValue: Math.round(pw.me.armyValue), types: Object.keys(typed).join('/'),
    baseLv: C.baseLevelOf(s, t), baseHp: base ? Math.round(base.hp / base.hpMax * 100) : 0,
    stance: plan.stance, ratio: plan.ratio,
    allIn: (s.aiPush && s.aiPush[t] && s.time < s.aiPush[t]) ? 1 : 0
  };
}
function line(tag, v) {
  return tag + ' res=' + String(v.res).padStart(4) + ' inc=' + String(v.inc).padStart(3) +
    ' score=' + String(v.score).padStart(4) + ' mines=' + v.mines + ' twr=' + v.towers + ' ace=' + v.ace +
    ' army=' + v.army + '(' + v.armyValue + 'g ' + (v.types || '-') + ')' +
    ' base=' + v.baseLv + '(' + v.baseHp + '%)' + ' st=' + v.stance + '/' + v.ratio + (v.allIn ? ' PUSH' : '');
}
var A = process.argv[2] || 'hell', B = process.argv[3] || 'hard';
var N = parseInt(process.argv[4] || '1', 10);
var STEP = parseInt(process.argv[5] || '30', 10);
for (var g = 0; g < N; g++) {
  var s = C.createState({ seed: 1000 + g * 37 });
  s.aiPreset.red = A; s.aiPreset.blue = B; s.aiTeam = 'red';
  var t = 0, nextLog = 0;
  console.log('--- game' + g + ' ' + A + '(R) vs ' + B + '(B) ---');
  while (!s.over && t < 20 * 800) {
    C.update(s, C.DT); C.aiUpdate(s, 'red', C.DT); C.aiUpdate(s, 'blue', C.DT);
    if (s.time >= nextLog) {
      nextLog += STEP;
      console.log(' t=' + String(Math.round(s.time)).padStart(3) + ' R| ' + line('', snap(s, 'red')));
      console.log('       B| ' + line('', snap(s, 'blue')));
    }
    t++;
  }
  console.log('  => winner=' + s.winner + ' time=' + Math.round(s.time) + 's');
}
