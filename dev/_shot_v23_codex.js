/* ============================================================================
 * v23 实拍：新图鉴（两层结构）
 *   运行： node dev/_shot_v23_codex.js
 *   产出： dev/_shots/v23/*.png
 *
 * 每张图单独起一次无头 Chrome —— #codex=… 调试口只在页面初始化时读一次 hash，
 * 同一页面里换 hash 不会重放，所以一次进程只截一个状态。
 * 第二层（详情 / 展开对比）需要额外点一下，用 ?s=N 让注入脚本补上那一步。
 * ========================================================================== */
'use strict';
var fs = require('fs');
var path = require('path');
var { execFileSync } = require('child_process');

var root = path.join(__dirname, '..');
var CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
var WIN = '1440,900';
var OUTDIR = path.join(__dirname, '_shots', 'v23');
fs.mkdirSync(OUTDIR, { recursive: true });

/* ?s=2 → 点主图进第二层；?s=3 → 再点一次「下」键展开各等级对比
 * 截图前把所有动画关掉：我们要看的是「布局最终长什么样」，
 * 而 virtual-time 与 CSS animation 的完成时机对不上，截出来常是半透明的暗场。 */
var probe = (function () {
  function boot() {
    var st = document.createElement('style');
    st.textContent = '#codex *, #codex *::before, #codex *::after {' +
      'animation: none !important; transition: none !important;}';
    document.head.appendChild(st);

    var q = (location.search.match(/[?&]s=(\d+)/) || [])[1];
    var s = q ? +q : 1;
    if (s < 2) return;
    var focus = document.querySelector('#codex .cx-focus');
    if (!focus) return setTimeout(boot, 80);
    focus.click();
    if (s < 3) return;
    setTimeout(function () {
      var btn = document.querySelector('#cxdetail [data-cmpbtn]');
      if (btn) btn.click();
    }, 400);
  }
  setTimeout(boot, 500);
}).toString().replace(/^function\s*\(\)\s*\{|\}$/g, '');

var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var tmp = path.join(root, '_shot_v23.html');
fs.writeFileSync(tmp, html.replace('</body>', '<script>(function(){' + probe + '})();</script></body>'), 'utf8');
var base = 'file:///' + tmp.replace(/\\/g, '/');

var FLAGS = [
  '--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--hide-scrollbars',
  '--virtual-time-budget=25000'
];

/* 第 3 列可选：窗口尺寸。
 * 注意 headless Chrome 的窗口有 500px 最小内宽 —— 传 390 进来实际按 512 排版再把右边裁掉，
 * 拍出来会假性「主图溢出」。所以窄屏一律用 512 拍，别被骗。 */
var shots = [
  ['01_browse_bld', '?s=1#codex=bld', '第一层 · 建筑（大本营 + 双侧残影）'],
  ['02_browse_unit', '?s=1#codex=unit', '第一层 · 兵种'],
  ['03_browse_spell', '?s=1#codex=spell', '第一层 · 法术'],
  ['04_detail_base', '?s=2#codex=bld,base,4', '第二层 · 大本营 Lv4'],
  ['05_detail_ward', '?s=2#codex=bld,ward,6', '第二层 · 防御塔 Lv6（无残影）'],
  ['06_detail_unit', '?s=2#codex=unit,archer', '第二层 · 兵种（无「下」键）'],
  ['07_detail_spell', '?s=2#codex=spell,fireball', '第二层 · 法术'],
  ['08_cmp_open', '?s=3#codex=bld,cannon,3', '第二层 · 展开各等级对比'],
  ['09_narrow_browse', '?s=1#codex=bld', '窄屏 · 第一层', '512,900'],
  ['10_narrow_detail', '?s=2#codex=bld,ward,6', '窄屏 · 第二层', '512,900']
];

var ok = 0, fail = [];
shots.forEach(function (sh) {
  var out = path.join(OUTDIR, sh[0] + '.png');
  var win = sh[3] || WIN;
  try {
    execFileSync(CHROME, FLAGS.concat(['--window-size=' + win, '--screenshot=' + out, base + sh[1]]), {
      encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], timeout: 180000
    });
    var sz = fs.statSync(out).size;
    console.log('✅ ' + sh[0] + '.png  ' + Math.round(sz / 1024) + ' KB  —— ' + sh[2]);
    ok++;
  } catch (e) {
    console.log('❌ ' + sh[0] + '：' + e.message.split('\n')[0]);
    fail.push(sh[0]);
  }
});

try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
console.log('\n产出 ' + ok + ' / ' + shots.length + ' 张 → ' + path.relative(root, OUTDIR));
if (fail.length) { console.log('失败：' + fail.join(', ')); process.exit(1); }
