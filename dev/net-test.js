'use strict';
/* ============================================================================
 * 双人对战「确定性锁步」自检
 *   1. 同种子 + 同命令流 → 两端逐 tick 状态哈希完全一致（多种子）
 *   2. 命令按确定性顺序执行；建造/升级/升级大本营/法术两端结果一致
 *   3. 人为制造分叉 → desync 能被检测到
 *   4. 状态校验和对金币变化敏感
 *   5. 中继服务器：两人配对 + 消息转发（用 Node 22 自带 WebSocket 客户端实测）
 * ========================================================================== */
var C = require('../src/logic.js');
var Net = require('../src/net.js');

var pass = 0, fail = 0;
var rows = [];
function item(name, ok, ev) {
  if (ok) pass++; else fail++;
  rows.push({ n: name, ok: ok, ev: ev || '' });
}

/* ---------------------------------------------------------------- 1~2 确定性 */
function runDeterminism(seed, delay) {
  var sA = C.createState({ seed: seed, difficulty: 'hard' });
  var sB = C.createState({ seed: seed, difficulty: 'hard' });
  [sA, sB].forEach(function (s) { s.res.blue = 99999; s.res.red = 99999; });

  var tA = Net.LoopbackTransport(), tB = Net.LoopbackTransport();
  Net.pairLoopback(tA, tB);
  var ds = [];

  var A = Net.createLockstep({ C: C, state: sA, me: 'blue', transport: tA,
    delayTicks: delay, checkEvery: 10, onDesync: function (e) { ds.push(e); } });
  var B = Net.createLockstep({ C: C, state: sB, me: 'red', transport: tB,
    delayTicks: delay, checkEvery: 10, onDesync: function (e) { ds.push(e); } });

  var spellKey = (C.DATA.spells && C.DATA.spells[0] && C.DATA.spells[0].key) || 'arrow';
  var script = [
    { t: 0,   w: 'blue', c: { op: 'deploy', team: 'blue', k: 'infantry', col: 3 } },
    { t: 0,   w: 'red',  c: { op: 'deploy', team: 'red',  k: 'infantry', col: 4 } },
    { t: 8,   w: 'blue', c: { op: 'deploy', team: 'blue', k: 'siege', col: 3 } },
    { t: 12,  w: 'red',  c: { op: 'deploy', team: 'red',  k: 'archer', col: 7 } },
    /* 塔放在「没有己方兵经过的空列」（蓝兵只走 col3，红兵只走 col4/7），
     * 否则兵会先占住格子导致建造被拒（两端同样被拒，但那不是要测的东西）。 */
    { t: 16,  w: 'blue', c: { op: 'place',  team: 'blue', k: 'cannon', row: 10, col: 1 } },
    { t: 40,  w: 'blue', c: { op: 'upBld',  team: 'blue', ref: 'r10c1' } },
    { t: 60,  w: 'blue', c: { op: 'upBase', team: 'blue' } },
    { t: 90,  w: 'blue', c: { op: 'cast',   team: 'blue', k: spellKey, row: 6, col: 5 } },
    { t: 120, w: 'red',  c: { op: 'place',  team: 'red',  k: 'cannon', row: 2, col: 9 } },
    { t: 160, w: 'red',  c: { op: 'upBld',  team: 'red',  ref: 'r2c9' } }
  ];
  var maxTicks = 360;
  for (var t = 0; t < maxTicks; t++) {
    for (var i = 0; i < script.length; i++) {
      if (script[i].t === t) (script[i].w === 'blue' ? A : B).submit(script[i].c);
    }
    A.step(); B.step();
  }
  return { A: A, B: B, sA: sA, sB: sB, ds: ds, maxTicks: maxTicks };
}

console.log('\n=== 1. 确定性：同种子 + 同命令流 → 两端一致 ===');
[1, 7, 12345, 99999].forEach(function (seed) {
  var r = runDeterminism(seed, 6);
  item('种子 ' + seed + '：A/B 最终状态哈希一致', r.A.checksum() === r.B.checksum(),
    r.A.checksum().toString(16) + ' vs ' + r.B.checksum().toString(16));
  item('种子 ' + seed + '：全程无 desync', r.ds.length === 0, 'desync=' + r.ds.length);
  item('种子 ' + seed + '：A/B tick 严格同步到 ' + r.maxTicks,
    r.A.tick === r.maxTicks && r.B.tick === r.maxTicks, r.A.tick + '/' + r.B.tick);
});

