/* _diag7.js —— P-E 两项验证（只做测量，不改游戏规则）
 * ===========================================================================
 * A. 任务 1 证据：中列（5/6）出兵的兵**能不能正常推进**（会不会卡在大本营后面）
 *    · 常规局面：空棋盘 + 中列出兵，逐格打印轨迹
 *    · 压力局面：自家半场被建筑塞得很满时，中列出兵还能不能进场并推进
 *    · 统计口径：半场内帧数、最长「原地不动」帧数、最终到哪一行
 *
 * B. 任务 1 效果：frontBlocked 修掉「大本营被当挡路」之后，真实对局里 AI 是
 *    不是真的开始走中路了（派兵列分布，5/6 列从 0 次变成有次数）
 *    · 同时按「旧判定」复算一遍「这一列会不会被旧逻辑排除」，做对照（只在脚本里算）
 *
 * C. 任务 2 干净测量：真实对局里**每一次** aiPickTower 调用都记 airShare 与选中塔，
 *    按 airShare 分桶统计「选中对空塔的比例」。
 *    · 关键：单独看「场上一个空军都没有（fieldAir=0）」的决策 —— 这时还选对空塔，
 *      就只能是**预判**（历史占比）在起作用，不是反应。
 *    · 再单独看 rule='weighted'（配额硬保证都已满足，纯粹由权重决定）的决策。
 *
 * 用法: node dev/_diag7.js
 */
var C = require('../src/logic.js');

var pad = function (s, n) { s = String(s); while (s.length < n) s += ' '; return s; };
var padl = function (s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; };
var pct = function (a, b) { return b ? Math.round(a / b * 1000) / 10 : 0; };

/* 代理里用确定性随机（不用 Math.random），保证同样的脚本反复跑出同样的数字 —— 证据可复现 */
var RS = 987654321;
function arand() { RS = (RS * 1103515245 + 12345) % 2147483648; return RS / 2147483648; }

/* ==========================================================================
 * A. 中列出兵的推进证据
 * ======================================================================== */
console.log('=====================================================================');
console.log(' A. 中列 5/6 出兵的推进证据（会不会卡在大本营后面？）');
console.log('=====================================================================');

function traceOne(team, key, col, secs, clutter) {
  var s = C.createState({ seed: 7 });
  s.res[team] = 1e6;
  if (clutter) {
    /* 压力局面：把自家半场塞满建筑（模拟"AI 自己铺了很多塔/矿"的极端情况）。
     * 只留 3 列空着让兵进场，中列依旧被大本营占着。 */
    var rows = (team === 'blue') ? [6, 7, 8, 9] : [5, 4, 3, 2];
    var allCols = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    var keepOpen = [2, 3, 8];
    rows.forEach(function (r) {
      allCols.forEach(function (c) {
        if (keepOpen.indexOf(c) >= 0) return;
        if (c === 5 || c === 6) return;             // 中列交给大本营，不再叠建筑
        C.placeBuilding(s, team, (r + c) % 3 === 0 ? 'cannon' : 'mine', r, c);
      });
    });
  }
  var rr = C.deployUnit(s, team, key, col);
  if (!rr.ok) return { err: rr.why };
  var u = rr.unit;
  var path = ['r' + u.row + 'c' + u.col];
  var prev = 'r' + u.row + 'c' + u.col, stillFrames = 0, maxStill = 0;
  var inHalf = 0, entered = 0, minRow = u.row, reachedFoeHalf = false;
  var foeRows = (team === 'blue') ? [1, 2, 3, 4, 5] : [6, 7, 8, 9, 10];
  for (var t = 0; t < 20 * secs; t++) {
    C.update(s, C.DT);
    if (!u || u.hp <= 0) break;
    var p = 'r' + u.row + 'c' + u.col;
    if (p !== prev) { path.push(p); prev = p; stillFrames = 0; } else stillFrames++;
    if (stillFrames > maxStill) maxStill = stillFrames;
    if (u.row >= 1 && u.row <= C.ROWS) {
      if (!entered) entered = s.time;
      inHalf++;
      if (foeRows.indexOf(u.row) >= 0) reachedFoeHalf = true;
      if (team === 'blue' && u.row < minRow) minRow = u.row;
      if (team === 'red' && u.row > minRow) minRow = u.row;
    }
  }
  return {
    u: u, path: path, maxStill: maxStill, inHalf: inHalf, enteredAt: entered,
    reachedFoeHalf: reachedFoeHalf, best: minRow, alive: !!(u && u.hp > 0)
  };
}

