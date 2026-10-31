/* _diag_ai.js —— AI 出兵/科技/送死 三项实测（改造前基线 + 改造后对比用同一份脚本）
 * ===========================================================================
 * 用户问题：「ai对手的放置兵种好像还是局限于两三种，而且会有一定的"送死"派兵
 *            有的时候，而且好像不会总体升级」
 *
 * 本脚本在**真实对局**里测三件事（红方 = 被观察的 AI）：
 *   ① 兵种分布：一局内 8 种兵各出了几次、实际用到几种
 *   ② 科技等级时间线：globalUpgrades 四项（bAtk/bHp/uAtk/uHp）每 60 秒采样
 *   ③ 送死程度：每只兵「出门后存活多久」「有没有进过敌方半场」「出门时是不是孤军」
 * 另外用 logic.js 里的 state.aiDeployDebug 插桩做**根因定位**：
 *   want（CD 好了的候选）几种 / picks（其中买得起的）几种 → 区分「取舍问题」和「钱的问题」。
 *
 * 局面：
 *   A. 困难 AI(红) vs 人类代理(蓝)   —— 用户最常打的局面
 *   B. 地狱 AI(红) vs 困难 AI(蓝)     —— 难度阶梯的关键对局
 * 代理用**确定性随机**（种子固定），保证改造前后同样的输入跑出可比数字。
 *
 * 用法: node dev/_diag_ai.js [秒数=420] [局数=3]
 */
var C = require('../src/logic.js');

