/* =============================================================================
 * 弹道与炮口专项验证
 * 用法: node dev/verify-projectile.js
 *
 * 覆盖四条玩家提出的要求：
 *   1. 炮弹从**炮口**出膛，不是从建筑中心凭空长出来
 *   2. 双管炮塔的左右炮口**交替**开火（不是"同一门炮开快一点"）
 *   3. 伤害在弹道**飞到时**结算，不是开火瞬间隔空结算
 *   4. 弹道飞行时长随**攻速**缩放
 * ========================================================================== */
'use strict';
var C = require('../src/logic.js');

var pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '   → ' + extra : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

/* 造一个「蓝方塔 r6c5 + 红方步兵 r5c5」的贴身场景 */
function scene(towerKey, unitKey) {
  var s = C.createState();
  s.res.blue = 1000000;
  var r = C.placeBuilding(s, 'blue', towerKey, 6, 5);
  if (!r.ok) throw new Error('放塔失败: ' + r.why);
  var u = C.spawnUnit(s, 'red', unitKey, 5, 5);
  u.hp = 999999; u.hpMax = 999999;      // 保证目标不会中途死掉，便于观察多轮开火
  return { state: s, b: r.building, u: u };
}

function firstProj(s, ownerId) {
  for (var i = 0; i < s.projectiles.length; i++) {
    if (s.projectiles[i].fromId === ownerId) return s.projectiles[i];
  }
  return null;
}

/* ---------------------------------------------------------------- 1. 出膛点 */
section('1. 炮弹从炮口出膛（不是建筑中心）');
var sc = scene('cannon', 'infantry');
var p1 = null;
for (var i = 0; i < 120 && !p1; i++) { C.update(sc.state, C.DT); p1 = firstProj(sc.state, sc.b.id); }
check('炮塔能开火并产生弹道', !!p1);
if (p1) {
  var cx = 5, cy = 5;                       // 1x1 塔在 r6c5，中心就是 (5,5)（0-based 内的 row/col）
  var dCenter = Math.hypot(p1.from.row - 6, p1.from.col - 5);
  check('出膛点不在建筑格中心', dCenter > 0.2, '距中心 ' + dCenter.toFixed(2));
  check('出膛点在朝目标的炮口方向（向上）', p1.from.row < 6 - 0.1, 'from.row=' + p1.from.row.toFixed(2));
  check('出膛距离约 0.36 格', near(dCenter, 0.36, 0.03), '实测 ' + dCenter.toFixed(3));
  check('弹道终点在目标身上', near(p1.to.row, 5, 0.01) && near(p1.to.col, 5, 0.01));
}

/* ---------------------------------------------------------------- 2. 命中结算 */
section('2. 伤害在弹道飞到时才结算');
var sc2 = scene('cannon', 'infantry');
var hp0 = sc2.u.hp;
var p2 = null, hpAtFire = null;
for (var j = 0; j < 120 && !p2; j++) {
  var before = sc2.u.hp;
  C.update(sc2.state, C.DT);
  var np = firstProj(sc2.state, sc2.b.id);
  if (np && !p2) { p2 = np; hpAtFire = sc2.u.hp; }
}
check('开火瞬间目标没有掉血', hpAtFire === hp0, '开火时 hp=' + (hpAtFire - hp0));
var life2 = p2 ? p2.ttl + C.DT : 0.3;
check('弹道飞行时长 > 0.1s', life2 > 0.1, 'life=' + life2.toFixed(3));
var tFly = 0;
while (tFly < life2 + 0.1) { C.update(sc2.state, C.DT); tFly += C.DT; }
check('弹道飞完后目标掉血', sc2.u.hp < hp0, '掉了 ' + (hp0 - sc2.u.hp));

