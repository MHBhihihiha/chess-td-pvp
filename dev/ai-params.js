/* 参数方向测试：把一个参数调高/调低，看强度往哪边走 —— 避免"以为在加强其实在削弱" */
var C = require('../src/logic.js');

function duel(label, mutateA, n) {
  var base = C.AI_PRESETS.hell;
  var A = JSON.parse(JSON.stringify(base));
  var B = JSON.parse(JSON.stringify(base));
  mutateA(A);
  C.AI_PRESETS.pA = A; C.AI_PRESETS.pB = B;
  var aw = 0, bw = 0, times = [];
  for (var i = 0; i < n; i++) {
    var s = C.createState({ seed: 3000 + i * 53 });
    s.aiPreset.red = 'pA'; s.aiPreset.blue = 'pB'; s.aiTeam = 'red';
    var t = 0;
    while (!s.over && t < 20 * 800) {
      C.update(s, C.DT); C.aiUpdate(s, 'red', C.DT); C.aiUpdate(s, 'blue', C.DT); t++;
    }
    if (s.winner === 'red') aw++; else if (s.winner === 'blue') bw++;
    times.push(s.time);
  }
  delete C.AI_PRESETS.pA; delete C.AI_PRESETS.pB;
  var pct = Math.round(aw / n * 100);
  console.log('  ' + label.padEnd(32) + ' A胜率 ' + String(pct).padStart(3) + '%  (' + aw + '/' + n + ')  平均 ' +
    (times.reduce(function (x, y) { return x + y; }, 0) / n).toFixed(0) + 's');
  return pct;
}

var N = parseInt(process.argv[2] || '6', 10);
console.log('=== 参数方向：A 改一点，B 保持地狱档基准 ===');
console.log('');
console.log('-- 预留金币（base reserve=0，A 改成 40 = 更保守）--');
duel('A: reserve 0 → 40', function (p) { p.reserve = 40; }, N);
console.log('');
console.log('-- 塔上限（base=10）--');
duel('A: maxTowers 10 → 4', function (p) { p.maxTowers = 4; }, N);
console.log('');
console.log('-- 金矿上限（base=8）--');
duel('A: maxMines 8 → 3', function (p) { p.maxMines = 3; }, N);
console.log('');
console.log('-- 思考间隔（base=0.5）--');
duel('A: thinkEvery 0.5 → 2.0', function (p) { p.thinkEvery = 2.0; }, N);
duel('A: thinkEvery 0.5 → 0.2', function (p) { p.thinkEvery = 0.2; }, N);
console.log('');
console.log('-- 主塔目标等级（base=10）--');
duel('A: aceTarget 10 → 3', function (p) { p.aceTarget = 3; }, N);
console.log('');
console.log('-- 全局升级预算（base=1.0）--');
duel('A: upgradeBudget 1.0 → 0.4', function (p) { p.upgradeBudget = 0.4; }, N);
console.log('');
console.log('-- 按形势调整（base=true）--');
duel('A: adaptive → false', function (p) { p.adaptive = false; }, N);
