/* _diag6.js —— 验证 P-D「对手建模 + 预判克制」
 * ---------------------------------------------------------------------------
 * 三个实验：
 *
 *   A. 打弱点（受控）：合成棋盘上人为摆出「左厚右薄 / 右厚左薄 / 中路铁桶」三种
 *      敌方塔阵，然后反复调用 aiDeploySmart，看 AI 把兵派到哪一列。
 *      对照组 = 旧规则的等价基线（旧规则在同分时随机 → 10 列均匀 10%）。
 *      → 若 AI 真的在「读对手、打弱点」，它应该显著偏向没设防的那几列。
 *
 *   B. 打弱点（涌现）：AI 对 AI 真打 8 局，统计红方每一次派兵选的列
 *      vs 蓝方该列的防御强度（state.aiFoe[team].laneDefense），算相关系数。
 *      → 负相关 = 越薄越爱打。
 *
 *   C. 预判克制：让对手先狂出空军（40~150s）再停手，观察 AI 的塔型演化
 *      （对空塔 arrow/mage/tesla 数量），与「对手只出地面兵」的对照组比较。
 *      → 空军局的对手空军占比升高 → AI 提前补对空；停手后占比衰减 → 塔型回摆。
 *
 * 用法: node dev/_diag6.js [B 实验秒数，默认 420]
 * 说明：诊断脚本里会给「对手代理」一点起始金币、并锁住它的基地血量，
 *       只为让实验跑满窗口、观察到规律；游戏规则本身没有任何改动。
 */
var fs = require('fs');
var path = require('path');
var Module = require('module');
var C = require('../src/logic.js');

var SECS = parseInt(process.argv[2] || '420', 10);
var r1 = function (x) { return Math.round(x * 10) / 10; };
var r2 = function (x) { return Math.round(x * 100) / 100; };
var pad = function (s, n) { s = String(s); while (s.length < n) s += ' '; return s; };
var padl = function (s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; };

/* ============================ A. 受控实验 ============================ */
console.log('=====================================================================');
console.log(' A. 打弱点（受控）：敌塔只铺半边，AI 的兵派去哪一列？');
console.log('=====================================================================');

/* 在蓝方半场摆一组塔（蓝方 = 行 6..10，大本营在行 9-10、列 5-6） */
var CONFIGS = [
  { name: '左厚右薄（塔只在 1~3 列）', towers: [[7, 2, 'arrow'], [8, 1, 'cannon'], [7, 3, 'mage'], [6, 2, 'mortar']] },
  { name: '右厚左薄（塔只在 8~10 列）', towers: [[7, 9, 'arrow'], [8, 10, 'cannon'], [7, 8, 'mage'], [6, 9, 'mortar']] },
  { name: '中路铁桶（塔只在 4~7 列）', towers: [[7, 5, 'arrow'], [8, 6, 'cannon'], [7, 4, 'mage'], [6, 7, 'mortar']] }
];

function trialA(cfg, diff, seed, calls) {
  var s = C.createState({ seed: seed });
  s.aiPreset.red = diff; s.aiPreset.blue = diff;
  var placed = 0;
  cfg.towers.forEach(function (t) {
    if (C.placeBuilding(s, 'blue', t[2], t[0], t[1]).ok) placed++;
  });
  C.updateFoeProfile(s, 'red', 0.05);
  var P = C.AI_PRESETS[diff];
  var hist = new Array(C.COLS + 2).fill(0), chosenDef = [], n = 0, laneDef = null;
  for (var i = 0; i < calls; i++) {
    // 每次「重新开局」：清空场上单位、重置冷却与金币，保证每次都是独立的选列决策
    s.units.length = 0;
    C.rebuildFields(s);
    for (var c = 0; c <= C.COLS; c++) s.deployCd.red[c] = 0;
    Object.keys(s.unitCd.red).forEach(function (k) { s.unitCd.red[k] = 0; });
    s.res.red = 9999;
    s.aiFocus.red = { col: 0, until: 0 };          // 不继承上一次的主攻列，单独看打分
    C.updateFoeProfile(s, 'red', 0.05);
    var before = s.units.length;
    var A = C.analyzeBoard(s, 'red');
    var ok = C.aiDeploySmart(s, 'red', A, P, false, 9999);
    if (!ok || s.units.length === before) continue;
    var u = s.units[s.units.length - 1];
    hist[u.col]++; n++;
    chosenDef.push(s.aiFoe.red.laneDefense[u.col] / Math.max(1e-9, s.aiFoe.red.defMax));
    laneDef = s.aiFoe.red.laneDefense.slice(1, C.COLS + 1);
  }
  return { hist: hist, n: n, chosenDef: chosenDef, placed: placed, s: s, laneDef: laneDef };
}

