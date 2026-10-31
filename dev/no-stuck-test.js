/* 建筑/兵种「不卡建筑」+ 空中兵飞越 + 不跳格 专项测试
 *
 * 重要区分：
 *   · 地面兵：**任何时刻**都不能站在建筑格上
 *   · 空中兵：**经过**建筑格是允许的（飞越），但不允许**停**在建筑格上
 *     → 判定方式：连续 3 帧以上不动且站在建筑上 = 停住了 = 违规
 */
var C = require('../src/logic.js');
var pass = 0, fail = 0;
function item(name, ok, extra) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  [' + extra + ']' : '')); }
}
var ALL = ['infantry', 'heavy', 'siege', 'ram', 'archer', 'balloon', 'airship', 'dragon'];

console.log('=== 一、地面兵任何时刻都不能站进建筑（含大本营）===');
['infantry', 'heavy', 'siege', 'ram', 'archer'].forEach(function (k) {
  var s = C.createState({ seed: 1 }); s.res.blue = 1e6;
  C.deployUnit(s, 'blue', k, 5);
  var u = C.unitsOf(s, 'blue').filter(function (x) { return x.key === k; })[0];
  var onB = 0;
  for (var t = 0; t < 20 * 20; t++) {
    C.update(s, C.DT);
    if (!u || u.hp <= 0) break;
    if (s.grid[u.row] && s.grid[u.row][u.col]) onB++;
  }
  item(C.DATA.units[k].name + ' 不站进建筑', onB === 0, onB + ' 帧');
});

console.log('\n=== 二、空中兵：可以飞越建筑，但不能停在建筑上 ===');
['balloon', 'airship', 'dragon'].forEach(function (k) {
  var s = C.createState({ seed: 1 }); s.res.blue = 1e6;
  // 在己方半场铺一排建筑，空中兵必须飞越它们
  [[8, 4], [8, 5], [8, 6], [7, 5], [6, 5]].forEach(function (p) {
    C.placeBuilding(s, 'blue', 'cannon', p[0], p[1]);
  });
  C.deployUnit(s, 'blue', k, 5);
  var u = C.unitsOf(s, 'blue').filter(function (x) { return x.key === k; })[0];
  var stillOnB = 0, prevPos = '', stillFrames = 0;
  for (var t = 0; t < 20 * 25; t++) {
    C.update(s, C.DT);
    if (!u || u.hp <= 0) break;
    var pos = 'r' + u.row + 'c' + u.col;
    var bb = s.grid[u.row] && s.grid[u.row][u.col];
    // 大本营格不算「卡在建筑里」——抢攻击位时贴着大本营是正常行为，只需看普通建筑
    var onB = !!(bb && !bb.def.isBase);
    if (pos === prevPos) stillFrames++; else stillFrames = 0;
    /* 空中兵 1 秒飞 1 格，飞越一个建筑格会待约 20 帧，这是**正常**的。
     * 真正异常的是「待着不动超过 3 秒」——那才是卡住。 */
    if (onB && stillFrames >= 60) stillOnB++;
    prevPos = pos;
  }
  item(C.DATA.units[k].name + ' 不会长期停在建筑上', stillOnB === 0, stillOnB + ' 帧');
  item(C.DATA.units[k].name + ' 成功推进（飞越了建筑）', u.row <= 4, '行' + u.row);
});

console.log('\n=== 三、空中兵能穿过整排封死的建筑 ===');
var s3 = C.createState(); s3.res.blue = 1e6;
for (var c3 = 1; c3 <= C.COLS; c3++) C.placeBuilding(s3, 'blue', 'cannon', 9, c3);
var a3 = C.spawnUnit(s3, 'blue', 'balloon', 11, 5);
for (var t3 = 0; t3 < 20 * 20; t3++) C.update(s3, C.DT);
item('气球兵穿过整排建筑推进到红方半场', a3.row <= 5, '行' + a3.row);

console.log('\n=== 四、任何兵种都不跳格（每帧最多走 1 格）===');
ALL.forEach(function (k) {
  var s = C.createState(); s.res.blue = 1e6;
  [[9, 3], [9, 4], [8, 4], [7, 3], [7, 4], [7, 5], [6, 4], [6, 5]].forEach(function (p) {
    C.placeBuilding(s, 'blue', 'cannon', p[0], p[1]);
  });
  C.deployUnit(s, 'blue', k, 5);
  var u = C.unitsOf(s, 'blue').filter(function (x) { return x.key === k; })[0];
  var tr = [];
  for (var t = 0; t < 20 * 25; t++) {
    if (!u || u.hp <= 0) break;
    C.update(s, C.DT);
    var p = 'r' + u.row + 'c' + u.col;
    if (tr[tr.length - 1] !== p) tr.push(p);
  }
  var jumps = 0;
  for (var i = 1; i < tr.length; i++) {
    var a = tr[i - 1].match(/r(\d+)c(\d+)/), b = tr[i].match(/r(\d+)c(\d+)/);
    if (Math.abs(+a[1] - +b[1]) + Math.abs(+a[2] - +b[2]) > 1) jumps++;
  }
  item(C.DATA.units[k].name + ' 不跳格', jumps === 0, jumps + ' 次');
});

console.log('\n=== 五、通道行不跳格（整排建筑封死的极端情况）===');
ALL.forEach(function (k) {
  var u0 = C.DATA.units[k];
  if (!u0.air) return;   // 只有空中兵会遇到"整排封死"的进场问题
  var s = C.createState(); s.res.blue = 1e6;
  for (var c = 1; c <= C.COLS; c++) C.placeBuilding(s, 'blue', 'cannon', 9, c);
  var u = C.spawnUnit(s, 'blue', k, 11, 5);
  var tr = [];
  for (var t = 0; t < 20 * 15; t++) {
    C.update(s, C.DT);
    if (!u || u.hp <= 0) break;
    var p = 'r' + u.row + 'c' + u.col;
    if (tr[tr.length - 1] !== p) tr.push(p);
  }
  var jumps = 0;
  for (var i = 1; i < tr.length; i++) {
    var a = tr[i - 1].match(/r(\d+)c(\d+)/), b = tr[i].match(/r(\d+)c(\d+)/);
    if (Math.abs(+a[1] - +b[1]) + Math.abs(+a[2] - +b[2]) > 1) jumps++;
  }
  item(C.DATA.units[k].name + ' 在通道行不跳格', jumps === 0, jumps + ' 次');
});

console.log('\n=== 六、电脑把金矿放后方 + 对地/对空都有塔 ===');
['normal', 'hard', 'hell'].forEach(function (d) {
  var s = C.createState({ seed: 900, difficulty: d }); s.aiTeam = 'red';
  for (var t = 0; t < 20 * 280; t++) { C.update(s, C.DT); C.aiUpdate(s, 'red', C.DT); }
  var mines = s.buildings.filter(function (b) { return b.team === 'red' && b.key === 'mine'; });
  item(d + ' 金矿都在后方（行1~3）', mines.length > 0 && mines.every(function (b) { return b.row <= 3; }),
    mines.map(function (b) { return 'r' + b.row; }).join(','));
  var tw = s.buildings.filter(function (b) { return b.team === 'red' && b.def.atk && !b.def.isBase; });
  var aa = tw.filter(function (b) { return b.def.targets === 'both'; }).length;
  var go = tw.filter(function (b) { return b.def.targets === 'ground'; }).length;
  item(d + ' 对空≥1 且 对地≥1', aa >= 1 && go >= 1, '对空' + aa + ' 对地' + go);
  item(d + ' 至少 2 座攻击塔', tw.length >= 2, tw.length + ' 座');
});

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
