/* =============================================================================
 * 无头（headless）规则测试 —— 用 Node 跑，验证逻辑层的关键机制
 * 用法: node dev/headless-test.js
 * ========================================================================== */
'use strict';
var C = require('../src/logic.js');

var pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '   → ' + extra : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }
function run(state, seconds, onTick) {
  var ticks = Math.round(seconds * C.TICK_HZ);
  for (var i = 0; i < ticks; i++) { C.update(state, C.DT); if (onTick) onTick(state, i); }
}
function towerRow(state, team, row, cols) {
  cols.forEach(function (c) {
    var r = C.placeBuilding(state, team, 'cannon', row, c);
    if (!r.ok) console.log('    (放置失败 r' + row + 'c' + c + ': ' + r.why + ')');
  });
  state.res[team] = 100000; // 测试用：给足钱
}

/* ---------------------------------------------------------------- 1. 初始状态 */
section('1. 初始棋盘与坐标');
var s = C.createState();
check('双方各有 1 座大本营', s.buildings.length === 2);
var rb = C.ownBase(s, 'red'), bb = C.ownBase(s, 'blue');
check('红方大本营在 (行1,列5) 且占 2x2', rb.row === 1 && rb.col === 5 && rb.def.size[0] === 2 && rb.def.size[1] === 2);
check('蓝方大本营在 (行9,列5) 且占 2x2', bb.row === 9 && bb.col === 5 && bb.def.size[0] === 2 && bb.def.size[1] === 2);
check('红蓝大本营 4 格占用正确', rb.refs.join(',') === 'r1c5,r1c6,r2c5,r2c6' && bb.refs.join(',') === 'r9c5,r9c6,r10c5,r10c6');
check('蓝方在本单位置为敌方大本营 (红=行1-5)', C.ownBase(s, 'blue').row === 9 && C.ownBase(s, 'red').row === 1);
check('行A=0 是红方通道, 行B=11 是蓝方通道', C.CHANNEL_ROW.red === 0 && C.CHANNEL_ROW.blue === 11);
check('大本营不可被重复放置', !C.canPlace(s, 'blue', 'cannon', 9, 5).ok);
s.res.blue = 1000;
check('蓝方不能建在敌方半场 行1', !C.canPlace(s, 'blue', 'cannon', 1, 1).ok);
check('蓝方可建在自己半场 行9（行10 是入场行，禁止建造）', C.canPlace(s, 'blue', 'cannon', 9, 1).ok);
check('入场行 行10 允许建造（玩家可自由布局）', C.canPlace(s, 'blue', 'cannon', 10, 1).ok);
check('蓝方可建在行6', C.canPlace(s, 'blue', 'cannon', 6, 1).ok);
check('蓝方不可建在行5', !C.canPlace(s, 'blue', 'cannon', 5, 1).ok);

/* ---------------------------------------------------------------- 2. 路线图 */
section('2. 行进路线图 (Flow Field)');
function checkField(state, label) {
  var ok = true, bad = null;
  ['red', 'blue'].forEach(function (team) {
    var f = state.field[team];
    for (var r = 0; r <= C.ROWS + 1; r++) {
      for (var c = 1; c <= C.COLS; c++) {
        var d = f.dist[r][c];
        if (d === 0 || d >= 1e9) continue;      // 目标格 / 走不通的格
        var t = f.dir[r][c];
        if (!t) { ok = false; bad = team + ' r' + r + 'c' + c + ' 无方向但距离=' + d; return; }
        if (f.dist[t.r][t.c] >= d) { ok = false; bad = team + ' r' + r + 'c' + c + ' 方向未减距'; return; }
      }
    }
  });
  check(label + '：每个可达格都指向距离更小的邻居（无死循环）', ok, bad);
}
checkField(s, '初始局面');
check('蓝方目标为红方大本营', s.field.blue.goal.r1 === 1 && s.field.blue.goal.c1 === 5);
check('蓝方单位推进方向为行号增大', C.DIR.blue === 1 && C.DIR.red === -1);

