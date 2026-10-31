/* 测公网隧道的 WS 消息往返时间（RTT）
 * 两个客户端进同一房间，A 发 N 条 rtt 包，B 原样回发，统计往返。
 * 用法：node dev/rtt-test.js <wss-url>
 */
'use strict';
var path = require('path');
var Net = require(path.join(__dirname, '..', 'src', 'net.js'));

var URL = process.argv[2] || 'wss://grants-salad-considerations-peer.trycloudflare.com';
var ROOM = 'RT' + Math.floor(Math.random() * 9000 + 1000);
var N = 12;

function mk() {
  var raw = Net.WsTransport(URL);
  var subs = [];
  raw.onMessage(function (m) { subs.forEach(function (f) { try { f(m); } catch (e) {} }); });
  return {
    raw: raw,
    send: function (o) { return raw.send(o); },
    on: function (f) { subs.push(f); },
    onOpen: function (f) { raw.onOpen = f; }
  };
}

function waitOpen(c, ms) {
  return new Promise(function (res) {
    var t0 = Date.now();
    (function p() {
      if (c.raw.ready) return res(true);
      if (Date.now() - t0 > ms) return res(false);
      setTimeout(p, 30);
    })();
  });
}

(async function () {
  console.log('隧道: ' + URL);
  var A = mk(), B = mk();
  if (!(await waitOpen(A, 15000))) { console.error('A 连接失败'); process.exit(1); }
  A.send({ type: 'join', room: ROOM });
  if (!(await waitOpen(B, 15000))) { console.error('B 连接失败'); process.exit(1); }
  B.send({ type: 'join', room: ROOM });

  var paired = false;
  A.on(function (m) { if (m.type === 'paired') paired = true; });
  B.on(function (m) { if (m.type === 'paired') paired = true; });
  var t0 = Date.now();
  while (!paired && Date.now() - t0 < 10000) await new Promise(function (r) { setTimeout(r, 50); });
  if (!paired) { console.error('未能配对'); process.exit(1); }
  console.log('已配对，开始测 ' + N + ' 次往返\n');

  var samples = [];
  var pending = {};
  B.on(function (m) {
    if (m && m.type === 'rtt') B.send({ type: 'rtt', seq: m.seq, echo: true });
  });
  A.on(function (m) {
    if (m && m.type === 'rtt' && m.echo && pending[m.seq]) {
      var rtt = Date.now() - pending[m.seq];
      delete pending[m.seq];
      samples.push(rtt);
      console.log('  #' + m.seq + '  RTT ' + rtt + ' ms');
    }
  });

  for (var i = 1; i <= N; i++) {
    pending[i] = Date.now();
    A.send({ type: 'rtt', seq: i });
    await new Promise(function (r) { setTimeout(r, 350); });
  }
  // 等最后几个回来
  await new Promise(function (r) { setTimeout(r, 3000); });

  if (!samples.length) { console.error('没有收到任何回包'); process.exit(1); }
  samples.sort(function (a, b) { return a - b; });
  var sum = samples.reduce(function (a, b) { return a + b; }, 0);
  var avg = sum / samples.length;
  var med = samples[Math.floor(samples.length / 2)];
  var p90 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.9))];
  console.log('\n=== 统计（' + samples.length + '/' + N + ' 个样本） ===');
  console.log('  最小  ' + samples[0] + ' ms');
  console.log('  中位  ' + med + ' ms');
  console.log('  平均  ' + avg.toFixed(0) + ' ms');
  console.log('  p90   ' + p90 + ' ms');
  console.log('  最大  ' + samples[samples.length - 1] + ' ms');
  console.log('\n  单向延迟中位 ≈ ' + (med / 2).toFixed(0) + ' ms  → 需要 ' +
              Math.ceil(med / 2 / 50) + ' tick 的输入缓冲');
  try { A.raw.close(); B.raw.close(); } catch (e) {}
  process.exit(0);
})().catch(function (e) { console.error('失败: ' + e.message); process.exit(1); });