console.log('\n=== 2. 命令确实生效，且两端结果一致 ===');
(function () {
  var r = runDeterminism(12345, 6), sA = r.sA, sB = r.sB;
  item('部署生效：双方都有单位上场', sA.units.length > 0 && sB.units.length > 0,
    '蓝 ' + sA.units.length + ' 红 ' + sB.units.length);
  item('建造生效：蓝方炮塔 r10c1 两端都建成了',
    !!sA.byRef.blue['r10c1'] && !!sB.byRef.blue['r10c1']);
  item('升级大本营：两端大本营等级一致',
    sA.baseLevel.blue === sB.baseLevel.blue, 'Lv' + sA.baseLevel.blue + ' / Lv' + sB.baseLevel.blue);
  var la = sA.byRef.blue['r10c1'] ? sA.byRef.blue['r10c1'].level : -1;
  var lb = sB.byRef.blue['r10c1'] ? sB.byRef.blue['r10c1'].level : -1;
  item('升级建筑：蓝方塔两端等级一致', la === lb, 'Lv' + la + ' / Lv' + lb);
  item('金币结算一致', sA.res.blue === sB.res.blue && sA.res.red === sB.res.red,
    '蓝 ' + Math.round(sA.res.blue) + '/' + Math.round(sB.res.blue));
})();

console.log('\n=== 3. desync 能被检测到 ===');
(function () {
  var sA = C.createState({ seed: 5 }), sB = C.createState({ seed: 5 });
  var tA = Net.LoopbackTransport(), tB = Net.LoopbackTransport();
  Net.pairLoopback(tA, tB);
  var dsA = 0, dsB = 0;
  var A = Net.createLockstep({ C: C, state: sA, me: 'blue', transport: tA, delayTicks: 6,
    checkEvery: 5, onDesync: function () { dsA++; } });
  var B = Net.createLockstep({ C: C, state: sB, me: 'red', transport: tB, delayTicks: 6,
    checkEvery: 5, onDesync: function () { dsB++; } });
  for (var t = 0; t < 30; t++) {
    A.step(); B.step();
    if (t === 12) sA.res.blue += 1000;   // 人为制造分叉（只改 A）
  }
  item('人为分叉后触发 desync（至少一侧）', dsA + dsB > 0, 'A=' + dsA + ' B=' + dsB);
})();

console.log('\n=== 4. 校验和敏感性 ===');
(function () {
  var s = C.createState({ seed: 1 });
  var h1 = Net.checksum(s);
  s.res.blue += 1;
  var h2 = Net.checksum(s);
  item('金币 +1 → 校验和变化', h1 !== h2, h1.toString(16) + ' vs ' + h2.toString(16));
  var s3 = C.createState({ seed: 1 });
  item('同种子新状态 → 校验和相同（可复现）', Net.checksum(s3) === h1, Net.checksum(s3).toString(16));
})();

console.log('\n=== 5. applyCommand 覆盖全部 7 种动作 ===');
(function () {
  var s = C.createState({ seed: 3 }); s.res.blue = 99999; s.res.red = 99999;
  var spellKey = (C.DATA.spells && C.DATA.spells[0] && C.DATA.spells[0].key) || 'arrow';
  var gk = Object.keys(C.DATA.globalUpgrades)[0];
  var threw = null, lvAfterUp = -1;
  try {
    Net.applyCommand(C, s, { op: 'deploy',   team: 'blue', k: 'infantry', col: 3 });
    Net.applyCommand(C, s, { op: 'place',    team: 'blue', k: 'cannon', row: 10, col: 1 });
    Net.applyCommand(C, s, { op: 'upBld',    team: 'blue', ref: 'r10c1' });
    lvAfterUp = s.byRef.blue['r10c1'] ? s.byRef.blue['r10c1'].level : -1;
    Net.applyCommand(C, s, { op: 'upBase',   team: 'blue' });
    Net.applyCommand(C, s, { op: 'upGlobal', team: 'blue', k: gk });
    Net.applyCommand(C, s, { op: 'cast',     team: 'blue', k: spellKey, row: 6, col: 5 });
    Net.applyCommand(C, s, { op: 'dem',      team: 'blue', ref: 'r10c1' });
  } catch (e) { threw = e; }
  item('7 种命令 applyCommand 全部无异常', !threw, threw ? threw.message : 'ok');
  item('  deploy 生效', s.units.length > 0, '单位 ' + s.units.length);
  item('  place + upBld 生效（炮塔 Lv2）', lvAfterUp === 2, 'Lv' + lvAfterUp);
  item('  upBase 生效', s.baseLevel.blue >= 2, 'Lv' + s.baseLevel.blue);
  item('  upGlobal 生效', (s.globalUp.blue[gk] || 0) >= 1, 'Lv' + (s.globalUp.blue[gk] || 0));
  item('  dem 生效（炮塔已拆除）', !s.byRef.blue['r10c1'], s.byRef.blue['r10c1'] ? '仍在' : '已拆');
})();