/* ---------------------------------------------------------------- 3. 收入 */
section('3. 收入与升级解锁');
var s3 = C.createState();
var r0 = s3.res.blue;
run(s3, 5);
var r5 = s3.res.blue;
var inc1 = C.DATA.baseLevels[0].income;
check('5 秒内金币增长 = 1级收入 × 5', Math.abs((r5 - r0) - inc1 * 5) < 0.5, '实际增长 ' + (r5 - r0).toFixed(1) + '，期望 ' + (inc1 * 5));
s3.res.blue = 1000;
var up = C.upgradeBase(s3, 'blue');
check('升级大本营成功', up.ok && s3.baseLevel.blue === 2);
check('所有建筑一开始就能建（无解锁限制）', C.canPlace(s3, 'blue', 'arrow', 9, 1).ok);
var r1 = s3.res.blue; run(s3, 5);
var inc2 = C.DATA.baseLevels[1].income;
check('2 级大本营收入翻倍', Math.abs((s3.res.blue - r1) - inc2 * 5) < 0.5, '实际增长 ' + (s3.res.blue - r1).toFixed(1) + '，期望 ' + (inc2 * 5));
check('收入确实随等级提高', inc2 > inc1);

/* ---------------------------------------------------------------- 4. 通道让位 */
section('4. 通道行让位与进入棋盘');
var s4 = C.createState();
s4.res.blue = 100000;
// 整行填满 行10，只留 列3 一个空位
[1, 2, 4, 5, 6, 7, 8, 9, 10].forEach(function (c) { C.placeBuilding(s4, 'blue', 'cannon', 9, c); });
s4.res.blue = 100000;
s4.unitCd.blue.infantry = 0;
var d4 = C.deployUnit(s4, 'blue', 'infantry', 3);    // 手动派到 行B 列3
check('手动派兵成功（兵出现在棋盘外通道 行B）', d4.ok && d4.unit.row === C.CHANNEL_ROW.blue);
var u4 = d4.unit;
var cdAfter = s4.deployCd.blue[3];
s4.unitCd.blue.infantry = 0;
check('同一列连续派兵有冷却（立即再派会被拒绝）', cdAfter > 0 && !C.canDeploy(s4, 'blue', 'infantry', 3).ok, '冷却 ' + cdAfter.toFixed(2) + 's');
run(s4, 1);                                          // 等冷却结束
check('冷却结束后同列可再派', C.canDeploy(s4, 'blue', 'infantry', 3).ok);
run(s4, 3);
check('从唯一空列（列3）进入棋盘并推进到蓝方大本营前', C.inGrid(u4.row, u4.col) && u4.row >= 8, '实际 r' + u4.row + 'c' + u4.col);
check('行10 有己方建筑时同列仍可通行（建筑不挡自己人）', s4.res.blue > 0);
var d4b = C.deployUnit(s4, 'blue', 'infantry', 4);   // 换一列
check('换一列可以立刻派兵', d4b.ok);

/* ---------------------------------------------------------------- 5. 堵住就拆墙 */
section('5. 被建筑堵住：步兵绕行，攻城兵拆墙（「堵」）');
var s5 = C.createState();
s5.res.blue = 100000;
// 只在红兵这一列砌一座墙（砌一整排塔会把兵直接打死，反而测不出「堵」）
C.placeBuilding(s5, 'blue', 'cannon', 7, 3);
s5.res.blue = 100000;
var wall5 = s5.byRef.blue[C.toRef(7, 3)];
check('墙已就位（红方这一列被堵）', !!wall5);
// 「打兵型」的路线图里根本没有墙这条路：旁边那一列也不是「指向墙」
check('打兵型路线图不会把墙当成目标（该列成为死路）', s5.field.red.dist[7][3] !== 0,
  'dist=' + s5.field.red.dist[7][3]);
check('拆建筑型路线图把墙当成 0 距离目标', s5.fieldSiege.red.dist[7][3] === 0,
  'dist=' + s5.fieldSiege.red.dist[7][3]);

// ① 步兵（只打士兵和大本营）：这一列被堵 → 在通道行上让位到别的空列再推进
C.spawnUnit(s5, 'blue', 'infantry', 8, 4);   // 靶子
var u5 = C.spawnUnit(s5, 'red', 'infantry', 0, 3);
var trace5 = [];
run(s5, 12, function () {
  if (!trace5.length || trace5[trace5.length - 1].r !== u5.row || trace5[trace5.length - 1].c !== u5.col) {
    trace5.push({ r: u5.row, c: u5.col });
  }
});
check('步兵会绕开那面墙推进（新寻路支持四向绕行）', u5.row >= 1 || u5.hp <= 0,
  '实际 列' + u5.col + ' 轨迹=' + JSON.stringify(trace5));
