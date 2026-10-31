'use strict';
/* 用一个极简的 DOM 桩来真实执行 index.html 里的渲染脚本，确认没有运行时错误 */
var fs = require('fs');
var path = require('path');

var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var src = html.match(/<script>([\s\S]*?)<\/script>/)[1];

/* ---- 极简 DOM 桩 ---- */
var BY_ID = {};   // innerHTML 里出现过的 id → 桩元素（让 querySelector('#x') / getElementById 能拿到）
function elWithId(id) {
  if (!BY_ID[id]) {
    var e = makeEl(id);
    BY_ID[id] = e;
  }
  return BY_ID[id];
}
function makeEl(id) {
  var el = {
    id: id, children: [], _inner: '', textContent: '', className: '',
    // style.setProperty：难度卡用 CSS 自定义属性 --tier 传档位 accent 色（规格 §4.4）
    style: { setProperty: function (k, v) { this[k] = v; } },
    dataset: {}, clientWidth: 360, clientHeight: 640, width: 360, height: 640,
    classList: {
      _s: {},
      add: function (c) { this._s[c] = true; },
      remove: function (c) { delete this._s[c]; },
      toggle: function (c, on) { if (on) this._s[c] = true; else delete this._s[c]; },
      contains: function (c) { return !!this._s[c]; }
    },
    appendChild: function (c) { this.children.push(c); return c; },
    querySelector: function (sel) {
      if (typeof sel === 'string' && sel.charAt(0) === '#') return BY_ID[sel.slice(1)] || null;
      return null;
    },
    querySelectorAll: function () { return []; },
    addEventListener: function (ev, fn) { (this._h = this._h || {})[ev] = fn; },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; },
    getContext: function () { return ctx; },
    onclick: null,
    // setAttribute：难度卡 role=radio / aria-checked（规格 §4.5 可访问性）
    setAttribute: function (k, v) { (this._attrs = this._attrs || {})[k] = String(v); }
  };
  // innerHTML 赋值时把里面的 id 登记起来，模拟浏览器解析
  Object.defineProperty(el, 'innerHTML', {
    get: function () { return this._inner; },
    set: function (v) {
      this._inner = String(v == null ? '' : v);
      this.children = [];      // 真实浏览器里重设 innerHTML 会清空子节点
      var re = /id="([A-Za-z0-9_-]+)"/g, m;
      while ((m = re.exec(this._inner))) { elWithId(m[1]); }
    }
  });
  return el;
}
var ctxCalls = 0;
var rotLog = [];              // 记录每次 ctx.rotate 的角度，用来验证「定子不转」
var ctx = new Proxy({}, {
  get: function (t, k) {
    if (k === 'canvas') return null;
    if (k === 'rotate') return function (a) { ctxCalls++; rotLog.push(a); };
    // 渐变对象要能被 .addColorStop 调用，否则 drawProjectiles 里的 orb / ball 会炸
    if (k === 'createRadialGradient' || k === 'createLinearGradient') {
      return function () { ctxCalls++; return { addColorStop: function () {} }; };
    }
    return function () { ctxCalls++; };
  },
  set: function () { return true; }
});

var els = {};
['cv', 'gold', 'rate', 'enemyinfo', 'hint', 'over', 'overtext', 'bcards', 'ucards', 'btnpath', 'btnrestart', 'again', 'detail', 'board-wrap', 'autodeploy', 'sudden']
  .forEach(function (id) { els[id] = makeEl(id); });
els['autodeploy'].checked = false;         // 默认手动派兵
els['sudden'].checked = true;              // 默认开决胜时刻
els['detailclose'] = makeEl('detailclose');
els['detailup'] = makeEl('detailup');

var rafQueue = [];
var document = {
  getElementById: function (id) {
    // innerHTML 里登记过的元素优先（保证和 querySelector('#x') 是同一个对象）
    if (BY_ID[id]) { els[id] = BY_ID[id]; return BY_ID[id]; }
    if (!els[id]) els[id] = makeEl(id);
    return els[id];
  },
  createElement: function (tag) { return makeEl(tag); },
  addEventListener: function () {}
};
var window = { devicePixelRatio: 1, addEventListener: function () {} };

var C = require('../src/logic.js');
window.GameCore = C;   // 与 index.html 里 <script src> 的行为一致
var errors = [];
function step(ms) {
  var fn = rafQueue.shift();
  if (!fn) return;
  try { fn(ms); } catch (e) { errors.push(e); console.log('   [帧内异常] ' + e.message); }
}

