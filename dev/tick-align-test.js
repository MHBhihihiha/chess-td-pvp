/* =============================================================================
 * dev/tick-align-test.js —— 「一方不延时、另一方延时 10 秒」的回归测试
 * -----------------------------------------------------------------------------
 * 线上症状：两人对局，一方操作几乎没延迟，另一方要等十秒左右，且棋盘逐渐不一致。
 *
 * 根因不是网络，是 tick 漂移 + 输入延迟 D 写死：
 *   1. 旧主循环两端各自按自己的帧率推进 tick，谁也不等谁。一端掉帧（老旧手机、
 *      贴图解码期、后台标签被 rAF 节流）就会稳定落后，差距越积越大。
 *   2. 命令的 _t 是**绝对 tick 编号**。落后 200 tick 的一端收到「_t 已过」的命令
 *      会立刻执行（看起来零延迟）；领先的一端收到「_t 在未来 200 tick」的命令要
 *      硬等 200 tick ≈ 10 秒。同一条命令两端执行时机差 10 秒，rng 序列当场错开。
 *   3. D=6（300ms）小于真实 RTT 时，命令从发出到抵达已经超过目标 tick，必然迟到。
 *
 * 本测试用**虚拟时钟**驱动（不依赖真实 setTimeout，跑得快且结果稳定），
 * 用一个 align=false 的对照组证明「不纠偏就会漂」，再用 align=true 证明修好了。
 * ========================================================================== */
'use strict';
var path = require('path');
var C = require(path.join(__dirname, '..', 'src', 'logic.js'));
var Net = require(path.join(__dirname, '..', 'src', 'net.js'));

var pass = 0, fail = 0;
function item(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('  ❌ ' + name + (detail ? '  ' + detail : '')); }
}

/* ------------------------------------------------------------------ 模拟器
 * o = {
 *   oneWayMs   单向延迟
 *   aFps/bFps  两端各自的「主循环帧率」（模拟掉帧）
 *   seconds    虚拟时长
 *   delayTicks 输入延迟 D（不传则由 rtt 推）
 *   rtt        注入的往返延迟（影响 leadLimit）
 *   align      是否启用 tick 纠偏
 * }
 * 返回两端 tick、共同 tick 上的哈希是否一致、迟到命令数、是否 desync。
 * --------------------------------------------------------------------- */
function runSim(o) {
  var s1 = C.createState({ seed: 4242, difficulty: 'hard' });
  var s2 = C.createState({ seed: 4242, difficulty: 'hard' });
  s1.aiTeam = null; s2.aiTeam = null;

  var now = 0;                  // 虚拟毫秒
  var inflight = [];            // 在途消息：{at, p(目标 pipe), m(消息副本)}

  function pipe() {
    return {
      peer: null, handler: null, closed: false,
      send: function (m) {
        if (this.closed) return;
        var p = this.peer;
        // 深拷贝模拟过网：两端绝不能共享对象引用，否则测不出真实的序列化语义
        inflight.push({ at: now + o.oneWayMs, p: p, m: JSON.parse(JSON.stringify(m)) });
      },
      onMessage: function (fn) { this.handler = fn; },
      close: function () { this.closed = true; }
    };
  }
  var t1 = pipe(), t2 = pipe();
  t1.peer = t2; t2.peer = t1;

  var h1 = {}, h2 = {}, late = 0, desync = null;

  var n1 = Net.createLockstep({
    C: C, state: s1, me: 'blue', transport: t1, checkEvery: 20,
    delayTicks: o.delayTicks, rtt: o.rtt, align: o.align,
    onLate: function () { late++; },
    onDesync: function (e) { if (!desync) desync = e; },
    onChecksum: function (t, h) { h1[t] = h; }
  });
  var n2 = Net.createLockstep({
    C: C, state: s2, me: 'red', transport: t2, checkEvery: 20,
    delayTicks: o.delayTicks, rtt: o.rtt, align: o.align,
    onLate: function () { late++; },
    onDesync: function (e) { if (!desync) desync = e; },
    onChecksum: function (t, h) { h2[t] = h; }
  });

  var stepA = 1000 / o.aFps, stepB = 1000 / o.bFps;
  var nextA = 0, nextB = 0, fA = 0, fB = 0;
  var end = o.seconds * 1000;

  while (now <= end) {
    // 投递到期的网络包
    var kept = [];
    for (var i = 0; i < inflight.length; i++) {
      var d = inflight[i];
      if (d.at <= now) { if (d.p && !d.p.closed && d.p.handler) d.p.handler(d.m); }
      else kept.push(d);
    }
    inflight = kept;

    if (now >= nextA) {
      n1.step(); nextA += stepA; fA++;
      if (fA === 10) n1.submit({ op: 'deploy', team: 'blue', k: 'infantry', col: 3 });
      if (fA === 80) n1.submit({ op: 'deploy', team: 'blue', k: 'infantry', col: 7 });
    }
    if (now >= nextB) {
      n2.step(); nextB += stepB; fB++;
      if (fB === 15) n2.submit({ op: 'place', team: 'red', k: 'cannon', row: 3, col: 4 });
    }
    now += 4;   // 4ms 粒度，远小于 50ms 一个 tick，不会漏帧
  }

  n1.close(); n2.close();

  /* 取两端都到达过的最大校验 tick 比较 —— 两端 tick 不必相等，
   * 但同一个 tick 号上的状态必须完全一样，这才是「同步」的定义。 */
  var common = Object.keys(h1)
    .filter(function (k) { return h2[k] != null; })
    .map(Number)
    .sort(function (a, b) { return a - b; });
  var lastT = common.length ? common[common.length - 1] : -1;

  return {
    tickA: n1.tick, tickB: n2.tick, diff: n1.tick - n2.tick,
    commonTicks: common.length, lastT: lastT,
    same: lastT > 0 && h1[lastT] === h2[lastT],
    hA: lastT > 0 ? h1[lastT] : null, hB: lastT > 0 ? h2[lastT] : null,
    late: late, desync: desync,
    rtt: n1.rtt, delayTicks: n1.delayTicks
  };
}