console.log('\n=== 6. index.html 接线静态检查 ===');
(function () {
  var fs = require('fs'), path = require('path');
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  item('已引入 src/net.js', /<script src="src\/net\.js"><\/script>/.test(html));
  var ops = {}, m, re = /op: '([a-zA-Z]+)'/g;
  while ((m = re.exec(html))) ops[m[1]] = true;
  var need = ['deploy', 'place', 'cast', 'upBase', 'upBld', 'dem', 'upGlobal'];
  var missing = need.filter(function (k) { return !ops[k]; });
  item('动作挂钩发出 7 种命令齐全', missing.length === 0, missing.length ? ('缺 ' + missing.join(',')) : 'ok');
  item('存在 PvP 大厅/开局/拦截代码',
    /function pvpConnect/.test(html) && /function pvpBegin/.test(html) && /installPvpHooks/.test(html));
  item('主循环 PvP 分支调用 net.step', /PVP\.net\.step\(\)/.test(html));
  item('AI 模式仍保留（aiUpdate 仍在主循环里）', /C\.aiUpdate\(state, FOE, C\.DT\)/.test(html));
})();

/* ------------------------------------------------------------- 7. 中继服务器 */
function testRelay() {
  return new Promise(function (resolve) {
    if (typeof WebSocket === 'undefined') {
      item('中继：跳过（当前 Node 无全局 WebSocket）', true, 'skip');
      return resolve();
    }
    var relay = require('../server/relay.js');
    /* 心跳间隔压到 120ms：生产是 25s，等 25 秒做断言不现实 */
    var srv = relay.createRelay({ heartbeatMs: 120 });
    srv.listen(0);
    var settled = false;
    function done() {
      if (settled) return; settled = true;
      try { srv.close(); } catch (e) {}
      resolve();
    }
    var timer = setTimeout(function () {
      item('中继：配对 + 转发', false, 'timeout(3s)');
      done();
    }, 3000);

    srv.on('listening', function () {
      var port = srv.address().port;
      var url = 'ws://127.0.0.1:' + port;
      var a = new WebSocket(url), b = new WebSocket(url);
      var paired = 0, gotB = false, pingCount = 0;

      a.onmessage = function (ev) {
        var m = JSON.parse(ev.data);
        if (m.type === 'ping') pingCount++;
        if (m.type === 'paired') { paired++; if (paired === 2) fire(); }
      };
      b.onmessage = function (ev) {
        var m = JSON.parse(ev.data);
        if (m.type === 'ping') pingCount++;
        if (m.type === 'paired') { paired++; if (paired === 2) fire(); }
        if (m.type === 'cmd' && m.c && m.c.op === 'deploy') gotB = true;
      };
      function fire() {
        a.send(JSON.stringify({ type: 'cmd', c: { op: 'deploy', team: 'blue', k: 'infantry', col: 3, _t: 6, _s: 'blue', _q: 1 } }));
        setTimeout(function () {
          item('中继：两人配对成功（双方各收到 paired）', paired >= 2, 'paired=' + paired);
          item('中继：A 的命令被转发给 B', gotB, 'gotB=' + gotB);
          item('中继：空闲时会发心跳包（防止隧道因 activity timeout 被掐）', pingCount > 0, 'ping=' + pingCount);
          clearTimeout(timer); done();
        }, 400);
      }
      a.onopen = function () { a.send(JSON.stringify({ type: 'join', room: 'TEST' })); };
      b.onopen = function () { b.send(JSON.stringify({ type: 'join', room: 'TEST' })); };
      a.onerror = b.onerror = function () {
        item('中继：WebSocket 连接', false, 'ws error');
        clearTimeout(timer); done();
      };
    });
  });
}

/* ---------------------------------------------------------------- 汇总 */
function finish() {
  console.log('\n================== 双人对战锁步自检 ==================');
  rows.forEach(function (r) { console.log((r.ok ? '  ✅ ' : '  ❌ ') + r.n + (r.ev ? ('  [' + r.ev + ']') : '')); });
  console.log('=====================================================');
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  process.exit(fail === 0 ? 0 : 1);
}

testRelay().then(finish, function (e) {
  item('中继测试异常', false, String(e && e.stack || e));
  finish();
});