/* ---------------------------------------------------------------- 3. 双管交替 */
section('3. 双管炮塔左右炮口交替开火');
var sc3 = scene('cannon', 'infantry');
var b3 = sc3.b;
for (var lv = 1; lv < 4; lv++) C.upgradeBuilding(sc3.state, b3);
var up = C.upgradeBuilding(sc3.state, b3, 'twin');
check('炮塔升到 Lv5 并选中「双管」分支', up.ok && b3.branch === 'twin', up.why || '');
var sides = [], lastSeq = 0;
for (var k = 0; k < 400; k++) {
  C.update(sc3.state, C.DT);
  if ((b3.muzzleSeq || 0) > lastSeq) { lastSeq = b3.muzzleSeq; sides.push(b3.muzzleSide); }
}
check('twin 真的开了多轮火', sides.length >= 4, '开火 ' + sides.length + ' 次');
var alternating = sides.length >= 4;
for (var m = 2; m < sides.length; m++) {
  if (sides[m] === sides[m - 1]) alternating = false;
}
check('左右炮口严格交替', alternating, '序列 = ' + sides.join(','));
check('普通炮塔没有左右交替（muzzleSeq 为空）', !sc.b.muzzleSeq, 'muzzleSeq=' + sc.b.muzzleSeq);

/* ---------------------------------------------------------------- 4. 弹速随攻速 */
section('4. 弹道时长随攻速缩放');
function lifeOf(towerKey, intervalHint) {
  var s = C.createState();
  s.res.blue = 1000000;
  var r = C.placeBuilding(s, 'blue', towerKey, 6, 5);
  var u = C.spawnUnit(s, 'red', 'infantry', 5, 5);
  u.hp = 999999; u.hpMax = 999999;
  for (var i = 0; i < 400; i++) {
    C.update(s, C.DT);
    var p = firstProj(s, r.building.id);
    if (p) return { life: p.ttl + C.DT, base: p.proj.baseLife, interval: intervalHint };
  }
  return null;
}
var Lc = lifeOf('cannon', 0.6);
var La = lifeOf('arrow', 0.45);
var Lm = lifeOf('mortar', 2.4);
check('炮塔（攻速 0.6s）弹道 ≈ 0.26×√0.6',
      Lc && near(Lc.life, 0.26 * Math.sqrt(0.6), 0.02), Lc && Lc.life.toFixed(3));
check('箭塔（攻速 0.45s）弹道被压到下限 0.75 倍',
      La && near(La.life, 0.22 * 0.75, 0.02), La && La.life.toFixed(3));
check('迫击炮（攻速 2.4s）弹道被拉到上限 1.3 倍',
      Lm && near(Lm.life, 0.70 * 1.3, 0.03), Lm && Lm.life.toFixed(3));
check('攻速越慢 → 弹道越长（迫击炮 > 炮塔 > 箭塔）',
      Lm && Lc && La && Lm.life > Lc.life && Lc.life > La.life,
      Lm && Lc && La && [Lm.life, Lc.life, La.life].map(function (v) { return v.toFixed(2); }).join(' > '));

/* ---------------------------------------------------------------- 5. 近战不延迟 */
section('5. 近战（挥砍/撞击）仍然是即时命中');
var s5 = C.createState();
s5.res.blue = 1000000;
var r5 = C.placeBuilding(s5, 'blue', 'cannon', 6, 5);
var siege = C.spawnUnit(s5, 'red', 'siege', 5, 5);
var hpBefore = r5.building.hp, sawMelee = false, instantOk = false;
for (var n = 0; n < 240; n++) {
  var prev = r5.building.hp;
  C.update(s5, C.DT);
  var mp = firstProj(s5, siege.id);
  if (mp && mp.proj.type === 'slash' && !sawMelee) {
    sawMelee = true;
    instantOk = (r5.building.hp < prev);   // 挥砍发生的同一帧建筑就已经掉血
    break;
  }
}
check('攻城兵对建筑产生了挥砍弹道', sawMelee);
check('挥砍的伤害是即时结算（同一帧扣血）', instantOk);
check('挥砍弹道不挂延迟结算载荷（hit 为 null）',
      (function () { var q = firstProj(s5, siege.id); return !q || q.hit === null; })());

console.log('\n===============================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('===============================');
process.exit(fail ? 1 : 0);
