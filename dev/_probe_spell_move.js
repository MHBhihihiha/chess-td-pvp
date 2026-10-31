/* 探针：法术对「移动中的单位」是否真的造成伤害？
 * 运行： node dev/_probe_spell_move.js
 *
 * 疑点（玩家反馈）：火球 2×2 / 火箭 1×1 打移动中的敌军「好像没作用」，
 * 而箭雨 3×3 感觉正常。三种可能：
 *   ① 逻辑层：castSpell → spellTargets 用 u.row/u.col 判定，位移是「跨格才改 row/col」，
 *      所以走到一半的单位，逻辑格仍是**出发格**，而画面已经插值到下一格。
 *      → 玩家照着画面点，1×1 会打空；2×2 只有一半概率命中。
 *   ② UI 层：pointToCell 的格子映射有偏移。
 *   ③ 渲染层：特效画了但没画在单位身上，看起来像"没效果"。
 * 本探针只验 ①（纯逻辑，可复现）。 */
var C = require('../src/logic.js');

var DT = 1 / 20;

function fresh() {
  var s = C.createState();
  s.res.blue = 1e6; s.res.red = 1e6;
  s.baseLevel.blue = 6;          // 解锁全部法术（1 级只有箭雨）
  return s;
}

/* 派一个红方步兵并让它走到「半格」状态 */
function movingRed(key) {
  var s = fresh();
  var r = C.deployUnit(s, 'red', key || 'infantry', 3);
  if (!r.ok) throw new Error('派兵失败：' + r.why);
  var u = s.units[s.units.length - 1];
  // 前进到 moveProg 落在 0.2~0.9 之间（也就是视觉上在两格之间），且已经进入棋盘内
  for (var i = 0; i < 400; i++) {
    C.update(s, DT);
    if (u.hp <= 0) break;
    var mp = u.moveProg || 0;
    if (mp > 0.25 && mp < 0.95 && u.nextStep && u.row >= 1) break;
  }
  return { s: s, u: u };
}

console.log('=== 1. 单位移动的坐标语义 ===');
var m = movingRed('infantry');
var u = m.u;
console.log('  逻辑格 row/col      = ' + u.row + ',' + u.col);
console.log('  下一格 nextStep     = ' + (u.nextStep ? u.nextStep.r + ',' + u.nextStep.c : 'null'));
console.log('  进度 moveProg       = ' + (u.moveProg || 0).toFixed(3));
console.log('  → 画面位置约在      = ' + (u.row + (u.nextStep ? (u.nextStep.r - u.row) * (u.moveProg || 0) : 0)).toFixed(2) +
            ' 行（逻辑格仍是出发格）');

console.log('\n=== 2. 打「逻辑格」（u.row/u.col）===');
[['arrowRain', 90], ['fireball', 200], ['rocket', 420]].forEach(function (pair) {
  var key = pair[0];
  var t = movingRed('infantry');
  var hp0 = t.u.hp;
  var res = C.castSpell(t.s, 'blue', key, t.u.row, t.u.col);
  console.log('  ' + key.padEnd(10) + ' ok=' + res.ok + ' hits=' + (res.hits == null ? '-' : res.hits) +
    '  血量 ' + hp0.toFixed(0) + ' → ' + t.u.hp.toFixed(1) + '  Δ=' + (hp0 - t.u.hp).toFixed(1));
});

console.log('\n=== 3. 打「画面格」（nextStep，玩家照画面点的就是这个）===');
[['arrowRain', 90], ['fireball', 200], ['rocket', 420]].forEach(function (pair) {
  var key = pair[0];
  var t = movingRed('infantry');
  var ns = t.u.nextStep;
  if (!ns) { console.log('  ' + key + '：没拿到 nextStep，跳过'); return; }
  var hp0 = t.u.hp;
  var res = C.castSpell(t.s, 'blue', key, ns.r, ns.c);
  console.log('  ' + key.padEnd(10) + ' 落点 ' + ns.r + ',' + ns.c + '  ok=' + res.ok + ' hits=' + (res.hits == null ? '-' : res.hits) +
    '  血量 ' + hp0.toFixed(0) + ' → ' + t.u.hp.toFixed(1) + '  Δ=' + (hp0 - t.u.hp).toFixed(1));
});

console.log('\n=== 4. 静止单位对照组（站在棋盘内不动）===');
[['arrowRain', 90], ['fireball', 200], ['rocket', 420]].forEach(function (pair) {
  var key = pair[0];
  var s = fresh();
  var t = C.spawnUnit(s, 'red', 'infantry', 5, 4);
  t.frozenUntil = 999;                      // 冻住，保证不动（也不会有 nextStep）
  for (var i = 0; i < 5; i++) C.update(s, DT);
  var hp0 = t.hp;
  var res = C.castSpell(s, 'blue', key, t.row, t.col);
  console.log('  ' + key.padEnd(10) + ' ok=' + res.ok + ' hits=' + (res.hits == null ? '-' : res.hits) +
    '  血量 ' + hp0.toFixed(0) + ' → ' + t.hp.toFixed(1) + '  Δ=' + (hp0 - t.hp).toFixed(1));
});

console.log('\n=== 5. 反向护栏：站着不动的兵不该被「下一格」白吃一发 ===');
var s5 = fresh();
var t5 = C.spawnUnit(s5, 'red', 'infantry', 5, 4);
t5.frozenUntil = 999;
for (var k5 = 0; k5 < 5; k5++) C.update(s5, DT);
var behind = { row: 5, col: 6 };            // 距离 2 格：1×1 火箭不该命中
var r5 = C.castSpell(s5, 'blue', 'rocket', behind.row, behind.col);
console.log('  火箭落在距离 2 格处 → hits=' + r5.hits + '（应为 1，且只打中格子里的东西）  目标血量 ' + t5.hp.toFixed(0));
