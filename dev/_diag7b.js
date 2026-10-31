/* _diag7b.js —— 真实对局里的「卡死率」A/B 测量（用于判断 frontBlocked 放开中列是否引入卡死）
 *
 * 口径（只统计 AI 派出的**地面兵**）：
 *   · 从派出的那一刻开始跟踪，记录它「朝敌方方向的最大行推进量」；
 *   · 若 12 秒内一次都没推进超过 1 行（还在自家半场/通道里打转），记为 stuck；
 *   · 若整局结束时它仍停在自家半场且 12 秒无推进，也记 stuck。
 * 输出：按「派出列」与「兵种」拆分，方便直接对比修复前/后的 5、6 列。
 *
 * 用法: node dev/_diag7b.js [秒数=420] [局数=6]
 */
var C = require('../src/logic.js');
var SECS = parseInt(process.argv[2] || '420', 10);
var ROUNDS = parseInt(process.argv[3] || '6', 10);
var pad = function (s, n) { s = String(s); while (s.length < n) s += ' '; return s; };
var padl = function (s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; };
var pct = function (a, b) { return b ? Math.round(a / b * 1000) / 10 : 0; };

var STUCK_SEC = 12;
var tot = { all: 0, stuck: 0, blocked: 0, queued: 0 };
var byCol = {}, byKey = {}, stuckByCol = {}, stuckByKey = {}, blockedByCol = {};

for (var rd = 0; rd < ROUNDS; rd++) {
  var seed = 1000 + rd * 37;
  var s = C.createState({ seed: seed });
  s.aiPreset.red = 'hell'; s.aiPreset.blue = 'hard';
  s.suddenDeath = false;
  var tracked = {};       // unitId -> {col, key, best, born, lastProgress, stuck}
  var prevIds = {}, t = 0;
  while (!s.over && t < 20 * SECS) {
    C.update(s, C.DT); C.aiUpdate(s, 'red', C.DT); C.aiUpdate(s, 'blue', C.DT);
    var seen = {};
    for (var i = 0; i < s.units.length; i++) {
      var u = s.units[i];
      seen[u.id] = 1;
      if (!prevIds[u.id] && !u.def.air) {
        // 刚派出的地面兵（此刻在通道行）
        tracked[u.id] = { col: u.col, key: u.key, team: u.team, best: 0,
                          born: s.time, lastProgress: s.time, stuck: false };
      }
      var tr = tracked[u.id];
      if (!tr) continue;
      var pos = 'r' + u.row + 'c' + u.col;
      if (pos !== tr.pos) {
        tr.pos = pos; tr.moved = (tr.moved || 0) + 1; tr.still = 0;
        tr.tail = (tr.tail || []); tr.tail.push(pos); if (tr.tail.length > 10) tr.tail.shift();
      } else { tr.still = (tr.still || 0) + 1; if (tr.still > (tr.maxStill || 0)) tr.maxStill = tr.still; }
      // 朝敌方推进了多少行（红方目标行号增大，蓝方目标行号减小）
      var prog = (u.team === 'red') ? (u.row - 1) : (C.ROWS - u.row);
      if (u.row >= 1 && u.row <= C.ROWS) {
        if (prog > tr.best + 0.001) { tr.best = prog; tr.lastProgress = s.time; }
        else if (s.time - tr.lastProgress > STUCK_SEC && !C.hasAnyTarget(s, u)) {
          /* 没推进、且射程里没有任何目标（不是在打架）→ 才是「可疑卡住」。
           * 再分两类，区分「真被挡住」和「在通道里排队」：
           *   · queued  ：还在通道行（行0/行11）→ 后面有兵堵着进场口，属于拥堵不是死锁
           *   · blocked ：已经在棋盘内却动不了 → 这才是真问题 */
          var inChan = (u.row < 1 || u.row > C.ROWS);
          if (inChan) tr.everQueued = true; else tr.everBlocked = true;
          tr.suspectFrames = (tr.suspectFrames || 0) + 1;
        }
      }
      // 记录「最长一次既没推进、也没在打架」的持续时长
      if (s.time - tr.lastProgress > STUCK_SEC && !C.hasAnyTarget(s, u)) {
        tr.noTargetFrames = (tr.noTargetFrames || 0) + 1;
        if (tr.bestAtSuspect == null) tr.bestAtSuspect = tr.best;
      }
      // 之后又往前推进了 → 说明只是短暂堵了一下（不是长期死锁）
      if (tr.bestAtSuspect != null && tr.best > tr.bestAtSuspect + 0.001) tr.recovered = true;
    }
    // 统计那些已经离场（阵亡/结束）的
    Object.keys(tracked).forEach(function (id) {
      if (!seen[id] && tracked[id].finish !== 1) { tracked[id].finish = 1; tracked[id].dead = s.time; finalize(tracked[id]); }
    });
    prevIds = seen;
    t++;
  }
  Object.keys(tracked).forEach(function (id) {
    if (!tracked[id].finish) { tracked[id].finish = 1; tracked[id].end = s.time; finalize(tracked[id]); }
  });
}

