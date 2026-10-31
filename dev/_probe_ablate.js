/* 一次性消融：看地狱档 420s 内钱到底被哪个分支吃掉（科技一直卡在 sum=4） */
var C = require('../src/logic.js');
function run(over, label) {
  var base = C.AI_PRESETS.hell;
  var saved = {};
  Object.keys(over).forEach(function (k) { saved[k] = base[k]; base[k] = over[k]; });
  var s = C.createState({ seed: 20261027 });
  s.suddenDeath = false; s.aiPreset.red = 'hell'; s.aiPreset.blue = 'hard'; s.aiTeam = 'red';
  var last = 0, peak = 0;
  for (var t = 0; t < 420 * 20 && !s.over; t++) {
    C.update(s, C.DT); C.aiUpdate(s, 'red', C.DT); C.aiUpdate(s, 'blue', C.DT);
    peak = Math.max(peak, s.res.red);
    if (s.time - last >= 140) { last = s.time;
      var x = s.globalUp.red || {}, sum = 0;
      ['bAtk','bHp','uAtk','uHp'].forEach(function (k) { sum += x[k] || 0; });
      console.log('  ' + label + ' t=' + Math.round(s.time) + ' sum=' + sum + ' res=' + Math.round(s.res.red));
    }
  }
  var x = s.globalUp.red || {}, sum = 0;
  ['bAtk','bHp','uAtk','uHp'].forEach(function (k) { sum += x[k] || 0; });
  console.log('  ' + label + ' 终 sum=' + sum + ' 峰值现金=' + Math.round(peak) + ' 结束=' + (s.over ? s.winner : '否') + ' ' + Math.round(s.time));
  Object.keys(saved).forEach(function (k) { base[k] = saved[k]; });
}
console.log('基准(地狱 vs 困难)');            run({}, 'base');
console.log('关掉大本营升级 baseCap=1');      run({ baseCap: 1 }, 'noBase');
console.log('关掉法术 spellEager=0');         run({ spellEager: 0 }, 'noSpell');
console.log('关掉出兵 armyShare=0');          run({ armyShare: 0 }, 'noArmy');
console.log('只留 3 塔 maxTowers=3');          run({ maxTowers: 3 }, 'noTower');
console.log('全关(纯科技)');                  run({ baseCap: 1, spellEager: 0, armyShare: 0, maxTowers: 3 }, 'techOnly');