// 真实执行脚本
try {
  new Function('window', 'document', 'requestAnimationFrame', 'GameCore', src)(
    window, document, function (fn) { rafQueue.push(fn); }, C
  );
} catch (e) {
  console.log('❌ 脚本初始化抛错: ' + e.message + '\n' + e.stack.split('\n').slice(0, 3).join('\n'));
  process.exit(1);
}
console.log('✅ 初始化成功；建筑卡片数 =', els.bcards.children.length, ' 兵种卡片数 =', els.ucards.children.length);

// 点「开始游戏」（等价于玩家点开局界面的按钮），之后模拟才会推进
if (window.__game && window.__game.start) window.__game.start();
console.log(window.__game && window.__game.start ? '✅ 开局界面：有「开始游戏」入口，点后开始模拟' : '❌ 缺少开始界面');

// 跑 60 帧（含 AI 与渲染）
var t = 0;
for (var i = 0; i < 60; i++) { t += 50; step(t); }
if (errors.length) {
  console.log('❌ 渲染循环抛错: ' + errors[0].message);
  console.log(errors[0].stack.split('\n').slice(0, 4).join('\n'));
  process.exit(1);
}
console.log('✅ 连续 60 帧渲染 + AI 无异常（canvas 调用 ' + ctxCalls + ' 次）');

// 模拟点击：先造一座塔，再点它 → 应该弹出详情卡（含攻击力）→ 再点升级
var canvasEl = els['cv'];
var tap = canvasEl._h && canvasEl._h['pointerdown'];
if (!tap) { console.log('❌ 画布没有绑定点击事件'); process.exit(1); }
console.log('✅ 画布已绑定点击事件');

function tapAt(px, py) { tap({ clientX: px, clientY: py }); }
function layoutOf() {
  var wrap = els['board-wrap'];
  var W = wrap.clientWidth, H = wrap.clientHeight;
  var rows = C.ROWS + 2;
  var cell = Math.max(14, Math.min(Math.floor(H / rows), Math.floor(W / (C.COLS + 2))));
  return { cell: cell, ox: (W - cell * C.COLS) / 2, oy: (H - cell * rows) / 2 };
}
function centerOf(row, col) {
  var L = layoutOf();
  return { x: L.ox + (col - 0.5) * L.cell, y: L.oy + (row + 0.5) * L.cell };
}

// 选中「炮塔」卡片 → 点自己半场 (10,1) 放置
els['bcards'].children.forEach(function (c) { if (c.dataset && c.dataset.key === 'cannon') c.onclick(); });
var p = centerOf(10, 1);
tapAt(p.x, p.y);
var built = null;
for (var bi = 0; bi < els['bcards'].children.length; bi++) { /* 占位 */ }
var stateRef = null;
// 通过金币变化与画布状态确认：直接点刚放下的塔
tapAt(p.x, p.y);
var detailHtml = els['detail'].innerHTML;
console.log(detailHtml.indexOf('炮塔') >= 0 ? '✅ 点击建筑弹出详情卡（含名称）' : '❌ 详情卡没有弹出');
console.log(detailHtml.indexOf('攻击力') >= 0 ? '✅ 详情卡显示攻击力' : '❌ 详情卡缺少攻击力');
console.log(/升级到 Lv2/.test(detailHtml) ? '✅ 详情卡显示升级按钮与费用' : '❌ 升级按钮文本不对: ' + (detailHtml.match(/升级到[^<]*/) || ['无'])[0]);
console.log(detailHtml.indexOf('血量') >= 0 ? '✅ 详情卡显示血量' : '❌ 详情卡缺少血量');

// 点升级按钮
if (els['detailup'] && els['detailup'].onclick) {
  els['detailup'].onclick();
  var h2 = els['detail'].innerHTML;
  console.log(/Lv2\/10/.test(h2) ? '✅ 升级成功，等级变为 Lv2' : '❌ 升级后等级没变：' + (h2.match(/Lv\d\/\d/) || ['?'])[0]);
  console.log(/攻击力<\/td><td class="v">15\.4/.test(h2) ? '✅ 升级后攻击力提升' : '⚠️ 升级后攻击力显示：' + (h2.match(/攻击力<\/td><td class="v">[^<]*/) || ['?'])[0]);
} else {
  console.log('❌ 升级按钮没有绑定点击处理');
}

