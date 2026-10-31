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

    /* --------------------------------------------- 输入延迟 & 往返测量
     * delayTicks（下称 D）决定「自己按下去之后多久才真正生效」，也决定了这局能容忍
     * 多大的网络延迟。它是锁步的**硬下限**，不是可随意调的画质参数：
     *
     *   命令带着「未来的 tick 号」发出去，必须在那个 tick 到来之前抵达对手。
     *   设对手领先我 L 个 tick、单向延迟 d 个 tick，则要求 D >= L + d。
     *   而为了避免「双方同时判定自己领先、互相干等」的死锁，又要求 D >= 2d（一个往返）。
     *
     *   旧代码写死 D=6（300ms），只要 RTT 超过 300ms 就先天不满足 —— 命令到对手手上时
     *   目标 tick 已经过去，对手只能在错位的时刻执行它，rng 序列当场分家。
     *   这解释了「明明网络没问题却一直不同步」：之前所有测试都在 RTT <= 600ms 内跑，
     *   恰好卡在 D 的边界上，看起来是「勉强能过」。
     *
     * 所以 D 由 index.html 开局时按实测 RTT 算好传进来（两端必须拿到同一个值），
     * 这里只负责兜底：没传就按已知 RTT 推，再没有就给 6。 */
    var rtt = opts.rtt != null ? opts.rtt : -1;                       // 往返延迟（ms，-1 = 未知）
    var TICK_MS = 50;                                                 // 20Hz，与 logic 的 DT 对应
    function rttTicks(ms) { return Math.ceil(Math.max(0, ms) / TICK_MS); }
    var delayTicks = opts.delayTicks != null
      ? opts.delayTicks
      : (rtt >= 0 ? Math.max(6, rttTicks(rtt) + 4) : 6);
    var checkEvery = opts.checkEvery != null ? opts.checkEvery : 20;  // 每 N tick 校验
    var onDesync = opts.onDesync || function () {};
    var onChecksum = opts.onChecksum || null;
    var onLate = opts.onLate || null;

    /* --------------------------------------------------- tick 对齐（v22）
     * 旧实现两端各自按自己的帧率自由推进 tick，谁也不等谁 —— 这是个致命漏洞。
     *
     * 为什么会致命：命令的 _t 是「绝对 tick 编号」，只有当两端 tick 大致相同时，
     * 「提前 delayTicks 排期」才等价于「提前 delayTicks×50ms 排期」。一旦 tick 漂移：
     *   · 落后 200 tick 的一端，收到 _t 早已过去的命令 → 立即执行 → 显得「零延迟」；
     *   · 领先 200 tick 的一端，收到 _t 还在未来的命令 → 硬等 200 tick ≈ 10 秒。
     * 同一条命令在两端差了 10 秒才执行，rng 调用序列必然错开 ⇒ 不同步。
     * 实测症状完全吻合：一方基本没延时、另一方延时 10 秒左右，且双方状态越走越偏。
     *
     * 漂移从哪来（都不是网络问题）：
     *   · 主循环 dt 上限 0.1s —— 帧率掉到 10fps 以下时真实过了 0.15s 却只推进 0.1s，
     *     仿真按半速跑，落后的量以「每秒几 tick」稳定累积；
     *   · 后台标签页 rAF 被浏览器节流到 ~1fps，切走再切回来能一次差出几十秒；
     *   · 开局 start 消息有先后差、贴图加载期掉帧，都会留下初始偏移。
     *
     * 修法：每 tick 广播一次自己的 tick 号，落后者主动等对手追上，领先量封顶 maxLead。
     * 这样「等」的成本被摊到每一帧（每帧最多多等一帧），玩家看到的只是偶尔抖一下，
     * 而不是攒到 10 秒后一次性爆发。
     *
     * stallLimitMs 是死锁兜底：如果对手真的卡死/断线（后台标签、手机息屏），
     * 不能陪着一起冻结，久无音讯就放行让本地继续跑。
     */
    var stallLimitMs = opts.stallLimitMs != null ? opts.stallLimitMs : 2500;
    var peerTick = -1;         // 对手最近一次广播的 tick（-1 = 还没收到过）
    var lastPeerAt = 0;        // 上次收到对手 tick 的时刻（超时兜底用）
    var pingSentAt = -1;
    var waiting = false;       // 本帧是否因为等对手而没有推进（UI 诊断用）
    var extraLead = 0;         // 自适应放宽量：反复超时说明阈值估低了，逐渐放大
    /* align=false 只用于对照实验（dev/tick-align-test.js 拿它证明「不纠偏就会漂」）
     * 与极端情况下的紧急回退，正常对局永远是 true。 */
    var align = opts.align !== false;

    /* 允许的「领先对手多少 tick」。
     * 两个方向都得留够，否则分别踩两种坑：
     *   太小 → 对手的进度心跳要过半个往返才到我手上，我看到的 peerTick 天然是旧值，
     *          两端会同时算出「我领先很多」而双双停下等对方，只能靠超时解开，
     *          表现成规律性卡顿（这是死锁，比延迟更难查）。
     *   太大 → 我领先太多时，对手那边收到的命令目标 tick 已经过去，直接分叉。
     * 由上一条注释的推导，取 D - d（d = 单向延迟），既不会死锁，也刚好保住命令准时。
     * RTT 还未知时放宽到 D + 8，宁可先不纠偏也别一开局就卡住。 */
    function leadLimit() {
      if (rtt < 0) return delayTicks + 8;
      var d = Math.ceil(rttTicks(rtt) / 2);                 // 单向延迟 tick 数
      /* 有个夹缝要专门处理：当 D < 2d（输入延迟撑不住一个往返）时，两个目标无法同时满足 ——
       * 取 D - d 会让两端互等（死锁，表现成整局卡住），取 d 又会让命令迟到（分叉）。
       * 这里选「不死锁」：卡住比偶发分叉更像掉线，玩家会直接弃局；分叉至少还能打完。
       * 正常部署由 index.html 的 pvpDelayTicks() 保证 D >= 一个往返 + 4，走不到这个分支。 */
      return Math.max(d + 2, delayTicks - d);
    }

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
      } else if (msg.type === 'tk') {
        /* 对手的进度心跳。只增不减（乱序到达的旧值直接丢掉）。 */
        if (msg.t > peerTick) peerTick = msg.t;
        lastPeerAt = nowMs();
        /* 落后量回到正常范围后，把超时逼出来的放宽量慢慢收回去 ——
         * 只减不增的话，一次网络抖动会把阈值永久撑大，之后就再也纠不回来了。 */
        if (extraLead > 0 && tick - peerTick <= leadLimit()) {
          extraLead = Math.max(0, extraLead - 2);
        }
      } else if (msg.type === 'ping2') {
        transport.send({ type: 'pong2', t: msg.t });    // 原样回显，对方据此算往返
      } else if (msg.type === 'pong2') {
        if (msg.t === pingSentAt) { rtt = nowMs() - pingSentAt; pingSentAt = -1; }
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

    /* 本帧是否允许推进。三种放行情形：
     *   1. 还没收到过对手心跳 —— 开局阶段不能卡住自己（对手可能刚进页面在载贴图）；
     *   2. 领先量在阈值以内 —— 正常，这是 delayTicks 预留的输入缓冲 + 网络延迟补偿；
     *   3. 对手久未动（超过 stallLimitMs）—— 兜底放行，绝不陪着一起冻结。 */
    function canStep() {
      if (closed) return false;
      if (!align) return true;
      if (peerTick < 0) return true;
      if (tick - peerTick <= leadLimit() + extraLead) return true;
      if ((nowMs() - lastPeerAt) > stallLimitMs) {
        /* 走到这里说明「等」已经等不出结果了：要么对手真的卡住/断线，要么阈值估低了。
         * 放行，并把阈值往上抬一点，避免下一步又立刻卡回来。 */
        extraLead = Math.min(extraLead + 4, 40);
        return true;
      }
      return false;
    }

    function step() {
      if (closed) return false;
      if (!canStep()) { waiting = true; return false; }
      waiting = false;
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

      /* 广播进度。必须每 tick 都发：这是对手判断「该不该等我」的唯一依据，
       * 攒批发会让对齐精度退化到批间隔。20Hz × 十几字节，带宽可以忽略。 */
      transport.send({ type: 'tk', t: tick });

      if (checkEvery > 0 && tick % checkEvery === 0) {
        var h = checksum(state);
        localHash[tick] = h;
        transport.send({ type: 'chk', tick: tick, h: h });
        compareHash(tick);
        if (onChecksum) onChecksum(tick, h);
      }
      return true;
    }

    /* 每 2 秒测一次往返：just for UI 诊断（「延时」到底是多少必须有数字，
     * 靠体感争论永远说不清 —— 之前正是因为没数字，把本地 tick 漂移误判成网络问题）。 */
    var pingTimer = setInterval(function () {
      if (closed) return;
      if (pingSentAt >= 0) return;                 // 上一次还没回，不叠着发
      pingSentAt = nowMs();
      transport.send({ type: 'ping2', t: pingSentAt });
    }, 2000);
    if (pingTimer && pingTimer.unref) pingTimer.unref();   // Node 下别拖着进程不退出

    return {
      submit: submit,
      step: step,
      canStep: canStep,
      state: state,
      get tick() { return tick; },
      get peerTick() { return peerTick; },
      get lead() { return peerTick < 0 ? 0 : tick - peerTick; },   // 正 = 我领先
      get waiting() { return waiting; },
      get rtt() { return rtt; },
      get delayTicks() { return delayTicks; },
      setRtt: function (ms) {
        /* 只往小里取：RTT 的偶发毛刺（一次排队、一次重传）不代表链路变差，
         * 用它去收紧阈值反而会误触发等待。真变差时 ping 会持续给出更小的值。 */
        if (ms > 0 && (rtt < 0 || ms < rtt)) rtt = ms;
      },
      get pending() { return queue.length; },
      checksum: function () { return checksum(state); },
      close: function () {
        closed = true;
        if (pingTimer) clearInterval(pingTimer);
        if (transport.close) transport.close();
      },
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