function reportA(title, clutter, list) {
  console.log('\n--- ' + title + ' ---');
  list.forEach(function (t) {
    var r = traceOne(t[0], t[1], t[2], 60, clutter);
    var nm = t[0] + ' ' + C.DATA.units[t[1]].name + '(列' + t[2] + ')';
    if (r.err) { console.log('  ' + pad(nm, 22) + ' 派兵失败: ' + r.err); return; }
    console.log('  ' + pad(nm, 22) +
      ' 进场@' + (r.enteredAt ? r.enteredAt.toFixed(1) + 's' : '未进场') +
      ' | 半场内 ' + r.inHalf + ' 帧' +
      ' | 最长原地不动 ' + r.maxStill + ' 帧(' + (r.maxStill / 20).toFixed(1) + 's)' +
      ' | 最远到 r' + r.best +
      ' | 越过中线=' + (r.reachedFoeHalf ? '是' : '否') +
      ' | 存活=' + (r.alive ? '是' : '否'));
    console.log('      轨迹: ' + r.path.slice(0, 22).join(' → ') +
      (r.path.length > 22 ? ' …(共 ' + r.path.length + ' 段)' : ''));
  });
}

var MID = [['blue', 'infantry', 5], ['blue', 'infantry', 6], ['blue', 'siege', 5],
           ['blue', 'archer', 6], ['blue', 'balloon', 5], ['blue', 'dragon', 6],
           ['blue', 'airship', 5], ['blue', 'heavy', 6],
           ['red', 'infantry', 5], ['red', 'infantry', 6], ['red', 'balloon', 5],
           ['red', 'dragon', 6]];
reportA('常规局面（空棋盘）', false, MID);
reportA('压力局面（自家半场被建筑塞满，只剩 2/3/8 列空着）', true, MID);

/* ==========================================================================
 * B. 真实对局里 AI 的派兵列分布（5/6 列是否被重新用起来）
 * ======================================================================== */
console.log('\n=====================================================================');
console.log(' B. 真实对局：AI 派兵列分布（5/6 列修复前后对比）');
console.log('=====================================================================');

function matchRun(diffR, diffB, seed, secs) {
  var s = C.createState({ seed: seed });
  s.aiPreset.red = diffR; s.aiPreset.blue = diffB;
  s.suddenDeath = false;
  s.aiDeployLog = s.aiDeployLog || null;
  var hist = { red: new Array(C.COLS + 2).fill(0), blue: new Array(C.COLS + 2).fill(0) };
  var prevIds = {};
  var t = 0;
  while (!s.over && t < 20 * secs) {
    C.update(s, C.DT); C.aiUpdate(s, 'red', C.DT); C.aiUpdate(s, 'blue', C.DT);
    // 每 tick 找 "新出现的、还在通道行" 的单位 = 这一帧刚派的兵，记它的列
    var seen = {};
    for (var i = 0; i < s.units.length; i++) {
      var u = s.units[i];
      seen[u.id] = 1;
      if (!prevIds[u.id] && u.row < 1) { hist[u.team][u.col]++; }   // 在通道行(行0/行11) = 刚派
    }
    prevIds = seen;
    t++;
  }
  return { s: s, hist: hist };
}

function colTable(hist) {
  var l1 = '  列号     ', l2 = '  派兵次数 ';
  for (var c = 1; c <= C.COLS; c++) { l1 += padl(c, 4); l2 += padl(hist[c], 4); }
  var mid = hist[5] + hist[6], tot = 0;
  for (c = 1; c <= C.COLS; c++) tot += hist[c];
  return { text: l1 + '\n' + l2, mid: mid, tot: tot,
           midPct: pct(mid, tot), c56: [hist[5], hist[6]] };
}

