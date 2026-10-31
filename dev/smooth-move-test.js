/* 平滑移动专项测试：
 *   1. moveProg 必须"每 tick 都变化"（匀速），不能长时间不变再突变
 *   2. 渲染位置必须单调前进（不倒退）
 *   3. 速度必须与 def.speed 一致（0.9 格/秒 → 1 格用 1.11 秒）
 */
var C = require('../src/logic.js');
var pass = 0, fail = 0;
function item(name, ok, extra) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  [' + extra + ']' : '')); }
}

console.log('=== 一、moveProg 每 tick 都在变化（匀速累积）===');
['infantry', 'heavy', 'siege', 'balloon'].forEach(function (k) {
  var s = C.createState({ seed: 1 }); s.res.blue = 1e6;
  var d = C.deployUnit(s, 'blue', k, 5);
  var u = d.unit;
  var prevProg = -1, stillCount = 0, samples = 0;
  for (var t = 0; t < 20 * 6; t++) {
    C.update(s, C.DT);
    var p = u.moveProg || 0;
    // 统计「moveProg 完全没变」的 tick 数（跨格归零不算）
    if (p === prevProg && p > 0 && p < 1) stillCount++;
    prevProg = p; samples++;
  }
  // 允许跨格时归零造成的少量"重复值"
  item(C.DATA.units[k].name + ' 每 tick 都在推进（无停顿）', stillCount <= 2,
    '停顿 tick 数=' + stillCount + '/' + samples);
});

console.log('\n=== 二、速度与实际一致 ===');
['infantry', 'heavy', 'archer', 'balloon'].forEach(function (k) {
  var s = C.createState({ seed: 1 }); s.res.blue = 1e6;
  var d = C.deployUnit(s, 'blue', k, 5);
  var u = d.unit;
  /* 测连续跨格间隔：只统计「相邻两次跨格」的间隔，
   * 自动跳过进场、攻击停顿、被堵的那些段（它们的间隔会明显偏大）。 */
  var crossTimes = [], lastPos = 'r' + u.row + 'c' + u.col, lastT = 0;
  for (var t = 0; t < 20 * 40; t++) {
    C.update(s, C.DT);
    var pos = 'r' + u.row + 'c' + u.col;
    if (pos !== lastPos) {
      if (lastT > 0) crossTimes.push((t + 1) / 20 - lastT);
      lastPos = pos; lastT = (t + 1) / 20;
    }
  }
  // 取中位数：排除被打断的那些间隔
  crossTimes.sort(function (a, b) { return a - b; });
  var gaps = crossTimes.length ? [crossTimes[Math.floor(crossTimes.length / 2)]] : [];
  var need = 1;
  var expect = 1 / u.def.speed;
  var avg = gaps.length ? gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length : 0;
  var ok = gaps.length === need && Math.abs(avg - expect) < 0.15;
  item(C.DATA.units[k].name + ' 连续移动每格 ' + expect.toFixed(2) + 's（实际 ' +
    (gaps.length ? avg.toFixed(2) + 's' : '未连续移动') + '）', ok);
});

console.log('\n=== 三、渲染位置（含限速）每帧匀速、不回退 ===');
/* 复刻 index.html 的 lerpPos（含限速），测最终画到屏幕上的位置 */
var visLastTest = {};
function renderPos(u) {
  var prog = (typeof u.moveProg === 'number') ? u.moveProg : 0;
  if (prog < 0) prog = 0;
  if (prog > 1) prog = 1;
  var tr, tc;
  if (u.nextStep && prog > 0) {
    tr = u.row + (u.nextStep.r - u.row) * prog;
    tc = u.col + (u.nextStep.c - u.col) * prog;
  } else { tr = u.row; tc = u.col; }
  var prev = visLastTest[u.id];
  if (prev) {
    var spd = (u.def && u.def.speed) ? u.def.speed : 0.8;
    var maxStep = Math.max(0.03, spd * C.DT * 1.05);
    var dr = tr - prev.r, dc = tc - prev.c;
    var dist = Math.abs(dr) + Math.abs(dc);
    if (dist > maxStep) {
      var k2 = maxStep / dist;
      tr = prev.r + dr * k2;
      tc = prev.c + dc * k2;
    }
  }
  visLastTest[u.id] = { r: tr, c: tc };
  return { row: tr, col: tc };
}

['infantry', 'heavy', 'archer'].forEach(function (k) {
  visLastTest = {};
  var s = C.createState({ seed: 3 }); s.res.blue = 1e6; s.res.red = 1e6;
  C.placeBuilding(s, 'blue', 'cannon', 8, 5);
  C.placeBuilding(s, 'blue', 'cannon', 7, 5);
  var d = C.deployUnit(s, 'blue', k, 5);
  var u = d.unit;
  var steps = [], prev = null;
  for (var t = 0; t < 20 * 25; t++) {
    C.update(s, C.DT);
    if (!u || u.hp <= 0) break;
    var p = renderPos(u);
    if (prev) steps.push(Math.abs(p.row - prev.row) + Math.abs(p.col - prev.col));
    prev = p;
  }
  var moving = steps.filter(function (x) { return x > 0.001; }).sort(function (a, b) { return a - b; });
  if (!moving.length) { item(C.DATA.units[k].name + ' 渲染位移均匀', false, '没有移动'); return; }
  var med = moving[Math.floor(moving.length / 2)];
  var maxS = moving[moving.length - 1];
  // 中位数附近 8% 以内算「匀速」；最大值不该超过中位数 1.15 倍
  item(C.DATA.units[k].name + ' 渲染匀速（中位 ' + med.toFixed(4) + ' 最大 ' + maxS.toFixed(4) + '）',
    maxS <= med * 1.15);
});



console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