function finalize(tr) {
  tot.all++;
  byCol[tr.col] = (byCol[tr.col] || 0) + 1;
  byKey[tr.key] = (byKey[tr.key] || 0) + 1;
  /* 「可疑卡住」= 连续 8 秒以上既没朝敌方推进、射程里也没有任何目标可打
   * （排除"站在那儿打敌人"这种正常行为）。再分两类：
   *   · blocked ：曾经在棋盘内动不了（真问题）
   *   · queued  ：只在通道行排队等进场（拥堵，不是死锁） */
  if ((tr.suspectFrames || 0) >= 20 * 8) {
    tot.stuck++; stuckByCol[tr.col] = (stuckByCol[tr.col] || 0) + 1;
    stuckByKey[tr.key] = (stuckByKey[tr.key] || 0) + 1;
    if (tr.everBlocked) { tot.blocked++; blockedByCol[tr.col] = (blockedByCol[tr.col] || 0) + 1; }
    else tot.queued++;
    if (!tr.recovered) {
      tot.hard = (tot.hard || 0) + 1;
      console.log('    [未恢复] ' + tr.team + ' ' + C.DATA.units[tr.key].name + ' 派出列' + tr.col +
        ' 出生@' + tr.born.toFixed(1) + 's 最远推进 ' + tr.best + ' 行 末位置 ' + (tr.tail ? tr.tail[tr.tail.length - 1] : '?') +
        ' 轨迹尾部 ' + (tr.tail ? tr.tail.join('→') : '?') +
        ' 耗时 ' + ((tr.dead || tr.end || 0) - tr.born).toFixed(0) + 's');
    }
  }
}

console.log('=== 真实对局卡死统计（' + ROUNDS + ' 局 × ' + SECS + 's，地狱(红) vs 困难(蓝)，只算地面兵）===');
console.log('  判据：连续 ≥8 秒「既没朝敌方推进、射程内也没有任何目标可打」（排除在打架）');
console.log('  地面兵总数 ' + tot.all + '，可疑卡住 ' + tot.stuck + '（' + pct(tot.stuck, tot.all) + '%）' +
  '  —— 其中「棋盘内动不了」' + tot.blocked + ' 个 /「通道里排队」' + tot.queued + ' 个');
var l1 = '  派出列   ', l2 = '  数量     ', l3 = '  可疑卡住 ', l4 = '  棋盘内卡  ';
for (var c = 1; c <= C.COLS; c++) {
  l1 += padl(c, 4); l2 += padl(byCol[c] || 0, 4); l3 += padl(stuckByCol[c] || 0, 4);
  l4 += padl(blockedByCol[c] || 0, 4);
}
console.log(l1); console.log(l2); console.log(l3); console.log(l4);
console.log('\n  按兵种：');
Object.keys(byKey).sort().forEach(function (k) {
  console.log('    ' + pad(C.DATA.units[k].name, 6) + ' 数量 ' + padl(byKey[k], 4) +
    '  卡死 ' + padl(stuckByKey[k] || 0, 4) + '（' + pct(stuckByKey[k] || 0, byKey[k]) + '%）');
});
var midN = (byCol[5] || 0) + (byCol[6] || 0), midS = (stuckByCol[5] || 0) + (stuckByCol[6] || 0);
console.log('\n  中列（5/6）合计：派出 ' + midN + ' 个，卡死 ' + midS + ' 个（' + pct(midS, midN) + '%）');
var sideN = (byCol[4] || 0) + (byCol[7] || 0), sideS = (stuckByCol[4] || 0) + (stuckByCol[7] || 0);
console.log('  邻列（4/7）合计：派出 ' + sideN + ' 个，卡死 ' + sideS + ' 个（' + pct(sideS, sideN) + '%）');