// 点空格子应该关闭详情卡
var empty = centerOf(6, 1);
tapAt(empty.x, empty.y);
console.log(!els['detail'].classList.contains('show') ? '✅ 点空格子会关闭详情卡' : '⚠️ 点空格子详情卡仍开着');

/* ---- 选中建筑卡片时，棋盘上应该出现「可放置」高亮（检查不抛错且真的画了格子） ---- */
var before = ctxCalls;
els['bcards'].children.forEach(function (c) { if (c.dataset && c.dataset.key === 'mine') c.onclick(); });
step(t += 50);
console.log(ctxCalls > before ? '✅ 选中卡片后棋盘会画出可放置高亮' : '⚠️ 选中卡片后没有额外绘制');
/* ---- 选中兵种卡片时，应高亮可派兵的通道列 ---- */
before = ctxCalls;
els['ucards'].children.forEach(function (c) { if (c.dataset && c.dataset.key === 'infantry') c.onclick(); });
step(t += 50);
console.log(ctxCalls > before ? '✅ 选中兵种后通道行会画出可派兵高亮' : '⚠️ 选中兵种后没有额外绘制');

/* ---- 打开自动派兵后，待命区的兵应该会被自动派出去 ---- */
var deployCalls = 0;
var origDeploy = C.deployUnit;
C.deployUnit = function () { var r = origDeploy.apply(null, arguments); if (r && r.ok) deployCalls++; return r; };
els['autodeploy'].checked = true;
var t2 = t;
for (var ai2 = 0; ai2 < 200; ai2++) { t2 += 50; step(t2); }
C.deployUnit = origDeploy;
console.log(deployCalls > 0 ? ('✅ 自动派兵真的派出去了（' + deployCalls + ' 次）') : '❌ 打开自动派兵后一次都没派出去');
// 悬停预览：选中建筑/法术后，鼠标移动应该额外画范围
var beforeHover = ctxCalls;
window.__game.select({ kind: 'building', key: 'cannon' });
var cv = els['cv'];
if (cv._h && cv._h.pointermove) {
  cv._h.pointermove({ clientX: 120, clientY: 240 });
  cv._h.pointermove({ clientX: 150, clientY: 260 });
}
console.log(ctxCalls > beforeHover ? '✅ 鼠标悬停时画出了建筑作用范围预览' : '❌ 悬停时没有额外绘制');
var beforeSpell = ctxCalls;
window.__game.select({ kind: 'spell', key: 'arrowRain' });
var _s = window.__game.state;
if (cv._h && cv._h.pointermove) cv._h.pointermove({ clientX: 170, clientY: 280 });
console.log(ctxCalls > beforeSpell ? '✅ 选中法术后鼠标悬停画出了法术范围' : '❌ 法术悬停没有绘制');

// 拆除 / 取消选中 / 总体升级 / 单位详情
var s9 = window.__game.state;
s9.res.blue = 100000;
var pb = C.placeBuilding(s9, 'blue', 'cannon', 9, 3);
window.__game.inspect(pb.building);
var dmHtml = els['detail'].innerHTML || '';
console.log(dmHtml.indexOf('detaildemolish') >= 0 || dmHtml.indexOf('拆除') >= 0 ? '✅ 建筑详情卡里有「拆除」按钮' : '❌ 详情卡没有拆除按钮');
// 注意：主循环每 0.3 秒会刷新详情卡，所以要在 inspect 之后【立刻】拿按钮点它
window.__game.inspect(pb.building);
var dmBtn = els['detail'].querySelector('#detaildemolish');
var goldBefore = s9.res.blue;
if (dmBtn && dmBtn.onclick) dmBtn.onclick();
else console.log('   [提示] 按钮没有绑定点击处理');
console.log(s9.buildings.indexOf(pb.building) < 0 ? '✅ 点拆除后建筑被移除' : '❌ 拆除没生效');
console.log(s9.res.blue > goldBefore ? '✅ 拆除返还了金币（+' + (s9.res.blue - goldBefore) + '）' : '❌ 拆除没返还金币');
var gstat = typeof C.globalUpgradeStatus === 'function' ? C.globalUpgradeStatus(s9, 'blue') : [];
console.log(gstat.length === 5 && gstat.some(function (g) { return g.key === 'cdReduce'; })
  ? '✅ 总体升级有 5 项（含 v14 新增的派兵冷却）'
  : '❌ 总体升级数量/构成不对（' + gstat.length + ' 项）');
