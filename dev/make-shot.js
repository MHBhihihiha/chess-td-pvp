'use strict';
/* 把 index.html 变成一张「已进入对局中段」的截图用页面（内联逻辑层，便于 file:// 直接跑） */
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var logic = fs.readFileSync(path.join(root, 'src', 'logic.js'), 'utf8');

// 1) 把外链脚本换成内联
html = html.replace('<script src="src/logic.js"></script>', '<script>\n' + logic + '\n</script>');

// 2) 注入「快进到对局中段 + 摆好局面」的代码，让截图能看到真实战斗画面
var inject = `
<script>
(function () {
  // 等主脚本初始化完成后，把局面推进到中段
  function boot() {
    if (!window.__shotReady) { setTimeout(boot, 30); return; }
  }
  setTimeout(function () {
    var g = window.__game;
    if (!g) { document.title = 'NO_GAME_HANDLE'; return; }
    var C = window.GameCore, s = g.state;
    // 给玩家一些资源与建筑
    s.res.blue = 640;
    C.placeBuilding(s, 'blue', 'tower', 8, 3);
    C.placeBuilding(s, 'blue', 'mine', 9, 7);
    C.placeBuilding(s, 'blue', 'barracks', 9, 2);
    C.upgradeBuilding(s, s.byRef.blue[C.toRef(8, 3)]);
    C.placeBuilding(s, 'blue', 'tower', 8, 8);
    // 红方也摆一点
    s.res.red = 900;
    C.placeBuilding(s, 'red', 'tower', 3, 4);
    C.placeBuilding(s, 'red', 'mine', 2, 8);
    C.placeBuilding(s, 'red', 'barracks', 1, 3);
    // 推进 26 秒，让双方都有兵在场上
    for (var i = 0; i < 20 * 26; i++) {
      C.update(s, C.DT);
      C.aiUpdate(s, 'red', C.DT);
      C.aiUpdate(s, 'blue', C.DT);
    }
    // 蓝方再手动派几个兵，保证画面里有己方兵
    ['infantry','infantry','siege','scout'].forEach(function (k, idx) {
      s.reserve.blue[k] = (s.reserve.blue[k] || 0) + 1;
      s.res.blue = 500;
      C.deployUnit(s, 'blue', k, 2 + idx * 2);
    });
    for (var j = 0; j < 20 * 6; j++) {
      C.update(s, C.DT);
      C.aiUpdate(s, 'red', C.DT);
    }
    // 打开一张建筑详情卡，展示「点建筑看攻击力+升级」
    var t = s.byRef.blue[C.toRef(8, 3)];
    if (t) { g.select(t); }
    g.render();
    document.title = 'SHOT_READY units=' + s.units.length + ' buildings=' + s.buildings.length;
  }, 120);
})();
</script>
`;

// 3) 让主脚本暴露一个句柄，供上面注入的代码使用
html = html.replace('  newGame();\n  requestAnimationFrame(frame);',
  '  window.__game = { get state() { return state; }, render: render, select: function (b) { selectedBuilding = b; renderDetail(); render(); } };\n  newGame();\n  requestAnimationFrame(frame);');

html = html.replace('</body>', inject + '</body>');

var out = path.join(root, 'dev', 'shot.html');
fs.writeFileSync(out, html, 'utf8');
console.log('已生成截图用页面: dev/shot.html（' + html.length + ' 字节）');