var SECS = parseInt(process.argv[2] || '420', 10);
var NG = parseInt(process.argv[3] || '3', 10);
var KEYS = ['infantry', 'heavy', 'siege', 'ram', 'archer', 'balloon', 'airship', 'dragon'];
var pad = function (s, n) { s = String(s); while (s.length < n) s += ' '; return s; };
var padl = function (s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; };
var pct = function (a, b) { return b ? Math.round(a / b * 1000) / 10 : 0; };
var median = function (arr) {
  if (!arr.length) return 0;
  var a = arr.slice().sort(function (x, y) { return x - y; });
  var m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/* -------------------------------------------------- 人类代理（确定性版） */
var RS = 20261027;
function arand() { RS = (RS * 1103515245 + 12345) % 2147483648; return RS / 2147483648; }

function proxyTurn(s, t) {
  var res = s.res[t];
  var mines = s.buildings.filter(function (b) { return b.team === t && b.key === 'mine'; }).length;
  if (mines < 3 && res >= 150) {
    for (var r = 10; r >= 6; r--) for (var c = 1; c <= 10; c++) if (C.placeBuilding(s, t, 'mine', r, c).ok) return;
  }
  var towers = s.buildings.filter(function (b) { return b.team === t && b.def.atk && !b.def.isBase; }).length;
  if (towers < 4 && res >= 120) {
    var kinds = ['cannon', 'arrow', 'mage', 'mortar', 'tesla'];
    var k = kinds[Math.floor(arand() * kinds.length)];
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

/* ---------------------------------------------------------------- 单局 */
function playGame(cfg) {
  var s = C.createState({ seed: cfg.seed });
  s.suddenDeath = false;
  s.aiPreset.red = cfg.redDiff;
  if (cfg.blueDiff) s.aiPreset.blue = cfg.blueDiff;
  s.aiTeam = 'red';
  s.aiDeployDebug = [];                 // 打开派兵插桩
  var watch = 'red';
  var foeHalf = { red: [6, 10], blue: [1, 5] };   // 敌方半场行区间（红方要打的是蓝方 6-10）

  var seen = {}, born = [], dead = [];
  var upTl = [], ecoTl = [];
  var t = 0, frames = 20 * SECS, nextSample = 60;
  var proxyTimer = 0;

  while (!s.over && t < frames) {
    C.update(s, C.DT);
    C.aiUpdate(s, 'red', C.DT);
    if (cfg.blueDiff) C.aiUpdate(s, 'blue', C.DT);
    else { proxyTimer += C.DT; if (proxyTimer >= 1.0) { proxyTimer = 0; proxyTurn(s, 'blue'); } }

    /* 单位生命周期追踪（只追被观察方） */
    var alive = {};
    for (var i = 0; i < s.units.length; i++) {
      var u = s.units[i];
      if (u.team !== watch) continue;
      alive[u.id] = 1;
      if (!seen[u.id]) {
        seen[u.id] = { id: u.id, key: u.key, t0: s.time, col: u.col,
                       reachedFoe: false, peersAtSpawn: 0 };
        // 出门时场上还有几只别的己方兵（判断"孤军送死"）
        var peers = 0;
        for (var j = 0; j < s.units.length; j++) {
          var v = s.units[j];
          if (v.team === watch && v.id !== u.id) peers++;
        }
        seen[u.id].peersAtSpawn = peers;
        born.push(seen[u.id]);
      }
      if (u.row >= foeHalf[watch][0] && u.row <= foeHalf[watch][1]) seen[u.id].reachedFoe = true;
      seen[u.id].lastRow = u.row; seen[u.id].lastCol = u.col;
    }
    Object.keys(seen).forEach(function (id) {
      if (!alive[id] && seen[id].t1 == null) { seen[id].t1 = s.time; dead.push(seen[id]); }
    });

    if (s.time >= nextSample) {
      nextSample += 60;
      var g = s.globalUp[watch] || {};
      var mines = s.buildings.filter(function (b) { return b.team === watch && b.key === 'mine'; }).length;
      var towers = s.buildings.filter(function (b) { return b.team === watch && b.def.atk && !b.def.isBase; }).length;
      upTl.push({ t: Math.round(s.time), bAtk: g.bAtk || 0, bHp: g.bHp || 0, uAtk: g.uAtk || 0, uHp: g.uHp || 0 });
      ecoTl.push({ t: Math.round(s.time), res: Math.round(s.res[watch]), mines: mines, towers: towers,
                   lvl: (C.ownBase(s, watch) ? C.baseLevelOf(s, watch) : 1) });
    }
    t++;
  }

  /* 收尾：还活着的兵算「存活到结束」 */
  var res = { seed: cfg.seed, over: s.over, winner: s.winner, time: s.time,
              byKey: {}, born: born, dead: dead, upTl: upTl, ecoTl: ecoTl, dbg: s.aiDeployDebug };
  KEYS.forEach(function (k) { res.byKey[k] = 0; });
  born.forEach(function (b) { res.byKey[b.key] = (res.byKey[b.key] || 0) + 1; });
  return res;
}

/* ---------------------------------------------------------------- 报表 */
function reportGame(label, r) {
  var total = r.born.length;
  var used = KEYS.filter(function (k) { return r.byKey[k] > 0; });
  var w = (r.winner === 'red') ? 'AI胜' : (r.winner === 'blue' ? '代理胜' : '未分胜负');
  console.log('\n  ' + label + '  seed=' + r.seed + '  结果=' + w + '  t=' + r.time.toFixed(0) + 's' +
              '  出兵 ' + total + ' 只 / 兵种 ' + used.length + ' 种');
  var line = '    各兵种：';
  KEYS.forEach(function (k) {
    line += pad(C.DATA.units[k].name, 10) + padl(r.byKey[k], 3) + '(' + padl(pct(r.byKey[k], total), 5) + '%)  ';
  });
  console.log(line);
  var missing = KEYS.filter(function (k) { return !r.byKey[k]; });
  if (missing.length) {
    console.log('    从未出现：' + missing.map(function (k) { return C.DATA.units[k].name; }).join(' '));
  }
  var tl = r.upTl.map(function (u) {
    return 't' + u.t + '[' + u.bAtk + ',' + u.bHp + ',' + u.uAtk + ',' + u.uHp + ']';
  });
  console.log('    科技等级（每60s，顺序 bAtk,bHp,uAtk,uHp）：');
  console.log('      ' + tl.join('  '));
  var eco = r.ecoTl.map(function (e) {
    return 't' + e.t + '(金' + e.res + '/矿' + e.mines + '/塔' + e.towers + '/本' + e.lvl + ')';
  });
  console.log('    经济：');
  console.log('      ' + eco.join('  '));

  /* 存活时长 */
  var lifes = r.dead.map(function (d) { return d.t1 - d.t0; });
  var shortDie = r.dead.filter(function (d) { return (d.t1 - d.t0) < 5; }).length;
  var neverFoe = r.born.filter(function (b) { return !b.reachedFoe; }).length;
  var solo = r.born.filter(function (b) { return b.peersAtSpawn === 0; }).length;
  console.log('    出兵质量：存活中位 ' + median(lifes).toFixed(1) + 's' +
              ' | 出门 <5s 就死 ' + shortDie + '/' + r.dead.length + ' (' + pct(shortDie, r.dead.length) + '%)' +
              ' | 从未进敌方半场 ' + neverFoe + '/' + total + ' (' + pct(neverFoe, total) + '%)' +
              ' | 孤军出门(场上无其他己方兵) ' + solo + '/' + total + ' (' + pct(solo, total) + '%)');

  /* 根因（插桩）：want 几种 vs picks 几种 */
  var withChosen = r.dbg.filter(function (d) { return d.chosen; });
  var avgWant = 0, avgPicks = 0;
  withChosen.forEach(function (d) {
    avgWant += d.want.length; avgPicks += d.picks.length;
  });
  if (withChosen.length) { avgWant /= withChosen.length; avgPicks /= withChosen.length; }
  var uniqWant = {}, uniqPicks = {}, uniqChosen = {}, blockedByMoney = {};
  withChosen.forEach(function (d) {
    d.want.forEach(function (k) {
      uniqWant[k] = (uniqWant[k] || 0) + 1;
      if (!d.affordable[k]) blockedByMoney[k] = (blockedByMoney[k] || 0) + 1;
    });
    d.picks.forEach(function (k) { uniqPicks[k] = (uniqPicks[k] || 0) + 1; });
    uniqChosen[d.chosen] = (uniqChosen[d.chosen] || 0) + 1;
  });
  console.log('    根因（' + withChosen.length + ' 次成功派兵的决策）：' +
              'want 平均 ' + avgWant.toFixed(1) + ' 种 → 其中买得起(picks) 平均 ' + avgPicks.toFixed(1) + ' 种');
  var bm = Object.keys(blockedByMoney).sort(function (a, b) { return blockedByMoney[b] - blockedByMoney[a]; });
  if (bm.length) {
    console.log('      进过 want 但当时买不起（次数）：' +
                bm.map(function (k) { return C.DATA.units[k].name + ' ' + blockedByMoney[k]; }).join(' / '));
  }
  return { total: total, used: used.length, byKey: r.byKey, shortDie: shortDie, neverFoe: neverFoe,
           solo: solo, avgWant: avgWant, avgPicks: avgPicks, dead: r.dead.length };
}

/* --------------------------------------------------------------- 主流程 */
function runScenario(name, cfgList) {
  console.log('\n=====================================================================');
  console.log(' ' + name);
  console.log('=====================================================================');
  var acc = { total: 0, used: [], byKey: {}, shortDie: 0, neverFoe: 0, solo: 0, dead: 0,
              avgWant: 0, avgPicks: 0, wins: 0 };
  cfgList.forEach(function (cfg, i) {
    var r = playGame(cfg);
    var g = reportGame('局' + (i + 1), r);
    acc.total += g.total; acc.dead += g.dead;
    acc.shortDie += g.shortDie; acc.neverFoe += g.neverFoe; acc.solo += g.solo;
    acc.avgWant += g.avgWant; acc.avgPicks += g.avgPicks;
    if (r.winner === 'red') acc.wins++;
    KEYS.forEach(function (k) { acc.byKey[k] = (acc.byKey[k] || 0) + g.byKey[k]; });
    if (g.used > acc.used.length) acc.used = KEYS.filter(function (k) { return g.byKey[k] > 0; });
  });
  console.log('\n  ----- ' + name + ' 汇总（' + cfgList.length + ' 局）-----');
  var line = '    兵种合计：';
  KEYS.forEach(function (k) {
    line += pad(C.DATA.units[k].name, 10) + padl(acc.byKey[k] || 0, 4) + '(' + padl(pct(acc.byKey[k] || 0, acc.total), 5) + '%)  ';
  });
  console.log(line);
  console.log('    AI 胜 ' + acc.wins + '/' + cfgList.length +
              ' | 出兵 ' + acc.total + ' 只 | 出门<5s 死 ' + pct(acc.shortDie, acc.dead) + '%' +
              ' | 从未进敌方半场 ' + pct(acc.neverFoe, acc.total) + '%' +
              ' | 孤军出门 ' + pct(acc.solo, acc.total) + '%');
  console.log('    want 平均 ' + (acc.avgWant / cfgList.length).toFixed(1) + ' 种 → 买得起 ' +
              (acc.avgPicks / cfgList.length).toFixed(1) + ' 种');
  return acc;
}

var cfgsA = [], cfgsB = [];
for (var i = 0; i < NG; i++) {
  cfgsA.push({ redDiff: 'hard', blueDiff: null, seed: 1000 + i * 37 });
  cfgsB.push({ redDiff: 'hell', blueDiff: 'hard', seed: 2000 + i * 37 });
}
runScenario('A. 困难 AI(红) vs 人类代理(蓝) · ' + SECS + 's', cfgsA);
runScenario('B. 地狱 AI(红) vs 困难 AI(蓝) · ' + SECS + 's', cfgsB);
process.exit(0);
