/* 冰冻法术专项测试：士兵不能动/不能打、建筑不能开火、解冻后恢复 */
var C = require('../src/logic.js');
var pass = 0, fail = 0;
function item(name, ok, extra) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  [' + extra + ']' : '')); }
}

console.log('=== 冰冻法术（4 秒）===');
var sp = null;
C.DATA.spells.forEach(function (x) { if (x.key === 'freeze') sp = x; });
item('冰冻法术存在且时长为 4 秒', sp && sp.frozen === 4, sp ? sp.frozen : 'none');
item('冰冻范围 2×2', sp && sp.aoe === 1, sp ? sp.aoe : 'none');

// ① 士兵：不能移动
var s = C.createState(); s.res.blue = 1e6; s.baseLevel.blue = 6;
var u = C.spawnUnit(s, 'red', 'infantry', 6, 3);
C.castSpell(s, 'blue', 'freeze', 6, 3);
var moved = 0;
for (var i = 0; i < 20 * 4; i++) { var b = 'r' + u.row + 'c' + u.col; C.update(s, C.DT); if ('r' + u.row + 'c' + u.col !== b) moved++; }
item('士兵被冰冻期间不能移动', moved === 0, '移动了 ' + moved + ' 次');
var moved2 = 0;
for (var j = 0; j < 20 * 3; j++) { var b2 = 'r' + u.row + 'c' + u.col; C.update(s, C.DT); if ('r' + u.row + 'c' + u.col !== b2) moved2++; }
item('解冻后士兵恢复移动', moved2 > 0, '移动了 ' + moved2 + ' 次');

// ② 士兵：不能攻击
var s2 = C.createState(); s2.res.blue = 1e6; s2.baseLevel.blue = 6;
var me = C.spawnUnit(s2, 'red', 'infantry', 6, 5);
var foe = C.spawnUnit(s2, 'blue', 'heavy', 6, 6);
foe.def = Object.assign({}, foe.def, { speed: 0 });
C.castSpell(s2, 'blue', 'freeze', 6, 5);
var hp0 = foe.hp;
for (var k = 0; k < 20 * 4; k++) C.update(s2, C.DT);
item('士兵被冰冻期间不能攻击', foe.hp >= hp0 - 0.01, '造成 ' + (hp0 - foe.hp).toFixed(1) + ' 伤害');

// ③ 建筑：不能开火
var s3 = C.createState(); s3.res.blue = 1e6; s3.res.red = 1e6; s3.baseLevel.blue = 6;
var t = C.placeBuilding(s3, 'red', 'cannon', 5, 5).building;
var v = C.spawnUnit(s3, 'blue', 'heavy', 6, 5);
v.def = Object.assign({}, v.def, { speed: 0 });
var h0 = v.hp;
C.castSpell(s3, 'blue', 'freeze', 5, 5);
for (var m = 0; m < 20 * 4; m++) C.update(s3, C.DT);
item('建筑被冰冻期间不能攻击', v.hp >= h0 - 0.01, '造成 ' + (h0 - v.hp).toFixed(1) + ' 伤害');
var h1 = v.hp;
for (var n = 0; n < 20 * 4; n++) C.update(s3, C.DT);
item('解冻后建筑恢复攻击', v.hp < h1, '造成 ' + (h1 - v.hp).toFixed(1) + ' 伤害');

// ④ 大本营也能被冻
var s4 = C.createState(); s4.res.blue = 1e6; s4.res.red = 1e6; s4.baseLevel.blue = 6;
var bb = C.ownBase(s4, 'red');
var v2 = C.spawnUnit(s4, 'blue', 'heavy', 2, 5);
v2.def = Object.assign({}, v2.def, { speed: 0 });
var bh0 = v2.hp;
C.castSpell(s4, 'blue', 'freeze', 2, 5);
for (var q = 0; q < 20 * 4; q++) C.update(s4, C.DT);
item('大本营被冰冻期间不能开火', v2.hp >= bh0 - 0.01, '造成 ' + (bh0 - v2.hp).toFixed(1) + ' 伤害');

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
