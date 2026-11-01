/* ============================================================================
 * 闯关模式实拍
 *   运行： node dev/_shot_stage.js
 *   产出： dev/_shots/stage/*.png
 * ========================================================================== */
'use strict';
var fs = require('fs');
var path = require('path');
var { execFileSync } = require('child_process');

var root = path.join(__dirname, '..');
var CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
var OUTDIR = path.join(__dirname, '_shots', 'stage');
fs.mkdirSync(OUTDIR, { recursive: true });

var FLAGS = [
  '--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--hide-scrollbars',
  '--virtual-time-budget=25000'
];

/* ?end=win,150 → 直接把这局判成"150 秒时获胜"，用来截结算界面的星级。
 * 真打一局要等到分出胜负，截图等不起。 */
var probe = (function () {
  function boot() {
    /* 关掉动画：结算卡片是淡入的，virtual-time 与 CSS animation 常常对不上，
     * 截出来会是半透明的暗场（看不到卡片内容）。 */
    var st = document.createElement('style');
    st.textContent = '#over *, #over *::before, #over *::after, #start * {' +
      'animation: none !important; transition: none !important; }';
    document.head.appendChild(st);

    var m = (location.search.match(/[?&]end=(\w+),(\d+)/) || []);
    if (!m.length) return;
    var g = window.__game;
    if (!g || !g.state) return setTimeout(boot, 80);
    g.state.time = +m[2] || 150;
    g.state.winner = m[1] === 'lose' ? 'red' : 'blue';
    g.state.over = true;
  }
  setTimeout(boot, 900);
}).toString().replace(/^function\s*\(\)\s*\{|\}$/g, '');

var shots = [
  ['01_start_tabs', '', '开始界面 · 三个模式 tab（闯关带星数角标）'],
  ['02_panel_locked', '#stage', '关卡面板 · 全新存档（只有第 1 关可点）'],
  ['03_panel_progress', '#stage=seed', '关卡面板 · 前 4 关已通关（解锁第 5 关）'],
  ['04_in_stage', '#stage=go,5', '闯关第 5 关 · 对局中'],
  ['05_settle_fast', '?end=win,150#stage=go,3', '结算 · 第 3 关 150 秒速胜（3 星）'],
  ['06_settle_slow', '?end=win,700#stage=go,3', '结算 · 第 3 关超时获胜（2 星）']
];

var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var tmp = path.join(root, '_shot_stage.html');
fs.writeFileSync(tmp, html.replace('</body>', '<script>(function(){' + probe + '})();</script></body>'), 'utf8');
var base = 'file:///' + tmp.replace(/\\/g, '/');

var ok = 0, fail = [];
shots.forEach(function (sh) {
  var out = path.join(OUTDIR, sh[0] + '.png');
  try {
    execFileSync(CHROME, FLAGS.concat(['--window-size=1440,900', '--screenshot=' + out, base + sh[1]]), {
      encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], timeout: 180000
    });
    console.log('✅ ' + sh[0] + '.png  ' + Math.round(fs.statSync(out).size / 1024) + ' KB  —— ' + sh[2]);
    ok++;
  } catch (e) {
    console.log('❌ ' + sh[0] + '：' + e.message.split('\n')[0]);
    fail.push(sh[0]);
  }
});
try { fs.unlinkSync(tmp); } catch (e) {}
console.log('\n产出 ' + ok + ' / ' + shots.length + ' 张 → ' + path.relative(root, OUTDIR));
if (fail.length) process.exit(1);