var gu = C.upgradeGlobal(s9, 'blue', 'uAtk');
console.log(gu.ok && C.globalBonus(s9, 'blue').unitAtk > 1 ? '✅ 总体升级可以购买并生效' : '❌ 总体升级没生效');
console.log(els['diffs'] && els['diffs'].children.length === 3 ? '✅ 开始界面有 3 个难度选项' : '❌ 难度选项数量不对（' + (els['diffs'] ? els['diffs'].children.length : 'null') + '）');
console.log(window.__game.state.aiPreset.red === 'normal' ? '✅ 默认难度是普通' : '❌ 默认难度=' + window.__game.state.aiPreset.red);
console.log('   金币显示 =', els['gold'].textContent, ' 收入显示 =', els['rate'].textContent);

/* ============================ 特斯拉系「定子」：顶部不跟着敌人转 ============================
 * 玩家要求：特斯拉电塔 / 脉冲塔 / 大电塔 的顶部固定在底座正中，只让电弧和电磁波朝敌人。
 * 这里用 canvas.rotate 的调用记录来验证：
 *   · 定子类每帧都以固定的 -90°（竖直朝上）绘制 → 角度完全不随目标变化
 *   · 同时场上的炮塔仍然在转（角度值多样）→ 说明不是"整个渲染都停了"
 */
var sStator = window.__game.state;
sStator.res.blue = 1000000;
var tsTower = C.placeBuilding(sStator, 'blue', 'tesla', 8, 5).building;
var cnTower = C.placeBuilding(sStator, 'blue', 'cannon', 6, 2).building;
function dummyAt(row, col) {
  var u = C.spawnUnit(sStator, 'red', 'infantry', row, col);
  if (u) { u.def = Object.assign({}, u.def, { speed: 0 }); u.hp = u.hpMax = 1e9; }
  return u;
}
/* 炮塔的转向验证：让目标在射程内（炮塔射程 1 格）换到不同方位，
 * 炮塔应该跟着扫出多个角度（右下 +45° / 右上 -45° / 右 0° / 上 -90°）。
 * （以前角度多样性靠大本营的矢量炮管凑数 —— 大本营改贴图装置后不再画炮管，
 *  这里改成真正驱动炮塔追踪换位目标，测的是它本来该有的行为。） */
var spots = [[7, 3], [5, 3], [6, 3], [5, 2]];
var dummy = null;
rotLog.length = 0;
for (var b = 0; b < spots.length; b++) {
  if (dummy) dummy.hp = -1;            // 移走旧目标，让炮塔换锁定
  dummy = dummyAt(spots[b][0], spots[b][1]);
  for (var f = 0; f < 15; f++) { C.update(sStator, C.DT); window.__game.render(); }
}
var statorFrames = rotLog.filter(function (a) { return Math.abs(a + Math.PI / 2) < 1e-9; }).length;
var distinctAng = new Set(rotLog.map(function (a) { return a.toFixed(4); })).size;
console.log(statorFrames >= 55
  ? '✅ 特斯拉系顶部固定竖直（' + statorFrames + ' 帧角度恒定 -90°）'
  : '❌ 特斯拉系顶部还在转（只有 ' + statorFrames + ' 帧是 -90°）');
console.log(distinctAng >= 4
  ? '✅ 普通炮塔仍在转向（出现 ' + distinctAng + ' 种不同角度）'
  : '❌ 炮塔也不转了，转向逻辑被误伤（只有 ' + distinctAng + ' 种角度）');
console.log(tsTower && cnTower ? '✅ 定子塔与炮塔同时存在于场上' : '❌ 测试建筑没放下');

/* ---------- 定子名单：法师三兄弟也要固定（玩家第二轮反馈） ---------- */
var g2 = window.__game;
console.log(g2.isStator && g2.isStator('mage')
  ? '✅ 法师塔 / 白魔法塔 / 黑魔法塔 的顶部也固定不转'
  : '❌ 法师塔还在跟着敌人转头');
console.log(g2.isStator && g2.isStator('tesla')
  ? '✅ 特斯拉电塔 / 脉冲塔 / 大电塔 的顶部固定不转'
  : '❌ 特斯拉系没在定子名单里');
console.log(g2.isStator && !g2.isStator('cannon') && !g2.isStator('arrow') && !g2.isStator('mortar')
  ? '✅ 炮塔 / 箭塔 / 迫击炮塔 仍然按瞄准角旋转（没被误归为定子）'
  : '❌ 有会转的塔被误归为定子');

