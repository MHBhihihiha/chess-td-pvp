/* 弹道可视化专项测试
 * 踩过的两个坑（都写进本文件）：
 *  ① 双方大本营自带 4×4 自卫射程 → 测试塔/兵时别靠近 c5-6，否则抓到的是大本营的弹道
 *  ② 战场上有多个单位在互相攻击 → 必须按 **attacker 的 key** 过滤，
 *     不能直接取 projectiles[0]
 */
var C = require('../src/logic.js');
var pass = 0, fail = 0;
function item(name, ok, extra) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  [' + extra + ']' : '')); }
}

/* 抓「指定攻击者」产生的第一发弹道 */
function shotBy(s, attackerKey, maxTicks) {
  maxTicks = maxTicks || 20 * 8;
  for (var t = 0; t < maxTicks; t++) {
    C.update(s, C.DT);
    for (var i = 0; i < s.projectiles.length; i++) {
      var p = s.projectiles[i];
      if (p.fromKey === attackerKey) return p;
    }
  }
  return null;
}

/* 塔打兵：塔和敌兵都放在远离大本营的位置 */
function towerShot(key) {
  var s = C.createState({ seed: 1 });
  s.res.blue = 1e6; s.res.red = 1e6;
  var r = C.placeBuilding(s, 'blue', key, 6, 1);
  if (!r.ok) return null;
  C.spawnUnit(s, 'red', 'infantry', 5, 1);
  s.projectiles.length = 0;
  return shotBy(s, key);
}

console.log('=== 一、每种建筑的弹道外观 ===');
var expect = {
  cannon: { type: 'ball', arcMin: 0.05 },
  arrow: { type: 'arrow', arcMin: 0.0 },
  mage: { type: 'orb', arcMin: 0 },
  mortar: { type: 'shell', arcMin: 0.30 },
  tesla: { type: 'volt', arcMin: 0 }
};
Object.keys(expect).forEach(function (k) {
  var p = towerShot(k);
  if (!p) { item(k + ' 能发射弹道', false, '没有弹道'); return; }
  var e = expect[k];
  item(k + ' 弹道类型=' + e.type, p.proj.type === e.type, '实际 ' + p.proj.type);
  item(k + ' 有飞行时长', p.ttl > 0 && p.ttl <= 1.0, 'ttl=' + p.ttl.toFixed(2));
  item(k + ' 有出生时间（渲染插值用）', p.born !== undefined, 'born=' + p.born);
  if (e.arcMin > 0) item(k + ' 有抛物线弧度', p.proj.arc >= e.arcMin, 'arc=' + p.proj.arc);
});

console.log('\n=== 二、大本营的自卫弹道 ===');
(function () {
  var s = C.createState(); s.res.red = 1e6;
  C.spawnUnit(s, 'blue', 'infantry', 3, 5);   // 红方大本营 r1-2 c5-6 的自卫圈内
  s.projectiles.length = 0;
  var got = shotBy(s, 'base');
  item('大本营能发射自卫弹道', !!got);
  if (got) item('大本营弹道类型=orb', got.proj.type === 'orb', '实际 ' + got.proj.type);
})();

console.log('\n=== 三、每种兵种的弹道外观 ===');
var unitExpect = {
  archer: 'arrow',
  balloon: 'ball',
  airship: 'ball',
  dragon: 'orb',
  infantry: 'slash',
  heavy: 'slash',
  siege: 'slash',
  ram: 'crit'
};
Object.keys(unitExpect).forEach(function (k) {
  var s = C.createState(); s.res.blue = 1e6; s.res.red = 1e6;
  var u = C.spawnUnit(s, 'blue', k, 6, 1);      // 远离大本营
  /* 拆建筑型（siege/ram）不打兵，必须给它一个建筑目标 */
  var isSiege = (C.DATA.units[k].priority === 'siege');
  var foe;
  if (isSiege) {
    var tb = C.placeBuilding(s, 'red', 'cannon', 5, 1);
    foe = tb.ok ? tb.building : null;
  } else {
    foe = C.spawnUnit(s, 'red', 'infantry', 6, 2);
    foe.hp = foe.hpMax = 99999;
  }
  if (!foe) { item(C.DATA.units[k].name + ' 有可打目标', false, '目标创建失败'); return; }
  s.projectiles.length = 0;
  /* 注意：空中兵会一直往前飞，敌人很快脱离射程。
   * 所以每帧把目标"钉"在它旁边，模拟持续交战。 */
  var got = null;
  for (var t = 0; t < 20 * 8 && !got; t++) {
    C.update(s, C.DT);
    foe.row = u.row; foe.col = Math.min(10, u.col + 1);
    for (var i2 = 0; i2 < s.projectiles.length; i2++) {
      if (s.projectiles[i2].fromKey === k) { got = s.projectiles[i2]; break; }
    }
  }
  if (!got) { item(C.DATA.units[k].name + ' 能产生弹道', false, '没有弹道'); return; }
  item(C.DATA.units[k].name + ' 弹道类型=' + unitExpect[k],
    got.proj.type === unitExpect[k], '实际 ' + got.proj.type);
});

