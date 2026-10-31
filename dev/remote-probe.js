/* 一次性探针：验证公网隧道上的 HTTP + WebSocket + 端到端配对
 * 用法：node dev/_tunnel_probe.js <host>
 * 测完即删，不进仓库。 */
'use strict';
var https = require('https');
var crypto = require('crypto');
var HOST = process.argv[2];
if (!HOST) { console.error('usage: node dev/_tunnel_probe.js <host>'); process.exit(1); }

function wsConnect(path) {
  return new Promise(function (resolve, reject) {
    var key = crypto.randomBytes(16).toString('base64');
    var req = https.request({
      host: HOST, path: path, port: 443, method: 'GET',
      headers: {
        'Connection': 'Upgrade', 'Upgrade': 'websocket',
        'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13'
      }
    });
    req.on('upgrade', function (res, socket, head) {
      var expect = crypto.createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      var c = { socket: socket, got: [], buf: head && head.length ? Buffer.from(head) : Buffer.alloc(0) };
      socket.on('data', function (d) { c.buf = Buffer.concat([c.buf, d]); drain(c); });
      socket.on('error', function () {});
      resolve({ status: res.statusCode, acceptOk: res.headers['sec-websocket-accept'] === expect, conn: c });
    });
    req.on('response', function (res) { reject(new Error('HTTP ' + res.statusCode)); });
    req.on('error', reject);
    req.end();
  });
}

function drain(c) {
  for (;;) {
    if (c.buf.length < 2) return;
    var b1 = c.buf[1], op = c.buf[0] & 0x0f, masked = (b1 & 0x80) !== 0;
    var len = b1 & 0x7f, off = 2;
    if (len === 126) { if (c.buf.length < 4) return; len = c.buf.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (c.buf.length < 10) return; len = Number(c.buf.readBigUInt64BE(2)); off = 10; }
    if (masked) off += 4;
    if (c.buf.length < off + len) return;
    var payload = c.buf.slice(off, off + len);
    if (masked) {
      var m = c.buf.slice(off - 4, off), out = Buffer.alloc(len);
      for (var i = 0; i < len; i++) out[i] = payload[i] ^ m[i % 4];
      payload = out;
    }
    c.buf = c.buf.slice(off + len);
    if (op === 1) c.got.push(payload.toString('utf8'));
  }
}

function send(c, obj) {
  var payload = Buffer.from(JSON.stringify(obj), 'utf8'), len = payload.length, head;
  if (len < 126) head = Buffer.from([0x81, 0x80 | len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0x80 | 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0x80 | 127; head.writeBigUInt64BE(BigInt(len), 2); }
  var mask = crypto.randomBytes(4), body = Buffer.alloc(len);
  for (var i = 0; i < len; i++) body[i] = payload[i] ^ mask[i % 4];
  c.socket.write(Buffer.concat([head, mask, body]));
}

function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function pick(conn, type) {
  for (var i = 0; i < conn.got.length; i++) {
    try { var m = JSON.parse(conn.got[i]); if (m.type === type) return m; } catch (e) {}
  }
  return null;
}

(async function () {
  var pass = 0, fail = 0;
  function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  [OK]   ' + name + (extra ? '  ' + extra : '')); }
    else { fail++; console.log('  [FAIL] ' + name + (extra ? '  ' + extra : '')); }
  }

  console.log('目标: wss://' + HOST + '/ws');
  var t0 = Date.now();
  var A = await wsConnect('/ws');
  ok('WS 握手返回 101', A.status === 101, 'status=' + A.status);
  ok('Sec-WebSocket-Accept 校验通过', A.acceptOk);
  console.log('  握手耗时 ' + (Date.now() - t0) + 'ms');

  send(A.conn, { type: 'join', room: 'PROBE1' });
  await wait(1500);
  ok('A 进房后收到 waiting', !!pick(A.conn, 'waiting'));

  var B = await wsConnect('/ws');
  send(B.conn, { type: 'join', room: 'PROBE1' });
  await wait(2000);
  var pa = pick(A.conn, 'paired'), pb = pick(B.conn, 'paired');
  ok('A 收到 paired(host)', pa && pa.role === 'host', pa ? 'role=' + pa.role : 'none');
  ok('B 收到 paired(guest)', pb && pb.role === 'guest', pb ? 'role=' + pb.role : 'none');

  send(A.conn, { type: 'cmd', seq: 42, payload: 'move-e2-3' });
  await wait(1500);
  var got = pick(B.conn, 'cmd');
  ok('A 的命令转发到 B', got && got.seq === 42, got ? 'seq=' + got.seq : 'none');

  send(B.conn, { type: 'chk', tick: 7 });
  await wait(1500);
  var got2 = pick(A.conn, 'chk');
  ok('B 的校验包反向转发到 A', got2 && got2.tick === 7, got2 ? 'tick=' + got2.tick : 'none');

  console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败');
  try { A.conn.socket.destroy(); B.conn.socket.destroy(); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.error('探针失败: ' + e.message);
  process.exit(1);
});