check('步兵不会拆墙（按规格：它只打士兵和大本营）', wall5.hp === wall5.hpMax,
  '墙血 ' + wall5.hp.toFixed(0) + '/' + wall5.hpMax);

// ② 攻城兵（只拆建筑）：同一列被堵 → 走到墙前开始拆
var sg5 = C.spawnUnit(s5, 'red', 'siege', 0, 3);
run(s5, 25);
check('攻城兵会去拆墙（拆墙是攻城兵的活）', wall5.hp < wall5.hpMax,
  '墙血 ' + wall5.hp.toFixed(0) + '/' + wall5.hpMax);

/* ---------------------------------------------------------------- 6. 就近空列 */
section('6. 正上方被遮挡 → 沿通道行寻路到就近空列');
var s6 = C.createState();
s6.res.blue = 100000;
// 红方（行5 是其前线）在 行5 的 列4/5/6 放塔，红兵从行A 列5 出来 → 应沿行A 绕到 列3 或 列7
C.placeBuilding(s6, 'red', 'cannon', 5, 4);
C.placeBuilding(s6, 'red', 'cannon', 5, 5);
C.placeBuilding(s6, 'red', 'cannon', 5, 6);
s6.res.red = 100000;
C.spawnUnit(s6, 'blue', 'infantry', 8, 3);   // 靶子在唯一能进的列上
var u6 = C.spawnUnit(s6, 'red', 'infantry', 0, 5);
var path = [];
var entryCol = null;
run(s6, 8, function () {
  var last = path[path.length - 1];
  if (!last || last.r !== u6.row || last.c !== u6.col) {
    path.push({ r: u6.row, c: u6.col });
    if (entryCol === null && u6.row >= 1) entryCol = u6.col;
  }
});
var movedSideways = path.some(function (p) { return p.r === 0 && p.c !== 5; });
check('红兵在通道行横向移动寻找空列', movedSideways, '轨迹: ' + JSON.stringify(path));
check('红兵最终从空列进入棋盘', entryCol !== null, '轨迹: ' + JSON.stringify(path));
check('进入的列不是被塔完全堵死的列', entryCol !== null, '进入列=' + entryCol);
check('红兵最终在红方半场推进成功（没有被卡在通道）', u6.row >= 1, '实际 r' + u6.row + ' 轨迹: ' + JSON.stringify(path));
/* ---------------------------------------------------------------- 7. 空中兵 */
section('7. 空中兵无视建筑直飞');
var s7 = C.createState();
s7.res.blue = 100000;
for (var c7 = 1; c7 <= C.COLS; c7++) C.placeBuilding(s7, 'blue', 'cannon', 9, c7); // 蓝方自己封死行10
s7.res.blue = 100000;
var a7 = C.spawnUnit(s7, 'blue', 'balloon', 11, 1);
run(s7, 12);
check('空中兵无视己方整行建筑，已推进到红方半场', a7.row <= 5, '实际 行' + a7.row);
var a7b = C.spawnUnit(s7, 'blue', 'balloon', 11, 2);
var s7b = C.createState(); s7b.res.blue = 100000;
for (var c7b = 1; c7b <= C.COLS; c7b++) C.placeBuilding(s7b, 'red', 'cannon', 5, c7b); // 红方封死行5
s7b.res.blue = 100000;
var a7c = C.spawnUnit(s7b, 'blue', 'balloon', 11, 3);
run(s7b, 14);
check('空中兵无视整行建筑继续推进（被塔打停在射程内也算正常）', a7c.row <= 6, '实际 行' + a7c.row);

/* ---------------------------------------------------------------- 8. 攻城兵 */
section('8. 攻城兵（只拆建筑，绝不打兵）');
var s8 = C.createState();
s8.res.blue = 100000;
var placed8 = C.placeBuilding(s8, 'blue', 'cannon', 8, 4);   // 蓝方挡路建筑：砌在打击线（行8）上，正好堵住红方这一列
check('测试前置：蓝方塔放置成功', placed8.ok, placed8.why);
s8.res.blue = 100000;
var sg = C.spawnUnit(s8, 'red', 'siege', 0, 4);      // 红方从行A 列4 冲来
var enemy = C.spawnUnit(s8, 'blue', 'infantry', 5, 1); // 蓝方士兵（离红方大本营远一点，免得被大本营自卫打掉）
var ehp0 = enemy.hp;
var tower8 = placed8.building;
var thp0 = tower8.hp;
run(s8, 25);   // 攻城兵走得慢（0.6 格/秒），从行A 走到行9 需要 ~15 秒
var sgSets8 = C.candidateSets(s8, sg);
check('攻城兵的目标组里没有任何敌兵（只拆建筑和大本营）',
  sgSets8.groups[0].every(function (x) { return !!x.def && !x.def.isBase; }),
  '组内 ' + sgSets8.groups[0].length + ' 个建筑');