var aggHist = new Array(C.COLS + 2).fill(0), aggTot = 0;
[[1000], [1037], [1074], [1111]].forEach(function (cfg) {
  var r = matchRun('hell', 'hard', cfg[0], 420);
  var tb = colTable(r.hist.red);
  console.log('\n  种子 ' + cfg[0] + '：地狱(红) vs 困难(蓝)，打了 ' + Math.round(r.s.time) + 's，' +
    (r.s.winner ? r.s.winner + ' 胜' : '未分胜负'));
  console.log(tb.text);
  console.log('  → 红方派兵共 ' + tb.tot + ' 次，其中 5/6 列 ' + tb.mid + ' 次（' + tb.midPct + '%），' +
    '5 列=' + tb.c56[0] + ' 次，6 列=' + tb.c56[1] + ' 次');
  for (var c = 1; c <= C.COLS; c++) aggHist[c] += r.hist.red[c];
  aggTot += tb.tot;
});
var aggTb = colTable(aggHist);
console.log('\n  【4 局合计】');
console.log(aggTb.text);
console.log('  → 5/6 列占比 = ' + aggTb.midPct + '%（修复前为 0%：frontBlocked 把这两列永久判死）');

/* 旧判定复算（纯测量）：把大本营也算作"挡路"时，会有几列被排除 */
(function () {
  var s = C.createState({ seed: 1000 });
  s.aiPreset.red = 'hell'; s.aiPreset.blue = 'hard'; s.suddenDeath = false;
  for (var t = 0; t < 20 * 200; t++) { C.update(s, C.DT); C.aiUpdate(s, 'red', C.DT); C.aiUpdate(s, 'blue', C.DT); }
  function oldBlocked(team, col) {
    var rows = C.DIR[team] > 0 ? [6, 7, 8, 9, 10] : [5, 4, 3, 2, 1];
    for (var i = 0; i < rows.length; i++) {
      var b = s.grid[rows[i]][col];
      if (b && b.team === team) return true;      // 旧逻辑：大本营也算
    }
    return false;
  }
  var ob = [], nb = [];
  for (var c = 1; c <= C.COLS; c++) { if (oldBlocked('red', c)) ob.push(c); }
  console.log('  【对照】在 200s 的真实局面里，按**旧判定**（大本营算挡路）红方会被判「堵死」的列 = [' + ob.join(',') + ']');
  console.log('        → 5、6 列必然在里面（大本营就在 5~6 列底行）→ 两列永久吃 -1000，AI 永不出中路。');
})();

/* ==========================================================================
 * C. 预判克制：真实对局里按 airShare 分桶
 * ======================================================================== */
console.log('\n=====================================================================');
console.log(' C. 预判克制：真实对局里「对手空军历史占比 → 选中对空塔」分桶统计');
console.log('=====================================================================');

/* 对手代理：只按规则出兵（不改规则，只为制造不同的 airShare 区间）
 * airMode: true=只出空军 / false=只出地面 / 'mix'=每 20 秒在「空军波 / 地面波」之间切换
 *          （mix 是为了把 airShare 落在 0.15~0.35 的中间桶，否则样本是双峰的） */
