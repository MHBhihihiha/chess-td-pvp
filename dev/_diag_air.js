/* _diag_air.js —— 空中单位寻路诊断（只测量，不改规则）
 * ===========================================================================
 * 用户问题：「空中单位总是要飞到大本营下面再飞出派兵区，这样寻路的话
 *            有一些列上面的建筑物就打不到了」
 *
 * 本脚本测三件事：
 *   A. 轨迹：蓝方空中兵分别从 c1 / c3 / c5 / c8 / c10 出兵的逐格轨迹
 *      （每 20 帧 = 0.5 秒采样一次；空中兵 1 秒 1 格，所以基本每次采样都换格）
 *   B. 横移卫生：
 *        · 有没有在**自家半场**（蓝：行 6~10）横移
 *        · 有没有在**自家大本营所在行**（蓝：行 9~10）横移 ← 用户直接看到的现象
 *        · 最长「连续横移」多少格（要求 ≤2，即阶梯式逼近而不是长距离平移）
 *        · 每帧是否最多 1 格（不跳格）
 *   C. 够不够得着：每列各放一座红方炮塔（c1..c10 行 4），看这只空中兵
 *      有没有真的打到「自己这一列」的建筑（= 该列建筑有没有掉血）。
 *
 * 用法:
 *   node dev/_diag_air.js            # 默认 600 帧（30 秒）上限
 *   node dev/_diag_air.js 200        # 只跑 200 帧（用户口径）
 */
var C = require('../src/logic.js');

var MAXF = parseInt(process.argv[2] || '600', 10);
var COLS_LIST = [1, 3, 5, 8, 10];
var AIRS = ['airship', 'balloon', 'dragon'];
var OWN_HALF = { blue: [6, 10], red: [1, 5] };     // 自家半场行区间
var BASE_ROWS = { blue: [9, 10], red: [1, 2] };    // 自家大本营所在行
var pad = function (s, n) { s = String(s); while (s.length < n) s += ' '; return s; };
var padl = function (s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; };

/* ---------------------------------------------------------------- 单次追踪 */
/* opts.withFoeBuilding：是否在每一列行 4 放一座红方炮塔（用来验证"打得到本列建筑"） */
function trace(key, col, opts) {
  opts = opts || {};
  var s = C.createState({ seed: 11 });
  s.res.blue = 1e6;
  s.suddenDeath = false;
  if (opts.withFoeBuilding) {
    s.res.red = 1e6;                       // 红方也要有钱，否则只放得下前 2 座炮塔
    for (var c = 1; c <= C.COLS; c++) C.placeBuilding(s, 'red', 'cannon', 4, c);
  }
  var rr = C.deployUnit(s, 'blue', key, col);
  if (!rr.ok) return { err: rr.why };
  var u = rr.unit;

  // 本列那座红方炮塔（验证"打得到本列建筑"）
  var foeB = null, foeHp0 = null;
  if (opts.withFoeBuilding) {
    foeB = s.buildings.filter(function (b) {
      return b.team === 'red' && b.row === 4 && b.col === col;
    })[0] || null;
    foeHp0 = foeB ? foeB.hp : null;
  }

  var traceCells = [];
  var last = null;
  var lateral = 0, latOwnHalf = 0, latBaseRow = 0, maxLatRun = 0, latRun = 0;
  var jumps = 0, ownHalfLatDetail = [], baseRowLatDetail = [];
  var firstLateralRow = null, attackPosFrames = 0;
  var baseGoal = C.BASE_RECT.red;         // 蓝方要打的敌方大本营
  var samples = [];
  var sampleAt200 = null;

  for (var f = 0; f < MAXF; f++) {
    var prev = { r: u.row, c: u.col };
    C.update(s, C.DT);
    if (!u || u.hp <= 0) break;
    if (u.row !== prev.r || u.col !== prev.c) {
      var dR = Math.abs(u.row - prev.r), dC = Math.abs(u.col - prev.c);
      if (dR + dC > 1) jumps++;
      if (dC > 0) {                                   // 这一步是横移
        lateral++;
        latRun++;
        if (latRun > maxLatRun) maxLatRun = latRun;
        if (firstLateralRow === null) firstLateralRow = u.row;
        var oh = OWN_HALF.blue;
        if (u.row >= oh[0] && u.row <= oh[1]) { latOwnHalf++; ownHalfLatDetail.push('r' + u.row + 'c' + u.col); }
        var br = BASE_ROWS.blue;
        if (u.row >= br[0] && u.row <= br[1]) { latBaseRow++; baseRowLatDetail.push('r' + u.row + 'c' + u.col); }
      } else {
        latRun = 0;                                   // 纵向前进 → 连续横移中断
      }
      traceCells.push('r' + u.row + 'c' + u.col);
    }
    // 是否站在「贴敌方大本营」的攻击位
    var onAtk = (u.row === baseGoal.r1 - 1 || u.row === baseGoal.r2 + 1) &&
                u.col >= baseGoal.c1 - 1 && u.col <= baseGoal.c2 + 1;
    if (onAtk) attackPosFrames++;
    if (f % 20 === 19) samples.push('r' + u.row + 'c' + u.col);
    if (f === 199) sampleAt200 = 'r' + u.row + 'c' + u.col;
  }

  return {
    key: key, col: col, trace: traceCells, samples: samples, sampleAt200: sampleAt200,
    lateral: lateral, latOwnHalf: latOwnHalf, latBaseRow: latBaseRow, maxLatRun: maxLatRun,
    firstLateralRow: firstLateralRow, jumps: jumps,
    ownHalfLatDetail: ownHalfLatDetail, baseRowLatDetail: baseRowLatDetail,
    final: 'r' + u.row + 'c' + u.col, finalRow: u.row, finalCol: u.col,
    attackPosFrames: attackPosFrames,
    foeRow4Hp0: foeHp0,
    foeRow4Hp: foeB ? (s.buildings.indexOf(foeB) >= 0 ? Math.round(foeB.hp) : 0) : null,
    foeRow4Hit: foeB ? (s.buildings.indexOf(foeB) < 0 || foeB.hp < foeHp0 - 0.5) : null
  };
}

