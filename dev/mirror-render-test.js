/* 视角镜像的**渲染层**端到端测试（v21）
 * ----------------------------------------------------------------------------
 * mirror-test.js 证的是坐标数学；这里证的是「渲染层真的把格子翻过去了」。
 *
 * 为什么还要单独一套：
 *   数学对 ≠ 画面对。典型翻车方式——cellRect 翻了但 pointToCell 没翻，
 *   于是红方玩家点第 3 列，兵从第 8 列出来。这种 bug 纯数学单测抓不到，
 *   只有「点屏幕上的某一点 → 看逻辑状态落到哪一格」才能抓。
 *
 * 做法：用极简 DOM/Canvas 桩真实执行 index.html 的内联脚本，然后
 *   ① 翻视角前后各画若干帧，确认不抛异常、背景板会重建（阵营色调跟着翻）
 *   ② 翻视角后在「屏幕坐标 (1,10)」点一下 —— 必须落到逻辑格 (10,1)
 *   ③ 翻回来后同一个屏幕点必须落到逻辑格 (1,10)（互逆性）
 */
'use strict';
var fs = require('fs');
var path = require('path');

var pass = 0, fail = 0;
function item(name, ok, extra) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  [' + extra + ']' : '')); }
}

/* ------------------------------------------------ 极简 DOM / Canvas 桩 */
var BY_ID = {};
var ctxCalls = 0;
var drawRects = [];                      // 记录 fillRect，便于确认"确实画了东西"
function ctxStub() {
  return new Proxy({}, {
    get: function (t, k) {
      if (k === 'canvas') return null;
      if (k === 'createRadialGradient' || k === 'createLinearGradient' || k === 'createPattern') {
        return function () { ctxCalls++; return { addColorStop: function () {}, setTransform: function () {} }; };
      }
      if (k === 'measureText') return function (t2) { return { width: String(t2).length * 8 }; };
      if (k === 'fillRect') return function (x, y, w, h) { ctxCalls++; drawRects.push([x, y, w, h]); };
      return function () { ctxCalls++; };
    },
    set: function () { return true; }
  });
}
function makeEl(id) {
  var el = {
    id: id, children: [], _inner: '', textContent: '', className: '', hidden: false,
    style: { setProperty: function (k, v) { this[k] = v; } },
    dataset: {}, clientWidth: 360, clientHeight: 640, width: 360, height: 640, checked: false,
    classList: {
      _s: {},
      add: function (c) { this._s[c] = true; },
      remove: function (c) { delete this._s[c]; },
      toggle: function (c, on) { if (on) this._s[c] = true; else delete this._s[c]; },
      contains: function (c) { return !!this._s[c]; }
    },
    appendChild: function (c) { this.children.push(c); return c; },
    querySelector: function (sel) { return (typeof sel === 'string' && sel.charAt(0) === '#') ? (BY_ID[sel.slice(1)] || null) : null; },
    querySelectorAll: function () { return []; },
    addEventListener: function (ev, fn) { (this._h = this._h || {})[ev] = fn; },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; },
    getContext: function () { return ctxStub(); },
    setAttribute: function (k, v) { (this._attrs = this._attrs || {})[k] = String(v); },
    onclick: null
  };
  Object.defineProperty(el, 'innerHTML', {
    get: function () { return this._inner; },
    set: function (v) {
      this._inner = String(v == null ? '' : v);
      this.children = [];
      var re = /id="([A-Za-z0-9_-]+)"/g, m;
      while ((m = re.exec(this._inner))) { if (!BY_ID[m[1]]) BY_ID[m[1]] = makeEl(m[1]); }
    }
  });
  return el;
}
var els = {};
var rafQueue = [];
var document = {
  getElementById: function (id) {
    if (BY_ID[id]) return BY_ID[id];
    if (!els[id]) els[id] = makeEl(id);
    return els[id];
  },
  createElement: function (tag) { return makeEl(tag); },
  addEventListener: function () {},
  body: makeEl('body')
};
var window = { devicePixelRatio: 1, addEventListener: function () {} };
var C = require('../src/logic.js');
var V = require('../src/view.js');
window.GameCore = C;
window.GameView = V;                     // 与 index.html 里 <script src="src/view.js"> 一致
var Net = require('../src/net.js');
window.Net = Net;

