/* 消融测试：把地狱档的某个参数换成普通档的值，看胜率变化 —— 找出真正决定强度的参数 */
var C = require('../src/logic.js');

function play(rp, bp, seed, maxSec) {
  var s = C.createState({ seed: seed });
  s.aiPreset.red = 'hell'; s.aiPreset.blue = 'hell';
  s.aiTeam = 'red';
  // 用临时预设对象覆盖
  var saved = C.AI_PRESETS.hell;
  C.AI_PRESETS.hell = rp; C.AI_PRESETS.red_tmp = rp;
  s.aiPreset.red = 'hell';
  var t = 0;
  while (!s.over && t < 20 * (maxSec || 800)) {
    C.update(s, C.DT);
    C.aiUpdate(s, 'red', C.DT);
    C.aiUpdate(s, 'blue', C.DT);
    t++;
  }
  C.AI_PRESETS.hell = saved;
  return s;
}

/* 红方用「地狱档改一个参数」，蓝方用「正常地狱档」 */
function ablate(label, mutate, n) {
  var base = C.AI_PRESETS.hell;
  var redP = JSON.parse(JSON.stringify(base));
  mutate(redP);
  var saved = C.AI_PRESETS.hell;
  // 红蓝不能用同一个 key，所以造两个 key
  C.AI_PRESETS.hellR = redP;
  C.AI_PRESETS.hellB = base;
  var redW = 0, blueW = 0, times = [];
  for (var i = 0; i < n; i++) {
    var s = C.createState({ seed: 2000 + i * 41 });
    s.aiPreset.red = 'hellR'; s.aiPreset.blue = 'hellB'; s.aiTeam = 'red';
    var t = 0;
    while (!s.over && t < 20 * 800) {
      C.update(s, C.DT);
      C.aiUpdate(s, 'red', C.DT);
      C.aiUpdate(s, 'blue', C.DT);
      t++;
    }
    if (s.winner === 'red') redW++; else if (s.winner === 'blue') blueW++;
    times.push(s.time);
  }
  delete C.AI_PRESETS.hellR; delete C.AI_PRESETS.hellB;
  var pct = Math.round(redW / n * 100);
  console.log('  ' + label.padEnd(30) + ' 改后红方胜率 ' + String(pct).padStart(3) + '%   (基准 50%)');
  return pct;
}

var N = parseInt(process.argv[2] || '6', 10);
console.log('=== 消融：红方把某参数改成较弱的值，看胜率是否下降 ===');
console.log('（胜率明显 < 50% = 这个参数重要；≈50% = 这个参数没影响）');
console.log('');
ablate('maxTowers 10 → 3', function (p) { p.maxTowers = 3; }, N);
ablate('maxMines 8 → 2', function (p) { p.maxMines = 2; }, N);
ablate('thinkEvery 0.3 → 2.2', function (p) { p.thinkEvery = 2.2; }, N);
ablate('mistakeRate 0 → 0.45', function (p) { p.mistakeRate = 0.45; }, N);
ablate('adaptive true → false', function (p) { p.adaptive = false; }, N);
ablate('smartDeploy true → false', function (p) { p.smartDeploy = false; }, N);
ablate('allIn true → false', function (p) { p.allIn = false; }, N);
ablate('aceTarget 10 → 1', function (p) { p.aceTarget = 1; }, N);
ablate('spellEager 1 → 0.35', function (p) { p.spellEager = 0.35; }, N);
ablate('upgradeBudget 1 → 0.35', function (p) { p.upgradeBudget = 0.35; }, N);
ablate('reserve 0 → 40', function (p) { p.reserve = 40; }, N);