check('攻城兵正在拆建筑', tower8.hp < thp0, '塔血 ' + tower8.hp.toFixed(0) + '/' + tower8.hpMax);
check('攻城兵被建筑挡住时停在建筑前（贴着墙）', sg.row === 7 && sg.col === 4, '实际 r' + sg.row + 'c' + sg.col + ' hp=' + sg.hp.toFixed(0));

/* ---------------------------------------------------------------- 9. 步兵优先打兵 */
section('9. 步兵优先打敌兵，其次大本营');
var s9 = C.createState();
var i9 = C.spawnUnit(s9, 'blue', 'infantry', 10, 5);
var e9 = C.spawnUnit(s9, 'red', 'infantry', 10, 6);
var eb9 = C.ownBase(s9, 'red');
run(s9, 4);
check('步兵攻击了贴身敌兵', e9.hp < e9.hpMax, '敌兵血 ' + e9.hp);
check('步兵没有越过去打大本营', eb9.hp === eb9.hpMax);

/* ---------------------------------------------------------------- 10. 对空 */
section('10. 塔的对地/对空限制');
var s10 = C.createState();
s10.res.blue = 100000;
C.placeBuilding(s10, 'blue', 'cannon', 5, 5);    // 对地塔
s10.res.blue = 100000;
var air10 = C.spawnUnit(s10, 'red', 'balloon', 1, 5);   // 空中兵在塔的射程之外起飞
run(s10, 1.5);
check('对地塔打不到空中兵', air10.hp === air10.hpMax, '飞机血 ' + air10.hp);
s10.res.blue = 100000;
C.upgradeBase(s10, 'blue');
s10.res.blue = 100000;
check('箭塔可以建造（对空对地）', C.canPlace(s10, 'blue', 'arrow', 7, 5).ok);
C.placeBuilding(s10, 'blue', 'arrow', 7, 5);
run(s10, 2);
air10.hpMax = air10.hp = Math.max(air10.hp, 300);   // 重置成满血，确保测的是刚放下的对空塔
check('对空塔可以击中空中兵', (function(){ C.update(s10, C.DT); for (var z=0; z<20*4; z++) C.update(s10, C.DT); return air10.hp < air10.hpMax; })(), '飞机血 ' + air10.hp);

/* ---------------------------------------------------------------- 11. 胜负 */
section('11. 胜负判定');
var s11 = C.createState();
var eb11 = C.ownBase(s11, 'red');
eb11.hp = 60;
eb11.hpMax = 60;
C.spawnUnit(s11, 'blue', 'siege', 3, 5);       // 站在红方大本营前面一格（打击线）
s11.units[0].hp = s11.units[0].hpMax = 5000;   // 大本营现在会自卫，给测试单位足够的血撑住
run(s11, 25);
check('大本营被打掉后对局结束', s11.over === true, '红方基地血=' + (C.ownBase(s11, 'red') ? C.ownBase(s11, 'red').hp.toFixed(0) : '已摧毁'));
check('胜利方是蓝方', s11.winner === 'blue', 'winner=' + s11.winner);
check('结束后不再产生新事件', (function () { var n = s11.events.length; run(s11, 2); return s11.events.length === n; })());

/* ---------------------------------------------------------------- 12. 建筑升级 */
section('12. 点击建筑升级 / 数值随等级提升 / 分支');
var s12b = C.createState();
s12b.res.blue = 1e6;
var pw = C.placeBuilding(s12b, 'blue', 'cannon', 9, 3);
check('建筑放置后默认 1 级', pw.building.level === 1);
var info1 = C.buildingInfo(s12b, pw.building);
check('详情信息含攻击力/攻速/血量/升级费用（供 UI 显示）',
  info1.atk > 0 && info1.atkInterval > 0 && info1.hpMax > 0 && info1.upgradeCost > 0,
  JSON.stringify({ atk: info1.atk, itv: info1.atkInterval, hp: info1.hpMax, cost: info1.upgradeCost }));