var aggA = { n: 0, sumDef: 0, runs: 0, tables: [] };
['hell', 'hard'].forEach(function (diff) {
  CONFIGS.forEach(function (cfg) {
    var merged = new Array(C.COLS + 2).fill(0), mn = 0, sd = 0, laneDef = null;
    [1000, 2024, 7, 3001, 4002].forEach(function (seed) {
      var t = trialA(cfg, diff, seed, 40);
      for (var c = 1; c <= C.COLS; c++) merged[c] += t.hist[c];
      mn += t.n;
      t.chosenDef.forEach(function (d) { sd += d; });
      if (t.laneDef) laneDef = t.laneDef;
    });
    aggA.n += mn; aggA.sumDef += sd; aggA.runs += 1;
    // 「有设防的列 / 没设防的列」直接用 AI 自己的 laneDefense 账本判定（>0.05 视为有设防）
    var cov = [], uncovered = [];
    for (var c2 = 1; c2 <= C.COLS; c2++) {
      var def = laneDef && laneDef[c2 - 1] > 0.05;
      (def ? cov : uncovered).push(c2);
    }
    var inUncov = 0;
    uncovered.forEach(function (c3) { inUncov += merged[c3]; });
    var line = '  列号       ';
    var line2 = '  派兵次数   ';
    for (var c4 = 1; c4 <= C.COLS; c4++) {
      line += padl(c4, 4);
      line2 += padl(merged[c4], 4);
    }
    console.log('\n--- ' + diff + ' · ' + cfg.name + '（5 个种子 × 40 次决策，有效 ' + mn + ' 次）---');
    console.log(line);
    console.log(line2);
    console.log('  AI 认为「有设防」的列 = [' + cov.join(',') + ']    完全没设防的列 = [' + uncovered.join(',') + ']');
    if (mn) {
      console.log('  → 打进「没设防列」的比例 = ' + Math.round(inUncov / mn * 100) + '%   ' +
        '（若均匀随机应 ≈ ' + Math.round(uncovered.length / C.COLS * 100) + '%）');
      console.log('  → 选中列的平均防御强度 = ' + r2(sd / mn).toFixed(3) + '（0 = 完全裸奔 · 1 = 最厚那列）');
    }
  });
});

  console.log('\n  注：5、6 两列在所有难度、所有局面下都会被 `frontBlocked` 判为「出兵口被挡」');
  console.log('      （自家大本营就占在 5~6 列的底行，这是 P-D 之前就有的既有行为，本轮未改动），');
  console.log('      所以真正参与竞争的是其余 8 列 —— 上面的数字里体现得很清楚。');

console.log('\n  【A 汇总】共 ' + aggA.n + ' 次派兵决策，选中列的平均防御强度 = ' +
  r2(aggA.sumDef / Math.max(1, aggA.n)).toFixed(3) +
  '（均匀随机挑列 ≈ ' + r2(0.55).toFixed(2) + ' 量级；越低越说明在打弱点）');

/* ============================ B. 涌现证据 ============================ */
console.log('\n=====================================================================');
console.log(' B. 打弱点（真打）：AI 对 AI 8 局，派兵列 vs 敌方该列防御强度');
console.log('=====================================================================');

