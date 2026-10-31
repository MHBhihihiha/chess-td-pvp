/* 建筑炮口转向专项测试
 * 验证：建筑会记录瞄准点、瞄准点会随敌人移动而改变、角度计算正确
 */
var C = require('../src/logic.js');
var pass = 0, fail = 0;
function item(name, ok, extra) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  [' + extra + ']' : '')); }
}

function fresh() {
  var s = C.createState({ seed: 1 });
  s.res.blue = 1e6; s.res.red = 1e6;
  return s;
}

console.log('=== 一、有目标时会记录瞄准点 ===');
['cannon', 'arrow', 'mage', 'mortar', 'tesla'].forEach(function (k) {
  var s = fresh();
  var b = C.placeBuilding(s, 'blue', k, 6, 1).building;
  var u = C.spawnUnit(s, 'red', 'infantry', 6, 2);   // 紧邻，射程内
  u.hp = u.hpMax = 99999;
  for (var t = 0; t < 20; t++) C.update(s, C.DT);
  item(C.DATA.buildings[k].name + ' 记录了瞄准点', b.aimRow != null && b.aimCol != null,
    'aim=r' + b.aimRow + 'c' + b.aimCol);
});

console.log('\n=== 二、没有目标时不记录（不会对着空气转）===');
(function () {
  var s = fresh();
  var b = C.placeBuilding(s, 'blue', 'cannon', 6, 1).building;
  C.spawnUnit(s, 'red', 'infantry', 1, 1);   // 太远
  for (var t = 0; t < 40; t++) C.update(s, C.DT);
  item('目标在射程外 → 没有瞄准点', b.aimRow == null, 'aim=' + b.aimRow);
})();

console.log('\n=== 三、敌人移动 → 瞄准点跟着变 ===');
(function () {
  var s = fresh();
  var b = C.placeBuilding(s, 'blue', 'arrow', 6, 1).building;   // 射程 2
  var u = C.spawnUnit(s, 'red', 'infantry', 6, 3);
  u.hp = u.hpMax = 99999;
  for (var t = 0; t < 20; t++) C.update(s, C.DT);
  var before = { r: b.aimRow, c: b.aimCol };
  // 把敌人移到另一侧
  u.row = 5; u.col = 2;
  for (var t2 = 0; t2 < 20; t2++) C.update(s, C.DT);
  var after = { r: b.aimRow, c: b.aimCol };
  item('瞄准点随敌人移动更新', before.r !== after.r || before.c !== after.c,
    'r' + before.r + 'c' + before.c + ' → r' + after.r + 'c' + after.c);
})();

console.log('\n=== 四、角度计算正确（四个方向）===');
(function () {
  var s = fresh();
  var b = C.placeBuilding(s, 'blue', 'tesla', 6, 2).building;   // 射程 2
  var u = C.spawnUnit(s, 'red', 'infantry', 6, 3);
  u.hp = u.hpMax = 99999;

  function ang() {
    // 复刻渲染层的角度计算
    var dx = b.aimCol - b.col, dy = b.aimRow - b.row;
    return Math.atan2(dy, dx) * 180 / Math.PI;
  }
  /* 注意：敌人自己会移动，所以要**每帧把它钉回指定位置**，
   * 否则测到的角度是它跑开之后的（第一次写这个测试就踩了坑）。 */
  function pinTo(r, c) {
    for (var t = 0; t < 20; t++) {
      u.row = r; u.col = c;
      u.moveProg = 0; u.nextStep = null;
      C.update(s, C.DT);
    }
  }

  pinTo(6, b.col + 1);
  item('敌在右侧 → 角度 ≈ 0°', Math.abs(ang()) < 12, ang().toFixed(0) + '°');
  pinTo(6, b.col + 2);
  item('敌在右侧 2 格 → 角度 ≈ 0°', Math.abs(ang()) < 12, ang().toFixed(0) + '°');

  pinTo(b.row + 1, b.col);
  item('敌在下方 → 角度 ≈ 90°', Math.abs(ang() - 90) < 12, ang().toFixed(0) + '°');

  pinTo(b.row, b.col - 1);
  item('敌在左侧 → 角度 ≈ ±180°', Math.abs(Math.abs(ang()) - 180) < 12, ang().toFixed(0) + '°');

  pinTo(b.row - 1, b.col);
  item('敌在上方 → 角度 ≈ -90°', Math.abs(ang() + 90) < 12, ang().toFixed(0) + '°');

  pinTo(b.row - 1, b.col + 1);
  item('敌在右上 → 角度 ≈ -45°', Math.abs(ang() + 45) < 12, ang().toFixed(0) + '°');
})();

console.log('\n=== 五、防御塔没有攻击 → 不画炮口 ===');
(function () {
  var s = fresh();
  var b = C.placeBuilding(s, 'blue', 'ward', 6, 1).building;
  var canAtk = b.def.isBase || (b.def.atk && b.def.atk > 0);
  item('防御塔 hasAtk=false（渲染层不画炮口）', !canAtk);
})();

console.log('\n=== 六、大本营也会转向 ===');
(function () {
  var s = C.createState();
  s.res.red = 1e6;
  var base = C.ownBase(s, 'red');
  var u = C.spawnUnit(s, 'blue', 'infantry', 3, 5);   // 红方大本营射程内
  u.hp = u.hpMax = 99999;
  for (var t = 0; t < 30; t++) C.update(s, C.DT);
  item('大本营记录了瞄准点', base.aimRow != null, 'aim=r' + base.aimRow + 'c' + base.aimCol);
})();

console.log('\n=== 七、被冰冻时停止瞄准（不转）===');
(function () {
  var s = fresh();
  var b = C.placeBuilding(s, 'blue', 'cannon', 6, 1).building;
  var u = C.spawnUnit(s, 'red', 'infantry', 6, 2);
  u.hp = u.hpMax = 99999;
  for (var t = 0; t < 20; t++) C.update(s, C.DT);
  var before = b.aimRow;
  // 冰冻这座塔
  s.time = 10;
  b.frozenUntil = 14;
  u.row = 5; u.col = 2;   // 敌人换位置
  for (var t2 = 0; t2 < 20; t2++) C.update(s, C.DT);
  item('冰冻期间瞄准点不更新', b.aimRow === before, '仍为 r' + b.aimRow);
})();

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
