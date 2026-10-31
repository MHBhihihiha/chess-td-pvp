/* 诊断 PvP 不同步：先查 createState 确定性，再压延迟看锁步是否分叉 */
'use strict';
var path = require('path');
var C = require(path.join(__dirname, '..', 'src', 'logic.js'));
var Net = require(path.join(__dirname, '..', 'src', 'net.js'));

function snap(s) {
  return {
    units: s.units.map(function (u) { return u.team + ':' + u.k + '@' + u.row + ',' + u.col + ':' + Math.floor(u.hp); }),
    blds: s.buildings.map(function (b) { return b.team + ':' + b.k + '@' + b.row + ',' + b.col + ':' + Math.floor(b.hp); }),
    res: [s.res.red, s.res.blue],
    rng: s.rngState
  };
}

console.log('=== 1. createState 是否确定性（同 seed 两次） ===');
var A = C.createState({ seed: 12345, difficulty: 'hard' });
var B = C.createState({ seed: 12345, difficulty: 'hard' });
var sa = JSON.stringify(snap(A)), sb = JSON.stringify(snap(B));
console.log('  同 seed 两次快照一致: ' + (sa === sb));
if (sa !== sb) {
  console.log('  A: ' + sa.slice(0, 200));
  console.log('  B: ' + sb.slice(0, 200));
}
console.log('  单位数 ' + A.units.length + ' / 建筑数 ' + A.buildings.length + ' / rng ' + A.rngState);

console.log('\n=== 2. 锁步哈希基线 ===');
console.log('  A checksum=' + Net.checksum(A) + '  B checksum=' + Net.checksum(B));

/* ---------------------------------------------------------------- 3. 延迟锁步
 * 建两端 lockstep，中间用一个带「单向延迟」的 transport 桥接，
 * 各自按 50ms 一 tick 推进，看最终 checksum 是否还一致。 */
function lagTransport(label) {
  var t = {
    label: label, peer: null, handler: null, delayMs: 0, closed: false,
    send: function (o) {
      if (t.closed) return;
      var peer = t.peer;
      var copy = JSON.parse(JSON.stringify(o));
      setTimeout(function () {
        if (peer && !peer.closed && peer.handler) peer.handler(copy);
      }, t.delayMs);
    },
    onMessage: function (fn) { t.handler = fn; },
    close: function () { t.closed = true; }
  };
  return t;
}

function runCase(oneWayMs, ticks) {
  return new Promise(function (resolve) {
    var s1 = C.createState({ seed: 999, difficulty: 'hard' });
    var s2 = C.createState({ seed: 999, difficulty: 'hard' });
    s1.aiTeam = null; s2.aiTeam = null;
    var t1 = lagTransport('blue'), t2 = lagTransport('red');
    t1.peer = t2; t2.peer = t1;
    t1.delayMs = oneWayMs; t2.delayMs = oneWayMs;

    var desync = null;
    var n1 = Net.createLockstep({
      C: C, state: s1, me: 'blue', transport: t1, delayTicks: 6, checkEvery: 20,
      onDesync: function (e) { if (!desync) desync = e; }
    });
    var n2 = Net.createLockstep({
      C: C, state: s2, me: 'red', transport: t2, delayTicks: 6, checkEvery: 20,
      onDesync: function (e) { if (!desync) desync = e; }
    });

    // 两端各自按 50ms 推进，模拟 20Hz 主循环
    var i = 0;
    var timer = setInterval(function () {
      n1.step(); n2.step();
      // 第 10 tick 蓝方派兵、第 25 tick 红方建塔
      if (i === 10) n1.submit({ op: 'deploy', team: 'blue', k: 'infantry', col: 3 });
      if (i === 25) n2.submit({ op: 'place', team: 'red', k: 'cannon', row: 3, col: 4 });
      i++;
      if (i >= ticks) {
        clearInterval(timer);
        setTimeout(function () {
          resolve({
            oneWayMs: oneWayMs,
            same: Net.checksum(s1) === Net.checksum(s2),
            h1: Net.checksum(s1), h2: Net.checksum(s2),
            u1: s1.units.length, u2: s2.units.length,
            b1: s1.buildings.length, b2: s2.buildings.length,
            desync: desync
          });
        }, oneWayMs * 2 + 400);
      }
    }, 50);
  });
}

(async function () {
  console.log('\n=== 3. 不同单向延迟下，delayTicks=6（300ms）能否撑住 ===');
  var cases = [0, 50, 100, 150, 200, 300, 500];
  for (var i = 0; i < cases.length; i++) {
    var r = await runCase(cases[i], 120);
    var lag = '单向 ' + r.oneWayMs + 'ms (RTT ' + r.oneWayMs * 2 + 'ms)';
    var msg = r.same ? '一致' : '❌ 分叉';
    console.log('  ' + lag.padEnd(26) + msg +
      '  单位 ' + r.u1 + '/' + r.u2 + ' 建筑 ' + r.b1 + '/' + r.b2 +
      (r.desync ? '  desync@' + r.desync.tick : ''));
  }
  process.exit(0);
})();
