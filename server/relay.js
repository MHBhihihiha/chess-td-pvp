/* =============================================================================
 * server/relay.js —— 零依赖 WebSocket 中继服务器（双人对战用）
 * -----------------------------------------------------------------------------
 * 职责（刻意做得极小）：
 *   1. 手写 WebSocket 握手 + 文本帧收发（不引入 ws 依赖，Node 直接跑）。
 *   2. 房间配对：客户端发 {type:'join', room}，同房间凑满 2 人即互发
 *      {type:'paired', role:'host'|'guest'}；之后该房间内的消息原样转发给对手。
 *   3. 顺带把游戏目录当静态站点托管（本地测试直接开两个标签页即可）。
 *
 * 它**不**跑游戏逻辑、也不做权威判定 —— 纯转发。真正的对战由两端各自的
 * 确定性锁步仿真完成（见 src/net.js）。因此服务器带宽/CPU 几乎为 0。
 *
 * 启动：
 *   node server/relay.js            # 默认 :8787
 *   PORT=9000 node server/relay.js
 * 本地测试：
 *   浏览器开 http://localhost:8787  （会加载 index.html）
 *   两个标签页分别「创建房间 / 加入房间」即可。
 * ========================================================================== */
'use strict';

var http = require('http');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
var ROOT = path.join(__dirname, '..');   // 游戏根目录（静态托管用）

/* -------------------------------------------------- WebSocket 帧编码/解码 */

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + GUID).digest('base64');
}

function encodeFrame(str, opcode) {
  var payload = Buffer.from(str, 'utf8');
  var len = payload.length;
  var header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | (opcode || 0x1);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | (opcode || 0x1);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | (opcode || 0x1);
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  return Buffer.concat([header, payload]);
}

function sendPong(socket, payload) {
  var len = payload.length;
  var header = Buffer.alloc(2);
  header[0] = 0x8A;           // FIN + pong
  header[1] = len < 126 ? len : 125;
  socket.write(Buffer.concat([header, len < 126 ? payload : Buffer.alloc(0)]));
}

/* 解析缓冲区里的帧；返回剩余未消费的 Buffer。onText/onClose 回调。 */
function parseFrames(c, chunk, onText, onClose) {
  c.buf = Buffer.concat([c.buf, chunk]);
  while (c.buf.length >= 2) {
    var b0 = c.buf[0], b1 = c.buf[1];
    var fin = (b0 & 0x80) !== 0;
    var opcode = b0 & 0x0f;
    var masked = (b1 & 0x80) !== 0;
    var len = b1 & 0x7f;
    var off = 2;
    if (len === 126) {
      if (c.buf.length < 4) break;
      len = c.buf.readUInt16BE(2); off = 4;
    } else if (len === 127) {
      if (c.buf.length < 10) break;
      len = c.buf.readUInt32BE(6); off = 10;   // 高 32 位按 0 处理（消息远小于 4GB）
    }
    var mask = null;
    if (masked) {
      if (c.buf.length < off + 4) break;
      mask = c.buf.slice(off, off + 4); off += 4;
    }
    if (c.buf.length < off + len) break;
    var payload = c.buf.slice(off, off + len);
    if (masked) {
      var p = Buffer.from(payload);
      for (var i = 0; i < p.length; i++) p[i] ^= mask[i & 3];
      payload = p;
    }
    c.buf = c.buf.slice(off + len);
    if (opcode === 0x8) { onClose(); return; }
    if (opcode === 0x9) { sendPong(c.socket, payload); continue; }
    if (opcode === 0xA) { continue; }
    if (opcode === 0x1 || opcode === 0x0) {
      if (opcode === 0x1) c.msg = payload;
      else c.msg = Buffer.concat([c.msg || Buffer.alloc(0), payload]);
      if (fin) { onText(c.msg.toString('utf8')); c.msg = null; }
    }
  }
}

/* -------------------------------------------------------------- 房间表 */

