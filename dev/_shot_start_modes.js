/* ============================================================================
 * 开始界面「模式切换」实拍（改成竖排后确认不挤、不顶到标题）
 *   运行： node dev/_shot_start_modes.js
 *   产出： dev/_shots/startmode/*.png
 * 注：headless Chrome 内宽下限约 500–512px，窄屏一律用 512 拍
 *     （传 390 会按 512 排版再裁右边缘，看起来像元素溢出）。
 * ========================================================================== */
'use strict';
var fs = require('fs');
var path = require('path');
var { execFileSync } = require('child_process');

var root = path.join(__dirname, '..');
var CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
var OUTDIR = path.join(__dirname, '_shots', 'startmode');
fs.mkdirSync(OUTDIR, { recursive: true });

var FLAGS = [
  '--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--hide-scrollbars',
  '--virtual-time-budget=25000'
];

/* 关动画：淡入没跑完时截出来是半透明暗场 */
var probe = (function () {
  function boot() {
    var st = document.createElement('style');
    st.textContent = '#start *, #start *::before, #start *::after {' +
      'animation: none !important; transition: none !important; }';
    document.head.appendChild(st);

    var m = location.search.match(/[?&]mode=(\w+)/);
    if (m) {
      var btn = document.getElementById('mode' + m[1]);
      if (btn) btn.click();
    }
  }
  setTimeout(boot, 900);
}).toString().replace(/^function\s*\(\)\s*\{|\}$/g, '');

var shots = [
  ['01_desktop_1440x900', '1440,900', '', '桌面 · 三个模式竖排（单机 / 双人 / 闯关）'],
  ['02_laptop_1280x720', '1280,720', '', '笔记本矮屏 · 竖排后 dock 上移是否顶到标题'],
  ['03_narrow_512x900', '512,900', '', '窄屏 · 胶囊统一宽度是否还在屏内'],
  ['04_pvp_1440x900', '1440,900', '?mode=pvp', '切到双人模式（竖排下的选中态 + 房间面板）']
];

var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var tmp = path.join(root, '_shot_startmodes.html');
fs.writeFileSync(tmp, html.replace('</body>', '<script>(function(){' + probe + '})();</script></body>'), 'utf8');
var base = 'file:///' + tmp.replace(/\\/g, '/');

var ok = 0, fail = [];
shots.forEach(function (sh) {
  var out = path.join(OUTDIR, sh[0] + '.png');
  try {
    execFileSync(CHROME, FLAGS.concat(['--window-size=' + sh[1], '--screenshot=' + out, base + sh[2]]), {
      encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], timeout: 180000
    });
    console.log('✅ ' + sh[0] + '.png  ' + Math.round(fs.statSync(out).size / 1024) + ' KB  —— ' + sh[3]);
    ok++;
  } catch (e) {
    console.log('❌ ' + sh[0] + '：' + e.message.split('\n')[0]);
    fail.push(sh[0]);
  }
});
try { fs.unlinkSync(tmp); } catch (e) {}
console.log('\n产出 ' + ok + ' / ' + shots.length + ' 张 → ' + path.relative(root, OUTDIR));
if (fail.length) process.exit(1);
