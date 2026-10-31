/* 难度阶梯测试：让红蓝用不同难度的 AI 对战，看强档是否真的更强。
 * 对称对局（两边同档）永远是 50%，测不出强度，必须做交叉对局。 */
var C = require('../src/logic.js');

function play(aDiff, bDiff, seed, maxSec) {
  var s = C.createState({ seed: seed });
  s.aiPreset.red = aDiff;      // 红方用 aDiff
  s.aiPreset.blue = bDiff;     // 蓝方用 bDiff
  s.aiTeam = 'red';
  var t = 0;
  while (!s.over && t < 20 * (maxSec || 800)) {
    C.update(s, C.DT);
    C.aiUpdate(s, 'red', C.DT);
    C.aiUpdate(s, 'blue', C.DT);
    t++;
  }
  return s;
}

function ladder(label, aDiff, bDiff, n) {
  var aWin = 0, bWin = 0, draw = 0, times = [];
  for (var i = 0; i < n; i++) {
    var s = play(aDiff, bDiff, 1000 + i * 37);
    if (s.winner === 'red') aWin++;
    else if (s.winner === 'blue') bWin++;
    else draw++;
    times.push(s.time);
  }
  var avg = times.reduce(function (x, y) { return x + y; }, 0) / times.length;
  var pct = Math.round(aWin / n * 100);
  console.log('  ' + label.padEnd(20) + ' A胜 ' + String(aWin).padStart(2) + '/' + n +
    '  B胜 ' + String(bWin).padStart(2) + '/' + n + '  平 ' + draw +
    '   A胜率 ' + String(pct).padStart(3) + '%   平均 ' + avg.toFixed(0) + 's');
  return pct;
}

var N = parseInt(process.argv[2] || '8', 10);
console.log('=== 难度阶梯（红=A档，蓝=B档）===');
var r1 = ladder('困难 vs 普通', 'hard', 'normal', N);
var r2 = ladder('地狱 vs 困难', 'hell', 'hard', N);
var r3 = ladder('地狱 vs 普通', 'hell', 'normal', N);
var r4 = ladder('普通 vs 困难', 'normal', 'hard', N);   // 反向验证
var r5 = ladder('困难 vs 地狱', 'hard', 'hell', N);     // 反向验证
console.log('');
console.log('期望：强档胜率明显 > 50%，反向对局 < 50%');
var ok = (r1 > 50 && r4 < 50) && (r2 > 50 && r5 < 50) && r3 > 50;
console.log(ok ? '✅ 难度阶梯正常：地狱 > 困难 > 普通'
              : '❌ 难度阶梯有问题（见上面数字）');
