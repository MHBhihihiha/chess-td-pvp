/* ============================================================================
 * v18 实拍：战斗中的「建筑详情面板」与开始界面/图鉴之外的最后一块拼图
 *   运行： node dev/_shot_v18_panel.js
 *   产出： dev/_shots/v18/battle_panel.png（1440×900 整页）
 *
 * 做法与 board-shot.js 同源：把 index.html 复制成根目录临时页，在 </body> 前注入
 * 一段"开局 + 摆局面 + 选中防御塔"的脚本 —— 因为详情面板只能靠真实 DOM 交互打开，
 * 纯 headless 截图拿不到。
 * ========================================================================== */
'use strict';
var fs = require('fs');
var path = require('path');
var { execFileSync } = require('child_process');

var root = path.join(__dirname, '..');
var CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
var WIN = '1440,900';

var probe = (function () {
  function boot() {
    var g = window.__game;
    if (!g || !g.start) return setTimeout(boot, 60);
    g.start();
    var s = g.state;
    s.res.blue = 999999;
    var C = window.GameCore;
    /* 摆一局看得懂的场面：几座塔 + 一个水晶塔（带光环）+ 几只兵 */
    var spots = [['arrow', 8, 2], ['cannon', 8, 5], ['mage', 7, 8], ['mine', 10, 1]];
    spots.forEach(function (sp) {
      var r = C.placeBuilding(s, 'blue', sp[0], sp[1], sp[2]);
      if (r.ok && sp[0] !== 'mine') r.building.level = 3;
    });
    var w = C.placeBuilding(s, 'blue', 'ward', 7, 3);
    if (w.ok) { w.building.level = 5; w.building.branch = 'crystal'; }
    ['infantry', 'archer', 'siege'].forEach(function (k, i) {
      C.deployUnit(s, 'blue', k, 2 + i * 3);
    });
    C.deployUnit(s, 'red', 'heavy', 4);
    for (var i = 0; i < 20 * 4; i++) { C.update(s, C.DT); C.aiUpdate(s, 'red', C.DT); }
    g.select(null);
    if (w.ok) g.inspect(w.building);
    g.render();
    document.title = 'SHOT ready';
  }
  setTimeout(boot, 80);
}).toString().replace(/^function\s*\(\)\s*\{|\}$/g, '');

var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var tmp = path.join(root, '_shot_v18.html');
fs.writeFileSync(tmp, html.replace('</body>', '<script>(function(){' + probe + '})();</script></body>'), 'utf8');
var url = 'file:///' + tmp.replace(/\\/g, '/');
var out = path.join(__dirname, '_shots', 'v18', 'battle_panel.png');
var FLAGS = [
  '--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--hide-scrollbars',
  '--window-size=' + WIN, '--virtual-time-budget=25000'
];
try {
  execFileSync(CHROME, FLAGS.concat(['--screenshot=' + out, url]), {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], timeout: 180000
  });
  console.log('已产出 ' + path.relative(root, out));
} catch (e) {
  console.log('截图失败：' + e.message.split('\n')[0]);
} finally {
  try { fs.unlinkSync(tmp); } catch (e2) { /* ignore */ }
}