function proxyTurn(s, t, airMode) {
  var fallback = false;
  if (airMode === 'mix') airMode = (Math.floor(s.time / 20) % 2 === 0);
  if (airMode === 'quarter') {            // 每 4 次出兵里有 1 次优先空军 → airShare 落在 0.2~0.4
    s._proxyN = (s._proxyN || 0) + 1;
    airMode = (s._proxyN % 4 === 0);
    fallback = true;                      // 空军买不起时退回地面兵，避免白白丢掉这一轮
  }
  /* stopair：前 120 秒狂出空军，之后彻底改出地面兵。
   * 这样「空军历史占比」会从 1 慢慢衰减经过 0.35/0.15 各桶，而**场上常常一个空军都没有**
   * → 正好是「预判」能露出真面目（且无法用"反应"解释）的那种局面。 */
  if (airMode === 'stopair') airMode = (s.time < 120);
  var res = s.res[t];
  var towerN = 0, mineN = 0;
  s.buildings.forEach(function (b) {
    if (b.team !== t) return;
    if (b.def.atk && !b.def.isBase) towerN++;
    if (b.key === 'mine') mineN++;
  });
  if (towerN < 2 && res >= 220) {         // 先立 2 座塔，钱留给兵
    var kinds = ['cannon', 'arrow', 'mage'];
    var rows = (t === 'blue') ? [6, 7, 8, 9, 10] : [5, 4, 3, 2, 1];
    for (var ri = 0; ri < rows.length; ri++) {
      for (var ci = 1; ci <= C.COLS; ci++) {
        if (C.placeBuilding(s, t, kinds[(rows[ri] + ci) % 3], rows[ri], ci).ok) return;
      }
    }
  }
  if (!airMode && mineN < 3 && res >= 150) {
    var rr = (t === 'blue') ? [10, 9, 8, 7, 6] : [1, 2, 3, 4, 5];
    for (var a = 0; a < rr.length; a++) for (var c = 1; c <= C.COLS; c++) if (C.placeBuilding(s, t, 'mine', rr[a], c).ok) return;
  }
  var orders = airMode ? [['balloon', 'dragon', 'airship']] : [['infantry', 'archer', 'siege']];
  if (airMode && fallback) orders.push(['infantry', 'archer', 'siege']);
  for (var oi = 0; oi < orders.length; oi++) {
    for (var i = 0; i < orders[oi].length; i++) {
      var k = orders[oi][i];
      if (!C.isUnitReady(s, t, k)) continue;
      if (res < C.DATA.units[k].cost) continue;
      var c0 = 1 + Math.floor(arand() * C.COLS);
      if (C.deployUnit(s, t, k, c0).ok) return;
      for (var c2 = 1; c2 <= C.COLS; c2++) if (C.deployUnit(s, t, k, c2).ok) return;
    }
  }
}

/* 跑一局，返回该方（aiSide）的全部 aiPickTower 决策 */
function predRun(cfg) {
  var s = C.createState({ seed: cfg.seed });
  s.aiPreset[cfg.aiSide] = cfg.diff;
  s.suddenDeath = false;
  s.aiTowerDebug = [];
  var foeSide = (cfg.aiSide === 'red') ? 'blue' : 'red';
  if (cfg.opponent !== 'ai') s.aiPreset[foeSide] = 'normal';   // 代理局：对面不做 AI 决策
  // 只给代理一点起始金币，让它养得起空军/混合兵种（纯为制造不同 airShare 区间，不改任何规则）
  if (cfg.opponent !== 'ai') s.res[foeSide] = (s.res[foeSide] || 0) + 1500;
  var timer = 0, t = 0;
  while (!s.over && t < 20 * cfg.secs) {
    C.update(s, C.DT);
    C.aiUpdate(s, cfg.aiSide, C.DT);
    if (cfg.opponent === 'ai') C.aiUpdate(s, foeSide, C.DT);
    if (cfg.opponent !== 'ai') {
      var bb = C.ownBase(s, foeSide);
      if (bb) bb.hp = bb.hpMax;                       // 代理锁血：只为跑满观察窗口
      timer += C.DT;
      if (timer >= 1) { timer = 0; proxyTurn(s, foeSide, cfg.airMode); }
    }
    t++;
  }
  return { decisions: s.aiTowerDebug.filter(function (d) { return d.team === cfg.aiSide; }),
           s: s };
}

var RUNS = [];
['hell', 'hard'].forEach(function (d) {
  [1000, 1037].forEach(function (sd) { RUNS.push({ name: 'AI对AI ' + d + ' 种子' + sd, aiSide: 'red', diff: d, opponent: 'ai', seed: sd, secs: 420 }); });
});
['hell', 'hard'].forEach(function (d) {
  [1000, 1037].forEach(function (sd) {
    RUNS.push({ name: 'vs 空军代理 ' + d + ' 种子' + sd, aiSide: 'red', diff: d, opponent: 'proxy', airMode: true, seed: sd, secs: 300 });
    RUNS.push({ name: 'vs 地面代理 ' + d + ' 种子' + sd, aiSide: 'red', diff: d, opponent: 'proxy', airMode: false, seed: sd, secs: 300 });
    RUNS.push({ name: 'vs 混合代理 ' + d + ' 种子' + sd, aiSide: 'red', diff: d, opponent: 'proxy', airMode: 'mix', seed: sd, secs: 300 });
    RUNS.push({ name: 'vs 1/4空军代理 ' + d + ' 种子' + sd, aiSide: 'red', diff: d, opponent: 'proxy', airMode: 'quarter', seed: sd, secs: 300 });
    RUNS.push({ name: 'vs 空军后停手 ' + d + ' 种子' + sd, aiSide: 'red', diff: d, opponent: 'proxy', airMode: 'stopair', seed: sd, secs: 300 });
  });
});

