/* v14 行为验证：法术削弱建筑伤害之后，AI 还会不会白扔法术？
 *
 * 三个问题：
 *  ① 法术落点还在砸大本营吗？（削弱后砸家几乎无收益）
 *  ② AI 会不会升第 5 项「派兵冷却」？（新增全局科技，硬编码漏改就会永远 0 级）
 *  ③ 冷却归零之后出兵量有没有暴涨（会不会破坏平衡）？
 *
 * 驱动方式与 dev/ai-ladder.js 一致：createState → 手设 aiPreset/aiTeam → update + aiUpdate。
 */
var C = require('../src/logic.js');

function run(aDiff, bDiff, seed, maxSec, tech) {
  var s = C.createState({ seed: seed });
  s.aiPreset.red = aDiff;
  s.aiPreset.blue = bDiff;
  s.aiTeam = 'red';
  var t = 0, maxT = 20 * (maxSec || 600);
  var spellAt = { base: 0, building: 0, units: 0, empty: 0 };
  var buildKind = {};          // 砸中的建筑是什么（矿 / 塔 / 其它）
  var deploy = { red: 0, blue: 0 };
  var seen = 0;
  while (!s.over && t < maxT) {
    C.update(s, C.DT);
    C.aiUpdate(s, 'red', C.DT);
    C.aiUpdate(s, 'blue', C.DT);
    t++;
    // 事件是每帧追加的，只处理新出现的
    for (var i = seen; i < s.events.length; i++) {
      var e = s.events[i];
      if (e.type === 'deploy') deploy[e.team]++;
      if (e.type !== 'spell') continue;
      var b = (s.grid[e.row] && s.grid[e.row][e.col]) || null;
      if (b && b.def && b.def.isBase) spellAt.base++;
      else if (b) {
        spellAt.building++;
        var bk = b.def.key;
        buildKind[bk] = (buildKind[bk] || 0) + 1;
      }
      else {
        // 空地上落的法术一定是为了打兵（或者纯浪费）
        var n = 0, foe = e.team === 'red' ? 'blue' : 'red';
        s.units.forEach(function (u) {
          if (u.team !== foe) return;
          if (Math.max(Math.abs(u.row - e.row), Math.abs(u.col - e.col)) <= (e.radius || 0) + 0.001) n++;
        });
        if (n > 0) spellAt.units++; else spellAt.empty++;
      }
    }
    seen = s.events.length;
  }
  var techAt = (s.globalUp && s.globalUp.red) || {};
  return {
    winner: s.winner, time: Math.round(s.time),
    spellAt: spellAt, deploy: deploy, buildKind: buildKind,
    tech: ['bAtk', 'bHp', 'uAtk', 'uHp', 'cdReduce'].map(function (k) { return k + '=' + (techAt[k] || 0); }).join(' ')
  };
}

var N = +process.argv[2] || 4;
var agg = { base: 0, building: 0, units: 0, empty: 0 };
var techLog = [];
var dep = { red: 0, blue: 0 };
var kindAgg = {};
console.log('=== 地狱(红) vs 困难(蓝) · ' + N + ' 局 ===');
for (var i = 0; i < N; i++) {
  var r = run('hell', 'hard', 2000 + i * 91, 600);
  console.log('  seed ' + (2000 + i * 91) + '  ' + (r.winner || '平') +
    ' @' + r.time + 's  法术→ 家' + r.spellAt.base + ' 建筑' + r.spellAt.building +
    ' 兵' + r.spellAt.units + ' 空' + r.spellAt.empty +
    '  出兵 红' + r.deploy.red + '/蓝' + r.deploy.blue);
  console.log('     科技(红): ' + r.tech);
  ['base', 'building', 'units', 'empty'].forEach(function (k) { agg[k] += r.spellAt[k]; });
  Object.keys(r.buildKind).forEach(function (k) { kindAgg[k] = (kindAgg[k] || 0) + r.buildKind[k]; });
  dep.red += r.deploy.red; dep.blue += r.deploy.blue;
  techLog.push(r.tech);
}
console.log('\n--- 汇总（' + N + ' 局）---');
var total = agg.base + agg.building + agg.units + agg.empty;
console.log('法术总数 ' + total + '：砸兵 ' + agg.units + ' / 砸建筑 ' + agg.building +
  ' / 砸大本营 ' + agg.base + ' / 落空 ' + agg.empty);
if (total) {
  console.log('占比：兵 ' + Math.round(agg.units / total * 100) + '%  建筑 ' +
    Math.round(agg.building / total * 100) + '%  大本营 ' + Math.round(agg.base / total * 100) +
    '%  落空 ' + Math.round(agg.empty / total * 100) + '%');
}
console.log('砸中的建筑明细：' + Object.keys(kindAgg).map(function (k) { return k + ' ' + kindAgg[k]; }).join(' / '));
console.log('出兵总数：红 ' + dep.red + ' / 蓝 ' + dep.blue);
var cdLv = techLog.map(function (x) { var m = /cdReduce=(\d+)/.exec(x); return +m[1]; });
console.log('派兵冷却等级：' + cdLv.join(', ') + '  （全 0 = AI 根本没升这一项，说明硬编码没改干净）');