/* ------------------------------------------------ 启动 */
var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var src = html.match(/<script>([\s\S]*?)<\/script>/)[1];

console.log('=== 一、带镜像逻辑启动（不抛异常） ===');
var bootErr = null;
try {
  new Function('window', 'document', 'requestAnimationFrame', 'GameCore', 'GameView', 'Net', src)(
    window, document, function (fn) { rafQueue.push(fn); }, C, V, Net
  );
} catch (e) { bootErr = e; }
item('内联脚本能完整初始化', !bootErr, bootErr && bootErr.message);

var G = window.__game;
item('暴露了 __game 调试口', !!G);
item('暴露了 __game.view 视角调试口', !!(G && G.view && G.view.setFlip && G.view.pick && G.view.cellRect));
if (!G || !G.view) { console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项'); process.exit(1); }

var t = 0;
function frames(n) {
  for (var i = 0; i < n; i++) {
    var fn = rafQueue.shift();
    if (!fn) break;
    t += 50;
    try { fn(t); } catch (e) {
      item('第 ' + i + ' 帧渲染抛错：' + e.message, false, e.stack.split('\n')[1]);
      return false;
    }
  }
  return true;
}
G.start();
item('开局后能连续渲染 20 帧', frames(20));
item('渲染确实产生了绘制调用', ctxCalls > 0, ctxCalls + ' 次');

/* ------------------------------------------------ 布局（与 computeLayout 同式） */
function layoutOf() {
  var W = 360, H = 640, rows = C.ROWS + 2;
  var cell = Math.max(14, Math.min(Math.floor(H / rows), Math.floor(W / (C.COLS + 2))));
  return { cell: cell, ox: (W - cell * C.COLS) / 2, oy: (H - cell * rows) / 2 };
}
/* 屏幕格（视口行列）→ 像素中心。故意**不复用** cellRect，避免"用被测函数算期望值" */
function viewCenter(vrow, vcol) {
  var L = layoutOf();
  return { x: L.ox + (vcol - 1) * L.cell + L.cell / 2, y: L.oy + vrow * L.cell + L.cell / 2 };
}
function tap(px, py) {
  var cv = document.getElementById('cv');
  if (cv._h && cv._h.pointerdown) cv._h.pointerdown({ clientX: px, clientY: py });
}
function state() { return G.state; }
function at(row, col) { var g = state().grid; return g[row] && g[row][col]; }

/* ------------------------------------------------ 二、默认（蓝方）视角：不翻 */
console.log('\n=== 二、默认视角（FLIP=false）行为不变 ===');
item('默认 FLIP=false', G.view.isFlip() === false);

/* 选中炮塔卡片 → 点屏幕格 (10,1) */
function selectCannon() {
  document.getElementById('bcards').children.forEach(function (c) {
    if (c.dataset && c.dataset.key === 'cannon' && c.onclick) c.onclick();
  });
}
var p10_1 = viewCenter(10, 1);          // 不翻时视口行 == 逻辑行
selectCannon();
tap(p10_1.x, p10_1.y);
item('不翻时点屏幕 (10,1) → 建筑落在逻辑 (10,1)', !!at(10, 1),
  at(10, 1) ? at(10, 1).def.key : ' 没建起来');

/* ------------------------------------------------ 三、翻到红方视角 */
console.log('\n=== 三、翻到红方视角 ===');
var bgBefore = G.bgStats().builds;
G.view.setFlip(true);
item('setFlip(true) 后 FLIP=true', G.view.isFlip() === true);
item('翻视角会作废背景板（阵营色调/通道标签要重画）', G.bgStats().key === '', G.bgStats().key);
item('红方视角连续渲染 20 帧不抛错', frames(20));
item('背景板已按新视角重建', G.bgStats().builds > bgBefore, bgBefore + ' → ' + G.bgStats().builds);

/* 核心断言：屏幕 (1,10) 必须对应逻辑 (10,1) —— 这是 180° 旋转 */
var hit = G.view.pick(viewCenter(1, 10).x, viewCenter(1, 10).y);
item('屏幕格 (1,10) → 逻辑格 (10,1)（180° 旋转）',
  hit && hit.row === 10 && hit.col === 1, hit && ('r' + hit.row + 'c' + hit.col));
var hit2 = G.view.pick(viewCenter(11, 1).x, viewCenter(11, 1).y);
item('屏幕格 (11,1) → 逻辑格 (0,10)（通道行也跟着翻）',
  hit2 && hit2.row === 0 && hit2.col === 10, hit2 && ('r' + hit2.row + 'c' + hit2.col));
/* 中心对称点必须自映射（11 行 → 行 5/6 交界处不成格，改用列验证） */
item('列方向：屏幕列 5、6 与逻辑列 6、5 互换',
  G.view.pick(viewCenter(1, 5).x, viewCenter(1, 5).y).col === 6 &&
  G.view.pick(viewCenter(1, 6).x, viewCenter(1, 6).y).col === 5);

/* 多格建筑：2×2 的大本营在镜像后左上角会变成右下角。
 * 不取四角 min 的话，红方视角下整块会向右下错一格、压到最底那条通道行上。 */
var baseBox = G.view.cellRect(1, 5, 2, 2);
var baseCen = viewCenter(9, 5);
item('红方视角下 2×2 大本营（逻辑 1,5）左上角落在屏幕 (9,5)',
  Math.abs((baseBox.x + baseBox.s / 2) - baseCen.x) < 1 &&
  Math.abs((baseBox.y + baseBox.s / 2) - baseCen.y) < 1,
  '矩形中心=(' + (baseBox.x + baseBox.s / 2).toFixed(1) + ',' + (baseBox.y + baseBox.s / 2).toFixed(1) +
  ') 期望=(' + baseCen.x.toFixed(1) + ',' + baseCen.y.toFixed(1) + ')');
var oppBox = G.view.cellRect(9, 5, 2, 2);
var oppCen = viewCenter(1, 5);
item('红方视角下对手 2×2 大本营（逻辑 9,5）左上角落在屏幕 (1,5)',
  Math.abs((oppBox.x + oppBox.s / 2) - oppCen.x) < 1 &&
  Math.abs((oppBox.y + oppBox.s / 2) - oppCen.y) < 1);

/* 端到端：在红方视角下点屏幕 (1,10)，应该命中刚才建在 (10,1) 的那座炮塔（弹详情卡） */
tap(viewCenter(1, 10).x, viewCenter(1, 10).y);
var detail = document.getElementById('detail');
item('红方视角下点屏幕 (1,10) 能选中建在逻辑 (10,1) 的炮塔（点击不错位）',
  detail.classList.contains('show') && detail.innerHTML.indexOf('炮塔') >= 0,
  detail.classList.contains('show') ? '详情卡内容里没有炮塔' : '详情卡没弹出');

/* ------------------------------------------------ 四、翻回来后互逆 */
console.log('\n=== 四、翻回默认视角，映射回到恒等 ===');
G.view.setFlip(false);
item('setFlip(false) 后 FLIP=false', G.view.isFlip() === false);
var back = G.view.pick(viewCenter(10, 1).x, viewCenter(10, 1).y);
item('翻回来后屏幕 (10,1) 仍 → 逻辑 (10,1)', back.row === 10 && back.col === 1,
  'r' + back.row + 'c' + back.col);
item('回默认视角后连续渲染 20 帧不抛错', frames(20));

/* CELL 坐标必须始终落在棋盘内（点边角不能越界） */
(function () {
  var bad = [];
  [0, 11].forEach(function (vr) {
    [1, 10].forEach(function (vc) {
      var p = viewCenter(vr, vc);
      var h = G.view.pick(p.x, p.y);
      if (!h || h.row < 0 || h.row > C.ROWS + 1 || h.col < 1 || h.col > C.COLS) bad.push(vr + ',' + vc);
    });
  });
  item('四角点击都落在棋盘内（不越界）', bad.length === 0, bad.join(' '));
})();

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
