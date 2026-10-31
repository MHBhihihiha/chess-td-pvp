/* _diag5.js —— 验证 P-B / P-C：塔位是不是真的跟着「主攻列热力图」走
 *
 * 输出四件事：
 *   ① 每一座防御建筑「落成那一刻」的热力 Top3 列（证明它读到了记忆）
 *   ② 命中率统计：塔的射程列 ∩ 当时最热那一列 的比例，对比「随机列」的期望值
 *      （只统计「热度已经非零」的那些决策 —— 开局还没交战、热度全 0 时本来就只能靠别的评分项）
 *   ③ 终局塔位 ASCII 图 + 热力柱状图（一眼看出是不是集中在主攻列附近）
 *   ④ 选点明细（state.aiSpotDebug）：当时前 6 名候选的分数 + 最终选中
 *
 * 用法: node dev/_diag5.js [秒数]
 */
var C = require('../src/logic.js');

var MAXSEC = parseInt(process.argv[2] || '420', 10);

function coveredCols(col, R) {
  var out = [];
  for (var c = Math.max(1, col - R); c <= Math.min(C.COLS, col + R); c++) out.push(c);
  return out;
}
function rangeOf(b) { return Math.max(1, Math.round(C.statsForLevel(b.def, 1).range || 1)); }

/* 人类玩家代理（与 dev/ai-difficulty2.js 完全相同的出招逻辑） */
function humanTurn(s, t) {
  var res = s.res[t];
  var mines = s.buildings.filter(function (b) { return b.team === t && b.key === 'mine'; }).length;
  if (mines < 3 && res >= 150) {
    for (var r = 10; r >= 6; r--) for (var c = 1; c <= 10; c++) if (C.placeBuilding(s, t, 'mine', r, c).ok) return;
  }
  var towers = s.buildings.filter(function (b) { return b.team === t && b.def.atk; }).length;
  if (towers < 4 && res >= 120) {
    var kinds = ['cannon', 'arrow', 'mage', 'mortar', 'tesla'];
    var k = kinds[Math.floor(Math.random() * kinds.length)];
    for (var r2 = 6; r2 <= 10; r2++) for (var c2 = 1; c2 <= 10; c2++) if (C.placeBuilding(s, t, k, r2, c2).ok) return;
  }
  if (res >= 400) { if (C.upgradeBase(s, t).ok) return; }
  var order = ['infantry', 'archer', 'siege'];
  for (var i = 0; i < order.length; i++) {
    if (!C.isUnitReady(s, t, order[i])) continue;
    if (res < C.DATA.units[order[i]].cost) continue;
    for (var c3 = 1; c3 <= 10; c3++) if (C.deployUnit(s, t, order[i], c3).ok) return;
  }
}