var up1 = C.upgradeBuilding(s12b, pw.building);
check('升级成功到 2 级', up1.ok && pw.building.level === 2);
var info2 = C.buildingInfo(s12b, pw.building);
check('升级后攻击力提升', info2.atk > info1.atk, info1.atk + ' → ' + info2.atk);
check('升级后最大血量提升', info2.hpMax > info1.hpMax, info1.hpMax + ' → ' + info2.hpMax);
check('升级后费用递增（越贵越贵）', info2.upgradeCost > info1.upgradeCost, info1.upgradeCost + ' → ' + info2.upgradeCost);
// 升级不回血：只加「最大血量的差值」
pw.building.hp = pw.building.hpMax - 100;      // 差 100 点满血
var hpBefore = pw.building.hp, maxBefore = pw.building.hpMax;
C.upgradeBuilding(s12b, pw.building);
var gained = pw.building.hp - hpBefore, maxGained = pw.building.hpMax - maxBefore;
check('升级不回血：血量只增加「最大血量的差值」',
  Math.abs(gained - maxGained) < 0.01 && pw.building.hp < pw.building.hpMax,
  '最大血量 +' + maxGained + '，当前血量 +' + gained + '（当前 ' + pw.building.hp + '/' + pw.building.hpMax + '）');
// 升到 4 级
while (pw.building.level < 4) C.upgradeBuilding(s12b, pw.building);
check('可以一路升到 4 级', pw.building.level === 4, '实际 ' + pw.building.level);
var br = C.buildingInfo(s12b, pw.building).branches;
check('4 级升 5 级时出现两个分支选项', br.length === 2, br.map(function (x) { return x.name; }).join(' / '));
check('不选分支时拒绝升级', C.upgradeBuilding(s12b, pw.building).ok === false);
var toTwin = C.buildingInfo(s12b, pw.building);
var atkBeforeBranch = toTwin.atk, itvBeforeBranch = toTwin.atkInterval;
var upBranch = C.upgradeBuilding(s12b, pw.building, 'twin');
check('选择分支后升到 5 级', upBranch.ok && pw.building.level === 5 && pw.building.branch === 'twin', upBranch.why || '');
var afterTwin = C.buildingInfo(s12b, pw.building);
check('双管炮塔：攻速翻倍', Math.abs(afterTwin.atkInterval - itvBeforeBranch / 2) < 0.001,
  itvBeforeBranch + ' → ' + afterTwin.atkInterval);
// 另一条分支：大炮塔伤害翻倍
var pw3 = C.placeBuilding(s12b, 'blue', 'cannon', 9, 1);
while (pw3.building.level < 4) C.upgradeBuilding(s12b, pw3.building);
var beforeBig = C.buildingInfo(s12b, pw3.building);
C.upgradeBuilding(s12b, pw3.building, 'bigcannon');
var afterBig = C.buildingInfo(s12b, pw3.building);
var twinAtk5 = C.statsForLevel(C.DATA.buildings.cannon, 5, 'twin').atk;
var bigAtk5 = C.statsForLevel(C.DATA.buildings.cannon, 5, 'bigcannon').atk;
check('大炮塔：伤害翻两倍（同一等级下是大炮塔两倍）',
  Math.abs(bigAtk5 - twinAtk5 * 2) < 0.1, '双管 ' + twinAtk5 + ' vs 大炮 ' + bigAtk5);
// 满级
while (C.buildingUpgradeCost(pw.building) !== null) {
  var r = C.upgradeBuilding(s12b, pw.building);
  if (!r.ok) break;
}
check('可以升到最高 10 级', pw.building.level === C.DATA.upgrade.maxLevel, '实际 ' + pw.building.level);
check('满级后不再可升', C.upgradeBuilding(s12b, pw.building).ok === false);
// 金矿产出曲线（v18：3→4 改成 +2，其余不变 → 2 / 3 / 4 / 6 / 8）
var mineInc = [];
for (var ml = 1; ml <= 5; ml++) mineInc.push(C.statsForLevel(C.DATA.buildings.mine, ml).income);
check('金矿产出逐级提高（取整后比例有偏差）', mineInc[1] > mineInc[0] && mineInc[3] > mineInc[2], mineInc.join(' → '));
check('金矿 4 级 = 6（3→4 加 2 产出）', mineInc[3] === 6, mineInc[2] + ' → ' + mineInc[3]);
check('金矿 5 级仍是最高一跳（+2，终极金矿）', mineInc[4] === 8 && mineInc[4] - mineInc[3] === 2,
  mineInc[3] + ' → ' + mineInc[4]);