/* ================= 贴图接线验证 =================
 * 风险：命名写错时不会报错，只会**静默退回矢量** —— 表面看游戏正常，实际贴图全没生效。
 * 所以这里把「所有建筑 × 所有等级 × 所有分支」的命名全部解析一遍，逐个比对磁盘。
 */
var artDir = path.join(__dirname, '..', 'art', 'v9');
var disk = new Set(fs.readdirSync(artDir).filter(function (f) { return /\.png$/i.test(f); }));
var gArt = window.__game;

var branchOf = {};
Object.keys(C.branches).forEach(function (k) {
  var p = C.branches[k].parent;
  (branchOf[p] = branchOf[p] || []).push(k);
});

var missing = [], checked = 0, samples = [];
Object.keys(C.DATA.buildings).forEach(function (key) {
  var def = C.DATA.buildings[key];
  var brs = [null].concat(branchOf[key] || []);
  var maxLv = def.maxLevel || 10;
  for (var lv = 1; lv <= maxLv; lv++) {
    brs.forEach(function (br) {
      if (br && lv < 5) return;                    // 分支在 Lv5 才选
      var fake = { def: def, level: lv, branch: br, team: 'blue' };
      var info = gArt.artFor(fake);
      [info.base, info.top].forEach(function (n) {
        if (!n) return;
        checked++;
        if (!disk.has(n)) missing.push(key + ' Lv' + lv + ' ' + (br || '基础') + ' → ' + n);
      });
      info.deco.forEach(function (n) {
        checked++;
        if (!disk.has(n + '.png')) missing.push(key + ' Lv' + lv + ' 装饰 → ' + n);
      });
      if (lv === 1 || lv === 5 || lv === 10) {
        samples.push(key + ' Lv' + lv + (br ? '/' + br : '') + ' = ' + info.base + (info.top ? ' + ' + info.top : '') +
                     (info.deco.length ? '  [' + info.deco.join(',') + ']' : ''));
      }
    });
  }
});

console.log(missing.length === 0
  ? '✅ 贴图命名全部命中磁盘（' + checked + ' 条引用，0 悬空）'
  : '❌ 有 ' + missing.length + ' 条命名指向不存在的文件：\n   ' + missing.slice(0, 8).join('\n   '));

/* 抽查三条，供人工确认命名规则没跑偏 */
console.log(samples.length ? '· 抽样：' + samples.slice(0, 3).join(' | ') : '· 抽样失败');

/* ================= 兵种朝向状态机 ================= */
var sF = window.__game.state;
sF.res.blue = 999999;
var fu = C.spawnUnit(sF, 'red', 'infantry', 6, 5);
if (fu) {
  fu.stepDir = { r: 1, c: 0 }; fu.moveProg = 0.6; fu.nextStep = { r: 7, c: 5 };
  gArt.render();
  console.log(gArt.facingOf(fu) === 'down' ? '✅ 向下移动 → 判定 down' : '❌ 向下判定错：' + gArt.facingOf(fu));

  fu.stepDir = { r: 0, c: -1 }; fu.moveProg = 0.6; fu.nextStep = { r: 6, c: 4 };
  gArt.render();
  console.log(gArt.facingOf(fu) === 'left' ? '✅ 向左移动 → 判定 left' : '❌ 向左判定错：' + gArt.facingOf(fu));

  /* 转向后停住：朝向必须保持在最后那个方向，不能回退默认 */
  fu.stepDir = null; fu.moveProg = 0; fu.nextStep = null;
  gArt.render();
  console.log(gArt.facingOf(fu) === 'left'
    ? '✅ 停下后仍保持最后朝向（left）'
    : '❌ 停下后朝向被重置：' + gArt.facingOf(fu));

  /* 拐角保护：刚转向、还没走过 15% 时不换姿态（防一格内闪两套） */
  fu.stepDir = { r: 1, c: 0 }; fu.moveProg = 0.05;
  gArt.render();
  console.log(gArt.facingOf(fu) === 'left'
    ? '✅ 刚起步（<15%）不抢姿态，避免拐角闪变'
    : '❌ 拐角保护失效：' + gArt.facingOf(fu));
}

/* ================= 特效贴图引用校验 =================
 * 特效名是写在代码里的字符串，写错同样**不报错、只是不显示**。
 * 这里把 index.html 里所有 'fx_xxx' 字面量抓出来，逐个比对磁盘。
 * 另外 boom 是拼出来的（'fx_boom_' + 帧号），单独补测 4 帧。
 */