function run(redD, blueD, seed, label, humanBlue) {
  var s = C.createState({ seed: seed });
  s.aiPreset.red = redD; s.aiPreset.blue = blueD; s.aiTeam = 'red';
  s.aiSpotDebug = [];
  var seen = {}, built = [];
  var t = 0, humanTimer = 0;
  while (!s.over && t < 20 * MAXSEC) {
    C.update(s, C.DT);
    C.aiUpdate(s, 'red', C.DT);
    if (humanBlue) {
      humanTimer += C.DT;
      if (humanTimer >= 1) { humanTimer = 0; humanTurn(s, 'blue'); }
    } else {
      C.aiUpdate(s, 'blue', C.DT);
    }
    t++;
    if (t % 20 !== 0) continue;              // 每秒采样一次新建成的防御建筑
    s.buildings.forEach(function (b) {
      if (b.team !== 'red' || b.def.isBase || seen[b.id]) return;
      seen[b.id] = 1;
      if (!b.def.atk && !b.def.aura) return;  // 只看防御建筑（塔 / 光环塔）
      var h = s.aiHeat.red, cols = [], mx = 0;
      for (var c = 1; c <= C.COLS; c++) { cols.push({ c: c, v: h[c] }); if (h[c] > mx) mx = h[c]; }
      cols.sort(function (x, y) { return y.v - x.v; });
      var blend = C.hotLanes(s, 'red'), bm = 0;
      for (var c2 = 1; c2 <= C.COLS; c2++) if (blend[c2] > bm) bm = blend[c2];
      var R = b.def.atk ? rangeOf(b) : 1;
      var cov = coveredCols(b.col, R);
      built.push({
        t: Math.round(s.time), key: b.key, row: b.row, col: b.col, R: R, heatMax: mx, blendMax: bm,
        hot1: cols[0].c, hot3: [cols[0].c, cols[1].c, cols[2].c],
        hit1: mx > 0 && cov.indexOf(cols[0].c) >= 0,
        hit3: mx > 0 && (cov.indexOf(cols[0].c) >= 0 || cov.indexOf(cols[1].c) >= 0 || cov.indexOf(cols[2].c) >= 0)
      });
    });
  }

  /* ---- ① 建塔时刻表 ---- */
  console.log('\n=== ' + label + '（seed ' + seed + '，' + redD + ' vs ' + blueD +
    '，终局 ' + (s.over ? (s.winner || '?') : '未结束') + ' @ ' + s.time.toFixed(0) + 's）===');
  console.log('  建塔时刻   建筑   位置      射程列        当时最热3列(热度max)');
  built.forEach(function (x) {
    var cov = coveredCols(x.col, x.R).join(',');
    var hot = x.heatMax > 0
      ? x.hot3.join(' > ') + ' (max ' + x.heatMax.toFixed(0) + ')'
      : '—（记忆还是 0：靠瞬时敌兵分布/出兵列/纵深评分）';
    console.log('  t=' + String(x.t).padStart(4) + 's  ' + x.key.padEnd(6) +
      ' r' + String(x.row).padStart(2) + 'c' + String(x.col).padStart(2) +
      '  [' + cov.padEnd(12) + ']  ' + hot +
      (x.heatMax === 0 && x.blendMax > 0 ? '（瞬时列权重 ' + x.blendMax.toFixed(2) + '）' : '') +
      (x.hit1 ? '   ← 命中主攻列' : ''));
  });

  /* ---- ② 命中率 vs 随机期望（只算热度非零的决策） ---- */
  var warm = built.filter(function (x) { return x.heatMax > 0; });
  var n = warm.length, hit1 = 0, hit3 = 0, exp1 = 0, exp3 = 0;
  warm.forEach(function (x) {
    if (x.hit1) hit1++;
    if (x.hit3) hit3++;
    exp1 += (2 * x.R + 1) / C.COLS;                      // 随机列时「罩住某一指定列」的概率
    exp3 += Math.min(1, (2 * x.R + 1) * 3 / C.COLS);     // 随机列时「罩住 Top3 任意一列」的上界
  });
  console.log('  ----------------------------------------------------------------');
  console.log('  防御建筑 ' + built.length + ' 座（其中 ' + n + ' 座是在「已有热度」时选的）');
  if (n) {
    console.log('  罩住【当时最热那一列】：实际 ' + hit1 + '/' + n + ' = ' + Math.round(hit1 / n * 100) +
      '%   随机列期望 ≈ ' + Math.round(exp1 / n * 100) + '%');
    console.log('  罩住【当时最热 3 列之一】：实际 ' + hit3 + '/' + n + ' = ' + Math.round(hit3 / n * 100) +
      '%   随机列期望 ≤ ' + Math.round(exp3 / n * 100) + '%');
  }

  /* ---- ③ 终局塔位 ASCII 图 + 热力柱 ---- */
  var h = s.aiHeat.red, mx = 0, c;
  for (c = 1; c <= C.COLS; c++) if (h[c] > mx) mx = h[c];
  console.log('  ----------------------------------------------------------------');
  console.log('  红方半场终局布局（T=攻击塔  W=光环塔  m=金矿  B=大本营  . 空）：');
  var glyph = { mine: 'm', ward: 'W' };
  for (var r = 1; r <= 5; r++) {
    var line = '   r' + String(r).padStart(2) + ' ';
    for (c = 1; c <= C.COLS; c++) {
      var b = s.grid[r][c];
      line += (b ? (b.def.isBase ? 'B' : (b.def.atk ? 'T' : (glyph[b.key] || '?'))) : '.') + ' ';
    }
    console.log(line);
  }
  var hbar = '       ';
  for (c = 1; c <= C.COLS; c++) {
    var f = mx > 0 ? h[c] / mx : 0;
    hbar += (f > 0.85 ? '#' : f > 0.6 ? '+' : f > 0.3 ? '-' : f > 0.02 ? '.' : ' ') + ' ';
  }
  console.log('  热力  ' + hbar + '   (蓝方主攻列强度，归一化)');
  console.log('  列号   1 2 3 4 5 6 7 8 9 10');

  /* ---- ④ 选点明细（前 3 次「有热度」的防御建筑选点） ---- */
  var dbg = s.aiSpotDebug.filter(function (d) {
    if (d.key === 'mine') return false;
    var hmax = 0;
    for (var i = 1; i <= C.COLS; i++) if (d.heat[i] > hmax) hmax = d.heat[i];
    return hmax > 0;
  }).slice(0, 3);
  dbg.forEach(function (d) {
    console.log('  [明细] t=' + d.t + 's ' + d.key + ' zone=' + d.zone +
      ' 热度=[' + d.heat.slice(1, 11).map(function (x) { return x.toFixed(2); }).join(',') + ']');
    console.log('         候选Top6: ' + d.cands.map(function (x) {
      return 'r' + x.row + 'c' + x.col + '=' + x.s.toFixed(1);
    }).join('  ') + '   → 选中 r' + d.picked.row + 'c' + d.picked.col);
  });

  return { n: n, hit1: hit1, hit3: hit3, exp1: exp1, exp3: exp3, all: built.length };
}

