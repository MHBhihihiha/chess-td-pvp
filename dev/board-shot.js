'use strict';
/* ============================================================================
 * 棋盘实拍图（给美术/主理人肉眼判「草地像不像草」用）
 *   运行： node dev/board-shot.js [--w=560] [--h=1000]
 *   产出： dev/_gen/board_after.png（棋盘裁切图，dpr=2）+ 一行实测参数
 *
 * 为什么不是 dev/shot.html 那套：那是老截图工具，页面放在 dev/ 下，art/v9/ 与
 * src/ 全是相对路径会 404（贴图全丢）。这里临时页放项目根，跑完即删。
 *
 * 为什么要跑两次 Chrome：--dump-dom 与 --screenshot 是两个互斥的输出模式。
 *   第一次拿布局矩形（cell / ox / oy / board-wrap 视口坐标），第二次截图，再用
 *   Python(PIL) 按矩形裁。两次窗口尺寸/缩放完全一致，布局是确定的，裁切不会错位。
 *
 * 为什么要摆局面再截：新开的局一盘空草地，看不出「草叶 vs 兵种图标」的清晰度。
 * 这里按 make-shot.js 的思路推 20 秒出头，让格子被建筑和兵占住，才是真实观感。
 * ========================================================================== */
var fs = require('fs');
var path = require('path');
var { execFileSync } = require('child_process');

var root = path.join(__dirname, '..');
function arg(name, dflt) {
  var hit = process.argv.filter(function (a) { return a.indexOf('--' + name + '=') === 0; })[0];
  return hit ? hit.split('=')[1] : dflt;
}
var WIN_W = +arg('w', 560), WIN_H = +arg('h', 1000), DPR = 2;
var SRC = arg('src', 'index.html');                    // 允许对副本做 A/B（不污染 index.html）
var OUT = arg('out', 'dev/_gen/board_after.png');

var CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].filter(function (p) { return p && fs.existsSync(p); })[0];

/* 注入体：进局 → 摆局面 → 等草地贴图 → 渲染 → 把布局写进 title + data-shot */
var probe = String(function () {
  function boot() {
    var g = window.__game, C = window.GameCore;
    if (!g || !C) return setTimeout(boot, 30);
    g.start();
    var s = g.state;
    /* 摆一个「双方都有东西」的中盘：塔/矿/兵营 + 若干兵，避免截出一片空草 */
    s.res.blue = 900;
    C.placeBuilding(s, 'blue', 'tower', 8, 3);
    C.placeBuilding(s, 'blue', 'mine', 9, 7);
    C.placeBuilding(s, 'blue', 'barracks', 9, 2);
    s.res.red = 900;
    C.placeBuilding(s, 'red', 'tower', 3, 4);
    C.placeBuilding(s, 'red', 'mine', 2, 8);
    C.placeBuilding(s, 'red', 'barracks', 1, 3);
    for (var i = 0; i < 20 * 22; i++) {
      C.update(s, C.DT);
      C.aiUpdate(s, 'red', C.DT);
      C.aiUpdate(s, 'blue', C.DT);
    }
    ['infantry', 'infantry', 'siege', 'scout'].forEach(function (k, idx) {
      s.res.blue = 500;
      s.reserve.blue[k] = (s.reserve.blue[k] || 0) + 1;
      C.deployUnit(s, 'blue', k, 3 + idx * 2);
    });
    for (var j = 0; j < 20 * 5; j++) { C.update(s, C.DT); C.aiUpdate(s, 'red', C.DT); }
    /* 选区留空：要看清格子，不要半透明放置预览盖住草地 */
    g.select(null);
    var tries = 0;
    (function waitTex() {                       // 草地贴图是异步 <img>，必须等它到位再定稿
      if (g.syncGrassTexture && g.syncGrassTexture()) return setTimeout(finish, 80);
      if (tries++ < 120) return setTimeout(waitTex, 50);
      finish();
    })();
  }
  function finish() {
    var g = window.__game;
    g.render();
    var st = g.bgStats();
    var p = String(st.key).split(',');
    var dpr = parseFloat(p[5]) || 1, s = parseFloat(p[2]), ox = parseFloat(p[3]), oy = parseFloat(p[4]);
    var r = document.getElementById('board-wrap').getBoundingClientRect();
    var M = {
      cell: s, ox: ox, oy: oy, dpr: dpr, wrapL: r.left, wrapT: r.top,
      builds: st.builds, ms: st.ms, texPending: st.texPending,
      units: g.state.units.length, buildings: g.state.buildings.length
    };
    document.body.setAttribute('data-shot', JSON.stringify(M));
    document.title = 'SHOT ' + JSON.stringify(M);
  }
  setTimeout(boot, 60);
}.toString().replace(/^function\s*\(\)\s*\{|\}$/g, ''));