function createRelay(opts) {
  var rooms = Object.create(null);   // name -> [client,...]
  var clients = [];                  // 所有活着的连接（心跳保活要遍历它，rooms 只含进过房的人）
  /* 心跳间隔可注入：生产用 25s，单测里传几十毫秒才能几秒内验完 */
  var hbMs = (opts && opts.heartbeatMs) || 25000;

  function sendJSON(c, obj) {
    if (!c.closed && c.socket.writable) {
      try { c.socket.write(encodeFrame(JSON.stringify(obj))); } catch (e) {}
    }
  }
  function peersOf(c) {
    return (rooms[c.room] || []).filter(function (x) { return x !== c && !x.closed; });
  }

  function handleText(c, text) {
    var msg;
    try { msg = JSON.parse(text); } catch (e) { return; }
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'join') {
      var name = String(msg.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'LOBBY';
      // 离开旧房间
      if (c.room && rooms[c.room]) {
        rooms[c.room] = rooms[c.room].filter(function (x) { return x !== c; });
        if (!rooms[c.room].length) delete rooms[c.room];
      }
      c.room = name;
      (rooms[name] = rooms[name] || []).push(c);
      var list = rooms[name];
      if (list.length >= 2) {
        var host = list[0], guest = list[1];
        sendJSON(host, { type: 'paired', role: 'host', peerId: guest.id });
        sendJSON(guest, { type: 'paired', role: 'guest', peerId: host.id });
      } else {
        sendJSON(c, { type: 'waiting', room: name });
      }
      return;
    }

    // 其余消息（cmd / chk / start / rematch ...）一律转发给同房间对手
    peersOf(c).forEach(function (p) { sendJSON(p, msg); });
  }

  function closeClient(c) {
    if (c.closed) return;
    c.closed = true;
    var ci = clients.indexOf(c);
    if (ci >= 0) clients.splice(ci, 1);
    if (c.room && rooms[c.room]) {
      rooms[c.room] = rooms[c.room].filter(function (x) { return x !== c; });
      rooms[c.room].forEach(function (p) { sendJSON(p, { type: 'peer-left' }); });
      if (!rooms[c.room].length) delete rooms[c.room];
    }
    try { c.socket.destroy(); } catch (e) {}
  }

  /* ---------------------------------------------------------- HTTP / 静态 */
  var server = http.createServer(function (req, res) {
    var u = decodeURIComponent((req.url || '/').split('?')[0]);
    if (u === '/') u = '/index.html';
    var file = path.normalize(path.join(ROOT, u));
    if (file.indexOf(ROOT) !== 0) { res.writeHead(403); res.end('forbidden'); return; }
    fs.readFile(file, function (err, data) {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      var ext = path.extname(file).toLowerCase();
      var mime = {
        '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml', '.webp': 'image/webp'
      }[ext] || 'application/octet-stream';
      /* 开发期一律不缓存：改完文件刷新就能拿到新版本（手机上没有 Ctrl+Shift+R 可用）。
       * 生产部署时这行也没什么代价 —— 单文件 225KB，本地/内网瞬间传完。 */
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache, no-store, must-revalidate' });
      res.end(data);
    });
  });

  /* ------------------------------------------------------------ 握手 */
  server.on('upgrade', function (req, socket) {
    if (!/websocket/i.test(req.headers.upgrade || '') || !req.headers['sec-websocket-key']) {
      socket.destroy(); return;
    }
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' + acceptKey(req.headers['sec-websocket-key']) + '\r\n\r\n'
    );
    var c = { socket: socket, buf: Buffer.alloc(0), msg: null, room: null, closed: false,
              id: Math.random().toString(36).slice(2, 8) };

    /* 关掉 Nagle，打开 TCP 保活。
     * Nagle 的规则是「上一个包还没被 ACK 就把后续小包攒着一起发」，配合对端的
     * delayed ACK，每次转发能凭空多等 40–200ms。锁步链路恰恰全是最难受的形状：
     * 每 tick 一个小进度包、每 20 tick 一个小校验包，包小、频率稳、永远凑不满一个 MSS。
     * 这个算法为吞吐量优化，对实时对局是纯负债 —— 必须显式关掉。
     * （Node 的 http 服务对象自己会设 noDelay，但 upgrade 之后拿到的是裸 socket，没人管。） */
    if (socket.setNoDelay) socket.setNoDelay(true);
    if (socket.setKeepAlive) socket.setKeepAlive(true, 30000);

    socket.on('data', function (chunk) {
      parseFrames(c, chunk, function (t) { handleText(c, t); }, function () {
        try { socket.end(); } catch (e) {}
        closeClient(c);
      });
    });
    socket.on('close', function () { closeClient(c); });
    socket.on('error', function () { closeClient(c); });
    clients.push(c);
  });

  /* ---------------------------------------------------------- 心跳保活 */
  /* 为什么必须有（实测踩到的）：
   *   免费 SSH 隧道会按「隧道空闲时长」掐连接。localhost.run 在我们挂机约半小时后
   *   直接报 `Received disconnect ... : tunnel activity timeout` 把隧道断了 ——
   *   而那一刻玩家可能正停在房间里等对手开局，页面还开着，地址却已经失效。
   *   对局中其实不会 idle（锁步每 20 tick 一个校验包），空闲只发生在：
   *     · 进了房间还没点开始
   *     · 结算界面挂着聊天
   *     · 页面开着但人走开了
   * 每 25 秒给所有连接广播一个 {type:'ping'}：客户端会忽略未知 type，
   * 但隧道里有了真实数据流，空闲计时器就被重置。
   * 25 秒是经验值 —— 要明显小于常见的 30~60 秒 idle 阈值，又不能太吵。 */
  var hb = setInterval(function () {
    if (!clients.length) return;                 // 没人在线就没什么可保活的
    for (var i = 0; i < clients.length; i++) sendJSON(clients[i], { type: 'ping', t: Date.now() });
  }, hbMs);
  if (hb.unref) hb.unref();                      // 别因为心跳让进程无法退出
  server.on('close', function () { clearInterval(hb); });

  server._rooms = rooms;   // 便于测试/调试
  server._clients = clients;
  return server;
}