var tot = { n: 0, hit1: 0, hit3: 0, exp1: 0, exp3: 0, all: 0 };
[[1001, 'A：地狱(红) vs 困难(蓝) — AI 对 AI', false],
 [1038, 'B：困难(红) vs 人类代理(蓝) — 玩家主力从左边列推', true]].forEach(function (cfg) {
  var r = run(cfg[0] === 1001 ? 'hell' : 'hard', cfg[0] === 1001 ? 'hard' : 'normal', cfg[0], cfg[1], cfg[2]);
  tot.n += r.n; tot.hit1 += r.hit1; tot.hit3 += r.hit3;
  tot.exp1 += r.exp1; tot.exp3 += r.exp3; tot.all += r.all;
});

/* ⑤ 多种子汇总（只打统计，不打印明细）：困难(红) vs 人类代理(蓝) × 4 局 */
console.log('\n=== 多种子汇总（困难(红) vs 人类代理(蓝)）===');
[1038, 1075, 1112, 1149].forEach(function (seed) {
  var r = run('hard', 'normal', seed, 'seed ' + seed, true);
  tot.n += r.n; tot.hit1 += r.hit1; tot.hit3 += r.hit3;
  tot.exp1 += r.exp1; tot.exp3 += r.exp3; tot.all += r.all;
});

console.log('\n=== 汇总（2 局明细 + 4 局统计）===');
if (tot.n) {
  console.log('  防御建筑 ' + tot.all + ' 座（其中 ' + tot.n + ' 座是在「已有热度」时选的）');
  console.log('  罩住最热列 ' + Math.round(tot.hit1 / tot.n * 100) + '%（随机期望 ' +
    Math.round(tot.exp1 / tot.n * 100) + '%）；罩住最热3列 ' +
    Math.round(tot.hit3 / tot.n * 100) + '%（随机期望 ≤ ' + Math.round(tot.exp3 / tot.n * 100) + '%）');
  console.log(tot.hit3 / tot.n > tot.exp3 / tot.n
    ? '✅ 塔位明显偏向主攻列（不是随机铺）'
    : '❌ 塔位没有明显偏向主攻列 —— 热力没生效');
}