function pearson(xs, ys) {
  var n = xs.length, sx = 0, sy = 0, i;
  if (n < 2) return 0;
  for (i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  var mx = sx / n, my = sy / n, num = 0, dx = 0, dy = 0;
  for (i = 0; i < n; i++) {
    var a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  if (dx <= 1e-12 || dy <= 1e-12) return 0;
  return num / Math.sqrt(dx * dy);
}

function experimentB(diff, seed, secs, verbose) {
  var s = C.createState({ seed: seed });
  s.aiPreset.red = diff; s.aiPreset.blue = 'hard';
  s.aiLaneDebug = [];
  s.suddenDeath = false;
  var t = 0;
  while (!s.over && t < 20 * secs) {
    C.update(s, C.DT); C.aiUpdate(s, 'red', C.DT); C.aiUpdate(s, 'blue', C.DT);
    t++;
  }
  var logs = s.aiLaneDebug.filter(function (d) {
    return d.team === 'red' && d.def && d.defMax > 1e-9;
  });
  var perCnt = new Array(C.COLS + 2).fill(0), perDef = new Array(C.COLS + 2).fill(0);
  var sumNew = 0, sumRand = 0, n = 0;
  logs.forEach(function (d) {
    var mean = 0, i;
    for (i = 0; i < d.def.length; i++) mean += d.def[i];
    mean = mean / d.def.length / d.defMax;
    var nd = d.def[d.col - 1] / d.defMax;
    sumNew += nd; sumRand += mean; n++;
    perCnt[d.col]++; perDef[d.col] += nd;
  });
  var xs = [], ys = [];
  for (var c = 1; c <= C.COLS; c++) {
    xs.push(perCnt[c] ? perDef[c] / perCnt[c] : 0);
    ys.push(perCnt[c]);
  }
  var res = { n: n, sumNew: sumNew, sumRand: sumRand, corr: pearson(xs, ys),
              perCnt: perCnt, perDef: perDef, time: s.time, winner: s.winner };
  if (verbose) {
    console.log('  种子 ' + seed + '：' + diff + '(红) vs hard(蓝)，打了 ' + Math.round(s.time) + 's，' +
      (s.winner ? '胜者 ' + s.winner : '未分胜负') + '，红方有效派兵 ' + n + ' 次');
    var line1 = '  列号        ', line2 = '  派兵次数    ', line3 = '  该列防御    ';
    for (c = 1; c <= C.COLS; c++) {
      line1 += padl(c, 5); line2 += padl(perCnt[c], 5);
      line3 += padl(perCnt[c] ? r2(perDef[c] / perCnt[c]).toFixed(2) : '-', 5);
    }
    console.log(line1); console.log(line2); console.log(line3);
    if (n) {
      console.log('  → 选中列平均防御 ' + r2(sumNew / n).toFixed(3) +
        ' vs 全列平均 ' + r2(sumRand / n).toFixed(3) +
        '（越低越说明在打弱点）  相关系数 r = ' + r2(res.corr).toFixed(3));
    }
  }
  return res;
}

var aggB = { n: 0, sumNew: 0, sumRand: 0, corr: 0, runs: 0 };
[[1000, true], [1037, false], [1074, false], [1111, false],
 [1148, false], [1185, false], [1222, false], [1259, false]].forEach(function (cfg) {
  var r = experimentB('hell', cfg[0], SECS, cfg[1]);
  aggB.n += r.n; aggB.sumNew += r.sumNew; aggB.sumRand += r.sumRand; aggB.runs++;
  aggB.corr += r.corr;
  if (!cfg[1]) {
    console.log('  种子 ' + cfg[0] + '：红方有效派兵 ' + r.n + ' 次，建塔终局 ' +
      Math.round(r.time) + 's' + (r.winner ? '（' + r.winner + ' 胜）' : '（未分胜负）'));
  }
});
if (aggB.n) {
  console.log('  ---------------------------------------------------------------');
  console.log('  8 局合计有效派兵 ' + aggB.n + ' 次');
  console.log('  选中列平均防御强度 ' + r2(aggB.sumNew / aggB.n).toFixed(3) +
    '   全列平均 ' + r2(aggB.sumRand / aggB.n).toFixed(3) +
    '   平均相关系数 r = ' + r2(aggB.corr / aggB.runs).toFixed(3));
  console.log(aggB.sumNew / aggB.n < aggB.sumRand / aggB.n * 0.9
    ? '  ✅ 越薄的列被派兵越多（负相关）—— AI 在读对手的防线'
    : '  ❌ 派兵列与敌方防御强度无关');
}

/* ============================ C. 预判克制 ============================ */
console.log('\n=====================================================================');
console.log(' C. 预判克制：对手先狂出空军（40~150s）再停手，AI 的塔型怎么变？');
console.log('=====================================================================');

function buildLayout(s, team) {
  var rows = (team === 'blue') ? [6, 7, 8, 9, 10] : [1, 2, 3, 4, 5];
  var out = [];
  rows.forEach(function (r) {
    var line = 'r' + padl(r, 2) + ' ';
    for (var c = 1; c <= C.COLS; c++) {
      var b = s.grid[r][c];
      line += (!b ? '.' : b.def.isBase ? 'B' : b.def.atk ? 'T' : b.key === 'ward' ? 'W' : 'm') + ' ';
    }
    out.push(line);
  });
  return out;
}

function airExperiment(diff, seed, airFrom, airUntil, secs) {
  var s = C.createState({ seed: seed });
  s.aiPreset.red = diff; s.aiPreset.blue = diff;
  s.suddenDeath = false;
  s.res.blue = 1500;                      // 只是让代理有钱出空军，不涉及规则
  var pts = [], t = 0, timer = 0;
  while (!s.over && t < 20 * secs) {
    var bb = C.ownBase(s, 'blue');
    if (bb) bb.hp = bb.hpMax;             // 锁血：只为跑满观察窗口
    C.update(s, C.DT); C.aiUpdate(s, 'red', C.DT);
    timer += C.DT;
    if (timer >= 1) {
      timer = 0;
      var inAir = (airFrom != null && s.time >= airFrom && s.time <= airUntil);
      proxyTurn(s, 'blue', inAir);
    }
    t++;
    if (t % (20 * 20) === 0) {
      var aa = 0, gnd = 0, byKey = {};
      s.buildings.forEach(function (b) {
        if (b.team !== 'red' || !b.def.atk || b.def.isBase) return;
        byKey[b.key] = (byKey[b.key] || 0) + 1;
        if (b.def.targets === 'both') aa++; else gnd++;
      });
      var sh = C.foeShares(s, 'red');
      var A = C.analyzeBoard(s, 'red');
      var rd = C.foeRead(s, 'red', A);
      pts.push({ t: Math.round(s.time), aa: aa, gnd: gnd, byKey: byKey,
                 airShare: r2(sh.airShare), airNow: A.air, airEq: r2(rd.airEq) });
    }
  }
  return { pts: pts, s: s };
}

/* 对手代理：airMode=true 时优先出空军；否则只出地面兵 */
function proxyTurn(s, t, airMode) {
  var res = s.res[t];
  var mineN = s.buildings.filter(function (b) { return b.team === t && b.key === 'mine'; }).length;
  var towerN = s.buildings.filter(function (b) { return b.team === t && b.def.atk && !b.def.isBase; }).length;
  if (towerN < 2 && res >= 220) {         // 只铺 2 座塔，钱留给兵
    var kinds = ['cannon', 'arrow', 'mage'];
    for (var ri = 6; ri <= 10; ri++) {
      for (var ci = 1; ci <= C.COLS; ci++) {
        if (C.placeBuilding(s, t, kinds[(ri + ci) % 3], ri, ci).ok) return;
      }
    }
  }
  if (mineN < 3 && res >= 150 && !airMode) {
    for (var r = 10; r >= 6; r--) for (var c = 1; c <= 10; c++) if (C.placeBuilding(s, t, 'mine', r, c).ok) return;
  }
  var order = airMode ? ['balloon', 'dragon', 'airship'] : ['infantry', 'siege', 'archer'];
  for (var i = 0; i < order.length; i++) {
    var k = order[i];
    if (!C.isUnitReady(s, t, k)) continue;
    if (res < C.DATA.units[k].cost) continue;
    var c0 = 1 + Math.floor(Math.random() * C.COLS);
    if (C.deployUnit(s, t, k, c0).ok) return;
    for (var c2 = 1; c2 <= C.COLS; c2++) if (C.deployUnit(s, t, k, c2).ok) return;
  }
}

var airRun = airExperiment('hard', 1000, 40, 150, 300);
var gndRun = airExperiment('hard', 1000, null, null, 300);

console.log('  同一个 AI（困难）、同一个种子：唯一差别是「对手在 40~150 秒只出空军」');
console.log('  时间 |  对手空军占比(airShare)  |  场上空军 / 预估当量  |  AI 对空塔 / 对地塔');
console.log('  -----+--------------------------+-----------------------+---------------------');
for (var i = 0; i < airRun.pts.length; i++) {
  var a = airRun.pts[i], g = gndRun.pts[i];
  if (!a) continue;
  console.log('  ' + pad(a.t, 4) + ' | 空军局 ' + padl(a.airShare.toFixed(2), 5) +
    '  对照 ' + padl(g ? g.airShare.toFixed(2) : '-', 5) +
    ' | ' + pad(a.airNow, 3) + ' / ' + pad(a.airEq.toFixed(1), 5) +
    '（对照 ' + (g ? g.airNow + ' / ' + g.airEq.toFixed(1) : '-') + '）' +
    ' | 对空 ' + pad(a.aa, 2) + ' vs ' + pad(g ? g.aa : '-', 2) +
    '  对地 ' + pad(a.gnd, 2) + ' vs ' + pad(g ? g.gnd : '-', 2));
}
var lastA = airRun.pts[airRun.pts.length - 1], lastG = gndRun.pts[gndRun.pts.length - 1];
console.log('  ---------------------------------------------------------------');
console.log('  终局塔型 · 空军局 ' + JSON.stringify(lastA.byKey));
console.log('  终局塔型 · 对照局 ' + JSON.stringify(lastG.byKey));
console.log('  空军局里对手空军占比峰值 ' + Math.max.apply(null, airRun.pts.map(function (p) { return p.airShare; })) +
  ' → AI 预估当量峰值 ' + Math.max.apply(null, airRun.pts.map(function (p) { return p.airEq; })) +
  '（远高于当时场上空军数 = 它在按「历史倾向」提前准备）');
console.log('  停手之后（t>150s）空军占比：' +
  airRun.pts.filter(function (p) { return p.t > 150; })
    .map(function (p) { return p.t + 's:' + p.airShare.toFixed(2); }).join('  '));
console.log((lastA.aa >= lastG.aa)
  ? '  ✅ 空军局里 AI 的对空塔不少于对照局（会预判补对空）'
  : '  ⚠ 空军局对空塔反而更少 —— 需要检查');
console.log((lastA.gnd + lastA.aa) && (lastA.gnd > 0 && lastA.aa > 0)
  ? '  ✅ 同时对地塔也 >0：没有为了堆对空而丢掉对地（平衡底线守住了）'
  : '  ⚠ 出现单边塔型，平衡底线被破坏');

/* ======================= C2. 受控：直接考 aiPickTower ======================= */
console.log('\n---------------------------------------------------------------------');
console.log(' C2. 受控考卷：给 aiPickTower 喂不同的「对手历史兵种画像」，看它选什么塔');
console.log('     （每种画像跑 300 次，排除随机噪声；塔数配比固定为 2 对空 + 2 对地，');
console.log('       即「两边都够」的状态，此时才是预判加权真正起作用的分支）');
console.log('---------------------------------------------------------------------');

function makeBoardWith(types) {
  var s = C.createState({ seed: 4242 });
  s.aiPreset.red = 'hell';
  s.res.red = 5000;                       // 只是为了让「预置塔」建得起来
  var spots = [[5, 1], [4, 2], [5, 9], [4, 9], [3, 3]];
  var placed = 0;
  types.forEach(function (k, i) {
    if (C.placeBuilding(s, 'red', k, spots[i % spots.length][0], spots[i % spots.length][1]).ok) placed++;
  });
  s.placed = placed;
  return s;
}

var PROFILES = [
  { name: '空白（没有任何历史）', mix: {} },
  { name: '对手一直出空军', mix: { balloon: 40, dragon: 25, airship: 20 } },
  { name: '对手一直出地面重甲', mix: { heavy: 40, ram: 25, infantry: 20 } },
  { name: '对手一直出攻城部队', mix: { siege: 40, ram: 30, airship: 15 } },
  { name: '对手一直出远程', mix: { archer: 45, balloon: 10 } }
];

PROFILES.forEach(function (prof) {
  var tally = {}, n = 0, lastAir = 0, lastShare = 0;
  ['hell', 'hard'].forEach(function (diff) {
    for (var i = 0; i < 150; i++) {
      // 固定「2 对空(arrow/tesla) + 2 对地(cannon/mortar)」→ 走到预判加权分支
      var s = makeBoardWith(['arrow', 'tesla', 'cannon', 'mortar']);
      s.aiPreset.red = diff;
      Object.keys(s.aiFoe.red.unitMix).forEach(function (k) { delete s.aiFoe.red.unitMix[k]; });
      Object.keys(prof.mix).forEach(function (k) { s.aiFoe.red.unitMix[k] = prof.mix[k]; });
      var A = C.analyzeBoard(s, 'red');
      lastAir = A.air;                       // ★ 场上此刻的空军数量（这些考卷里全是 0）
      lastShare = C.foeShares(s, 'red').airShare;
      var k2 = C.aiPickTower(s, 'red', A, false, C.AI_PRESETS[diff]);
      tally[k2] = (tally[k2] || 0) + 1; n++;
    }
  });
  var air = (tally.arrow || 0) + (tally.tesla || 0);
  var gnd = (tally.cannon || 0) + (tally.mortar || 0) + (tally.mage || 0);
  var parts = Object.keys(tally).sort().map(function (k) { return k + ':' + Math.round(tally[k] / n * 100) + '%'; });
  console.log('  ' + pad(prof.name, 22) + ' → ' + pad(parts.join('  '), 40) +
    '  对空 ' + padl(Math.round(air / n * 100) + '%', 4) + ' / 对地 ' + padl(Math.round(gnd / n * 100) + '%', 4) +
    '   （场上空军 ' + lastAir + ' 个，历史空军占比 ' + lastShare.toFixed(2) + '）');
});
console.log('\n  期望：空军画像 → 对空占比明显抬升；重甲/攻城/远程画像 → 对地（cannon/mortar/mage）抬升。');
console.log('        这就是「预判克制」：即使此刻场上一个空军都没有，只要对手最近一直在出空军，');
console.log('        AI 也会提前把对空塔补上。');
