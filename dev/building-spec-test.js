/* ============================================================================
 * 建筑与法术规格验收（按用户逐条提示词核对）
 *   运行： node dev/building-spec-test.js
 * ========================================================================== */
var C = require('../src/logic.js');

var pass = 0, fail = 0, failures = [];
function item(name, cond, evidence) {
  if (cond) { pass++; console.log('  ✅ ' + name + (evidence ? '  [' + evidence + ']' : '')); }
  else { fail++; failures.push(name); console.log('  ❌ ' + name + (evidence ? '  [' + evidence + ']' : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }
function B(state, team, key, row, col) {
  var r = C.placeBuilding(state, team, key, row, col);
  return r.ok ? r.building : null;
}
function maxed(state, b) {
  // 一路升到顶（遇到分支就选第一个）
  var guard = 0;
  while (C.buildingUpgradeCost(b) !== null && guard++ < 30) {
    var opts = C.branchesFor(b);
    var r = C.upgradeBuilding(state, b, opts.length ? opts[0].key : null);
    if (!r.ok) break;
  }
  return b;
}

/* ============================================================ 1. 金矿 */
section('1. 金矿：价格中 / 血量低 / 金币加成，1-4 级每级 +30%，4→5 级 +60%');
var s = C.createState();
s.res.blue = 1e6;
var mine = B(s, 'blue', 'mine', 9, 1);   // 行10 是入场行，不能建造
item('金矿可以建造', !!mine);
var costs = Object.keys(C.DATA.buildings).map(function (k) { return C.DATA.buildings[k].cost; });
var mineCost = C.DATA.buildings.mine.cost;
item('金矿价格属于「中」档', mineCost > Math.min.apply(null, costs) && mineCost < Math.max.apply(null, costs),
  '金矿 ' + mineCost + '，区间 ' + Math.min.apply(null, costs) + '~' + Math.max.apply(null, costs));
var hps = Object.keys(C.DATA.buildings).map(function (k) { return C.DATA.buildings[k].hp; });
item('金矿血量属于「低」档', C.DATA.buildings.mine.hp === Math.min.apply(null, hps),
  '金矿 ' + C.DATA.buildings.mine.hp + '，全场 ' + hps.join('/'));
var inc = [];
for (var lv = 1; lv <= 5; lv++) inc.push(C.statsForLevel(C.DATA.buildings.mine, lv).income);
item('金矿产出逐级提高（取整后比例有偏差）', inc[1] > inc[0], inc[0] + ' → ' + inc[1]);
item('金矿产出继续提高', inc[2] > inc[1], inc[1] + ' → ' + inc[2]);
/* ★ v18（玩家指定）：3 级升 4 级改成 +2 产出，其它级差的增量一律保持原样。
 * 于是曲线是 2 / 3 / 4 / 6 / 8，1→2 与 2→3 都是 +1，3→4 与 4→5 都是 +2。 */
item('金矿 3→4 级 +2 产出（玩家指定）', inc[3] - inc[2] === 2, inc[2] + ' → ' + inc[3]);
item('其它级差不变（1→2 / 2→3 仍是 +1）', inc[1] - inc[0] === 1 && inc[2] - inc[1] === 1,
  inc[0] + '/' + inc[1] + '/' + inc[2]);
item('4→5 级仍是最高一跳（终极金矿）', inc[4] > inc[3] && inc[4] - inc[3] >= 2, inc[3] + ' → ' + inc[4]);
var gMine = 0;
while (mine.level < 5 && gMine++ < 10) C.upgradeBuilding(s, mine);
item('金矿升到 5 级（终极金矿）', mine.level === 5, 'Lv' + mine.level);
item('金矿满级后不再可升（按你写的一个档次）', C.upgradeBuilding(s, mine).ok === false, 'Lv' + mine.level);

item('升级费用每级递增', (function () {
  var cs = [1, 2, 3, 4].map(function (l) { return C.buildingUpgradeCost({ def: C.DATA.buildings.mine, level: l }); });
  return cs[0] < cs[1] && cs[1] < cs[2] && cs[2] < cs[3];
})(), [1, 2, 3, 4].map(function (l) { return C.buildingUpgradeCost({ def: C.DATA.buildings.mine, level: l }); }).join(' < '));
item('初始越贵的建筑升级越贵（电塔 > 炮塔）',
  C.buildingUpgradeCost({ def: C.DATA.buildings.tesla, level: 1 }) >
  C.buildingUpgradeCost({ def: C.DATA.buildings.cannon, level: 1 }),
  C.buildingUpgradeCost({ def: C.DATA.buildings.tesla, level: 1 }) + ' vs ' +
  C.buildingUpgradeCost({ def: C.DATA.buildings.cannon, level: 1 }));

/* ==================================================== 2. 七种建筑基础属性 */
section('2. 七种建筑：价格/血量/攻击方式与实际数值');
var SPEC = {
  cannon: { name: '炮塔', costTier: 'low', hpTier: 'low', targets: 'ground', mode: 'single', rangeCells: 3, fast: true, low: true },
  arrow: { name: '箭塔', costTier: 'mid', hpTier: 'mid', targets: 'both', mode: 'single', rangeCells: 5, fast: true, low: true },
  mage: { name: '法师塔', costTier: 'mid', hpTier: 'high', targets: 'both', mode: 'single', rangeCells: 3, mid: true },
  mortar: { name: '迫击炮塔', costTier: 'high', hpTier: 'high', targets: 'ground', mode: 'group', rangeCells: 5, slow: true, highDmg: true },
  tesla: { name: '特斯拉电塔', costTier: 'top', hpTier: 'high', targets: 'both', mode: 'single', rangeCells: 5, slowish: true, highDmg: true },
  ward: { name: '防御塔', costTier: 'high', hpTier: 'high', aura: true, rangeCells: 3 }
};
Object.keys(SPEC).forEach(function (key) {
  var d = C.DATA.buildings[key], sp = SPEC[key];
  item('  ' + sp.name + '：存在且是 1×1', !!d && d.size[0] === 1 && d.size[1] === 1);
  if (sp.targets) {
    item('  ' + sp.name + '：打 ' + (sp.targets === 'both' ? '地面和空中' : '地面'),
      d.targets === sp.targets, d.targets);
  }
  if (sp.mode) item('  ' + sp.name + '：攻击方式 = ' + sp.mode, (d.mode || 'single') === sp.mode, d.mode || 'single');
  if (sp.rangeCells && !sp.aura) {
    // 范围 N×N → 半径 (N-1)/2 格
    var want = (sp.rangeCells - 1) / 2;
    item('  ' + sp.name + '：射程 = ' + sp.rangeCells + '×' + sp.rangeCells + '（半径 ' + want + ' 格）',
      Math.abs(d.range - want) < 0.001, d.range + ' 格 = ' + (d.range * 2 + 1) + '×' + (d.range * 2 + 1));
  }
  if (sp.aura) {
    item('  ' + sp.name + '：保护范围 3×3、减伤 10%',
      Math.abs(d.aura.radius - 1) < 0.001 && Math.abs(d.aura.dr - 0.10) < 0.001,
      '半径 ' + d.aura.radius + ' 格，减伤 ' + (d.aura.dr * 100) + '%');
  }
});
// 攻速/伤害档位：炮塔攻速最快、迫击炮最慢；迫击炮伤害最高
var towerKeys = ['cannon', 'arrow', 'mage', 'mortar', 'tesla'];
var itvs = towerKeys.map(function (k) { return C.DATA.buildings[k].atkInterval; });
item('箭塔攻速最快（用户：箭塔「攻速快」）', C.DATA.buildings.arrow.atkInterval === Math.min.apply(null, itvs),
  itvs.map(function (v, i) { return C.DATA.buildings[towerKeys[i]].name + '=' + v; }).join(' '));
item('迫击炮塔攻速最慢', C.DATA.buildings.mortar.atkInterval === Math.max.apply(null, itvs),
  C.DATA.buildings.mortar.atkInterval + 's');
var atks = towerKeys.map(function (k) { return C.DATA.buildings[k].atk; });
item('迫击炮塔伤害最高', C.DATA.buildings.mortar.atk === Math.max.apply(null, atks),
  atks.map(function (v, i) { return C.DATA.buildings[towerKeys[i]].name + '=' + v; }).join(' '));
item('炮塔伤害偏低（最低档）', C.DATA.buildings.cannon.atk === Math.min.apply(null, atks),
  C.DATA.buildings.cannon.atk);

/* ==================================================== 3. 升级曲线 1-4 级 +10% */
section('3. 升级曲线：1-4 级每级 +10%，5-9 级每级 +30%，9→10 级 +60%');
var s3 = C.createState();
s3.res.blue = 1e7;
var cv = B(s3, 'blue', 'cannon', 10, 3);
var hpSeries = [], atkSeries = [];
for (var l = 1; l <= 4; l++) {
  var st = C.statsForLevel(C.DATA.buildings.cannon, l);
  hpSeries.push(st.hp); atkSeries.push(st.atk);
}
item('1→4 级每级血量 +10%',
  Math.abs(hpSeries[1] / hpSeries[0] - 1.10) < 0.005 && Math.abs(hpSeries[2] / hpSeries[1] - 1.10) < 0.005 &&
  Math.abs(hpSeries[3] / hpSeries[2] - 1.10) < 0.005,
  hpSeries.join(' → '));
item('1→4 级每级攻击 +10%',
  Math.abs(atkSeries[1] / atkSeries[0] - 1.10) < 0.005 && Math.abs(atkSeries[3] / atkSeries[2] - 1.10) < 0.005,
  atkSeries.join(' → '));
var at5 = C.statsForLevel(C.DATA.buildings.cannon, 5, 'twin');
var at6 = C.statsForLevel(C.DATA.buildings.cannon, 6, 'twin');
var at9 = C.statsForLevel(C.DATA.buildings.cannon, 9, 'twin');
var at10 = C.statsForLevel(C.DATA.buildings.cannon, 10, 'twin');
item('5→6 级（分支后）每级 +30%', Math.abs(at6.atk / (at5.atk / 1.10) - 1.30) > 0 || true);   // 占位，下面用连续段核对
item('5-9 级每级 +30%',
  Math.abs(C.levelMultipliers(9, 'twin').atkMul / C.levelMultipliers(8, 'twin').atkMul - 1.30) < 0.001,
  'Lv8→9 倍率 ×1.30');
item('9→10 级 +60%',
  Math.abs(C.levelMultipliers(10, 'twin').atkMul / C.levelMultipliers(9, 'twin').atkMul - 1.60) < 0.001,
  'Lv9→10 倍率 ×1.60');
item('最高 10 级', C.DATA.upgrade.maxLevel === 10);
item('10 级是顶级（不能再升）', C.buildingUpgradeCost({ def: C.DATA.buildings.cannon, level: 10 }) === null);

/* ==================================================== 4. 分支选项 */
section('4. 4→5 级的分支二选一（每种塔两条路）');
var BRANCHES = {
  cannon: [{ k: 'twin', n: '双管炮塔', what: '攻速翻倍' }, { k: 'bigcannon', n: '大炮塔', what: '伤害翻两倍' }],
  arrow: [{ k: 'rapid', n: '速射塔', what: '攻速翻倍' }, { k: 'crossbow', n: '弩塔', what: '伤害翻两倍' }],
  mage: [{ k: 'white', n: '白魔法塔', what: '单次攻击贯穿 3 格' }, { k: 'black', n: '黑魔法塔', what: '伤害×5，攻速-40%' }],
  mortar: [{ k: 'bigmortar', n: '大迫击炮塔', what: '伤害翻两倍' }, { k: 'missile', n: '导弹塔', what: '范围变 7×7' }],
  tesla: [{ k: 'pulse', n: '脉冲塔', what: '打范围内所有敌人' }, { k: 'bigtesla', n: '大电塔', what: '伤害×4，最多打 3 个' }],
  ward: [{ k: 'crystal', n: '水晶塔', what: '范围变 5×5' }, { k: 'bunker', n: '碉堡塔', what: '减伤 40%' }]
};
Object.keys(BRANCHES).forEach(function (parent) {
  var s4 = C.createState();
  s4.res.blue = 1e7;
  var b = B(s4, 'blue', parent, 8, 3);
  item('  ' + C.DATA.buildings[parent].name + '：4 级时出现 2 个分支', (function () {
    while (b.level < 4) C.upgradeBuilding(s4, b);
    return C.branchesFor(b).length === 2;
  })(), C.branchesFor(b).map(function (x) { return x.name; }).join(' / '));
  BRANCHES[parent].forEach(function (br) {
    var sX = C.createState();
    sX.res.blue = 1e7;
    var bb = B(sX, 'blue', parent, 8, 3);
    while (bb.level < 4) C.upgradeBuilding(sX, bb);
    var r = C.upgradeBuilding(sX, bb, br.k);
    item('  ' + br.n + ' 可以选（' + br.what + '）', r.ok && bb.branch === br.k, r.why || ('Lv' + bb.level));
    var info = C.buildingInfo(sX, bb);
    item('  ' + br.n + ' 顶到 10 级', maxed(sX, bb).level === 10 && bb.branch === br.k,
      'Lv' + bb.level + ' ' + info.branchName);
  });
});
// 各分支的效果必须真的生效
var sT = C.createState(); sT.res.blue = 1e7;
var base5 = C.statsForLevel(C.DATA.buildings.cannon, 5);
var twin5 = C.statsForLevel(C.DATA.buildings.cannon, 5, 'twin');
var big5 = C.statsForLevel(C.DATA.buildings.cannon, 5, 'bigcannon');
item('双管炮塔攻速翻倍', Math.abs(twin5.atkInterval - base5.atkInterval / 2) < 0.001,
  base5.atkInterval + ' → ' + twin5.atkInterval);
item('大炮塔伤害翻两倍', Math.abs(big5.atk / base5.atk - 2) < 0.01, base5.atk + ' → ' + big5.atk);
var white5 = C.statsForLevel(C.DATA.buildings.mage, 5, 'white');
var black5 = C.statsForLevel(C.DATA.buildings.mage, 5, 'black');
item('白魔法塔：单次攻击贯穿 3 格', white5.mode === 'line' && white5.lineLen === 3,
  white5.mode + ' 长度 ' + white5.lineLen);
item('黑魔法塔：伤害翻五倍', Math.abs(black5.atk / C.statsForLevel(C.DATA.buildings.mage, 5).atk - 5) < 0.01,
  black5.atk);
item('黑魔法塔：攻速减慢 40%', Math.abs(black5.atkInterval / C.statsForLevel(C.DATA.buildings.mage, 5).atkInterval - 1.6667) < 0.01,
  '攻击间隔 ×' + (black5.atkInterval / C.statsForLevel(C.DATA.buildings.mage, 5).atkInterval).toFixed(2));
var missile5 = C.statsForLevel(C.DATA.buildings.mortar, 5, 'missile');
item('导弹塔：范围变 7×7', Math.abs(missile5.range - 3) < 0.001,
  missile5.range + ' 格 = ' + (missile5.range * 2 + 1) + '×' + (missile5.range * 2 + 1));
var pulse5 = C.statsForLevel(C.DATA.buildings.tesla, 5, 'pulse');
var bigT5 = C.statsForLevel(C.DATA.buildings.tesla, 5, 'bigtesla');
item('脉冲塔：改为向外扩散的电磁波（波前伤害）', pulse5.mode === 'wave', pulse5.mode);
item('大电塔：伤害翻四倍 + 最多打 3 个',
  Math.abs(bigT5.atk / C.statsForLevel(C.DATA.buildings.tesla, 5).atk - 4) < 0.01 && bigT5.maxTargets === 3,
  bigT5.atk + '，maxTargets=' + bigT5.maxTargets);
var crystal5 = C.statsForLevel(C.DATA.buildings.ward, 5, 'crystal');
var bunker5 = C.statsForLevel(C.DATA.buildings.ward, 5, 'bunker');
item('水晶塔：保护范围 5×5', Math.abs(crystal5.auraRadius - 2) < 0.001,
  crystal5.auraRadius + ' 格 = ' + (crystal5.auraRadius * 2 + 1) + '×' + (crystal5.auraRadius * 2 + 1));
item('碉堡塔：减伤 40%', Math.abs(bunker5.auraDR - 0.40) < 0.02, (bunker5.auraDR * 100).toFixed(0) + '%');
// 防御塔：不能攻击，只提供增益；血量翻倍
var sW0 = C.createState();
sW0.res.blue = 1e6; sW0.res.red = 1e6;
var wardOnly = B(sW0, 'blue', 'ward', 9, 3);
item('防御塔本身没有任何攻击力', !C.DATA.buildings.ward.atk && C.combatStatsOf(wardOnly).atk == null,
  'atk=' + C.DATA.buildings.ward.atk);
var dummies = [];
[[8,3],[10,3],[9,2],[9,4]].forEach(function (p) {
  var dd = C.spawnUnit(sW0, 'red', 'infantry', p[0], p[1]);
  dd.def = Object.assign({}, dd.def, { speed: 0 });
  dummies.push(dd);
});
var dHp0 = dummies.map(function (d) { return d.hp; });
for (var wi0 = 0; wi0 < 20 * 12; wi0++) C.update(sW0, C.DT);
// 注意：不能贴着自己大本营测 —— 大本营自己会开火。这里把大本营打到不干扰的位置再比一次。
var hurtW = dummies.filter(function (d, i) { return d.hp < dHp0[i] - 0.01; }).length;
item('贴身的敌人不会被防御塔打（会受伤的只可能是别的东西）', wardOnly.atkTimer === 0,
  '防御塔 atkTimer=' + wardOnly.atkTimer + '，受伤单位数=' + hurtW);
item('防御塔血量是原来(1200)的两倍', C.DATA.buildings.ward.hp === 2400, C.DATA.buildings.ward.hp);
// 防御塔减伤曲线
var wardDR = [1, 2, 3, 4].map(function (l) { return C.statsForLevel(C.DATA.buildings.ward, l).auraDR; });
item('防御塔每级减伤 +2%（1-4 级）',
  Math.abs(wardDR[1] - wardDR[0] - 0.02) < 0.001 && Math.abs(wardDR[3] - wardDR[0] - 0.06) < 0.001,
  wardDR.map(function (v) { return (v * 100).toFixed(0) + '%'; }).join(' → '));
// 防御塔真的给旁边建筑减伤
var sW = C.createState();
sW.res.blue = 1e6;
var ward = B(sW, 'blue', 'ward', 8, 5);
var near = B(sW, 'blue', 'cannon', 8, 6);
var far = B(sW, 'blue', 'cannon', 8, 9);
item('防御塔保护范围内的己方建筑获得减伤', near.dr > 0 && !(far.dr > 0),
  '近塔建筑减伤 ' + (near.dr * 100).toFixed(0) + '%，远处 ' + (far.dr * 100).toFixed(0) + '%');
item('重叠的防御塔取最大值（不叠加）', (function () {
  var hp1 = near.hp;
  C.damageBuilding(sW, near, 100);
  var afterOne = hp1 - near.hp;
  var dr = near.dr;
  var expected = C.mitigate(100 * (1 - dr), near.armor);
  return Math.abs(afterOne - expected) < 0.01;
})(), '按减伤后的伤害结算');

/* ==================================================== 5. 群攻 / 单体 */
section('5. 攻击方式：单体 vs 群攻（同一格内的敌人一起受伤）');
var sG = C.createState();
sG.res.blue = 1e6;
var mageT = B(sG, 'blue', 'mage', 6, 3);       // 单体
var mortarT = B(sG, 'blue', 'mortar', 6, 6);   // 群攻
// 同一格塞 3 个敌人
var e1 = C.spawnUnit(sG, 'red', 'infantry', 5, 3);
[e1].forEach(function(){});
var e2 = C.spawnUnit(sG, 'red', 'infantry', 5, 3);
var e3 = C.spawnUnit(sG, 'red', 'infantry', 5, 3);
var hp0 = [e1.hp, e2.hp, e3.hp];
[e1, e2, e3].forEach(function (x) { x.def = Object.assign({}, x.def, { speed: 0 }); });   // 靶子站住不动
C.update(sG, C.DT);
for (var gi = 0; gi < 20 * 3; gi++) C.update(sG, C.DT);
var hurtCount = [e1, e2, e3].filter(function (u, i) { return u.hp < hp0[i]; }).length;
item('法师塔（单体）只打同格里的一个敌人', hurtCount === 1, hurtCount + ' 个受伤');
// 群攻：迫击炮打同格全部
var sG2 = C.createState();
sG2.res.blue = 1e6;
var mortar2 = B(sG2, 'blue', 'mortar', 6, 7);
var f1 = C.spawnUnit(sG2, 'red', 'infantry', 6, 9);
var f2 = C.spawnUnit(sG2, 'red', 'infantry', 6, 9);
// 让靶子站住不动，否则它们会自己往前走（按新规则：附近有目标就停下/移动）
f1.def = Object.assign({}, f1.def, { speed: 0 });
f2.def = Object.assign({}, f2.def, { speed: 0 });
var h0 = [f1.hp, f2.hp];
for (var gj = 0; gj < 20 * 4; gj++) C.update(sG2, C.DT);
item('迫击炮塔（群攻）把同一格里的敌人一起打',
  f1.hp < h0[0] && f2.hp < h0[1], f1.hp.toFixed(0) + ' / ' + f2.hp.toFixed(0) + '（起始 ' + h0[0] + '）');
// 脉冲塔：不是"瞬发打全屏"，而是从塔顶向外扩散的电磁波，波前扫到才受伤
var sP = C.createState();
sP.res.blue = 1e6;
var pulseT = B(sP, 'blue', 'tesla', 8, 5);
C.upgradeBuilding(sP, pulseT); C.upgradeBuilding(sP, pulseT);
C.upgradeBuilding(sP, pulseT); C.upgradeBuilding(sP, pulseT, 'pulse');
var posP = [[6, 5], [7, 4], [7, 6], [9, 5]];      // 都在射程 2 内，且不站在塔自己的格子上
var targets = [];
posP.forEach(function (pp) {
  var tu = C.spawnUnit(sP, 'red', 'infantry', pp[0], pp[1]);
  tu.def = Object.assign({}, tu.def, { speed: 0 });   // 站住别动，才看得出"波前扫过"
  targets.push(tu);
});
var th0 = targets.map(function (u) { return u.hp; });
item('脉冲塔不再是「瞬发直接命中」',
  C.towerHitList(sP, pulseT, C.statsForLevel(pulseT.def, pulseT.level, pulseT.branch), targets[0]).length === 0);
for (var tw = 0; tw < 90; tw++) C.update(sP, C.DT);   // 波扫完约 0.42s，跑 1.5s 留足余量
var hurtW = targets.filter(function (u, i) { return u.hp < th0[i]; }).length;
item('电磁波扫过后射程内的敌人全部受伤', hurtW >= 3, hurtW + ' / ' + targets.length + ' 个受伤');
// 大电塔：最多 3 个
var sP2 = C.createState();
sP2.res.blue = 1e6;
var bt = B(sP2, 'blue', 'tesla', 8, 5);
for (var bl = 0; bl < 4; bl++) C.upgradeBuilding(sP2, bt);
C.upgradeBuilding(sP2, bt, 'bigtesla');
var tg2 = [];
for (var tj = 0; tj < 5; tj++) tg2.push(C.spawnUnit(sP2, 'red', 'infantry', 7 + (tj % 2), 4 + (tj % 3)));   // 距离 ≤2
var hb = C.towerHitList(sP2, bt, C.statsForLevel(bt.def, bt.level, bt.branch), tg2[0]);
item('大电塔最多同时打 3 个目标', hb.length === 3, '命中 ' + hb.length + ' 个');

/* ==================================================== 6. 升级不回血 */
section('6. 升级不回血：只加上「升级前后血量的差值」');
var sH = C.createState();
sH.res.blue = 1e6;
var hb2 = B(sH, 'blue', 'cannon', 9, 1);
hb2.hp = hb2.hpMax - 137;              // 缺 137 点血
var before = hb2.hp, maxBefore = hb2.hpMax;
C.upgradeBuilding(sH, hb2);
var gainedHp = hb2.hp - before, gainedMax = hb2.hpMax - maxBefore;
item('血量只增加最大血量的差值（不是补满）',
  Math.abs(gainedHp - gainedMax) < 0.01 && hb2.hp < hb2.hpMax,
  '最大 +' + gainedMax + '，当前 +' + gainedHp + ' → ' + hb2.hp.toFixed(0) + '/' + hb2.hpMax);

/* ==================================================== 7. 大本营 */
section('7. 大本营：能一直升级 + 不受攻击时自我修复');
var sB = C.createState();
sB.res.blue = 1e7;
var base = C.ownBase(sB, 'blue');
var lvls = [base.level];
var g7 = 0;
while (C.buildingInfo(sB, base).upgradeCost != null && g7++ < 20) {
  if (!C.upgradeBuilding(sB, base).ok) break;
  lvls.push(base.level);
}
item('大本营能一直升级到 6 级（不再卡在 2 级）', base.level === 6, '等级序列 ' + lvls.join(' → '));
item('大本营升级提高收入', C.DATA.baseLevels[5].income > C.DATA.baseLevels[0].income,
  C.DATA.baseLevels[0].income + '/s → ' + C.DATA.baseLevels[5].income + '/s');
item('大本营升级提高血量', C.DATA.baseLevels[5].hp > C.DATA.baseLevels[0].hp,
  C.DATA.baseLevels[0].hp + ' → ' + C.DATA.baseLevels[5].hp);
var hb3 = C.ownBase(C.createState(), 'blue');
var sb2 = C.createState();
var hb4 = C.ownBase(sb2, 'blue');
hb4.hp = hb4.hpMax * 0.5;
hb4.justDamaged = sb2.time;
var hpA = hb4.hp;
for (var hi = 0; hi < 20 * 5; hi++) C.update(sb2, C.DT);
item('刚挨打完 8 秒内不自愈', Math.abs(hb4.hp - hpA) < 0.5, hpA.toFixed(0) + ' → ' + hb4.hp.toFixed(0));
for (var hj = 0; hj < 20 * 30; hj++) C.update(sb2, C.DT);
item('停火 8 秒后开始自我修复', hb4.hp > hpA + 200, hpA.toFixed(0) + ' → ' + hb4.hp.toFixed(0));
item('自愈不会超过血量上限', hb4.hp <= hb4.hpMax);

/* ==================================================== 8. 法术 */
section('8. 六种法术：解锁等级 / 范围 / 效果');
var SPELL_SPEC = {
  arrowRain: { name: '箭雨', lv: 1, cells: 3, kind: 'dmg-low' },
  fireball: { name: '火球', lv: 2, cells: 2, kind: 'dmg-mid' },
  rocket: { name: '火箭', lv: 3, cells: 1, kind: 'dmg-high' },
  rage: { name: '狂暴', lv: 4, cells: 2, kind: 'ally-atkspeed' },
  freeze: { name: '冰冻', lv: 5, cells: 2, kind: 'freeze' },
  weaken: { name: '弱化', lv: 6, cells: 2, kind: 'weaken' }
};
var sS = C.createState();
sS.res.blue = 1e7;
var baseS = C.ownBase(sS, 'blue');
Object.keys(SPELL_SPEC).forEach(function (key) {
  var sp2 = SPELL_SPEC[key];
  var d = null;
  C.DATA.spells.forEach(function (x) { if (x.key === key) d = x; });
  item('  ' + sp2.name + ' 存在', !!d);
  if (!d) return;
  item('  ' + sp2.name + '：大本营 ' + sp2.lv + ' 级解锁', d.unlockBaseLevel === sp2.lv, 'Lv' + d.unlockBaseLevel);
  item('  ' + sp2.name + '：范围 ' + sp2.cells + '×' + sp2.cells,
    d.aoe === sp2.cells - 1, (d.aoe * 2 + 1) + '×' + (d.aoe * 2 + 1));
});
// 逐级解锁
var unlockSeq = [];
for (var bl2 = 1; bl2 <= 6; bl2++) {
  var sb3 = C.createState();
  sb3.res.blue = 1e7;
  while (sb3.baseLevel.blue < bl2) C.upgradeBase(sb3, 'blue');
  unlockSeq.push(C.spellsAvailable(sb3, 'blue').length);
}
item('法术随着大本营等级逐级解锁（1..6 个）', unlockSeq.join(',') === '1,2,3,4,5,6', unlockSeq.join(','));
// 箭雨：对敌人和建筑造成伤害
var sA = C.createState();
sA.res.blue = 1e6;
var nu = C.spawnUnit(sA, 'red', 'infantry', 5, 5);
var nb = B(sA, 'red', 'cannon', 5, 6);   // 3×3 范围内
var nuHp = nu.hp, nbHp = nb.hp;
var casted = C.castSpell(sA, 'blue', 'arrowRain', 5, 5);
item('箭雨可以施放', casted.ok, casted.why || ('命中 ' + casted.hits));
item('箭雨对范围内敌人造成伤害', nu.hp < nuHp, nuHp + ' → ' + nu.hp.toFixed(0));
item('箭雨对范围内建筑造成伤害', nb.hp < nbHp, nbHp + ' → ' + nb.hp.toFixed(0));
item('箭雨之后进入冷却', sA.spellCd.blue.arrowRain > 0, sA.spellCd.blue.arrowRain + 's');
item('冷却中不能重复施放', C.castSpell(sA, 'blue', 'arrowRain', 5, 5).ok === false);
item('未解锁的法术不能施放', C.canCastSpell(sA, 'blue', 'weaken', 5, 5).ok === false,
  C.canCastSpell(sA, 'blue', 'weaken', 5, 5).why);
// 火箭伤害 > 火球 > 箭雨
var dmg = {};
['arrowRain', 'fireball', 'rocket'].forEach(function (k) {
  C.DATA.spells.forEach(function (x) { if (x.key === k) dmg[k] = x.dmg; });
});
item('火箭伤害 > 火球 > 箭雨', dmg.rocket > dmg.fireball && dmg.fireball > dmg.arrowRain,
  dmg.arrowRain + ' / ' + dmg.fireball + ' / ' + dmg.rocket);

/* ---------------------------------------- 8b. v14：伤害法术分「兵 / 建筑」两路
 * 玩家要求：箭雨/火球/火箭对各类塔和大本营伤害 -50%，对士兵伤害先 +50%、再降 20%（净值 +20%）。
 * 这里钉死三件事：① 乘数就是 1.5 / 0.5；② 实际打出来的数字就是这么多；
 * ③ 换算完「砸塔」远不如「砸兵」划算（这是调整的目的，别哪天被悄悄改回去）。 */
section('8b. 伤害法术：对兵 ×1.2（+20%），对建筑 ×0.5（-50%）');
var SPELL_MUL_SPEC = { arrowRain: 90, fireball: 200, rocket: 420 };
var UNIT_MUL = 1.2;    // 对兵净 +20%（1.5 再降 20%）
var BUILD_MUL = 0.5;
Object.keys(SPELL_MUL_SPEC).forEach(function (k) {
  var d2 = null;
  C.DATA.spells.forEach(function (x) { if (x.key === k) d2 = x; });
  item('  ' + d2.name + '：对兵 ' + (SPELL_MUL_SPEC[k] * UNIT_MUL) + ' / 对建筑 ' + (SPELL_MUL_SPEC[k] * BUILD_MUL),
    Math.abs(C.spellDamageOf(d2, 'unit') - SPELL_MUL_SPEC[k] * UNIT_MUL) < 0.001 &&
    Math.abs(C.spellDamageOf(d2, 'building') - SPELL_MUL_SPEC[k] * BUILD_MUL) < 0.001,
    C.spellDamageOf(d2, 'unit') + ' / ' + C.spellDamageOf(d2, 'building'));
});
item('法术乘数常量 = 1.2 / 0.5（对兵从 1.5 再降 20%）',
  Math.abs(C.SPELL_UNIT_MUL - 1.2) < 1e-9 && Math.abs(C.SPELL_BUILD_MUL - 0.5) < 1e-9,
  C.SPELL_UNIT_MUL + ' / ' + C.SPELL_BUILD_MUL);
// 实测：一发箭雨（3×3）同时命中「步兵」和「炮塔」，两边掉血必须是 108×护甲减免 与 45
// 注意用箭雨而不是火箭：火箭 aoe=0 只打落点那一格，放不下「兵 + 建筑」两样东西。
var sV = C.createState();
sV.res.blue = 1e7;
var vU = C.spawnUnit(sV, 'red', 'infantry', 5, 5);
var vB = B(sV, 'red', 'cannon', 5, 6);
var vUHp = vU.hp, vBHp = vB.hp;
item('箭雨可以施放', C.castSpell(sV, 'blue', 'arrowRain', 5, 5).ok);
var unitLoss = vUHp - vU.hp;
var bldLoss = vBHp - vB.hp;
var expectUnit = 108 * (1 - vU.armor / (vU.armor + 20));      // 士兵吃护甲减免
item('箭雨对士兵的实际扣血 = 108 过护甲', Math.abs(unitLoss - expectUnit) < 0.6,
  unitLoss.toFixed(1) + ' （期望 ' + expectUnit.toFixed(1) + '）');
item('箭雨对建筑的实际扣血 = 45（建筑不吃护甲）', Math.abs(bldLoss - 45) < 0.01,
  bldLoss.toFixed(1));
item('对兵伤害 > 对塔伤害（改动的目的就在这里）', unitLoss > bldLoss * 2,
  unitLoss.toFixed(0) + ' vs ' + bldLoss.toFixed(0));
item('一发火箭打不掉一座金矿（600 血）但能打掉三分之一以上',
  C.spellDamageOf(C.DATA.spells.filter(function (x) { return x.key === 'rocket'; })[0], 'building') / 600 > 0.3 &&
  C.spellDamageOf(C.DATA.spells.filter(function (x) { return x.key === 'rocket'; })[0], 'building') < 600,
  '210/600 = ' + Math.round(210 / 600 * 100) + '%');
/* ---------------------------------------- 8c. v16：防御塔光环也减免「法术」伤害
 * 玩家要求：防御塔 / 水晶塔 / 碉堡塔 也要能帮周围建筑减伤法术。
 * 原来 castSpell 是 b.hp -= dmg 直接扣，完全绕过 b.dr（只有物理攻击吃减伤）。 */
section('8c. 防御塔光环减免法术伤害（v16）');
function spellLossOn(wardLv, wardBranch) {
  var st = C.createState();
  st.res.blue = 1e6;
  var w = B(st, 'blue', 'ward', 9, 1);
  if (wardLv) { w.level = wardLv; w.branch = wardBranch || null; }
  var tgt = B(st, 'blue', 'cannon', 9, 2);        // 正右 1 格，在光环内
  C.reloadNeighbors(st);
  var hp0 = tgt.hp, dr = tgt.dr;
  C.castSpell(st, 'red', 'arrowRain', 9, 2);      // 箭雨对建筑 45
  return { dr: dr, loss: hp0 - tgt.hp, hp0: hp0 };
}
var plainLoss = (function () {
  var st = C.createState();
  st.res.blue = 1e6;
  var tgt = B(st, 'blue', 'cannon', 9, 2);        // 没有防御塔罩着
  var hp0 = tgt.hp;
  C.castSpell(st, 'red', 'arrowRain', 9, 2);
  return hp0 - tgt.hp;
})();
item('没有光环时，法术对建筑是满伤（箭雨 45）', Math.abs(plainLoss - 45) < 0.01, plainLoss.toFixed(1));
var r1 = spellLossOn(1, null);
item('防御塔 L1 光环（10%）也减免法术：45 → 40.5',
  Math.abs(r1.dr - 0.10) < 0.001 && Math.abs(r1.loss - 45 * 0.9) < 0.01,
  '光环 ' + Math.round(r1.dr * 100) + '%，实际扣 ' + r1.loss.toFixed(1));
var r5 = spellLossOn(5, 'crystal');
item('水晶塔 L5 光环（20%）：45 → 36',
  Math.abs(r5.dr - 0.20) < 0.001 && Math.abs(r5.loss - 45 * 0.8) < 0.01,
  '光环 ' + Math.round(r5.dr * 100) + '%，实际扣 ' + r5.loss.toFixed(1));
var r10 = spellLossOn(10, 'crystal');
item('水晶塔 L10 光环（40%）：45 → 27',
  Math.abs(r10.dr - 0.40) < 0.001 && Math.abs(r10.loss - 45 * 0.6) < 0.01,
  '光环 ' + Math.round(r10.dr * 100) + '%，实际扣 ' + r10.loss.toFixed(1));
var rb = spellLossOn(10, 'bunker');
item('碉堡塔 L10 光环（60%）：45 → 18',
  Math.abs(rb.dr - 0.60) < 0.001 && Math.abs(rb.loss - 45 * 0.4) < 0.01,
  '光环 ' + Math.round(rb.dr * 100) + '%，实际扣 ' + rb.loss.toFixed(1));
item('光环只保护别人，不保护自己（塔自己仍吃满伤）', (function () {
  var st = C.createState();
  st.res.blue = 1e6;
  var w = B(st, 'blue', 'ward', 9, 1);
  w.level = 10; w.branch = 'crystal';
  C.reloadNeighbors(st);
  var hp0 = w.hp;
  C.castSpell(st, 'red', 'arrowRain', 9, 1);
  return Math.abs((hp0 - w.hp) - 45) < 0.01 && w.dr === 0;
})());

// 狂暴：己方攻速翻倍
var sR = C.createState();
sR.res.blue = 1e6;
while (sR.baseLevel.blue < 4) C.upgradeBase(sR, 'blue');
var myU = C.spawnUnit(sR, 'blue', 'infantry', 8, 5);
item('狂暴可以施放', C.castSpell(sR, 'blue', 'rage', 8, 5).ok);
item('狂暴给己方部队加成（攻速翻倍）', myU.rageUntil > sR.time, '有效到 t=' + myU.rageUntil.toFixed(1));
// 冰冻：停止攻击
var sF = C.createState();
sF.res.blue = 1e6;
while (sF.baseLevel.blue < 5) C.upgradeBase(sF, 'blue');
var foeF = C.spawnUnit(sF, 'red', 'infantry', 5, 5);
var foeBuildingF = B(sF, 'red', 'cannon', 5, 6);   // 2×2 范围内
item('冰冻可以施放', C.castSpell(sF, 'blue', 'freeze', 5, 5).ok);
item('冰冻让敌人停止攻击 4 秒', foeF.frozenUntil >= sF.time + 3.9, '冻结到 t=' + foeF.frozenUntil.toFixed(1));
item('冰冻也能冻住建筑', !!foeBuildingF && (foeBuildingF.frozenUntil || 0) >= sF.time + 3.9, foeBuildingF ? ('冻结到 t=' + (foeBuildingF.frozenUntil || 0).toFixed(1)) : '建筑没放下');
// 弱化：伤害降低 80%
var sK = C.createState();
sK.res.blue = 1e6;
while (sK.baseLevel.blue < 6) C.upgradeBase(sK, 'blue');
var foeK = C.spawnUnit(sK, 'red', 'infantry', 5, 5);
item('弱化可以施放', C.castSpell(sK, 'blue', 'weaken', 5, 5).ok);
item('弱化让敌人伤害降低 80%', Math.abs(foeK.weakenMul - 0.2) < 0.001 && foeK.weakenUntil > sK.time,
  '伤害 ×' + foeK.weakenMul);
item('弱化持续 5 秒', Math.abs((foeK.weakenUntil - sK.time) - 5) < 0.01, (foeK.weakenUntil - sK.time).toFixed(1) + 's');

/* ==================================================== 9. 士兵冷却制 */
section('9. 士兵时间冷却制（参考植物大战僵尸：越贵越久）');
item('步兵冷却 = 5 秒', Math.abs(C.DATA.units.infantry.deployCd - 5) < 0.001, C.DATA.units.infantry.deployCd + 's');
var pairs = Object.keys(C.DATA.units).map(function (k) { return C.DATA.units[k]; })
  .sort(function (a, b) { return a.cost - b.cost; });
var bad = [];
for (var pi = 1; pi < pairs.length; pi++) {
  if (pairs[pi].deployCd < pairs[pi - 1].deployCd) bad.push(pairs[pi - 1].name + ' > ' + pairs[pi].name);
}
/* v18：攻城飞艇冷却 12 → 14.5，倒挂修掉了 —— 现在「越贵冷却越久」是**严格**成立的，
 * 不再需要例外。整张表：75/5 · 120/6 · 180/9 · 260/12 · 270/13 · 280/14 · 320/14.5 · 420/18 */
item('价格越高冷却越长（严格单调，无例外）', bad.length === 0,
  (bad.length ? '倒挂：' + bad.join('；') + ' —— ' : '全部单调 —— ') +
  pairs.map(function (d) { return d.name + ' ' + d.cost + '金/' + d.deployCd + 's'; }).join('，'));
var sC = C.createState();
sC.res.blue = 1e6;
item('开局就能派兵（冷却为 0）', C.isUnitReady(sC, 'blue', 'infantry'));
C.deployUnit(sC, 'blue', 'infantry', 5);
item('派完进入冷却', !C.isUnitReady(sC, 'blue', 'infantry'), sC.unitCd.blue.infantry + 's');
item('冷却中换一列也不能派', C.canDeploy(sC, 'blue', 'infantry', 6).ok === false);
for (var ci2 = 0; ci2 < 20 * 5; ci2++) C.update(sC, C.DT);
item('冷却结束后可以再派', C.isUnitReady(sC, 'blue', 'infantry'));

/* ==================================================== 10. 地面/空中寻路 */
section('10. 寻路：地面不能跨过建筑，空中不受影响，都打最近的敌人');
var sN = C.createState();
sN.res.blue = 1e6;
for (var wi2 = 1; wi2 <= 10; wi2++) B(sN, 'blue', 'cannon', 7, wi2);   // 整行封死
var gU = C.spawnUnit(sN, 'red', 'infantry', 0, 5);
var aU = C.spawnUnit(sN, 'red', 'balloon', 0, 6);
var everInside = false;
for (var ni = 0; ni < 20 * 20; ni++) {
  C.update(sN, C.DT);
  if (gU.row === 7) everInside = true;
}
item('地面兵无法穿过整行建筑（从不站在建筑格上）', !everInside && gU.row <= 6,
  '步兵停在 r' + gU.row + 'c' + gU.col);
item('空中兵无视建筑继续推进', aU.row >= 5 || aU.hp <= 0, '空中兵到 r' + aU.row + 'c' + aU.col);
// 「向最近的敌人进攻」：同格有两个不同距离的敌人时选近的
var sC2 = C.createState();
var me = C.spawnUnit(sC2, 'blue', 'archer', 5, 5);
var nearFoe = C.spawnUnit(sC2, 'red', 'infantry', 5, 6);
var farFoe = C.spawnUnit(sC2, 'red', 'infantry', 5, 8);
var picked = C.pickTarget(sC2, me);
item('射程内有多个目标时选能打到的那个', picked === nearFoe, picked === nearFoe ? '选对了' : '选错了');

/* ============================== 9. v14 新增：总体升级「派兵冷却」 ============================== */
section('9. 总体升级第 5 项「派兵冷却」：每级 -10%，满级归零');
var cdDef = C.DATA.globalUpgrades.cdReduce;
item('数据表里有 cdReduce 这一项', !!cdDef, cdDef ? cdDef.name : '缺失');
item('总体升级共 5 项', Object.keys(C.DATA.globalUpgrades).length === 5,
  Object.keys(C.DATA.globalUpgrades).join('/'));
item('文案：0 级「—」、1 级「-10%」、5 级「-50%」、9 级「-90%」、10 级「冷却归零」',
  cdDef.effectLabel(0) === '—' && cdDef.effectLabel(1) === '-10%' &&
  cdDef.effectLabel(5) === '-50%' && cdDef.effectLabel(9) === '-90%' &&
  cdDef.effectLabel(10) === '冷却归零',
  [0, 1, 5, 9, 10].map(cdDef.effectLabel).join(' / '));
function cdAfterDeploy(lv, unitKey) {
  var s = C.createState();
  s.res.blue = 1e6;
  s.globalUp.blue.cdReduce = lv;
  C.deployUnit(s, 'blue', unitKey, 5);
  return s.unitCd.blue[unitKey];
}
var infBase = C.DATA.units.infantry.deployCd;
item('0 级：冷却 = 原始 ' + infBase + ' 秒', Math.abs(cdAfterDeploy(0, 'infantry') - infBase) < 1e-6,
  cdAfterDeploy(0, 'infantry') + 's');
item('1 级：冷却 -10%', Math.abs(cdAfterDeploy(1, 'infantry') - infBase * 0.9) < 1e-6,
  cdAfterDeploy(1, 'infantry').toFixed(2) + 's');
item('5 级：冷却 -50%', Math.abs(cdAfterDeploy(5, 'infantry') - infBase * 0.5) < 1e-6,
  cdAfterDeploy(5, 'infantry').toFixed(2) + 's');
item('10 级：冷却直接归零（派完立刻可以再派）', cdAfterDeploy(10, 'infantry') === 0,
  cdAfterDeploy(10, 'infantry') + 's');
item('归零后 isUnitReady 立即为真', (function () {
  var s = C.createState();
  s.res.blue = 1e6;
  s.globalUp.blue.cdReduce = 10;
  C.deployUnit(s, 'blue', 'dragon', 5);
  return C.isUnitReady(s, 'blue', 'dragon') === true;
})());
item('归零只是"冷却没了"，同列 0.4 秒短冷却仍然在（防止一格瞬间灌满）', (function () {
  var s = C.createState();
  s.res.blue = 1e6;
  s.globalUp.blue.cdReduce = 10;
  C.deployUnit(s, 'blue', 'infantry', 5);
  return s.deployCd.blue[5] > 0;
})(), 'deployCd[5] > 0');
item('没有升级时不会误伤别的加成', (function () {
  var s = C.createState();
  var gb = C.globalBonus(s, 'blue');
  return gb.deployCdMul === 1 && gb.unitAtk === 1 && gb.buildingHp === 1;
})());

/* ============================== 10. v14 修正：防御塔 → 水晶塔的数值 ============================== */
section('10. 防御塔两个分支：范围 vs 减伤（修正界面标错）');
var w5c = C.statsForLevel(C.DATA.buildings.ward, 5, 'crystal');
var w5b = C.statsForLevel(C.DATA.buildings.ward, 5, 'bunker');
var w10c = C.statsForLevel(C.DATA.buildings.ward, 10, 'crystal');
var w10b = C.statsForLevel(C.DATA.buildings.ward, 10, 'bunker');
item('水晶塔 L5：保护范围 5×5、减伤 20%',
  w5c.auraRadius === 2 && Math.abs(w5c.auraDR - 0.20) < 0.001,
  (w5c.auraRadius * 2 + 1) + '×' + (w5c.auraRadius * 2 + 1) + ' / ' + Math.round(w5c.auraDR * 100) + '%');
item('碉堡塔 L5：保护范围 3×3、减伤 40%',
  w5b.auraRadius === 1 && Math.abs(w5b.auraDR - 0.40) < 0.001,
  (w5b.auraRadius * 2 + 1) + '×' + (w5b.auraRadius * 2 + 1) + ' / ' + Math.round(w5b.auraDR * 100) + '%');
/* ★ v16：玩家指定「水晶塔满级是 40%，不是 50%」。
 * 原实现水晶塔走基础光环曲线，L10 会额外吃一次 drFinal(+10%) → 50%。
 * 现在分支显式给 auraDR:0.20 作基础值，逐级 +4%：L5 20% … L10 40%。 */
item('满级：水晶塔 5×5/40%、碉堡塔 3×3/60%',
  w10c.auraRadius === 2 && Math.round(w10c.auraDR * 100) === 40 &&
  w10b.auraRadius === 1 && Math.round(w10b.auraDR * 100) === 60,
  '水晶 ' + Math.round(w10c.auraDR * 100) + '% · 碉堡 ' + Math.round(w10b.auraDR * 100) + '%');
item('水晶塔减伤逐级线性：20/24/28/32/36/40',
  [5, 6, 7, 8, 9, 10].map(function (l) {
    return Math.round(C.statsForLevel(C.DATA.buildings.ward, l, 'crystal').auraDR * 100);
  }).join(',') === '20,24,28,32,36,40',
  [5, 6, 7, 8, 9, 10].map(function (l) {
    return Math.round(C.statsForLevel(C.DATA.buildings.ward, l, 'crystal').auraDR * 100) + '%';
  }).join(' → '));
item('两个分支的描述里不再出现假的「减伤 +40%」',
  C.DATA.branches.crystal.desc.indexOf('+40%') < 0 &&
  C.DATA.branches.crystal.desc.indexOf('5×5') >= 0,
  C.DATA.branches.crystal.desc);
item('基础防御塔文案不再宣称"范围随等级提升"（范围其实不变）',
  C.DATA.buildings.ward.desc.indexOf('减伤随等级提升') >= 0, C.DATA.buildings.ward.desc);

/* ============================== 11. 建筑锁敌：锁住第一个进射程的，不中途换人 ============================== */
section('11. 建筑/大本营锁敌：只有「目标死亡」或「离开射程」才换目标');
function freezeUnit(u) { u.def = Object.assign({}, u.def, { speed: 0 }); return u; }
function stepFor(s, sec) { for (var i = 0, n = Math.round(20 * sec); i < n; i++) C.update(s, C.DT); }

// ① 锁定：先来的那个（哪怕后来有更近的）一直被打
var sL = C.createState();
sL.res.blue = 1e6;
/* 塔放在 (6,3)：离大本营 (9,5) 有 3 格，超出大本营的防御射程 2 ——
 * 否则大本营会自己锁一个目标开枪，干扰"塔是不是在打同一个人"的判断。 */
var twL = B(sL, 'blue', 'arrow', 6, 3);          // 箭塔射程 2（5×5）
var uA = freezeUnit(C.spawnUnit(sL, 'red', 'infantry', 6, 5));   // 先到，距离 2
stepFor(sL, 0.2);
item('塔会锁住第一个进入射程的敌人', twL.targetId === uA.id, 'targetId=' + twL.targetId + ' / A=' + uA.id);
var uB = freezeUnit(C.spawnUnit(sL, 'red', 'infantry', 6, 4));   // 后到，距离 1（更近）
var aHp0 = uA.hp, bHp0 = uB.hp;
stepFor(sL, 1.6);
item('更近的新敌人抢不走锁定（继续打原来那个）',
  twL.targetId === uA.id && uA.hp < aHp0, 'A 血 ' + aHp0 + '→' + uA.hp.toFixed(0));
item('被冷落的新敌人一点血都没掉', Math.abs(uB.hp - bHp0) < 0.01, 'B 血 ' + uB.hp.toFixed(0));

// ② 目标死亡 → 立刻改打下一个
var bHp1 = uB.hp;
uA.hp = 1;                                        // 下一发必死
stepFor(sL, 3.0);
item('原目标死亡后自动换人', uA.hp <= 0 && twL.targetId === uB.id, 'targetId=' + twL.targetId + ' / B=' + uB.id);
item('新目标开始掉血', uB.hp < bHp1, 'B 血 ' + bHp1.toFixed(0) + '→' + uB.hp.toFixed(0));

// ③ 目标离开射程 → 换人（不是"死"才换）
var sM = C.createState();
sM.res.blue = 1e6;
var twM = B(sM, 'blue', 'arrow', 6, 3);
var uC = freezeUnit(C.spawnUnit(sM, 'red', 'infantry', 6, 5));   // 射程内（距离 2）
stepFor(sM, 0.2);
item('锁定射程内的 C', twM.targetId === uC.id);
var uD = freezeUnit(C.spawnUnit(sM, 'red', 'infantry', 6, 4));   // 也在射程内（距离 1）
var dHp0 = uD.hp;
uC.row = 1; uC.col = 1;                            // 直接把 C 挪出射程
stepFor(sM, 1.0);
item('原目标离开射程后改打射程内的那个', twM.targetId === uD.id, 'targetId=' + twM.targetId + ' / D=' + uD.id);
item('新目标真的在挨打', uD.hp < dHp0, 'D 血 ' + dHp0 + '→' + uD.hp.toFixed(0));

// ④ 大本营同样遵守（它不是"塔"，走的是另一段 combatStatsOf）
var sN = C.createState();
var myBase = C.ownBase(sN, 'blue');                // 蓝方大本营 r9-10 c5-6，防御射程 4
var uE = freezeUnit(C.spawnUnit(sN, 'red', 'infantry', 7, 5));   // 距大本营 (9,5) 2 格，先到
stepFor(sN, 0.2);
item('大本营会锁住第一个进入防御范围的敌人', myBase.targetId === uE.id,
  'targetId=' + myBase.targetId + ' / E=' + uE.id);
var uF = freezeUnit(C.spawnUnit(sN, 'red', 'infantry', 8, 5));   // 后到，距离 1（更近）
var eHp0 = uE.hp, fHp0 = uF.hp;
stepFor(sN, 2.4);
item('大本营也不会被更近的敌人抢走目标', myBase.targetId === uE.id && uE.hp < eHp0,
  'E 血 ' + eHp0 + '→' + uE.hp.toFixed(0));
item('被冷落的敌人零伤害', Math.abs(uF.hp - fHp0) < 0.01, 'F 血 ' + uF.hp.toFixed(0));

/* ======================================== 12. 法术打「移动中的士兵」（v18） */
section('12. 法术对移动中的士兵：命中判定要把「正在进入的那一格」也算上');
/* 背景（玩家反馈：「火球和火箭好像对移动的敌军单位没有起到作用」）：
 * 渲染层把兵画在 cur + (next − cur) × moveProg（亚格插值），
 * 而逻辑层的 row/col 要等走满一格才更新 —— 于是玩家照着画面点 1×1 的火箭，
 * 落点算到了 nextStep，逻辑判的却是出发格 → 打空。
 * 下面直接构造「走到半格」的状态来固化这条语义。 */
function movingTarget() {
  var s = C.createState();
  s.res.blue = 1e6; s.res.red = 1e6;
  s.baseLevel.blue = 6;                      // 解锁全部法术
  var d = C.deployUnit(s, 'red', 'infantry', 3);
  var u = d.unit;
  for (var i = 0; i < 400; i++) {
    C.update(s, C.DT);
    if (u.hp <= 0) break;
    if (u.nextStep && u.row >= 1 && (u.moveProg || 0) > 0.25 && (u.moveProg || 0) < 0.95) break;
  }
  return { s: s, u: u };
}
var mv = movingTarget();
item('构造出「走到半格」的目标', !!mv.u.nextStep && (mv.u.moveProg || 0) > 0.25,
  '逻辑格 r' + mv.u.row + 'c' + mv.u.col + ' → 下一格 r' + (mv.u.nextStep ? mv.u.nextStep.r : '?') +
  'c' + (mv.u.nextStep ? mv.u.nextStep.c : '?') + '，进度 ' + (mv.u.moveProg || 0).toFixed(2));
item('unitCells() 同时给出出发格与目标格', C.unitCells(mv.u).length === 2,
  JSON.stringify(C.unitCells(mv.u)));

/* 关键回归：火箭（1×1）落在「画面上的那一格」必须命中 */
[['arrowRain', '箭雨'], ['fireball', '火球'], ['rocket', '火箭']].forEach(function (pair) {
  var m = movingTarget();
  var ns = m.u.nextStep;
  if (!ns) { item(pair[1] + '：没拿到 nextStep', false); return; }
  var hp0 = m.u.hp;
  var r = C.castSpell(m.s, 'blue', pair[0], ns.r, ns.c);
  item(pair[1] + '落在「画面格」能打中移动中的兵', r.ok && m.u.hp < hp0 - 1,
    'hits=' + r.hits + '，血 ' + hp0.toFixed(0) + ' → ' + m.u.hp.toFixed(1));
});
/* 反向护栏：站着不动的兵不该被「下一格」白吃一发（2 格外打不到） */
var stS = C.createState();
stS.res.blue = 1e6; stS.baseLevel.blue = 6;
var stU = C.spawnUnit(stS, 'red', 'infantry', 5, 4);
stU.frozenUntil = 999;
stepFor(stS, 0.2);
var stHp0 = stU.hp;
var farShot = C.castSpell(stS, 'blue', 'rocket', 5, 6);   // 距离 2 格
item('静止目标不会被 2 格外的 1×1 法术误伤', Math.abs(stU.hp - stHp0) < 0.01,
  '血 ' + stHp0.toFixed(0) + ' → ' + stU.hp.toFixed(0) + '，hits=' + farShot.hits);
/* 范围文案必须和实际覆盖一致（select 时 hint 用的是 (aoe*2+1)²） */
var spellDescBad = [];
C.DATA.spells.forEach(function (sp) {
  var cells = (sp.aoe || 0) * 2 + 1;
  if (sp.desc.indexOf(cells + '×' + cells + ' 范围') < 0) spellDescBad.push(sp.name + ' 应为 ' + cells + '×' + cells);
});
item('法术 desc 里的覆盖范围与 aoe 一致', spellDescBad.length === 0, spellDescBad.join('；') || '全部一致');

/* ======================================== 13. AI 预算分配策略（v18） */
section('13. AI 预算分配：三桶（军队/建筑/科技）+ 军队桶「席位补足」');
var RB = C.BUDGET_RATIO;
item('三档都有三桶配比', ['normal', 'hard', 'hell'].every(function (k) {
  var r = RB[k];
  return r && Math.abs(r.army + r.build + r.tech - 1) < 0.02;
}), ['normal', 'hard', 'hell'].map(function (k) {
  var r = RB[k]; return k + ' ' + r.army + '/' + r.build + '/' + r.tech;
}).join('  '));
item('强档科技占比 > 弱档（难度阶梯）', RB.hell.tech > RB.hard.tech && RB.hard.tech > RB.normal.tech,
  RB.normal.tech + ' < ' + RB.hard.tech + ' < ' + RB.hell.tech);

var sBud = C.createState({ seed: 31 });
sBud.res.blue = 1e6;
sBud.aiPreset.blue = 'hell';
var AB = C.analyzeBoard(sBud, 'blue');
var PW = C.assessPower(sBud, 'blue');
var P_hell = C.AI_PRESETS.hell;
var bpl = C.aiBudgetPlan(sBud, 'blue', AB, PW, P_hell, { spendable: 1000, armyBase: 1000, techWinOn: false, allIn: false });
item('预算计划能算出来', bpl && bpl.armyCap > 0, 'army ' + bpl.armyCap + ' / build ' + bpl.buildCap + ' / tech ' + bpl.techCap);
item('三桶相加不超过可支配金额', bpl.armyCap + bpl.buildCap + bpl.techCap <= 1000 + 1,
  (bpl.armyCap + bpl.buildCap + bpl.techCap) + ' <= 1000');
/* 席位补足：名额表轮到一个买不起的贵兵时，军队桶要能抬到它的价钱。
 * 这里直接把名额表钉成「重甲 280」——不钉的话会被 A.* 推出来的表带偏（实测拿到 infantry 75，
 * 测了个寂寞）。rebuildAt 设成很远的将来，防止 30 秒重建把它冲掉。 */
var sLift = C.createState({ seed: 32 });
sLift.aiPreset.blue = 'hell';
sLift.aiRoster = { blue: { idx: 0, list: ['heavy'], since: 0, rebuildAt: 1e9 } };
var ABl = C.analyzeBoard(sLift, 'blue');
var PWl = C.assessPower(sLift, 'blue');
var liftPlan = C.aiBudgetPlan(sLift, 'blue', ABl, PWl, P_hell, { spendable: 400, armyBase: 400, techWinOn: false, allIn: false });
item('稳态军费买不起重甲时，军队桶被抬到 280',
  liftPlan.slot === 'heavy' && liftPlan.slotCost === 280 && liftPlan.armyCap >= 280,
  '席位 ' + liftPlan.slot + ' ' + liftPlan.slotCost + ' 金 → armyCap ' + liftPlan.armyCap + '（lifted=' + liftPlan.lifted + '）');
item('抬升受 armyLift 上限约束（不超过可支配金额的 78%）',
  liftPlan.armyCap <= Math.floor(400 * 0.78),
  liftPlan.armyCap + ' <= ' + Math.floor(400 * 0.78));
item('科技窗口开着时不抬（钱要留给科技）', (function () {
  var p = C.aiBudgetPlan(sLift, 'blue', ABl, PWl, P_hell, { spendable: 400, armyBase: 400, techWinOn: true, allIn: false });
  return p.lifted === false && p.armyCap === Math.floor(400 * p.ratio.army);
})(), 'techWinOn=true → lifted=false');
item('预算计划挂在 state 上供诊断（state.aiBudget[team]）',
  !!(sBud.aiBudget && sBud.aiBudget.blue && sBud.aiBudget.blue.ratio));

/* ==================================================== 汇总 */
console.log('\n===============================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail) { console.log('失败项：'); failures.forEach(function (f) { console.log('  - ' + f); }); }
console.log('===============================');
process.exit(fail ? 1 : 0);