/* 列出本机所有可被别人访问的 IPv4 地址。
 * 为什么需要：手机上要打开 `http://<内网IP>:8787` 才能玩，让用户自己去 ipconfig 找
 * 是最容易卡住的一步（还常常抄到 VMware / WSL 的虚拟网卡地址，抄过去当然打不开）。
 * 这里直接把候选地址打印出来，虚拟网卡排在后面并标注，肉眼一看就知道该用哪个。 */
function lanUrls(port) {
  var list = [];
  try {
    var ifs = require('os').networkInterfaces() || {};
    Object.keys(ifs).forEach(function (name) {
      (ifs[name] || []).forEach(function (a) {
        if (!a) return;
        if (a.family !== 'IPv4' && a.family !== 4) return;
        if (a.internal) return;
        list.push({ name: name, url: 'http://' + a.address + ':' + port });
      });
    });
  } catch (e) { /* os 不可用就当没有 */ }
  /* 排序 = 「手机最可能连得上的排最前」。
   * 踩过的坑：这台机器上排第一的是 26.116.x（ZeroTier 默认网段）和 192.168.137.1
   * （Windows 移动热点的虚拟网卡），真网卡 10.200.x（以太网）反而混在中间。
   * 手机照着第一名去开，必然打不开。所以按「网段可信度」打分，而不是按网卡出场顺序。 */
  var VIRTUAL = /vmware|virtualbox|vethernet|hyper-v|wsl|docker|loopback|tap|tun|zerotier|tailscale|热点|hotspot/i;
  function score(name, ip) {
    var s = 10;
    if (/^192\.168\./.test(ip)) s = 40;                                  // 家用 WiFi 最常见
    else if (/^10\./.test(ip)) s = 35;                                   // 校园网/企业网常见
    else if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) s = 30;
    if (/^26\./.test(ip)) s -= 90;                                       // ZeroTier 默认网段
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) s -= 90;   // Tailscale CGNAT
    if (/^169\.254\./.test(ip)) s -= 100;                                // 链路本地（没拿到 DHCP）
    if (/^127\./.test(ip)) s -= 100;
    if (VIRTUAL.test(name)) s -= 50;
    if (/本地连接\s*\*/.test(name)) s -= 25;                             // Windows 热点/虚拟适配器
    return s;
  }
  list.forEach(function (x) { x.score = score(x.name, x.url.replace(/^http:\/\//, '').split(':')[0]); });
  list.sort(function (a, b) { return b.score - a.score; });
  return list;
}

function start(port) {
  var server = createRelay();
  var p = port != null ? port : (process.env.PORT ? +process.env.PORT : 8787);
  server.listen(p, function () {
    var addr = server.address();
    var real = addr && addr.port ? addr.port : p;
    console.log('[relay] listening on :' + real);
    console.log('        本机       http://localhost:' + real);
    var lan = lanUrls(real);
    if (lan.length) {
      console.log('        手机/同WiFi ' + lan[0].url + '   ← 手机连同一个 WiFi 时开这个');
      lan.slice(1).forEach(function (x) {
        console.log('        （备选）    ' + x.url + '   [' + x.name + ']');
      });
    } else {
      console.log('        手机/同WiFi （没找到局域网地址，检查是否连着 WiFi）');
    }
    console.log('        异地       cloudflared tunnel --url http://localhost:' + real + ' --protocol http2');
  });
  return server;
}

if (require.main === module) start();
module.exports = { start: start, createRelay: createRelay, lanUrls: lanUrls };
