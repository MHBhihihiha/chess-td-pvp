/* ============================================================================
 * 全量自检入口（v18）
 * ----------------------------------------------------------------------------
 * 为什么要有它：以前「18 套件全过」是**手敲一串命令**跑出来的，
 * 于是 chk-ai-deploy.js / strategy-test.js 这类脚本长期游离在矩阵之外，
 * 改了逻辑没人跑，坏了也没人知道（它们不产出 pass/fail，所以最容易漏）。
 * 现在一条命令跑完整张表，任何一套非零退出就整体返回 1。
 *
 * 用法：
 *   node dev/run-all.js            # 常规矩阵（几十秒）
 *   node dev/run-all.js --full     # 追加慢跑：难度阶梯 + AI 行为诊断（几分钟）
 *   node dev/run-all.js --only unit,bld   # 只跑匹配的套件（名字模糊匹配）
 *
 * 判定规则（assert 类）：
 *   ① 退出码 0
 *   ② 输出里不能出现 ❌ / FAIL
 *   ③ 如果打印了「失败 N 项」，N 必须是 0
 * 判定规则（info 类）：只要退出码 0 且没有异常栈就算过 —— 它们是"看数字"的诊断脚本，
 *   但**必须能跑完**，跑不完就说明接口被改坏了。
 * ========================================================================== */
'use strict';
var path = require('path');
var spawnSync = require('child_process').spawnSync;

var ROOT = path.join(__dirname, '..');
var ARGV = process.argv.slice(2);
var FULL = ARGV.indexOf('--full') >= 0;
var ONLY = null;
ARGV.forEach(function (a) {
  if (a.indexOf('--only') === 0) {
    var v = a.indexOf('=') > 0 ? a.split('=')[1] : ARGV[ARGV.indexOf(a) + 1];
    if (v) ONLY = v.split(',').map(function (s) { return s.trim().toLowerCase(); });
  }
});

/* 套件表：name 用于筛选，args 传给脚本 */
var SUITES = [
  { name: 'headless',   file: 'headless-test.js',   kind: 'assert', note: '核心规则' },
  { name: 'unit',       file: 'unit-spec-test.js',  kind: 'assert', note: '兵种规格' },
  { name: 'building',   file: 'building-spec-test.js', kind: 'assert', note: '建筑/法术/AI 预算' },
  { name: 'projectile', file: 'projectile-test.js', kind: 'assert', note: '弹道' },
  { name: 'ram',        file: 'ram-test.js',        kind: 'assert', note: '攻城车' },
  { name: 'smooth',     file: 'smooth-move-test.js', kind: 'assert', note: '平滑移动' },
  { name: 'no-stuck',   file: 'no-stuck-test.js',   kind: 'assert', note: '不卡死' },
  { name: 'acceptance', file: 'acceptance.js',      kind: 'assert', note: '验收' },
  { name: 'dom',        file: 'dom-test.js',        kind: 'assert', note: 'DOM 桩渲染' },
  { name: 'ui',         file: 'ui-contract-test.js', kind: 'assert', note: 'UI 契约' },
  { name: 'friendly',   file: 'friendly-fire-test.js', kind: 'assert', note: '友军伤害' },
  { name: 'freeze',     file: 'freeze-test.js',     kind: 'assert', note: '冰冻' },
  { name: 'turret-aim', file: 'turret-aim-test.js', kind: 'assert', note: '炮口朝向' },
  { name: 'soak',       file: 'soak-test.js',       kind: 'assert', note: '长跑稳定性' },
  { name: 'deep',       file: 'deep-selfcheck.js',  kind: 'assert', note: '8 种子逐帧扫' },
  { name: 'net',        file: 'net-test.js',        kind: 'assert', note: '双人锁步/中继' },
  { name: 'tick-align', file: 'tick-align-test.js', kind: 'assert', note: 'tick 对齐/输入延迟' },
  /* 真浏览器事件流：dom-test 跑的是 DOM 桩，验不了「按键之后 DOM 有没有变」 */
  { name: 'codex-keys', file: 'codex-interact-test.js', kind: 'assert', note: '图鉴键盘/翻页' },
  { name: 'stage',      file: 'stage-test.js',      kind: 'assert', note: '闯关模式规则' },
  { name: 'mirror',     file: 'mirror-test.js',     kind: 'assert', note: '红方视角镜像' },
  { name: 'mirror-render', file: 'mirror-render-test.js', kind: 'assert', note: '镜像点击/渲染' },
  { name: 'playtest',   file: 'playtest.js',        kind: 'assert', note: '对局流程' },
  { name: 'grass',      file: 'grass-acceptance.js', kind: 'assert', note: '草地贴图' },
  /* ↓ v18 新纳入矩阵的两个「游离脚本」：它们只打印数字，不做断言。
   *   现在照样跑，只要跑完就行 —— 这样接口被改坏会立刻暴露。 */
  { name: 'chk-deploy-hard',   file: 'chk-ai-deploy.js', kind: 'info', args: ['hard'],   note: 'AI 派兵分布(普通)' },
  { name: 'chk-deploy-hell',   file: 'chk-ai-deploy.js', kind: 'info', args: ['hell'],   note: 'AI 派兵分布(困难)' },
  { name: 'strategy',          file: 'strategy-test.js', kind: 'info', note: '支出权重' }
];
if (FULL) {
  SUITES.push({ name: 'ladder', file: 'ai-ladder.js', kind: 'info', args: ['12'], note: '难度阶梯 12 局' });
  SUITES.push({ name: 'diag-ai', file: '_diag_ai.js', kind: 'info', args: ['420', '3'], note: 'AI 行为诊断' });
}