var fxUsed = (html.match(/'fx_[a-z0-9_]+'/g) || [])
  .map(function (s) { return s.slice(1, -1); })
  // 以 _ 结尾的是拼前缀用的（'fx_boom_' + 帧号），不是文件名，排除
  .filter(function (n) { return !/_$/.test(n); });
var fxMissing = fxUsed.filter(function (n) { return !disk.has(n + '.png'); });
console.log(fxMissing.length === 0
  ? '✅ 特效贴图引用全部命中磁盘（' + new Set(fxUsed).size + ' 个不同特效）'
  : '❌ 特效贴图缺失：' + fxMissing.join(', '));

var boomOk = [1, 2, 3, 4].every(function (i) { return disk.has('fx_boom_' + i + '.png'); });
console.log(boomOk ? '✅ 爆炸 4 帧齐全（代码里是 ' + "'fx_boom_' + 帧号" + ' 拼出来的）'
                   : '❌ 爆炸帧不齐');

/* ================= 法术图标接线 ================= */
var spMissing = C.DATA.spells.filter(function (sp) {
  return !disk.has('spell_' + sp.key + '.png');
});
console.log(spMissing.length === 0
  ? '✅ 6 个法术图标齐全：' + C.DATA.spells.map(function (s) { return s.key; }).join(' / ')
  : '❌ 缺法术图标：' + spMissing.map(function (s) { return s.key; }).join(', '));

/* 卡片 DOM 里必须真的挂上了 img（否则只是"文件存在但界面没用"） */
var scEl = els['scards'];
var spCards = (scEl && scEl.children) || [];
var withImg = spCards.filter(function (c) {
  return (c._inner || '').indexOf('spell_') >= 0 && (c._inner || '').indexOf('<img') >= 0;
}).length;
console.log(spCards.length > 0 && withImg === spCards.length
  ? '✅ 法术卡全部挂上图标 img（' + withImg + '/' + spCards.length + '）'
  : '❌ 法术卡缺图标：' + withImg + '/' + spCards.length);

/* ================= 兵种姿态帧完整性 =================
 * 规则：**要么六帧齐、要么一张都没有**。
 * 半套（比如只有 back_walk0 没有 back_walk1）会导致走路时一半帧退回正面，
 * 看起来像"走两步转一次身"，比不做还糟。
 */
var POSE_FRAMES = ['front_walk0', 'front_walk1', 'back_walk0', 'back_walk1', 'side_walk0', 'side_walk1'];
var halfPose = [], completePose = [];
Object.keys(C.DATA.units).forEach(function (uk) {
  ['blue', 'red'].forEach(function (team) {
    var prefix = 'unit_' + uk + '_' + team + '_';
    var have = POSE_FRAMES.filter(function (p) { return disk.has(prefix + p + '.png'); });
    if (have.length === 0) return;                       // 还没做，正常
    if (have.length === POSE_FRAMES.length) completePose.push(uk + '/' + team);
    else halfPose.push(uk + '/' + team + '（缺 ' + (POSE_FRAMES.length - have.length) + ' 帧）');
  });
});
console.log(halfPose.length === 0
  ? '✅ 姿态帧成套：' + (completePose.length ? completePose.join(', ') : '（尚无成套姿态）')
  : '❌ 有半套姿态：' + halfPose.join('; '));

/* 已有姿态帧的兵种，转身时必须真的取到对应的图（而不是悄悄退回正面） */
if (completePose.length) {
  var pyKey = completePose[0].split('/')[0], pyTeam = completePose[0].split('/')[1];
  var fake = { id: 900001, key: pyKey, team: pyTeam, def: C.DATA.units[pyKey], moveProg: 0.3, nextStep: null };
  var probe = window.__game.art;
  /* unitFile 不在公开接口里，这里用 artFor 之外的路径：直接查磁盘名是否按姿态存在 */
  var poseOk = ['front', 'back', 'side'].every(function (p) {
    return disk.has('unit_' + pyKey + '_' + pyTeam + '_' + p + '_walk0.png');
  });
  console.log(poseOk ? '✅ 三姿态（front/back/side）都有走路帧' : '❌ 三姿态不全');
}

/* ============================================================================
 * v14/v15：图鉴（两级索引）——列表页与详情页都是纯函数，直接断言字符串
 *   ① 列表页：小图 + 名称 + 精简信息，条数对得上数据表
 *   ② 详情页：左大图（底座+武器两层，按等级选图）+ 右数值 + 等级滑动轨
 *   ③ 水晶塔的数值仍然必须是对的（v14 修过的标错点，别回退）
 * ========================================================================== */
