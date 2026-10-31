/* =============================================================================
 * src/net.js —— 双人对战「确定性锁步」核心（无 DOM 依赖）
 * -----------------------------------------------------------------------------
 * 设计目标：
 *   两端各自在本地跑**完整仿真**，只交换「命令 + 目标 tick」。因为：
 *     · 仿真完全确定性（logic.js 用带种子的 xorshift，rand(state)，不用 Math.random）
 *     · 仿真不读墙上时钟（update 只吃传入的 dt）
 *     · 玩家动作是离散命令（部署/建造/法术/升级/拆除）
 *   所以「同种子 + 同命令流 + 同顺序」⇒ 两端状态逐 tick 完全一致。
 *
 * 核心约定：
 *   · tick 从 0 开始，20Hz（logic 的 DT = 1/20）。
 *   · 本地操作不立即执行，而是排到 `tick + delayTicks` 执行（吸收网络延迟/抖动）。
 *   · 每条命令携带 {_t(执行tick), _s(发送方), _q(发送方自增序号)}；
 *     执行前按 (_t, _s 固定序, _q) 排序 ⇒ 两端执行顺序必然一致。
 *   · 每 checkEvery 个 tick 交换一次状态哈希；不一致即 desync。
 *
 * 传输层（transport）只需两个方法：
 *     send(obj)        发送一个可 JSON 序列化的消息
 *     onMessage(fn)    注册接收回调
 *     close()          可选
 *   内置 LoopbackTransport（同进程回环，测试用）+ WsTransport（浏览器 WebSocket）。
 * ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; // Node
  root.Net = api;                                                        // 浏览器
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* --------------------------------------------------------------- 工具 */
  function nowMs() {
    if (typeof performance !== 'undefined' && performance.now) return performance.now();
    return Date.now();
  }
  function cloneMsg(obj) {
    // 模拟「过网」：切断对象引用共享
    return JSON.parse(JSON.stringify(obj));
  }

  /* ------------------------------------------------- 状态哈希（desync 检测）
   * 只取对「规则推进」敏感、且两端必然相同的量：
   *   rngState（随机游标）、单位/建筑数量与血量总和、金币、单位坐标。
   * 注意：**不**取渲染/临时字段（如 justDamaged 这类只影响视觉的量可忽略，
   *       但它们在两端也一致，取不取都不影响正确性，这里取核心量即可）。
   * ---------------------------------------------------------------------- */
  function checksum(state) {
    var h = 2166136261 >>> 0;                 // FNV-1a 32bit
    function mix(n) {
      h ^= (n | 0);
      h = Math.imul(h, 16777619) >>> 0;
    }
    mix(state.rngState | 0);
    mix(state.units.length);
    mix(state.buildings.length);
    var i, uhp = 0, bhp = 0;
    for (i = 0; i < state.units.length; i++) uhp += (state.units[i].hp | 0);
    for (i = 0; i < state.buildings.length; i++) bhp += (state.buildings[i].hp | 0);
    mix(uhp); mix(bhp);
    mix(state.res.red | 0); mix(state.res.blue | 0);
    // 单位坐标（数组顺序两端一致：同命令、同 tick、同更新路径）
    for (i = 0; i < state.units.length; i++) {
      mix(state.units[i].row | 0);
      mix(state.units[i].col | 0);
      mix(state.units[i].team === 'red' ? 1 : 2);
    }
    return h >>> 0;
  }

  /* ------------------------------------------------------- 命令分派
   * 把可序列化命令映射回 logic.js 的既有函数。
   * 建筑相关命令用 ref（'r{row}c{col}'）定位，因为两端建筑布局完全一致。
   * 返回：无（命令是否成功不影响同步，两端会得到同样的结果）。
   * ---------------------------------------------------------------------- */
  function applyCommand(C, state, cmd) {
    var team = cmd.team;
    switch (cmd.op) {
      case 'deploy':   C.deployUnit(state, team, cmd.k, cmd.col); break;
      case 'place':    C.placeBuilding(state, team, cmd.k, cmd.row, cmd.col); break;
      case 'cast':     C.castSpell(state, team, cmd.k, cmd.row, cmd.col); break;
      case 'upBase':   C.upgradeBase(state, team); break;
      case 'upBld': {
        var b = state.byRef[team] && state.byRef[team][cmd.ref];
        if (b) C.upgradeBuilding(state, b, cmd.branch || undefined);
        break;
      }
      case 'dem': {
        var b2 = state.byRef[team] && state.byRef[team][cmd.ref];
        if (b2) C.demolishBuilding(state, b2);
        break;
      }
      case 'upGlobal': C.upgradeGlobal(state, team, cmd.k); break;
      default: break; // 未知命令静默忽略（两端一致）
    }
  }

  /* ------------------------------------------------------- 锁步引擎 */
  function createLockstep(opts) {
    var C = opts.C;
    if (!C) throw new Error('createLockstep: 缺少 opts.C（logic 模块）');
    var state = opts.state;
    if (!state) throw new Error('createLockstep: 缺少 opts.state');

    var me = opts.me || 'blue';                       // 本端阵营
    var transport = opts.transport;
    if (!transport) throw new Error('createLockstep: 缺少 opts.transport');

    var delayTicks = opts.delayTicks != null ? opts.delayTicks : 6;   // 输入延迟
    var checkEvery = opts.checkEvery != null ? opts.checkEvery : 20;  // 每 N tick 校验
    var onDesync = opts.onDesync || function () {};
    var onChecksum = opts.onChecksum || null;
    var onLate = opts.onLate || null;

    var tick = 0;              // 下一个要模拟的 tick
    var localSeq = 0;
    var queue = [];            // 待执行命令
    var localHash = {};        // tick -> 本端哈希
    var remoteHash = {};       // tick -> 对端哈希
    var closed = false;

    /* 固定发送方顺序：blue 必先于 red。两端同一张表 ⇒ 同 tick 多命令顺序一致。 */
    function senderOrder(s) { return s === 'blue' ? 0 : 1; }

    transport.onMessage(function (msg) {
      if (closed || !msg || typeof msg !== 'object') return;
      if (msg.type === 'cmd' && msg.c) {
        var c = msg.c;
        if (c._t < tick && onLate) onLate(c, tick);   // 迟到的命令（v1 仍照常入队）
        queue.push(c);
      } else if (msg.type === 'chk') {
        remoteHash[msg.tick] = msg.h;
        compareHash(msg.tick);
      }
    });

    function submit(cmd) {
      if (closed) return null;
      localSeq++;
      var c = {
        op: cmd.op, team: cmd.team,
        k: cmd.k, row: cmd.row, col: cmd.col,
        ref: cmd.ref, branch: cmd.branch,
        _t: tick + delayTicks, _s: me, _q: localSeq
      };
      queue.push(c);
      transport.send({ type: 'cmd', c: c });
      return c;
    }

    function compareHash(t) {
      if (localHash[t] != null && remoteHash[t] != null) {
        if (localHash[t] !== remoteHash[t]) {
          onDesync({ tick: t, local: localHash[t], remote: remoteHash[t] });
        }
        delete localHash[t];
        delete remoteHash[t];
      }
    }

    function step() {
      if (closed) return;
      // 取出所有「到期」命令（_t <= 当前 tick），其余留在队列
      var due = [], rest = [];
      for (var i = 0; i < queue.length; i++) {
        (queue[i]._t <= tick ? due : rest).push(queue[i]);
      }
      queue = rest;
      // 确定性排序：(执行tick, 发送方固定序, 发送方序号)
      due.sort(function (a, b) {
        if (a._t !== b._t) return a._t - b._t;
        var so = senderOrder(a._s) - senderOrder(b._s);
        if (so) return so;
        return a._q - b._q;
      });
      for (var j = 0; j < due.length; j++) applyCommand(C, state, due[j]);

      C.update(state, C.DT);
      tick++;

      if (checkEvery > 0 && tick % checkEvery === 0) {
        var h = checksum(state);
        localHash[tick] = h;
        transport.send({ type: 'chk', tick: tick, h: h });
        compareHash(tick);
        if (onChecksum) onChecksum(tick, h);
      }
    }

    return {
      submit: submit,
      step: step,
      state: state,
      get tick() { return tick; },
      get pending() { return queue.length; },
      checksum: function () { return checksum(state); },
      close: function () { closed = true; if (transport.close) transport.close(); },
      _inject: function (c) { queue.push(c); }   // 测试/调试用
    };
  }

  /* --------------------------------------------------- 回环传输（测试用） */
  function LoopbackTransport() {
    var self = {
      handler: null,
      peer: null,
      closed: false,
      send: function (o) {
        if (self.closed) return;
        if (self.peer && !self.peer.closed && self.peer.handler) {
          self.peer.handler(cloneMsg(o));
        }
      },
      onMessage: function (fn) { self.handler = fn; },
      close: function () { self.closed = true; if (self.peer) self.peer.closed = true; }
    };
    return self;
  }
  function pairLoopback(a, b) { a.peer = b; b.peer = a; }

  /* ----------------------------------------------- WebSocket 传输（浏览器） */
  function WsTransport(url) {
    if (typeof WebSocket === 'undefined') throw new Error('WebSocket 不可用（仅浏览器）');
    var ws = new WebSocket(url);
    var self = {
      ws: ws,
      handler: null,
      closed: false,
      ready: false,
      onOpen: null,
      send: function (o) {
        if (self.closed || ws.readyState !== 1) return false;
        ws.send(JSON.stringify(o));
        return true;
      },
      onMessage: function (fn) { self.handler = fn; },
      close: function () { self.closed = true; try { ws.close(); } catch (e) {} }
    };
    ws.onopen = function () { self.ready = true; if (self.onOpen) self.onOpen(); };
    ws.onmessage = function (ev) {
      var msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (self.handler) self.handler(msg);
    };
    ws.onclose = function () { self.closed = true; };
    return self;
  }

  return {
    createLockstep: createLockstep,
    applyCommand: applyCommand,
    checksum: checksum,
    LoopbackTransport: LoopbackTransport,
    pairLoopback: pairLoopback,
    WsTransport: WsTransport,
    nowMs: nowMs
  };
});