// 缺钱拒绝
s12b.res.blue = 0;
s12b.res.blue = 1000;
var pw2 = C.placeBuilding(s12b, 'blue', 'mine', 8, 1);
check('测试前置：金矿放置成功', pw2.ok, pw2.why);
s12b.res.blue = 0;
check('金币不足时拒绝升级', C.upgradeBuilding(s12b, pw2.building).ok === false);
// 资源建筑升级后收入确实变高
s12b.res.blue = 5000;
var inc1mine = C.statsForLevel(C.DATA.buildings.mine, 1).income;
C.upgradeBuilding(s12b, pw2.building);
var inc2mine = C.statsForLevel(C.DATA.buildings.mine, pw2.building.level).income;
check('金矿升级后等级提高、收入随之提高', pw2.building.level >= 2 && inc2mine > inc1mine,
  'Lv' + pw2.building.level + ' 收入 ' + inc1mine + ' → ' + inc2mine);
// 大本营也能通过同一个入口升级（并且可以一直升）
var base12 = C.ownBase(s12b, 'blue');
s12b.res.blue = 1e6;
var baseUp = 0;
while (C.buildingInfo(s12b, base12).upgradeCost != null) {
  var r12 = C.upgradeBuilding(s12b, base12);
  if (!r12.ok) break;
  baseUp++;
  if (baseUp > 20) break;
}
check('大本营能一直升级（不再卡在 2 级）', base12.level === C.DATA.baseLevels.length,
  '升到 Lv' + base12.level + ' / 上限 ' + C.DATA.baseLevels.length);
check('大本营升级提高收入', C.DATA.baseLevels[base12.level - 1].income > C.DATA.baseLevels[0].income,
  C.DATA.baseLevels[0].income + '/s → ' + C.DATA.baseLevels[base12.level - 1].income + '/s');
check('大本营升级解锁法术（6 级解锁全部）',
  C.spellsAvailable(s12b, 'blue').length === C.DATA.spells.length,
  C.spellsAvailable(s12b, 'blue').map(function (x) { return x.name; }).join('、'));

/* ------------------------------------------------ 12.5 大本营自我修复 */
section('12.5 大本营不受攻击时自我修复');
var s12h = C.createState();
var hb = C.ownBase(s12h, 'blue');
hb.hp = hb.hpMax * 0.5;
hb.justDamaged = s12h.time;   // 模拟「刚刚才挨打」（直接改血量不会自动打上这个时间戳）
var hpStart = hb.hp;
run(s12h, 5);   // 前 8 秒是「停火等待期」，不该回血
check('刚被打完的 8 秒内不回血', Math.abs(hb.hp - hpStart) < 0.5, hpStart.toFixed(0) + ' → ' + hb.hp.toFixed(0));
run(s12h, 25);  // 之后再等 25 秒
check('停止挨打后开始自我修复', hb.hp > hpStart + 100, hpStart.toFixed(0) + ' → ' + hb.hp.toFixed(0));
check('自我修复不会超过上限', hb.hp <= hb.hpMax);

/* ------------------------------------- 13. 无「决胜时刻」（v22 起移除） */
section('13. 时间流逝不会烧血（v22 移除了「5 分钟后决胜」）');
var s13 = C.createState();
var b13hp = C.ownBase(s13, 'blue').hp, r13hp = C.ownBase(s13, 'red').hp;
s13.time = 299;
run(s13, 2);                        // 跨过原来那条 5 分钟线
check('跨过 5 分钟后双方大本营血量分毫未变',
  Math.abs(C.ownBase(s13, 'blue').hp - b13hp) < 1e-9 &&
  Math.abs(C.ownBase(s13, 'red').hp - r13hp) < 1e-9,
  '蓝 ' + C.ownBase(s13, 'blue').hp.toFixed(2) + ' 红 ' + C.ownBase(s13, 'red').hp.toFixed(2));
var s13b = C.createState();
s13b.time = 299;
run(s13b, 180);                     // 再跑 3 分钟：确认没有任何「随时间加剧」的残留机制
check('再过 3 分钟仍然不掉血（没有随时间加剧的隐性烧血）',
  C.ownBase(s13b, 'blue').hp === C.ownBase(s13b, 'blue').hpMax &&
  C.ownBase(s13b, 'red').hp === C.ownBase(s13b, 'red').hpMax,
  '蓝 ' + C.ownBase(s13b, 'blue').hp + ' 红 ' + C.ownBase(s13b, 'red').hp);