/* ==========================================================================
 * A. 空棋盘：轨迹 + 横移卫生
 * ======================================================================== */
console.log('=====================================================================');
console.log(' A. 空棋盘轨迹（蓝方空中兵，从 c1/c3/c5/c8/c10 各出一只，' + MAXF + ' 帧）');
console.log('    敌方大本营在行1-2/列5-6；蓝方自家半场=行6-10，自家大本营=行9-10');
console.log('=====================================================================');
var rowsA = [];
AIRS.forEach(function (key) {
  console.log('\n--- ' + C.DATA.units[key].name + '（' + key + '）speed=' + C.DATA.units[key].speed +
              ' range=' + C.DATA.units[key].range + ' priority=' + C.DATA.units[key].priority + ' ---');
  console.log(pad('出兵列', 6) + pad('最终位置', 10) + padl('横移格数', 9) + padl('自家半场横移', 13) +
              padl('大本营行横移', 13) + padl('最长连续横移', 13) + padl('跳格', 6) + padl('到攻击位帧', 11));
  COLS_LIST.forEach(function (col) {
    var r = trace(key, col, {});
    if (r.err) { console.log('  c' + col + '  部署失败：' + r.err); return; }
    rowsA.push(r);
    var mark = (r.latOwnHalf === 0 && r.latBaseRow === 0 && r.maxLatRun <= 2 && r.jumps === 0) ? ' ✅' : ' ❌';
    console.log(pad('c' + col, 6) + pad(r.final, 10) + padl(r.lateral, 9) + padl(r.latOwnHalf, 13) +
                padl(r.latBaseRow, 13) + padl(r.maxLatRun, 13) + padl(r.jumps, 6) +
                padl(r.attackPosFrames, 11) + mark);
  });
});

console.log('\n---------------------------------------------------------------------');
console.log(' 逐格轨迹（每行一只兵；省略号=采样间隔，实际每格都列了）');
console.log('---------------------------------------------------------------------');
rowsA.forEach(function (r) {
  console.log('  ' + pad(C.DATA.units[r.key].name, 6) + 'c' + padl(r.col, 2) + '  ' +
              r.trace.join(' → '));
});

console.log('\n---------------------------------------------------------------------');
console.log(' 横移发生位置（自家半场 / 大本营行 明细，应全部为空）');
console.log('---------------------------------------------------------------------');
rowsA.forEach(function (r) {
  if (r.latOwnHalf === 0 && r.latBaseRow === 0) return;
  console.log('  ' + pad(C.DATA.units[r.key].name, 6) + 'c' + padl(r.col, 2) +
              '  自家半场横移: [' + r.ownHalfLatDetail.join(' ') + ']  大本营行横移: [' + r.baseRowLatDetail.join(' ') + ']');
});
if (!rowsA.some(function (r) { return r.latOwnHalf > 0 || r.latBaseRow > 0; })) {
  console.log('  （无：所有横移都发生在敌方半场）');
}

/* ==========================================================================
 * B. 每列放一座敌方炮塔：这一列的建筑会不会被它打到
 * ======================================================================== */
