/* 真实链路端到端：两个客户端经公网隧道（Cloudflare）跑完整锁步，
 * 检测在真实延迟下两端状态是否一致。
 * 用法：node dev/wss-live-test.js <wss-url>
 */
'use strict';
var path = require('path');
var C = require(path.join(__dirname, '..', 'src', 'logic.js'));
var Net = require(path.join(__dirname, '..', 'src', 'net.js'));

var URL = process.argv[2] || 'wss://grants-salad-considerations-peer.trycloudflare.com';
var ROOM = 'LV' + Math.floor(Math.random() * 90000 + 10000);
var TICKS = 400;          // 20 秒
var STEP_MS = 50;         // 20Hz

function makeClient(team) {
  var cl = { team: team, raw: null, mux: null, state: null, net: null, role: null,
             desync: null, connected: false, started: false, hashes: [] };
  cl.raw = Net.WsTransport(URL);
  var subs = [];
  cl.raw.onMessage(function (m) { subs.forEach(function (f) { try { f(m); } catch (e) {} }); });
  cl.mux = {
    send: function (o) { return cl.raw.send(o); },
    onMessage: function (f) { subs.push(f); },
    close: function () { cl.raw.close(); }
  };
  cl.mux.onMessage(function (msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'paired') {
      cl.role = msg.role;
      if (msg.role === 'host') {
        var seed = (Math.random() * 2147483647) >>> 0;
        cl.mux.send({ type: 'start', seed: seed, sudden: true });
        begin(cl, seed);
      }
    } else if (msg.type === 'start') {
      begin(cl, msg.seed >>> 0);
    }
  });
  cl.raw.onOpen = function () {
    cl.connected = true;
    cl.mux.send({ type: 'join', room: ROOM });
  };
  return cl;
}

function begin(cl, seed) {
  cl.state = C.createState({ seed: seed, difficulty: 'hard' });
  cl.state.aiTeam = null;
  cl.state.suddenDeath = true;
  cl.net = Net.createLockstep({
    C: C, state: cl.state, me: cl.role === 'host' ? 'blue' : 'red',
    transport: cl.mux, delayTicks: 6, checkEvery: 20,
    onDesync: function (e) { if (!cl.desync) cl.desync = e; },
    onChecksum: function (t, h) { cl.hashes.push([t, h]); }
  });
  cl.started = true;
}

function waitUntil(fn, ms) {
  return new Promise(function (res) {
    var t0 = Date.now();
    (function poll() {
      if (fn()) return res(true);
      if (Date.now() - t0 > ms) return res(false);
      setTimeout(poll, 50);
    })();
  });
}

(async function () {
  console.log('隧道: ' + URL);
  console.log('房间: ' + ROOM);
  var A = makeClient('blue');
  var okA = await waitUntil(function () { return A.connected; }, 15000);
  if (!okA) { console.error('A 连接失败'); process.exit(1); }
  console.log('A 已连接，等待配对…');

  var B = makeClient('red');
  var okB = await waitUntil(function () { return B.connected; }, 15000);
  if (!okB) { console.error('B 连接失败'); process.exit(1); }
  console.log('B 已连接');

  var both = await waitUntil(function () { return A.started && B.started; }, 15000);
  if (!both) { console.error('未双双开局'); process.exit(1); }
  console.log('双方已开局，开始推演 ' + TICKS + ' tick（' + (TICKS / 20) + ' 秒）\n');

  var t0 = Date.now();
  var i = 0;
  var units = ['infantry', 'heavy', 'archer', 'siege'];
  var blds = ['cannon', 'arrow', 'mine'];
  var timer = setInterval(function () {
    if (A.net) A.net.step();
    if (B.net) B.net.step();
    // 每 40 tick 各提交一条命令
    if (i % 40 === 20 && A.net) {
      A.net.submit({ op: 'deploy', team: 'blue', k: units[(i / 40) % units.length | 0], col: 2 + (i % 6) });
    }
    if (i % 40 === 30 && B.net) {
      B.net.submit({ op: 'place', team: 'red', k: blds[(i / 40) % blds.length | 0], row: 3 + (i % 2), col: 3 + (i % 4) });
    }
    i++;
    if (i >= TICKS) {
      clearInterval(timer);
      // 留出尾巴时间让最后的命令与校验包落地
      setTimeout(finish, 3000);
    }
  }, STEP_MS);

  function finish() {
    var hA = Net.checksum(A.state), hB = Net.checksum(B.state);
    console.log('=== 结果 ===');
    console.log('  时长            ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
    console.log('  tick            A=' + A.net.tick + '  B=' + B.net.tick);
    console.log('  状态哈希        A=' + hA + '  B=' + hB);
    console.log('  一致            ' + (hA === hB ? '是' : '否 ❌'));
    console.log('  单位数          A=' + A.state.units.length + '  B=' + B.state.units.length);
    console.log('  建筑数          A=' + A.state.buildings.length + '  B=' + B.state.buildings.length);
    console.log('  金币            A=' + Math.floor(A.state.res.blue) + '/' + Math.floor(A.state.res.red) +
                '  B=' + Math.floor(B.state.res.blue) + '/' + Math.floor(B.state.res.red));
    console.log('  desync 事件     A=' + (A.desync ? 'tick ' + A.desync.tick : '无') +
                '  B=' + (B.desync ? 'tick ' + B.desync.tick : '无'));
    var mismatch = 0;
    for (var k = 0; k < Math.min(A.hashes.length, B.hashes.length); k++) {
      if (A.hashes[k][1] !== B.hashes[k][1]) mismatch++;
    }
    console.log('  校验轮次        A=' + A.hashes.length + '  B=' + B.hashes.length +
                '  不一致轮次=' + mismatch);
    try { A.raw.close(); B.raw.close(); } catch (e) {}
    process.exit(hA === hB ? 0 : 1);
  }
})().catch(function (e) { console.error('失败: ' + e.message); process.exit(1); });