console.log('\n══════════════════════════════════════════════════════');
console.log(' tick 对齐 / 输入延迟回归');
console.log('══════════════════════════════════════════════════════\n');

/* ---------------------------------------------------------------- 1. 对照组
 * 关掉纠偏，让 B 端掉到 5fps，A 保持 20Hz。这正是线上那台的处境。 */
console.log('【1】对照组：关闭 tick 纠偏，B 端掉帧到 5fps');
var off = runSim({ oneWayMs: 50, aFps: 20, bFps: 5, seconds: 10, delayTicks: 6, rtt: 100, align: false });
console.log('      A tick=' + off.tickA + '  B tick=' + off.tickB + '  帧差=' + off.diff);
item('不纠偏时两端 tick 会明显拉开（证明对照组有效）', Math.abs(off.diff) >= 100,
  '帧差 ' + off.diff + ' tick ≈ ' + (Math.abs(off.diff) * 50 / 1000).toFixed(1) + ' 秒');
item('不纠偏时同一 tick 的状态已经对不上（即线上看到的「不同步」）', !off.same,
  '共同 tick ' + off.lastT + ' 上 ' + off.hA + ' vs ' + off.hB);

/* ------------------------------------------------------------ 2. 修复后收敛 */
console.log('\n【2】开启纠偏，同样的掉帧场景');
var on = runSim({ oneWayMs: 50, aFps: 20, bFps: 5, seconds: 10, delayTicks: 6, rtt: 100, align: true });
console.log('      A tick=' + on.tickA + '  B tick=' + on.tickB + '  帧差=' + on.diff);
item('开启纠偏后帧差被限制在阈值内', Math.abs(on.diff) <= 12,
  '帧差 ' + on.diff + ' tick ≈ ' + (Math.abs(on.diff) * 50) + 'ms');
item('开启纠偏后两端在同一 tick 上状态一致', on.same,
  '共同 tick ' + on.lastT + ' 上 ' + on.hA + ' vs ' + on.hB);
item('没有触发 desync 回调', on.desync === null,
  on.desync ? 'desync@' + on.desync.tick : '无');

/* ------------------------------------------------- 3. 高延迟链路上不能死锁 */
console.log('\n【3】RTT 500ms、两端同速（检查不会互相干等）');
var hi = runSim({ oneWayMs: 250, aFps: 20, bFps: 20, seconds: 10, rtt: 500, align: true });
console.log('      自动推出的输入延迟 D=' + hi.delayTicks + ' tick (' + hi.delayTicks * 50 + 'ms)');
item('D 按 RTT 自适应：RTT 500ms 时 D >= 一个往返（10 tick）', hi.delayTicks >= 10,
  'D=' + hi.delayTicks);
item('两端同速时没有互相等待（tick 正常推进到 10 秒）', hi.tickA >= 190 && hi.tickB >= 190,
  'A=' + hi.tickA + ' B=' + hi.tickB);
item('高延迟下两端状态仍然一致', hi.same, '共同 tick ' + hi.lastT + ' → ' + hi.hA + ' vs ' + hi.hB);
item('高延迟下没有迟到命令', hi.late === 0, '迟到 ' + hi.late + ' 条');

/* ------------------------------------- 4. D 太小时命令必然迟到（证明硬下限） */
console.log('\n【4】反证：RTT 1000ms 但强行把 D 压回 6（旧代码的写死值）');
var bad = runSim({ oneWayMs: 500, aFps: 20, bFps: 20, seconds: 10, delayTicks: 6, rtt: 1000, align: true });
item('D 小于一个往返时会出现迟到命令', bad.late > 0, '迟到 ' + bad.late + ' 条');
item('因此旧代码在长链路上必然分叉', !bad.same, '共同 tick ' + bad.lastT + ' → ' + bad.hA + ' vs ' + bad.hB);

/* ------------------------------------------------------------ 5. 接口自洽 */
console.log('\n【5】接口与降级');
var probe = Net.createLockstep({
  C: C, state: C.createState({ seed: 1, difficulty: 'hard' }), me: 'blue',
  transport: Net.LoopbackTransport(), rtt: 300
});
item('未传 delayTicks 时按 RTT 推出（RTT 300ms → 至少 10 tick）', probe.delayTicks >= 10, 'D=' + probe.delayTicks);
item('lead 在未收到对手心跳时返回 0', probe.lead === 0, 'lead=' + probe.lead);
item('step() 返回布尔值（调用方据此决定是否让出帧）', probe.step() === true);
probe.setRtt(50);
item('setRtt 只往小里取（避免毛刺把阈值收紧）', probe.rtt === 50, 'rtt=' + probe.rtt);
probe.close();

console.log('\n──────────────────────────────────────────────────────');
console.log((fail === 0 ? ' ✅ ' : ' ❌ ') + '通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('──────────────────────────────────────────────────────\n');
process.exit(fail === 0 ? 0 : 1);
