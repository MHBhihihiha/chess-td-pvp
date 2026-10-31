/* TEMP DIAGNOSTIC (not part of suite): split base damage into "sudden-death burn" vs "real combat damage",
 * so we can tell WHY one side loses. */
var C = require('../src/logic.js');
var SD_AT = 300, SD_DPS = 6;
var A = process.argv[2] || 'hell', B = process.argv[3] || 'hard';
var N = parseInt(process.argv[4] || '3', 10), STEP = parseInt(process.argv[5] || '60', 10);

for (var g = 0; g < N; g++) {
  var s = C.createState({ seed: 1000 + g * 37 });
  s.aiPreset.red = A; s.aiPreset.blue = B; s.aiTeam = 'red';
  var t = 0, next = 0;
  var prev = { red: C.ownBase(s, 'red').hp, blue: C.ownBase(s, 'blue').hp };
  var combat = { red: 0, blue: 0 };     // 真实战斗伤害（被打）
  var peakArmy = { red: 0, blue: 0 }, peakTowers = { red: 0, blue: 0 };
  var built = { red: 0, blue: 0 }, killed = { red: 0, blue: 0 };
  var seen = { red: {}, blue: {} };
  console.log('--- game' + g + ' ' + A + '(R) vs ' + B + '(B) ---');
  while (!s.over && t < 20 * 800) {
    prev.red = C.ownBase(s, 'red') ? C.ownBase(s, 'red').hp : 0;
    prev.blue = C.ownBase(s, 'blue') ? C.ownBase(s, 'blue').hp : 0;
    C.update(s, C.DT);
    var extra = s.time > SD_AT ? (s.time - SD_AT) / 90 : 0;
    var burn = s.suddenDeath !== false && s.time > SD_AT ? SD_DPS * (1 + extra) * C.DT : 0;
    ['red', 'blue'].forEach(function (team) {
      var b = C.ownBase(s, team);
      var now = b ? b.hp : 0;
      var d = prev[team] - now;
      combat[team] += Math.max(0, d - burn);
    });
    C.aiUpdate(s, 'red', C.DT); C.aiUpdate(s, 'blue', C.DT);
    if (s.time >= next) {
      next += STEP;
      ['red', 'blue'].forEach(function (team) {
        var army = s.units.filter(function (u) { return u.team === team && u.hp > 0; }).length;
        var tw = s.buildings.filter(function (b) { return b.team === team && b.def.atk && !b.def.isBase; }).length;
        if (army > peakArmy[team]) peakArmy[team] = army;
        if (tw > peakTowers[team]) peakTowers[team] = tw;
      });
      var br = C.ownBase(s, 'red'), bb = C.ownBase(s, 'blue');
      console.log(' t=' + String(Math.round(s.time)).padStart(3) +
        ' | R base=' + (br ? Math.round(br.hp / br.hpMax * 100) : 0) + '% lv' + C.baseLevelOf(s, 'red') +
        ' combatTaken=' + Math.round(combat.red) + ' army=' + s.units.filter(function (u) { return u.team === 'red' && u.hp > 0; }).length +
        ' tw=' + s.buildings.filter(function (b) { return b.team === 'red' && b.def.atk && !b.def.isBase; }).length +
        ' res=' + Math.round(s.res.red) +
        ' || B base=' + (bb ? Math.round(bb.hp / bb.hpMax * 100) : 0) + '% lv' + C.baseLevelOf(s, 'blue') +
        ' combatTaken=' + Math.round(combat.blue) + ' army=' + s.units.filter(function (u) { return u.team === 'blue' && u.hp > 0; }).length +
        ' tw=' + s.buildings.filter(function (b) { return b.team === 'blue' && b.def.atk && !b.def.isBase; }).length +
        ' res=' + Math.round(s.res.blue));
    }
    t++;
  }
  console.log('  => winner=' + s.winner + ' time=' + Math.round(s.time) +
    ' | combat damage taken R=' + Math.round(combat.red) + ' B=' + Math.round(combat.blue) +
    ' | peakArmy R=' + peakArmy.red + ' B=' + peakArmy.blue + ' peakTowers R=' + peakTowers.red + ' B=' + peakTowers.blue);
}