var AL = [];   // 所有决策
RUNS.forEach(function (cfg) {
  var r = predRun(cfg);
  r.decisions.forEach(function (d) { d.run = cfg.name; AL.push(d); });
  var aa = r.decisions.filter(function (d) { return d.antiAirPick; }).length;
  var sh = C.foeShares(r.s, cfg.aiSide);
  console.log('  ' + pad(cfg.name, 26) + ' 决策 ' + padl(r.decisions.length, 4) +
    ' 次 | 选中对空 ' + padl(aa, 4) + ' 次(' + padl(pct(aa, r.decisions.length), 5) + '%)' +
    ' | 终局对手空军占比 ' + (Math.round(sh.airShare * 100) / 100).toFixed(2) +
    ' | 用时 ' + Math.round(r.s.time) + 's');
});

var BUCKETS = [
  { name: 'airShare < 0.15', lo: 0, hi: 0.15 },
  { name: '0.15 ~ 0.35   ', lo: 0.15, hi: 0.35 },
  { name: 'airShare > 0.35', lo: 0.35, hi: 2 }
];

/* airShare 分布直方图（0.1 一格）—— 让人一眼看出样本落在哪儿、中桶为什么空/满 */
(function () {
  var bins = new Array(11).fill(0);
  AL.forEach(function (d) { bins[Math.min(10, Math.floor(d.airShare * 10))]++; });
  console.log('\n  airShare 分布直方图（全部 ' + AL.length + ' 次决策，横轴 = airShare 十分位）：');
  for (var i = 0; i <= 10; i++) {
    var lo = (i / 10).toFixed(1), bar = '';
    for (var j = 0; j < Math.min(60, Math.round(bins[i] / 4)); j++) bar += '█';
    console.log('    ' + lo + '~' + ((i + 1) / 10).toFixed(1) + '  ' + padl(bins[i], 5) + '  ' + bar);
  }
})();
function bucketOf(v) {
  for (var i = 0; i < BUCKETS.length; i++) if (v >= BUCKETS[i].lo && v < BUCKETS[i].hi) return i;
  return BUCKETS.length - 1;
}

function table(title, filter, note) {
  console.log('\n--- ' + title + ' ---');
  if (note) console.log('    ' + note);
  var rows = AL.filter(filter);
  console.log('    ' + pad('airShare 区间', 18) + padl('决策数', 8) + padl('选对空塔', 10) +
    padl('对空占比', 10) + '   规则分布(no-aa/quota-aa/quota-ground/weighted/sloppy)');
  var stats = [];
  BUCKETS.forEach(function (b, bi) {
    var inB = rows.filter(function (d) { return bucketOf(d.airShare) === bi; });
    var aa = inB.filter(function (d) { return d.antiAirPick; }).length;
    var ruleCnt = { 'no-aa': 0, 'quota-aa': 0, 'quota-ground': 0, 'weighted': 0, 'sloppy-random': 0, 'no-ground': 0 };
    inB.forEach(function (d) { ruleCnt[d.rule] = (ruleCnt[d.rule] || 0) + 1; });
    stats.push({ n: inB.length, aa: aa, p: pct(aa, inB.length) });
    console.log('    ' + pad(b.name, 18) + padl(inB.length, 8) + padl(aa, 10) +
      padl(pct(aa, inB.length) + '%', 10) + '   ' +
      ruleCnt['no-aa'] + '/' + ruleCnt['quota-aa'] + '/' + ruleCnt['quota-ground'] + '/' +
      ruleCnt['weighted'] + '/' + ruleCnt['sloppy-random']);
    if (inB.length) {
      var pickCnt = {}, aaSum = 0, goSum = 0, eqSum = 0;
      inB.forEach(function (d) {
        pickCnt[d.pick] = (pickCnt[d.pick] || 0) + 1;
        aaSum += d.aaOwn; goSum += d.goOwn; eqSum += d.airEq;
      });
      var pk = Object.keys(pickCnt).sort(function (x, y) { return pickCnt[y] - pickCnt[x]; })
        .map(function (k) { return k + ' ' + pickCnt[k]; }).join(' · ');
      console.log('        ' + pad('', 18) + '自身塔构成 均对空 ' + (aaSum / inB.length).toFixed(1) +
        ' / 均对地 ' + (goSum / inB.length).toFixed(1) + ' | 均 airEq ' + (eqSum / inB.length).toFixed(2) +
        ' | 选中的塔: ' + pk);
    }
  });
  var mono = stats[2].p > stats[1].p && stats[1].p > stats[0].p && stats[2].n > 30 && stats[0].n > 30;
  /* 只要「样本足够的那几个桶」里，对空占比随 airShare 单调上升，就算成立。
   * （某个桶一个样本都没有时不能算失败 —— 那只是这次没有落进那个区间的对局） */
  var solid = stats.filter(function (x) { return x.n >= 20; });
  var solidMono = true;
  for (var si = 1; si < solid.length; si++) if (solid[si - 1] && solid[si] && solid[si].p <= solid[si - 1].p) solidMono = false;
  if (solid.length < 2) solidMono = false;
  console.log('    → 桶内单调（只看样本 ≥20 的桶，共 ' + solid.length + ' 个）= ' +
    (solidMono ? '✅ 是' : '❌ 否') +
    '   |  三桶全非空且严格递增 = ' + (mono ? '是' : '否（中桶样本 ' + stats[1].n + ' 个）'));
  return solidMono;
}

