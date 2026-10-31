/* 深度自检：把「B 行瞬移」「卡在大本营里」「飞越建筑」三件事
 * 在各种极端场景下逐帧扫一遍，任何一次 >1 格位移都算失败。 */
var C = require('../src/logic.js');
var pass = 0, fail = 0;
function item(name, ok, extra) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  [' + extra + ']' : '')); }
}

/* 通用扫描器：
 *  - unitKey / team / 各种棋盘布置
 *  - 返回 { maxStep, baseStopFrames, endPos, seq } */
function scanOne(setup, team, unitKey, col, secs) {
  var s = C.createState({ seed: 5 });
  s.res.blue = 1e6; s.res.red = 1e6;
  setup(s);
  var d = C.deployUnit(s, team, unitKey, col);
  if (!d.ok) return { err: d.why };
  var u = d.unit;
  var pr = u.row, pc = u.col, maxStep = 0, baseStop = 0, still = 0, prevPos = 'r' + pr + 'c' + pc;
  var seq = [prevPos];
  for (var t = 0; t < 20 * (secs || 30); t++) {
    C.update(s, C.DT);
    if (!u || u.hp <= 0) break;
    var st = Math.abs(u.row - pr) + Math.abs(u.col - pc);
    if (st > maxStep) maxStep = st;
    var pos = 'r' + u.row + 'c' + u.col;
    if (pos === prevPos) still++; else { still = 0; seq.push(pos); }
    var b = s.grid[u.row] && s.grid[u.row][u.col];
    if (b && b.def.isBase && still >= 60) baseStop++;   // 停在大本营上超过 3 秒
    prevPos = pos; pr = u.row; pc = u.col;
  }
  return { maxStep: maxStep, baseStop: baseStop, end: 'r' + u.row + 'c' + u.col, seq: seq };
}

var noSetup = function () { };
var fillRow = function (team, row) {
  return function (s) { for (var c = 1; c <= 10; c++) C.placeBuilding(s, team, 'cannon', row, c); };
};
var fillRows = function (team, rows) {
  return function (s) {
    rows.forEach(function (r) { for (var c = 1; c <= 10; c++) C.placeBuilding(s, team, 'cannon', r, c); });
  };
};

console.log('=== 一、空中兵从 B 行(行11) 进场：各种棋盘布置都不能瞬移 ===');
var airSetups = [
  ['空棋盘', noSetup],
  ['行10 全铺满', fillRow('blue', 10)],
  ['行7~10 全铺满', fillRows('blue', [7, 8, 9, 10])],
  ['行5~10 全铺满（整半场）', fillRows('blue', [5, 6, 7, 8, 9, 10])],
  ['行10 只留大本营两格', function (s) {
    for (var c = 1; c <= 10; c++) if (c !== 5 && c !== 6) C.placeBuilding(s, 'blue', 'cannon', 9, c);
  }],
  ['红方半场也铺满', fillRows('red', [1, 2, 3, 4, 5])]
];
['balloon', 'airship', 'dragon'].forEach(function (k) {
  airSetups.forEach(function (pair) {
    var worst = 0, baseStop = 0;
    [1, 3, 5, 7, 10].forEach(function (col) {
      var r = scanOne(pair[1], 'blue', k, col, 40);
      if (r.err) return;
      worst = Math.max(worst, r.maxStep);
      baseStop = Math.max(baseStop, r.baseStop);
    });
    item(C.DATA.units[k].name + ' / ' + pair[0] + '：不瞬移且不卡大本营',
      worst <= 1 && baseStop === 0, '最大位移=' + worst + ' 卡大本营=' + baseStop);
  });
});

console.log('\n=== 二、空中兵确实能飞越整排建筑抵达攻击位 ===');
[['balloon'], ['airship'], ['dragon']].forEach(function (arr) {
  var k = arr[0];
  var worst = 0, reached = 0;
  [1, 5, 10].forEach(function (col) {
    var r = scanOne(fillRows('blue', [7, 8, 9]), 'blue', k, col, 45);
    if (r.err) return;
    worst = Math.max(worst, r.maxStep);
    var m = r.end.match(/r(\d+)c/);
    if (+m[1] <= 4) reached++;
  });
  item(C.DATA.units[k].name + ' 飞越 3 排建筑抵达红方半场', reached === 3, reached + '/3');
});

console.log('\n=== 三、地面兵从 B 行进场：不能瞬移、不能卡在大本营里 ===');
['infantry', 'heavy', 'siege', 'ram', 'archer'].forEach(function (k) {
  var worst = 0, baseStop = 0;
  [1, 5, 10].forEach(function (col) {
    var r = scanOne(noSetup, 'blue', k, col, 30);
    if (r.err) return;
    worst = Math.max(worst, r.maxStep);
    baseStop = Math.max(baseStop, r.baseStop);
  });
  item(C.DATA.units[k].name + ' 不瞬移、不卡大本营', worst <= 1 && baseStop === 0,
    '最大位移=' + worst + ' 卡大本营=' + baseStop);
});

console.log('\n=== 四、红方通道（行0）同样规则 ===');
['balloon', 'dragon', 'infantry', 'siege'].forEach(function (k) {
  var worst = 0;
  [1, 5, 10].forEach(function (col) {
    var r = scanOne(noSetup, 'red', k, col, 30);
    if (r.err) return;
    worst = Math.max(worst, r.maxStep);
  });
  item(C.DATA.units[k].name + '（红方）不瞬移', worst <= 1, '最大位移=' + worst);
});

console.log('\n=== 五、完整对局 600 秒逐帧扫描：无任何瞬移 ===');
/* v18：种子 2 个 → 8 个。
 * 只跑 2 个种子时覆盖面太窄：卡死/瞬移都是「特定棋盘+特定 AI 决策序列」才触发的偶发问题，
 * 2 个种子（≈ 2 局）几乎必然漏掉。8 个种子的成本约 4 倍，但仍在十几秒内跑完。 */
[11, 22, 33, 44, 55, 66, 77, 88].forEach(function (seed) {
  var s = C.createState({ seed: seed, difficulty: 'hard' });
  s.aiTeam = 'red';
  var maxStep = 0, worstAt = '', t = 0;
  while (!s.over && t < 20 * 600) {
    var before = {};
    s.units.forEach(function (u) { before[u.id] = { r: u.row, c: u.col, k: u.key, air: u.def.air }; });
    C.update(s, C.DT); C.aiUpdate(s, 'red', C.DT); C.aiUpdate(s, 'blue', C.DT);
    t++;
    s.units.forEach(function (u) {
      var b = before[u.id];
      if (!b) return;
      var st = Math.abs(u.row - b.r) + Math.abs(u.col - b.c);
      if (st > maxStep) { maxStep = st; worstAt = b.k + ' r' + b.r + 'c' + b.c + '→r' + u.row + 'c' + u.col; }
    });
  }
  item('seed' + seed + ' 完整对局无瞬移', maxStep <= 1, '最大位移=' + maxStep + ' ' + worstAt);
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