(function () {
  var st = window.__game.state;
  st.res.blue = 999999;
  var G = window.__game;

  /* ---- 第一层：列表 ---- */
  var idxBld = G.codexIndexHtml('bld');
  var nBld = (idxBld.match(/class="cx-i"/g) || []).length;
  console.log(nBld === C.DATA ? '' : '');
  console.log(nBld === 7 ? '✅ 建筑列表 7 条（金矿/炮塔/箭塔/法师塔/迫击炮/电塔/防御塔）'
                        : '❌ 建筑列表条数不对：' + nBld);
  console.log(idxBld.indexOf('金矿') >= 0 && idxBld.indexOf('防御塔') >= 0 && idxBld.indexOf('cx-hintline') >= 0
    ? '✅ 列表条目含名称与精简信息，并带操作提示' : '❌ 列表条目内容缺失');
  var idxUnit = G.codexIndexHtml('unit');
  var nUnit = (idxUnit.match(/class="cx-i"/g) || []).length;
  console.log(nUnit === 8 ? '✅ 兵种列表 8 条' : '❌ 兵种列表条数不对：' + nUnit);
  var idxBase = G.codexIndexHtml('base');
  console.log((idxBase.match(/class="cx-i"/g) || []).length === 1
    ? '✅ 大本营列表只有 1 条（等级交给详情页的滑动轨）' : '❌ 大本营列表条数不对');

  /* ---- 第二层：详情（建筑） ---- */
  var dWard5 = G.codexDetailHtml('bld', 'ward', 5, 'crystal');
  console.log(dWard5.indexOf('>保护范围</td>') >= 0 && dWard5.indexOf('5×5') >= 0
    ? '✅ 详情页右表含「保护范围」行且是 5×5' : '❌ 详情页缺保护范围行或数值不对');
  console.log(/护盾减伤<\/span><span class="v">20%/.test(dWard5)
    ? '✅ 水晶塔 L5 减伤 20%（旧文案写 40%，是错的）' : '❌ 水晶塔减伤不对');
  console.log(dWard5.indexOf('ward_body_e3.png') >= 0 && dWard5.indexOf('ward_crystal_top_e3.png') >= 0
    ? '✅ 大图 = 底座 e3 + 水晶塔武器 e3（和棋盘同比例两层叠）' : '❌ 大图贴图选错');
  console.log(/<input[^>]*type="range"[^>]*min="1"[^>]*max="10"/.test(dWard5)
    ? '✅ 有等级滑动轨（1..10）' : '❌ 缺少等级滑动轨');
  console.log(/data-bp="crystal"/.test(dWard5) && /data-bp="bunker"/.test(dWard5)
    ? '✅ L5 起出现分支切换（水晶塔 / 碉堡塔）' : '❌ 分支切换缺失');

  /* L4：还没到分支，大图只有底座、没有武器层，滑动轨照旧 */
  var dWard4 = G.codexDetailHtml('bld', 'ward', 4, null);
  console.log(dWard4.indexOf('ward_body_e2.png') >= 0 && dWard4.indexOf('_top_e') < 0
    ? '✅ L4 防御塔只画底座（分支武器 L5 才出现）' : '❌ L4 防御塔的图层不对');
  console.log(dWard4.indexOf('data-branchpick hidden') >= 0
    ? '✅ L4 时分支切换是隐藏的' : '❌ L4 不该显示分支切换');

  /* ---- 第二层：详情（大本营 / 兵种） ---- */
  var dBase3 = G.codexDetailHtml('base', 'base', 3);
  console.log(dBase3.indexOf('base_L3.png') >= 0 ? '✅ 大本营 L3 大图 = base_L3.png' : '❌ 大本营大图不对');
  console.log(/<input[^>]*type="range"[^>]*max="6"/.test(dBase3) ? '✅ 大本营滑动轨 1..6' : '❌ 大本营滑动轨范围不对');
  var dUnit = G.codexDetailHtml('unit', 'archer', 1);
  console.log(dUnit.indexOf('unit_archer_blue_idle.png') >= 0 && dUnit.indexOf('data-range') < 0
    ? '✅ 兵种详情：大图 + 无滑动轨（兵种没有单兵等级）' : '❌ 兵种详情结构不对');
})();

