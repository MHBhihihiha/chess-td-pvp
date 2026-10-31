/* 一次性探针：hard/hell 的科技推进曲线（看 techReady 门槛何时满足） */
var C = require('../src/logic.js');
function run(redDiff, blueDiff, secs, seed) {
  var s = C.createState({ seed: seed || 20261027 });
  s.suddenDeath = false;
  s.aiPreset.red = redDiff;
  if (blueDiff) s.aiPreset.blue = blueDiff;
  s.aiTeam = 'red';
  var out = [];
  var frames = 20 * secs, nextSample = 30;
  for (var t = 0; t < frames && !s.over; t++) {
    C.update(s, C.DT);
    C.aiUpdate(s, 'red', C.DT);
    if (blueDiff) C.aiUpdate(s, 'blue', C.DT);
    if (s.time >= nextSample) {
      nextSample += 60;
      var g = s.globalUp.red || {};
      var sum = 0; ['bAtk','bHp','uAtk','uHp'].forEach(function(k){ sum += g[k]||0; });
      var towers = 0, aceLv = 0, mines = 0;
      s.buildings.forEach(function(b){ if (b.team==='red'){ if (b.key==='mine') mines++; else if (b.def.atk && !b.def.isBase){ towers++; aceLv = Math.max(aceLv, b.level||1);} } });
      out.push('  t=' + Math.round(s.time) + 's tech=' + JSON.stringify(g) + ' sum=' + sum +
               ' gold=' + Math.round(s.res.red) + ' towers=' + towers + ' aceLv=' + aceLv +
               ' mines=' + mines);
    }
  }
  out.push('  -> ' + (s.over ? ('结束 ' + s.time + 's ' + s.winner) : '未结束'));
  return out.join('\n');
}
var SECS = parseInt(process.argv[2] || '400', 10);
console.log('hard vs proxy\n' + run('hard', null, SECS));
console.log('hell vs hard\n' + run('hell', 'hard', SECS));
