/* 攻城车（拆建筑型）+ 单位脱困 专项测试
 * 覆盖两个实测出来的 bug：
 *   1. 攻城车改成拆建筑型后，对建筑倍率还是旧的 0.7 → 拆不动建筑
 *   2. 出生在己方大本营格上的单位会被判成"彻底堵死"→ 永远站着不动
 */
var C = require('../src/logic.js');
var pass = 0, fail = 0;
function item(name, ok, extra) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  [' + extra + ']' : '')); }
}
var U = C.DATA.units;

console.log('=== 一、攻城车属性 ===');
item('攻城车血量 = 1480（v19：1680 → 1480）', U.ram.hp === 1480, U.ram.hp);
item('攻城车定位 = 拆建筑型（只拆建筑和大本营）', U.ram.priority === 'siege', U.ram.priority);
item('攻城车只对地', U.ram.targets === 'ground', U.ram.targets);
item('攻城车是地面单位', !U.ram.air, U.ram.air);
item('攻城车价格 270 / 攻击 32 / 间隔 1.4 / 护甲 5 / 速度 1.1 / 血 1480（v19b 提速）',
  U.ram.cost === 270 && U.ram.atk === 32 && U.ram.atkInterval === 1.4 &&
  U.ram.armor === 5 && U.ram.speed === 1.1 && U.ram.hp === 1480,
  JSON.stringify({ c: U.ram.cost, a: U.ram.atk, hp: U.ram.hp, i: U.ram.atkInterval, ar: U.ram.armor, s: U.ram.speed }));

console.log('\n=== 二、攻城车的目标选择 ===');
var s = C.createState(); s.res.blue = 1e6;
var tower = C.placeBuilding(s, 'red', 'cannon', 5, 3).building;
var foe = C.spawnUnit(s, 'red', 'infantry', 5, 4);
var ram = C.spawnUnit(s, 'blue', 'ram', 5, 2);
var sets = C.candidateSets(s, ram);
item('候选目标里没有任何敌兵', !sets.groups[0].some(function (x) { return x.kind === 'unit'; }),
  JSON.stringify(sets.groups[0].map(function (x) { return x.key || x.def.key; })));
item('打不到紧邻的敌兵', C.pickTarget(s, ram) !== foe, C.pickTarget(s, ram) ? C.pickTarget(s, ram).key : 'null');

console.log('\n=== 三、攻城车真的能拆建筑（倍率必须 1.4）===');
var s2 = C.createState(); s2.res.blue = 1e6;
var t2 = C.placeBuilding(s2, 'red', 'cannon', 3, 5).building;
var r2 = C.spawnUnit(s2, 'blue', 'ram', 4, 5);
var h0 = t2.hp;
for (var i = 0; i < 20 * 6; i++) C.update(s2, C.DT);
var dealt = h0 - Math.max(0, t2.hp);
/* v19：攻城车攻击 92 → 32（−60）。拆建筑倍率仍是 ×1.4（每击 32×1.4≈44.8，约 32/秒），
 * 含接近 + 起手开销后 6 秒实测 ≈138（23/秒）。阈值据此下调，但仍必须显著高于
 * 「若误用普通兵 0.35 倍率」的 ~8/秒，以锁定 ×1.4 倍率确实生效。 */
item('6 秒内对建筑造成明显伤害（>90，×1.4 倍率生效）', dealt > 90, '造成 ' + dealt.toFixed(0) + ' 伤害');
var dps = dealt / 6;
item('对建筑 DPS 在 14~45 之间（×1.4 倍率：基础 ~32/秒，含接近开销）', dps > 14 && dps < 45, dps.toFixed(1) + '/秒');

console.log('\n=== 四、单位从己方大本营格脱困 ===');
['infantry', 'heavy', 'siege', 'ram', 'archer', 'balloon', 'airship', 'dragon'].forEach(function (k) {
  var sc = C.createState(); sc.res.blue = 1e6;
  var u = C.spawnUnit(sc, 'blue', k, 10, 5);   // 蓝方大本营占 r9-10 c5-6
  for (var j = 0; j < 20 * 12; j++) C.update(sc, C.DT);
  item(C.DATA.units[k].name + ' 能从蓝方大本营格走出来', u.row !== 10 || u.col !== 5,
    'r' + u.row + 'c' + u.col);
});
['infantry', 'heavy', 'archer', 'ram'].forEach(function (k) {
  var sc = C.createState(); sc.res.red = 1e6;
  var u = C.spawnUnit(sc, 'red', k, 1, 5);     // 红方大本营占 r1-2 c5-6
  for (var j = 0; j < 20 * 12; j++) C.update(sc, C.DT);
  item(C.DATA.units[k].name + ' 能从红方大本营格走出来', u.row !== 1 || u.col !== 5,
    'r' + u.row + 'c' + u.col);
});

console.log('\n=== 五、攻城车直奔敌方大本营 ===');
var s3 = C.createState({ seed: 1 }); s3.res.blue = 1e6;
C.deployUnit(s3, 'blue', 'ram', 5);
var r3 = C.unitsOf(s3, 'blue').filter(function (x) { return x.key === 'ram'; })[0];
var rb = C.ownBase(s3, 'red');
var bh0 = rb.hp;
for (var m = 0; m < 20 * 90; m++) C.update(s3, C.DT);
item('攻城车抵达并拆掉了红方大本营', rb.hp < bh0, '大本营 ' + bh0 + ' → ' + rb.hp.toFixed(0));

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