var ok1 = table('全部决策（每一次 aiPickTower 调用）', function () { return true; },
  '注意：低 airShare 桶会被「还没对空 → 必补对空」的硬规则抬高，所以这不是纯净对照。');
var ok2 = table('只看「场上一个空军都没有」（fieldAir = 0）', function (d) { return d.fieldAir === 0; },
  '★ 关键表：此刻棋盘上没有空军，还选了对空塔 = 只可能来自历史占比（预判）。');
var ok3 = table('只看「配额硬保证都已满足」（rule = weighted）', function (d) { return d.rule === 'weighted'; },
  '★ 主表：对空/对地都已达配额，选塔完全由权重决定 → 直接检验权重里的预判项。');
var ok4 = table('最纯净：fieldAir = 0 且 rule = weighted', function (d) { return d.fieldAir === 0 && d.rule === 'weighted'; },
  '★ 最纯净口径：既没有空军在场（排除反应），配额也满了（排除硬规则）。');

/* 点二列相关：airShare 与 antiAirPick */
function corr(rows) {
  var n = rows.length;
  if (n < 3) return 0;
  var sx = 0, sy = 0, i;
  for (i = 0; i < n; i++) { sx += rows[i].airShare; sy += (rows[i].antiAirPick ? 1 : 0); }
  var mx = sx / n, my = sy / n, num = 0, dx = 0, dy = 0;
  for (i = 0; i < n; i++) {
    var a = rows[i].airShare - mx, b = (rows[i].antiAirPick ? 1 : 0) - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  if (dx <= 1e-12 || dy <= 1e-12) return 0;
  return num / Math.sqrt(dx * dy);
}
var wRows = AL.filter(function (d) { return d.rule === 'weighted'; });
var pureRows = AL.filter(function (d) { return d.fieldAir === 0 && d.rule === 'weighted'; });
console.log('\n  点二列相关 r(airShare, 选中对空塔)：');
console.log('    · rule=weighted 子集：n=' + wRows.length + '，r = ' + (Math.round(corr(wRows) * 1000) / 1000));
console.log('    · 最纯净子集      ：n=' + pureRows.length + '，r = ' + (Math.round(corr(pureRows) * 1000) / 1000));
console.log('\n  【C 结论】' + ((ok3 || ok4) ? '✅ 真实对局里 airShare 越高 → 选中对空塔的比例越高（预判在"权重通道"里生效）'
  : '❌ 真实对局里看不到预判效果') + '（主表 rule=weighted：' + (ok3 ? '通过' : '未通过') + '）');