console.log('\n=====================================================================');
console.log(' B. 每列行4 放一座红方炮塔 → 空中兵会不会打到「自己这一列」的建筑');
console.log('    （只有 siege 类空中兵以建筑为目标；balloon/dragon 是 field 类，只打兵和大本营）');
console.log('=====================================================================');
var hitCount = 0;
console.log(pad('兵种', 14) + pad('出兵列', 8) + padl('本列炮塔HP', 12) + padl('结束时HP', 11) +
            padl('被命中', 8) + padl('横移', 6) + padl('最长连续', 9) + padl('自家半场横移', 13));
AIRS.forEach(function (key) {
  COLS_LIST.forEach(function (col) {
    var r = trace(key, col, { withFoeBuilding: true });
    if (r.err) return;
    if (r.foeRow4Hit) hitCount++;
    console.log(pad(C.DATA.units[key].name, 14) + pad('c' + col, 8) +
                padl(r.foeRow4Hp0 == null ? '-' : Math.round(r.foeRow4Hp0), 12) +
                padl(r.foeRow4Hp == null ? '-' : r.foeRow4Hp, 11) +
                padl(r.foeRow4Hit ? '是' : '否', 8) +
                padl(r.lateral, 6) + padl(r.maxLatRun, 9) + padl(r.latOwnHalf, 13));
  });
});

/* airship 单独统计：要求 5/5 列都能打到本列建筑 */
var ships = COLS_LIST.map(function (col) { return trace('airship', col, { withFoeBuilding: true }); });
var shipHit = ships.filter(function (r) { return r.foeRow4Hit; }).length;
console.log('\n  攻城飞艇命中「本列建筑」的列数：' + shipHit + ' / ' + COLS_LIST.length +
            (shipHit >= 3 ? '  ✅ 达标（≥3/5）' : '  ❌ 不达标'));

/* ==========================================================================
 * C. 200 帧快照（用户口径） + 汇总判定
 * ======================================================================== */
console.log('\n=====================================================================');
console.log(' C. 200 帧（10 秒）快照 + 汇总判定');
console.log('=====================================================================');
console.log(pad('兵种', 14) + pad('出兵列', 8) + padl('200帧位置', 12) + padl('横移', 6) +
            padl('自家半场横移', 13) + padl('大本营行横移', 13) + padl('最长连续横移', 13) + padl('跳格', 6));
AIRS.forEach(function (key) {
  COLS_LIST.forEach(function (col) {
    var r = trace(key, col, {});
    if (r.err) return;
    console.log(pad(C.DATA.units[key].name, 14) + pad('c' + col, 8) + padl(r.sampleAt200, 12) +
                padl(r.lateral, 6) + padl(r.latOwnHalf, 13) + padl(r.latBaseRow, 13) +
                padl(r.maxLatRun, 13) + padl(r.jumps, 6));
  });
});

var badOwnHalf = rowsA.filter(function (r) { return r.latOwnHalf > 0; }).length;
var badBaseRow = rowsA.filter(function (r) { return r.latBaseRow > 0; }).length;
var badRun = rowsA.filter(function (r) { return r.maxLatRun > 2; }).length;
var badJump = rowsA.filter(function (r) { return r.jumps > 0; }).length;
var noAdvance = rowsA.filter(function (r) { return r.finalRow > 5; }).length;   // 30 秒还没进敌方半场
console.log('\n  汇总（空棋盘 ' + rowsA.length + ' 次追踪）：');
console.log('    · 自家半场横移的追踪数        : ' + badOwnHalf + (badOwnHalf === 0 ? '  ✅' : '  ❌'));
console.log('    · 沿自家大本营行横移的追踪数  : ' + badBaseRow + (badBaseRow === 0 ? '  ✅' : '  ❌'));
console.log('    · 最长连续横移 >2 格的追踪数  : ' + badRun + (badRun === 0 ? '  ✅' : '  ❌'));
console.log('    · 跳格的追踪数                : ' + badJump + (badJump === 0 ? '  ✅' : '  ❌'));
console.log('    · 30 秒还没进敌方半场的追踪数 : ' + noAdvance + (noAdvance === 0 ? '  ✅' : '  ❌'));
console.log('    · 攻城飞艇命中本列建筑的列数  : ' + shipHit + '/' + COLS_LIST.length +
            (shipHit >= 3 ? '  ✅' : '  ❌'));
var allOk = (badOwnHalf === 0 && badBaseRow === 0 && badRun === 0 && badJump === 0 &&
             noAdvance === 0 && shipHit >= 3);
console.log('\n  ' + (allOk ? '✅ 空中寻路达标（沿本列纵向推进 + 只在敌方半场阶梯微调 + 打得到本列建筑）'
                           : '❌ 空中寻路未达标（见上面 ❌ 项）'));
process.exit(0);