var html = fs.readFileSync(path.join(root, SRC), 'utf8');
var tmp = path.join(root, '_board_shot.html');
fs.writeFileSync(tmp, html.replace('</body>', '<script>(function(){' + probe + '})();</script></body>'), 'utf8');
var url = 'file:///' + tmp.replace(/\\/g, '/');
var FLAGS = [
  '--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--hide-scrollbars',
  '--window-size=' + WIN_W + ',' + WIN_H, '--force-device-scale-factor=' + DPR,
  '--virtual-time-budget=25000'
];

var M = null, execErr = null;
try {
  if (!CHROME) throw new Error('找不到 Chrome/Edge');
  /* ① 布局矩形 */
  var dom = execFileSync(CHROME, FLAGS.concat(['--dump-dom', url]), {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], timeout: 180000
  });
  var m = dom.match(/data-shot="([^"]*)"/);
  if (!m) throw new Error('页面没跑到 finish()（贴图/逻辑未就绪）');
  M = JSON.parse(m[1].replace(/&quot;/g, '"'));

  /* ② 截图（同一窗口尺寸，布局可复现） */
  var full = path.join(__dirname, '_gen', '_board_full.png');
  execFileSync(CHROME, FLAGS.concat(['--screenshot=' + full, url]), {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], timeout: 180000
  });
  M.full = full;
} catch (e) {
  execErr = e.message.split('\n')[0];
} finally {
  try { fs.unlinkSync(tmp); } catch (e) {}      // 临时页不留仓库
}

if (!M) { console.log('❌ 截图失败：' + (execErr || '未知')); process.exit(1); }

/* ③ 裁切：棋盘含两条通道行 = 12 行 × 10 列 */
var cropX = Math.round((M.wrapL + M.ox) * M.dpr);
var cropY = Math.round((M.wrapT + M.oy) * M.dpr);
var cropW = Math.round(10 * M.cell * M.dpr);
var cropH = Math.round(12 * M.cell * M.dpr);
var out = path.join(root, OUT);
var py = [
  'from PIL import Image',
  'im = Image.open(r"' + M.full + '")',
  'im = im.convert("RGB")',
  'box = (' + cropX + ',' + cropY + ',' + (cropX + cropW) + ',' + (cropY + cropH) + ')',
  'im.crop(box).save(r"' + out + '")',
  'print("crop", box, "->", im.crop(box).size)'
].join('\n');
try {
  execFileSync('py', ['-c', py], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  try { execFileSync('python', ['-c', py], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e2) { console.log('❌ 裁切失败（PIL？）：' + e2.message.split('\n')[0]); process.exit(1); }
}

console.log('=== 棋盘实拍 ===');
console.log('  窗口 ' + WIN_W + 'x' + WIN_H + ' @dpr' + DPR + '   cell=' + M.cell + '  dpr=' + M.dpr);
console.log('  贴图 texPending=' + M.texPending + '  builds=' + M.builds + '  buildBackground=' + M.ms.toFixed(1) + 'ms');
console.log('  场上：' + M.units + ' 个单位 / ' + M.buildings + ' 座建筑');
console.log('  输出：' + OUT + '  (' + cropW + 'x' + cropH + ' px)');