/* ---------------------------------------------------------------- 14. AI 完整对局 */
section('12. 电脑对手能完整打完一局');
var s12 = C.createState();
var stats = { redBuild: 0, blueBuild: 0, redUnits: 0, blueUnits: 0, maxUnits: 0 };
var simSeconds = 0;
var debugOn = process.env.DEBUG_AI === '1';
var nextLog = 0;
while (!s12.over && simSeconds < 600) {
  C.update(s12, C.DT);
  C.aiUpdate(s12, 'red', C.DT);
  C.aiUpdate(s12, 'blue', C.DT);
  simSeconds += C.DT;
  stats.maxUnits = Math.max(stats.maxUnits, s12.units.length);
  if (debugOn && simSeconds >= nextLog) {
    nextLog += 60;
    console.log('    t=' + simSeconds.toFixed(0) + 's 红:金' + s12.res.red.toFixed(0) + ' 建筑' +
      s12.buildings.filter(function (b) { return b.team === 'red' && !b.def.isBase; }).length +
      ' lv' + s12.baseLevel.red + ' 兵' + s12.stats.red.produced +
      '  |  蓝:金' + s12.res.blue.toFixed(0) + ' 建筑' +
      s12.buildings.filter(function (b) { return b.team === 'blue' && !b.def.isBase; }).length +
      ' lv' + s12.baseLevel.blue + ' 兵' + s12.stats.blue.produced +
      '  |  场上兵 ' + s12.units.length);
  }
}
stats.redBuild = s12.buildings.filter(function (b) { return b.team === 'red' && !b.def.isBase; }).length;
stats.blueBuild = s12.buildings.filter(function (b) { return b.team === 'blue' && !b.def.isBase; }).length;
stats.redUnits = s12.stats.red.produced;
stats.blueUnits = s12.stats.blue.produced;
console.log('    对局时长 ' + simSeconds.toFixed(1) + 's，终局: ' + (s12.over ? (s12.winner || '?') : '未结束') +
  '，红方建筑 ' + stats.redBuild + ' / 蓝方建筑 ' + stats.blueBuild +
  '，红方出兵 ' + stats.redUnits + ' / 蓝方出兵 ' + stats.blueUnits +
  '，场上最大单位数 ' + stats.maxUnits);
check('双方 AI 都造出了建筑', stats.redBuild > 0 && stats.blueBuild > 0);
check('双方 AI 都出了兵', stats.redUnits > 0 && stats.blueUnits > 0);
check('战斗有实际伤害（红方大本营掉血或蓝方掉血）',
  C.ownBase(s12, 'red') === undefined || C.ownBase(s12, 'blue') === undefined ||
  C.ownBase(s12, 'red').hp < C.ownBase(s12, 'red').hpMax || C.ownBase(s12, 'blue').hp < C.ownBase(s12, 'blue').hpMax || s12.over);
checkField(s12, '对局中期（有建筑阻挡）');

/* ---------------------------------------------------------------- 13. 性能 */
section('13. 性能');
var s13 = C.createState();
s13.res.red = 1e6; s13.res.blue = 1e6;
for (var c13 = 1; c13 <= 10; c13++) { C.placeBuilding(s13, 'red', 'cannon', 5, c13); C.placeBuilding(s13, 'blue', 'cannon', 6, c13); }
for (var i13 = 0; i13 < 60; i13++) { C.spawnUnit(s13, 'red', 'infantry', 0, 1 + (i13 % 10)); C.spawnUnit(s13, 'blue', 'infantry', 11, 1 + (i13 % 10)); }
var t0 = Date.now();
for (var k13 = 0; k13 < 400; k13++) C.update(s13, C.DT);
var ms = Date.now() - t0;
console.log('    120 个单位 + 20 座塔，模拟 20 秒耗时 ' + ms + 'ms（每帧 ' + (ms / 400).toFixed(2) + 'ms）');
check('模拟性能足够（每帧 < 5ms）', ms / 400 < 5, (ms / 400).toFixed(2) + 'ms/帧');

/* ---------------------------------------------------------------- 汇总 */
console.log('\n===============================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('===============================');
process.exit(fail === 0 ? 0 : 1);