console.log('\n=== 四、弹道终点会跟随移动中的目标 ===');
(function () {
  var s = C.createState(); s.res.blue = 1e6;
  C.placeBuilding(s, 'blue', 'cannon', 6, 1);
  var foe = C.spawnUnit(s, 'red', 'infantry', 5, 1);
  foe.hp = foe.hpMax = 99999;
  s.projectiles.length = 0;
  var p = shotBy(s, 'cannon');
  if (!p) { item('能产生弹道', false); return; }
  var before = JSON.stringify(p.to);
  foe.row = 5; foe.col = 2;
  for (var t2 = 0; t2 < 3; t2++) C.update(s, C.DT);
  var after = JSON.stringify(p.to);
  item('弹道终点跟随移动目标', before !== after || p.ttl <= 0, before + ' → ' + after);
})();

console.log('\n=== 五、弹道不会无限堆积 ===');
(function () {
  var s = C.createState(); s.res.blue = 1e6;
  C.placeBuilding(s, 'blue', 'cannon', 6, 1);
  var foe = C.spawnUnit(s, 'red', 'infantry', 5, 1);
  foe.hp = foe.hpMax = 99999;
  var peak = 0;
  for (var t = 0; t < 20 * 10; t++) {
    C.update(s, C.DT);
    peak = Math.max(peak, s.projectiles.length);
  }
  item('弹道峰值受控（≤30）', peak <= 30, '峰值 ' + peak);
})();

console.log('\n=== 六、不同弹道有颜色区分度 ===');
(function () {
  var colors = {};
  ['cannon', 'arrow', 'mage', 'mortar', 'tesla'].forEach(function (k) {
    var p = towerShot(k);
    if (p) colors[k] = p.proj.color;
  });
  var uniq = {};
  Object.keys(colors).forEach(function (k) { uniq[colors[k]] = 1; });
  item('至少 4 种不同颜色', Object.keys(uniq).length >= 4,
    Object.keys(uniq).length + ' 种: ' + Object.keys(uniq).join(' '));
})();


console.log('\n=== 七、迫击炮：3×3 溅射 + 高抛远程弹道 ===');
(function () {
  var s = C.createState(); s.res.blue = 1e6; s.res.red = 1e6;
  // 塔放 r6c1（远离蓝方大本营 r9-10 c5-6，避免被自卫攻击干扰）
  var b = C.placeBuilding(s, 'blue', 'mortar', 6, 1).building;
  item('迫击炮有 splash=1（3×3 范围）', C.statsForLevel(b.def, 1).splash === 1,
    'splash=' + C.statsForLevel(b.def, 1).splash);

  var pos = [[5, 1], [4, 1], [5, 2], [4, 2], [3, 1], [6, 2]];
  var us = pos.map(function (p) {
    var u = C.spawnUnit(s, 'red', 'infantry', p[0], p[1]);
    u.hp = u.hpMax = 99999;
    return u;
  });
  var shot = null;
  for (var t = 0; t < 400; t++) {
    us.forEach(function (u, i) {
      u.row = pos[i][0]; u.col = pos[i][1]; u.moveProg = 0; u.nextStep = null;
    });
    C.update(s, C.DT);
    shot = s.projectiles.filter(function (x) { return x.fromKey === 'mortar'; })[0];
    if (shot) break;
  }
  if (!shot) { item('迫击炮开火', false); return; }
  /* 伤害走「弹道飞到才结算」（resolveProjectile）：group 模式每颗炮弹各打
   * 一个 3×3 内的目标，必须等这一批炮弹全部落地（ttl<=0 被移除）再查血量，
   * 不能在炮弹出现的瞬间就检查 —— 那是开火，不是命中。 */
  for (var tw = 0; tw < 200; tw++) {
    us.forEach(function (u, i) {
      u.row = pos[i][0]; u.col = pos[i][1]; u.moveProg = 0; u.nextStep = null;
    });
    C.update(s, C.DT);
    if (!s.projectiles.some(function (x) { return x.fromKey === 'mortar'; })) break;
  }
  var tr = Math.round(shot.to.row), tc = Math.round(shot.to.col);
  item('主目标被命中', us[0].hp < 99999);
  item('上下相邻格被溅射', us[1].hp < 99999 && us[2].hp < 99999);
  item('斜角格也被溅射（3×3 完整）', us[3].hp < 99999, 'r4c2');
  item('距离 2 的格子不受影响', us[4].hp === 99999, 'r3c1');

  // 弹道外观：高抛 + 长飞行
  item('弹道类型=shell', shot.proj.type === 'shell', shot.proj.type);
  item('高抛弧线（arc ≥ 0.6）', shot.proj.arc >= 0.6, 'arc=' + shot.proj.arc);
  item('飞行时长 ≥ 0.6s（能看清上天→落下）', shot.proj.life >= 0.6, 'life=' + shot.proj.life);
  item('弹道带 aoe 信息（渲染层画预警圈）', shot.proj.aoe === 1, 'aoe=' + shot.proj.aoe);
})();

console.log('\n=== 八、箭塔射的是箭，法师塔射的是法球 ===');
['arrow', 'mage'].forEach(function (k) {
  var s = C.createState(); s.res.blue = 1e6; s.res.red = 1e6;
  C.placeBuilding(s, 'blue', k, 6, 1);
  C.spawnUnit(s, 'red', 'infantry', 5, 1);
  var shot = null;
  for (var t = 0; t < 300; t++) {
    C.update(s, C.DT);
    shot = s.projectiles.filter(function (x) { return x.fromKey === k; })[0];
    if (shot) break;
  }
  var want = (k === 'arrow') ? 'arrow' : 'orb';
  item(C.DATA.buildings[k].name + ' 弹道类型=' + want,
    !!shot && shot.proj.type === want, shot ? shot.proj.type : '无弹道');
});
console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