function match(name) {
  if (!ONLY) return true;
  var n = name.toLowerCase();
  return ONLY.some(function (k) { return n.indexOf(k) >= 0; });
}

function classify(out, code) {
  if (code !== 0) return { ok: false, why: '退出码 ' + code };
  if (/❌|FAIL/.test(out)) return { ok: false, why: '输出里有失败项' };
  var m = /失败\s+(\d+)\s+项/.exec(out);
  if (m && parseInt(m[1], 10) !== 0) return { ok: false, why: '失败 ' + m[1] + ' 项' };
  if (/\bError\b|\bat .*:\d+:\d+/.test(out) && /throw|TypeError|ReferenceError/.test(out)) {
    return { ok: false, why: '有异常' };
  }
  return { ok: true, why: '' };
}

function tailLine(out) {
  var lines = out.split(/\r?\n/).filter(function (l) { return l.trim(); });
  var pick = '';
  for (var i = lines.length - 1; i >= 0; i--) {
    if (/通过\s+\d+\s+项|失败/.test(lines[i])) { pick = lines[i].trim(); break; }
  }
  if (!pick && lines.length) pick = lines[lines.length - 1].trim();
  return pick.replace(/^[=\-\s]+/, '').slice(0, 52);
}

var rows = [], failed = [];
var t0 = Date.now();
SUITES.forEach(function (s) {
  if (!match(s.name)) return;
  var file = path.join(__dirname, s.file);
  var args = (s.args || []).slice();
  var started = Date.now();
  var r = spawnSync(process.execPath, [file].concat(args), {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
  });
  var out = (r.stdout || '') + (r.stderr || '');
  var ev = classify(out, r.status == null ? 1 : r.status);
  var ms = Date.now() - started;
  rows.push({ name: s.name, note: s.note, kind: s.kind, ok: ev.ok, why: ev.why, ms: ms, tail: tailLine(out) });
  if (!ev.ok) failed.push(s.name + '：' + ev.why);
});

/* ------------------------------------------------------------------ 报表 */
function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
function padl(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }

console.log('\n════════════════════════════════════════════════════════════════');
console.log(' 全量自检' + (FULL ? '（--full，含慢跑）' : '') + (ONLY ? '（筛选：' + ONLY.join(',') + '）' : ''));
console.log('════════════════════════════════════════════════════════════════');
rows.forEach(function (r) {
  console.log('  ' + (r.ok ? '✅' : '❌') + '  ' + pad(r.name, 16) + pad(r.note, 22) +
    padl(r.ms + 'ms', 8) + '   ' + r.tail);
});
var secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log('────────────────────────────────────────────────────────────────');
if (failed.length) {
  console.log('  ❌ ' + failed.length + ' / ' + rows.length + ' 套件失败（' + secs + 's）');
  failed.forEach(function (f) { console.log('     - ' + f); });
} else {
  console.log('  ✅ ' + rows.length + ' / ' + rows.length + ' 套件全过（' + secs + 's）');
}
console.log('════════════════════════════════════════════════════════════════\n');
process.exit(failed.length ? 1 : 0);