/* ============================================================================
 * v18：建筑详情面板 与 图鉴 的「数值行」必须完全一致
 *   背景：这两处原来各写一套 if/else，同一个数值改一边忘一边就会打架
 *   （v14 报的「防御塔升水晶塔界面数值标错」正是这么来的）。
 *   现在两边都从 bldStatRows()/baseStatRows() 取行 —— 这里锁死这条契约：
 *   同一栋楼、同一等级，面板 <td class="k">…</td> 的标签集合
 *   必须等于图鉴 <span class="k">…</span> 的标签集合（图鉴多一个「升级花费」，它属于按钮区）。
 * ========================================================================== */
(function () {
  var st = window.__game.state;
  st.res.blue = 999999;
  var G = window.__game;
  var C2 = require('../src/logic.js');
  var detailEl = document.getElementById('detail');

  function labelsOf(html, re) {
    var out = [], m;
    while ((m = re.exec(html))) out.push(m[1]);
    return out;
  }
  function compare(key, lv, branch, row, col) {
    var placed = C2.placeBuilding(st, 'blue', key, row, col);
    if (!placed.ok) { console.log('❌ [' + key + '] 放置失败：' + placed.why); return; }
    var b = placed.building;
    b.level = lv;
    if (branch) b.branch = branch;
    G.inspect(b);
    var panel = detailEl.innerHTML || '';
    var codex = G.codexDetailHtml('bld', key, lv, branch);
    var pLabels = labelsOf(panel, /<td class="k">([^<]+)<\/td>/g);
    // 图鉴的 cxKV 小卡：<span class="k">标签</span>
    var cLabels = labelsOf(codex, /<span class="k">([^<]+)<\/span>/g)
      .filter(function (x) { return x !== '升级花费'; });
    var same = pLabels.length > 1 && pLabels.join('|') === cLabels.join('|');
    console.log(same
      ? '✅ [' + key + ' Lv' + lv + '] 详情面板与图鉴数值行一致：' + pLabels.join(' / ')
      : '❌ [' + key + ' Lv' + lv + '] 两处数值行不一致\n     面板：' + pLabels.join(' / ') + '\n     图鉴：' + cLabels.join(' / '));
  }
  compare('ward', 5, 'crystal', 6, 3);   // 光环：保护范围 + 护盾减伤
  compare('cannon', 3, null, 7, 4);       // 普通攻击塔
  compare('mine', 4, null, 10, 2);        // 只产金币

  /* 防御塔没有 atk，面板不许给它挂「攻击力 / 攻击方式」 */
  var placedW = C2.placeBuilding(st, 'blue', 'ward', 9, 7);
  if (placedW.ok) {
    placedW.building.level = 2;
    G.inspect(placedW.building);
    var wp = detailEl.innerHTML || '';
    console.log(wp.indexOf('<td class="k">攻击力</td>') < 0 && wp.indexOf('<td class="k">攻击方式</td>') < 0
      ? '✅ 防御塔面板不再出现「攻击力/攻击方式」（它根本不能攻击）'
      : '❌ 防御塔面板仍挂着攻击相关行');
  }
})();

/* v18：选了分支之后，说明文案必须用**分支的**那份
 * （防御塔基础文案写「保护范围 3×3」，水晶塔其实是 5×5 —— 同一屏里自相矛盾）
 * 面板与图鉴两处都要对。 */
(function () {
  var st = window.__game.state;
  st.res.blue = 999999;
  var G = window.__game;
  var C3 = require('../src/logic.js');
  var detailEl = document.getElementById('detail');
  var placed = C3.placeBuilding(st, 'blue', 'ward', 6, 9);
  if (!placed.ok) { console.log('❌ [ward-branch] 放置失败'); return; }
  placed.building.level = 5;
  placed.building.branch = 'crystal';
  G.inspect(placed.building);
  var panel = detailEl.innerHTML || '';
  var codex = G.codexDetailHtml('bld', 'ward', 5, 'crystal');
  var panelOk = panel.indexOf('保护范围扩大到 5×5') >= 0 && panel.indexOf('保护范围 3×3，减伤随等级提升') < 0;
  var codexOk = codex.indexOf('保护范围扩大到 5×5') >= 0;
  console.log(panelOk ? '✅ 面板说明改用分支文案（水晶塔 5×5，不再是基础的 3×3）'
                      : '❌ 面板仍在用基础文案，和数值表打架');
  console.log(codexOk ? '✅ 图鉴说明同样用分支文案' : '❌ 图鉴说明没跟上分支');
})();
