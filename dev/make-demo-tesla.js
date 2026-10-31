/* =============================================================================
 * 生成特斯拉系演示页 dev/demo-tesla.html
 * 用法: node dev/make-demo-tesla.js
 *
 * 把 index.html + src/logic.js 内联成一个自包含页面，摆好三座塔和一堆靶子，
 * 用**真实渲染器**持续出图，方便肉眼验看：
 *   · 特斯拉电塔（单体）→ 锯齿闪电
 *   · 脉冲塔（Lv5）     → 自中心向外扩散的电磁波
 *   · 大电塔（Lv5）     → 敌人之间的链式跳跃闪电
 * 打开方式：http://127.0.0.1:8899/dev/demo-tesla.html
 * ========================================================================== */
'use strict';
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var logic = fs.readFileSync(path.join(root, 'src', 'logic.js'), 'utf8');

html = html.replace('<script src="src/logic.js"></script>', '<script>\n' + logic + '\n</script>');

var inject = `
<script>
(function () {
  function boot(tries) {
    if (!window.__game) {
      if (tries > 200) { document.title = 'NO_GAME_HANDLE'; return; }
      return setTimeout(function () { boot(tries + 1); }, 30);
    }
    var g = window.__game, C = window.GameCore, s = g.state;
    var startEl = document.getElementById('start');
    if (startEl) startEl.classList.add('hide');

    s.res.blue = 1000000;
    function put(key, row, col, branch) {
      var r = C.placeBuilding(s, 'blue', key, row, col);
      if (!r.ok) { console.log('place fail', key, row, col, r.why); return null; }
      var b = r.building;
      if (branch) {
        for (var i = 0; i < 4; i++) C.upgradeBuilding(s, b);
        C.upgradeBuilding(s, b, branch);
      }
      return b;
    }
    put('tesla', 6, 2);               // 单体闪电
    put('tesla', 8, 5, 'pulse');      // 电磁波
    put('tesla', 8, 8, 'bigtesla');   // 链式闪电

    function dummy(key, row, col) {
      var u = C.spawnUnit(s, 'red', key, row, col);
      if (!u) return null;
      u.def = Object.assign({}, u.def, { speed: 0 });   // 站住不动
      u.hp = u.hpMax = 1e9;                             // 靶子锁血，保证一直有戏看
      return u;
    }
    dummy('infantry', 5, 2);
    dummy('infantry', 7, 5); dummy('infantry', 6, 5);
    dummy('infantry', 7, 6); dummy('infantry', 6, 6);
    dummy('heavy', 7, 8); dummy('heavy', 7, 9); dummy('heavy', 6, 8);

    // 自己推进模拟（不点「开始游戏」，避免 AI 掺进来把靶子清掉）
    setInterval(function () {
      C.update(s, C.DT);
      g.render();
    }, 33);
    document.title = 'DEMO_READY';
  }
  boot(0);
})();
</script>
`;

html = html.replace('</body>', inject + '</body>');
var out = path.join(root, 'dev', 'demo-tesla.html');
fs.writeFileSync(out, html, 'utf8');
console.log('已生成演示页: dev/demo-tesla.html（' + html.length + ' 字节）');
