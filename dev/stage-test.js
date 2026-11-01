/* ============================================================================
 * 闯关模式规则测试
 *   运行： node dev/stage-test.js
 *
 * 这些规则都在 index.html 的内联脚本里，所以用无头浏览器打开真页面来测
 * （和 dom-test 的 DOM 桩不同：这里连页面状态、localStorage 都是真的）。
 *
 * 覆盖：关卡倍率公式 / 评星边界 / 解锁规则 / 存档容错
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
    function chk(desc, cond, got) {
      if (!cond) fails++;
      out.push((cond ? '✅' : '❌') + ' ' + desc + (got != null ? '  [' + got + ']' : ''));
    }
    var g = window.__game;
    if (!g || !g.stage) { document.title = 'RESULT::❌ __game.stage 未暴露'; return; }
    var S = g.stage;

    /* ---------- 1. 倍率公式 ---------- */
    var b1 = S.boost(1), b5 = S.boost(5), b10 = S.boost(10);
    chk('第 1 关：金币 120% / 血量 110% / 攻击 110%',
      Math.abs(b1.income - 1.2) < 1e-9 && Math.abs(b1.hp - 1.1) < 1e-9 && Math.abs(b1.atk - 1.1) < 1e-9,
      b1.income + ' / ' + b1.hp + ' / ' + b1.atk);
    chk('第 5 关：金币 200% / 血量 150% / 攻击 150%',
      Math.abs(b5.income - 2.0) < 1e-9 && Math.abs(b5.hp - 1.5) < 1e-9 && Math.abs(b5.atk - 1.5) < 1e-9,
      b5.income + ' / ' + b5.hp + ' / ' + b5.atk);
    chk('第 10 关：金币 300% / 血量 200% / 攻击 200%',
      Math.abs(b10.income - 3.0) < 1e-9 && Math.abs(b10.hp - 2.0) < 1e-9 && Math.abs(b10.atk - 2.0) < 1e-9,
      b10.income + ' / ' + b10.hp + ' / ' + b10.atk);
    chk('倍率只作用于电脑（team=red）', b1.team === 'red', b1.team);
    var incOk = true;
    for (var n = 1; n <= S.MAX; n++) {
      var b = S.boost(n);
      if (Math.abs(b.income - (1 + 0.2 * n)) > 1e-9 || Math.abs(b.hp - (1 + 0.1 * n)) > 1e-9) incOk = false;
    }
    chk('10 关的加成逐关线性递增', incOk);

    /* ---------- 2. 评星边界 ---------- */
    chk('3 分钟内获胜 = 3 星', S.starsOf(true, 100) === 3, S.starsOf(true, 100));
    chk('恰好 180 秒获胜 = 3 星（速胜边界含等号）', S.starsOf(true, 180) === 3, S.starsOf(true, 180));
    chk('181 秒获胜 = 3 星（坚持3分+击败+10分钟内）', S.starsOf(true, 181) === 3, S.starsOf(true, 181));
    chk('600 秒获胜 = 3 星（10 分钟边界含等号）', S.starsOf(true, 600) === 3, S.starsOf(true, 600));
    chk('601 秒获胜 = 2 星（超时，拿不到速通星）', S.starsOf(true, 601) === 2, S.starsOf(true, 601));
    chk('撑满 3 分钟后战败 = 1 星', S.starsOf(false, 200) === 1, S.starsOf(false, 200));
    chk('3 分钟内战败 = 0 星', S.starsOf(false, 120) === 0, S.starsOf(false, 120));
    chk('恰好 180 秒战败 = 1 星', S.starsOf(false, 180) === 1, S.starsOf(false, 180));

    /* 星条目列表要和星数对得上（结算界面直接照它渲染） */
    var linesOk = true, cases = [[true, 100], [true, 181], [true, 601], [false, 200], [false, 120]];
    cases.forEach(function (c) {
      var cnt = S.linesOf(c[0], c[1]).filter(function (l) { return l.ok; }).length;
      if (cnt !== S.starsOf(c[0], c[1])) linesOk = false;
    });
    chk('结算星条目数量与星数一致', linesOk);

    /* ---------- 3. 解锁规则 ---------- */
    S.setProg({ cleared: {}, stars: {} });
    chk('全新存档：第 1 关可玩', S.unlocked(1) === true);
    chk('全新存档：第 2 关锁着', S.unlocked(2) === false);
    S.setProg({ cleared: { 1: true }, stars: { 1: 3 } });
    chk('通关第 1 关后第 2 关解锁', S.unlocked(2) === true);
    chk('第 3 关仍然锁着（不能跳关）', S.unlocked(3) === false);
    S.setProg({ cleared: {}, stars: { 1: 1 } });
    chk('只在第 1 关拿到 1 星但没获胜 → 不解锁第 2 关',
      S.unlocked(2) === false, 'cleared 才解锁');

    /* ---------- 4. 存档读写的容错 ---------- */
    S.setProg({ cleared: { 1: true, 2: true }, stars: { 1: 3, 2: 2 } });
    chk('总星数累加正确', S.total() === 5, S.total());
    S.setProg({ cleared: {}, stars: { 1: 99 } });
    chk('星级越界（99）被夹到 3', S.stars(1) === 3, S.stars(1));
    S.setProg({ cleared: {}, stars: { 1: -5 } });
    chk('负数星级被夹到 0', S.stars(1) === 0, S.stars(1));
    S.setProg(null);
    chk('进度对象为空时不崩、总星数为 0', S.total() === 0, S.total());

    /* ---------- 5. 关卡面板能渲染出 10 张卡 ---------- */
    S.setProg({ cleared: { 1: true }, stars: { 1: 2 } });
    var panel = document.getElementById('stage');
    panel.hidden = false;
    S.render();
    var cards = document.querySelectorAll('#stgrid .st-card');
    chk('关卡面板渲染出 10 张卡', cards.length === 10, cards.length);
    var locked = document.querySelectorAll('#stgrid .st-card.lock').length;
    chk('只有第 1 关通关时，锁着 8 张', locked === 8, locked);
    var firstCard = cards[0];
    chk('第 1 张卡显示关卡号 01', firstCard && firstCard.textContent.indexOf('01') >= 0);
    chk('卡片上有倍数说明（金币 120%）',
      cards[0] && cards[0].textContent.indexOf('金币 120%') >= 0,
      cards[0] ? cards[0].textContent.replace(/\s+/g, ' ').slice(0, 40) : '');
    chk('总星数显示在面板右上', (document.getElementById('sttotal') || {}).textContent === '2',
      (document.getElementById('sttotal') || {}).textContent);

    /* ---------- 6. 买「建筑血量」科技不能把倍率抹掉 ----------
     * 这段是回归断言：upgradeGlobal 的 bHp 分支是**重算**上限，不是「再加一层」，
     * 漏乘 boost 的话 AI 花金币买科技反而把自己买脆了（实测第 5 关 4800 → 3520）。 */
    var L = g.logic;
    var st5 = L.createState({ seed: 7, difficulty: 'hard', boost: S.boost(5) });
    var base5 = L.ownBase(st5, 'red');
    var openHp = base5.hpMax;
    chk('第 5 关开局 AI 大本营 = 3200×1.5', openHp === 4800, openHp);
    st5.res.red = 99999;
    L.upgradeGlobal(st5, 'red', 'bHp');
    var afterHp = L.ownBase(st5, 'red').hpMax;
    chk('买一级建筑血量科技后上限只涨不跌（4800 → 5280）', afterHp === 5280, afterHp);
    chk('科技加成没把闯关倍率顶掉', afterHp > openHp, openHp + ' → ' + afterHp);
    for (var ti = 0; ti < 3; ti++) L.upgradeGlobal(st5, 'red', 'bHp');
    var maxHp = L.ownBase(st5, 'red').hpMax;
    var gm = L.globalBonus(st5, 'red').buildingHp;
    /* 科技是逐级连乘（1.1^4 = 1.4641），不能手写 1.4 —— 用 globalBonus 现取倍率 */
    chk('连买 4 级后仍是「等级值 × 科技 × 关卡」', maxHp === Math.round(3200 * gm * 1.5),
      maxHp + '（科技 ×' + gm.toFixed(4) + '）');
    var stN = L.createState({ seed: 7, difficulty: 'hard' });
    var nHp = L.ownBase(stN, 'red').hpMax;
    stN.res.red = 99999;
    L.upgradeGlobal(stN, 'red', 'bHp');
    chk('普通对局（无 boost）科技效果不变：3200 → 3520',
      nHp === 3200 && L.ownBase(stN, 'red').hpMax === 3520,
      nHp + ' → ' + L.ownBase(stN, 'red').hpMax);

    out.push('---失败 ' + fails + ' 项---');
    document.title = 'RESULT::' + out.join(' ;; ');
  }
  setTimeout(boot, 800);
}).toString().replace(/^function\s*\(\)\s*\{|\}$/g, '');

var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var tmp = path.join(root, '_stage_test.html');
fs.writeFileSync(tmp, html.replace('</body>', '<script>(function(){' + probe + '})();</script></body>'), 'utf8');

var dom;
try {
  dom = execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--hide-scrollbars',
    '--window-size=1440,900', '--virtual-time-budget=20000', '--dump-dom',
    'file:///' + tmp.replace(/\\/g, '/')
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 180000 });
} catch (e) {
  console.log('❌ 浏览器启动失败：' + e.message.split('\n')[0]);
  try { fs.unlinkSync(tmp); } catch (e2) {}
  process.exit(1);
}
try { fs.unlinkSync(tmp); } catch (e) {}

var m = /<title>RESULT::([\s\S]*?)<\/title>/.exec(dom);
if (!m) { console.log('❌ 探针没有回写结果（脚本可能报错）'); process.exit(1); }

var fail = 0;
m[1].split(' ;; ').forEach(function (l) {
  var s = l.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  if (s.indexOf('❌') === 0) fail++;
  console.log('  ' + s);
});
console.log(fail ? '\n❌ 闯关规则：失败 ' + fail + ' 项' : '\n✅ 闯关规则：全部通过');
process.exit(fail ? 1 : 0);
