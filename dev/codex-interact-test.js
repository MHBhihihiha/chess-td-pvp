/* ============================================================================
 * 图鉴键盘操作实测（真实浏览器事件流）
 *   运行： node dev/codex-interact-test.js
 *
 * 为什么不用 dom-test：那边跑的是 DOM 桩，只能断言「生成的 HTML 长什么样」，
 * 跑不了「按一下方向键之后 DOM 有没有真的变」。这里用无头 Chrome 打开真页面，
 * 往 document 上派发 KeyboardEvent，逐步读状态。
 *
 * 覆盖：→ 翻页 / Enter 进详情 / 详情里 → 换条目 / ↓ 展开对比 / Esc 退一层 / Esc 关闭
 * ========================================================================== */
'use strict';
var fs = require('fs');
var path = require('path');
var { execFileSync } = require('child_process');

var root = path.join(__dirname, '..');
var CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

var probe = (function () {
  function boot() {
    var out = [], fails = 0;
    function d(id) { return document.getElementById(id); }
    function nameBrowse() {
      var e = document.querySelector('#cxfocus .cx-fname');
      return e ? e.textContent.trim() : '(空)';
    }
    function nameDetail() {
      var e = document.querySelector('#cxdscroll .cxd-name');
      return e ? e.textContent.trim().replace(/\s+/g, '') : '(空)';
    }
    function where() { return d('cxdetail').hidden ? 'browse' : 'detail'; }
    function key(k) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    }
    function chk(desc, cond, got) {
      if (!cond) fails++;
      out.push((cond ? '✅' : '❌') + ' ' + desc + (got != null ? '  [' + got + ']' : ''));
    }

    var n0 = nameBrowse();
    chk('初始停在第一层、主图是大本营', where() === 'browse' && n0 === '大本营', n0);

    key('ArrowRight');
    var n1 = nameBrowse();
    chk('→ 翻到下一件（大本营 → 下一座建筑）', n1 !== n0 && n1.length > 0, n0 + ' → ' + n1);

    key('ArrowLeft');
    chk('← 翻回上一件', nameBrowse() === n0, nameBrowse());

    key('Enter');
    chk('Enter 进入第二层', where() === 'detail', where());
    var d0 = nameDetail();
    chk('第二层标题与第一层是同一件', d0.indexOf(n0) === 0, d0);

    key('ArrowRight');
    var d1 = nameDetail();
    chk('第二层 → 切换下一件（不回到第一层）', where() === 'detail' && d1 !== d0, d0 + ' → ' + d1);

    var panel = document.querySelector('#cxdscroll [data-cmppanel]');
    chk('对比区初始是折叠的', !!panel && panel.hasAttribute('hidden'));
    key('ArrowDown');
    chk('↓ 展开各等级对比', !!panel && !panel.hasAttribute('hidden'));
    key('ArrowDown');
    chk('再按 ↓ 收起', !!panel && panel.hasAttribute('hidden'));

    key('Escape');
    chk('Esc 在详情里只退一层（回到第一层，图鉴还开着）',
      where() === 'browse' && !d('codex').hidden, where());

    key('Escape');
    chk('再按 Esc 才关闭图鉴', !!d('codex').hidden, d('codex').hidden ? 'closed' : 'open');

    out.push('---失败 ' + fails + ' 项---');
    document.title = 'RESULT::' + out.join(' ;; ');
  }
  setTimeout(boot, 900);
}).toString().replace(/^function\s*\(\)\s*\{|\}$/g, '');

var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var tmp = path.join(root, '_codexkey.html');
fs.writeFileSync(tmp, html.replace('</body>', '<script>(function(){' + probe + '})();</script></body>'), 'utf8');

var dom;
try {
  dom = execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--allow-file-access-from-files',
    '--window-size=1440,900', '--virtual-time-budget=20000', '--dump-dom',
    'file:///' + tmp.replace(/\\/g, '/') + '#codex=bld'
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 180000 });
} catch (e) {
  console.log('❌ 浏览器启动失败：' + e.message.split('\n')[0]);
  try { fs.unlinkSync(tmp); } catch (e2) { /* ignore */ }
  process.exit(1);
}
try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }

var m = /<title>RESULT::([\s\S]*?)<\/title>/.exec(dom);
if (!m) { console.log('❌ 探针没有回写结果（可能脚本报错）'); process.exit(1); }

var lines = m[1].split(' ;; ');
var fail = 0;
lines.forEach(function (l) {
  var s = l.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  if (s.indexOf('❌') === 0) fail++;
  console.log('  ' + s);
});
console.log(fail ? '\n❌ 图鉴键盘：失败 ' + fail + ' 项' : '\n✅ 图鉴键盘：全部通过');
process.exit(fail ? 1 : 0);
