'use strict';
/* ============================================================================
 * 草地验收脚本（美术规范 docs/art/icons-and-grass.md §B6 性能 + §B8 六条标准）
 *   运行： node dev/grass-acceptance.js            （当前资产状态）
 *          node dev/grass-acceptance.js --tex      （把 art/v9/tex_grass.png 计入，验证 L3/L4）
 *          node dev/grass-acceptance.js --tex --no-chrome   （只打印判定表，不跑浏览器）
 *
 * 做法：生成一个临时页（项目根，保证 art/ 与 src/ 相对路径可用）→ 用系统 Chrome
 * 无头跑一遍 → 从 DOM 里读回 __game.bgCanvas() 的像素统计 + __game.bgStats() 的性能
 * 数字 → 逐条比对阈值 → 打印 PASS/FAIL → 删掉临时页。
 *
 * 为什么不用 dev/ 下的临时页：src/logic.js 与 art/v9/ 都是相对路径，放到 dev/ 会
 * 全部 404，导致 GameCore 缺失（一开始踩过这个坑，会误判成「游戏挂了」）。
 * 为什么用 --virtual-time-budget：无头环境没有 rAF，虚拟时间能把定时器推完；
 * 但虚拟时间下 performance.now() 是冻结的，所以性能数字只在首帧可信（脚本里已注明）。
 * ========================================================================== */
var fs = require('fs');
var path = require('path');
var os = require('os');
var { execFileSync } = require('child_process');

var root = path.join(__dirname, '..');
var withTex = process.argv.indexOf('--tex') >= 0;
var noChrome = process.argv.indexOf('--no-chrome') >= 0;

var CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].filter(function (p) { return p && fs.existsSync(p); })[0];

var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (withTex) {
  html = html.replace('<script src="art/v9/assets.js"></script>',
    '<script src="art/v9/assets.js"></script><script>window.ARTV9FILES&&window.ARTV9FILES.push("tex_grass.png");</script>');
}

var probe = String(function () {
  function srgb2lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function rgb2lab(r, g, b) {
    var R = srgb2lin(r), G = srgb2lin(g), B = srgb2lin(b);
    var X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    function f(t) { return t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116); }
    var fx = f(X), fy = f(Y), fz = f(Z);
    return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
  }
  function hslH(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d === 0) return 0;
    var h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60; return h < 0 ? h + 360 : h;
  }
  function dE(p, q) { return Math.sqrt(Math.pow(p.L - q.L, 2) + Math.pow(p.a - q.a, 2) + Math.pow(p.b - q.b, 2)); }
  function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : NaN; }
  var out = [], M = {};
  function go() {
    var g = window.__game;
    if (!g) return setTimeout(go, 30);
    g.start();
    var tries = 0;
    (function wait() {                     // 等贴图就绪（只有 --tex 时才会 true）
      if (g.syncGrassTexture && g.syncGrassTexture()) return setTimeout(run, 60);
      if (tries++ < 80) return setTimeout(wait, 50);
      setTimeout(run, 60);
    })();
  }
  function run() {
    var g = window.__game, st = g.bgStats(), cv = g.bgCanvas();
    var p = String(st.key).split(',');
    var dpr = parseFloat(p[5]) || 1, s = parseFloat(p[2]), ox = parseFloat(p[3]), oy = parseFloat(p[4]);
    var W = cv.width, H = cv.height, D = cv.getContext('2d').getImageData(0, 0, W, H).data;
    function px(x, y) {
      var X = Math.round(x * dpr), Y = Math.round(y * dpr);
      if (X < 0 || Y < 0 || X >= W || Y >= H) return null;
      var i = (Y * W + X) * 4, lab = rgb2lab(D[i], D[i + 1], D[i + 2]);
      lab.hsl = hslH(D[i], D[i + 1], D[i + 2]);
      return lab;
    }
    M.builds = st.builds; M.ms = +st.ms.toFixed(1); M.texPending = st.texPending;
    M.dpr = dpr; M.cell = s; M.canvas = W + 'x' + H;
    /* 整数步进采样：0.1 累加到第 10 次得 0.9999…，会采到格线/亮棱上，指标全失真。
     * v2 追加：B8-1 的「单格极差」必须**排除格线 ±2px**（刻槽 ×0.52 + 亮棱 .30 一旦被采到，
     * 极差会虚报到 140+，量到的是格线不是草）。所以边距 = max(10% 格宽, 2px)。 */
    var margin = Math.max(2, s * 0.10);
    var sumL = 0, sumH = 0, n = 0, ranges = [], stds = [];
    for (var r = 1; r <= 10; r++) {
      for (var c = 1; c <= 10; c++) {
        var ls = [];
        for (var iy = 1; iy <= 9; iy++) {
          for (var ix = 1; ix <= 9; ix++) {
            var q = px(ox + (c - 1) * s + margin + (s - 2 * margin) * ix / 10,
                       oy + r * s + margin + (s - 2 * margin) * iy / 10);
            if (!q) continue;
            ls.push(q.L); sumL += q.L; sumH += q.hsl; n++;
          }
        }
        if (ls.length < 4) continue;
        ranges.push(Math.max.apply(null, ls) - Math.min.apply(null, ls));
        var m = avg(ls), v = 0;
        for (var k = 0; k < ls.length; k++) v += Math.pow(ls[k] - m, 2);
        stds.push(Math.sqrt(v / ls.length));
      }
    }
    M.meanL = +(sumL / n).toFixed(1); M.meanHue = +(sumH / n).toFixed(1);
    M.rangeAvg = +avg(ranges).toFixed(1); M.stdAvg = +avg(stds).toFixed(2);
    M.stdMax = +Math.max.apply(null, stds).toFixed(2); M.stdMin = +Math.min.apply(null, stds).toFixed(2);
    // 格线：暗槽 vs 上下 3px 草地
    var dLs = [], dEs = [];
    for (var rr = 1; rr <= 10; rr++) {
      var ly = oy + rr * s + 0.5;
      for (var kk = 0; kk < 9; kk++) {
        var sx = ox + (kk + 0.5) * s, lp = px(sx, ly);
        if (!lp) continue;
        var gl = [];
        for (var d = 1; d <= 3; d++) { var a1 = px(sx, ly - d), a2 = px(sx, ly + d); if (a1) gl.push(a1); if (a2) gl.push(a2); }
        if (!gl.length) continue;
        dLs.push(Math.abs(avg(gl.map(function (z) { return z.L; })) - lp.L));
        dEs.push(avg(gl.map(function (z) { return dE(z, lp); })));
      }
    }
    M.lineL = +avg(dLs).toFixed(1); M.lineLMin = +Math.min.apply(null, dLs).toFixed(1);
    M.lineE = +avg(dEs).toFixed(1); M.lineEMin = +Math.min.apply(null, dEs).toFixed(1);
    var mp = px(ox + 5 * s, oy + 6 * s), ab = px(ox + 5 * s, oy + 6 * s - 2.5), be = px(ox + 5 * s, oy + 6 * s + 2.5);
    M.midL = (mp && ab && be) ? +Math.abs((ab.L + be.L) / 2 - mp.L).toFixed(1) : NaN;
    // 相邻格：每格 4×4 均值再比（单点会落在暗斑/草尖上，量到的是纹理不是格温差）
    var dh = [], dl = [];
    function cell(r3, c3) {
      var a = 0, b = 0, m2 = 0;
      for (var iy2 = 1; iy2 <= 4; iy2++) for (var ix2 = 1; ix2 <= 4; ix2++) {
        var q2 = px(ox + (c3 - 1) * s + ix2 / 5 * s, oy + r3 * s + iy2 / 5 * s);
        if (!q2) continue; a += q2.L; b += q2.hsl; m2++;
      }
      return m2 ? { L: a / m2, H: b / m2 } : null;
    }
    for (var r4 = 1; r4 <= 10; r4++) for (var c4 = 1; c4 <= 9; c4++) {
      var p1 = cell(r4, c4), p2 = cell(r4, c4 + 1);
      if (!p1 || !p2) continue;
      var dv = Math.abs(p1.H - p2.H); if (dv > 180) dv = 360 - dv;
      dh.push(dv); dl.push(Math.abs(p1.L - p2.L));
    }
    M.adjHue = +avg(dh).toFixed(1); M.adjL = +avg(dl).toFixed(1);
    M.oldMeanL = +((function () { var a = rgb2lab(93, 160, 74).L, b = rgb2lab(77, 139, 60).L; return (a + b) / 2; })()).toFixed(1);
    document.body.setAttribute('data-accept', JSON.stringify(M));
    document.title = 'DONE';
  }
  setTimeout(go, 30);
}.toString().replace(/^function\s*\(\)\s*\{|\}$/g, ''));

var tmp = path.join(root, '_grass_acceptance.html');
fs.writeFileSync(tmp, html.replace('</body>', '<script>(function(){' + probe + '})();</script></body>'), 'utf8');

var M = {};
var execErr = null;
try {
  if (noChrome) { console.log('（--no-chrome：跳过浏览器，无法取得实测值）'); process.exit(0); }
  if (!CHROME) { console.log('❌ 找不到 Chrome/Edge，无法跑验收'); process.exit(1); }
  var dom = execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--allow-file-access-from-files',
    '--window-size=1100,1150', '--force-device-scale-factor=2',
    '--virtual-time-budget=20000', '--dump-dom', 'file:///' + tmp.replace(/\\/g, '/')
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], timeout: 120000 });
  var m = dom.match(/data-accept="([^"]*)"/);
  if (m) M = JSON.parse(m[1].replace(/&quot;/g, '"'));
} catch (e) {
  execErr = e.message.split('\n')[0];
} finally {
  try { fs.unlinkSync(tmp); } catch (e) {}     // 临时页用完即删，不留在仓库里
}

function check(name, cond, detail) {
  var tag = cond === true ? '✅ PASS' : cond === false ? '❌ FAIL' : '⚠️  N/A';
  console.log('  ' + tag + '  ' + name + (detail ? '  [' + detail + ']' : ''));
  return cond === true;
}
var pass = 0, fail = 0, na = 0;
function tally(r) { if (r === true) pass++; else if (r === false) fail++; else na++; }

if (!Object.keys(M).length) {
  console.log('❌ 浏览器没吐回数据（' + (execErr || '页面没跑完 / 临时页被删') + '）');
  process.exit(1);
}
console.log('\n=== 实测（' + (M.texPending ? '贴图未就绪 → L3/L4 跳过（降级路径）' : '贴图已生效 → L3/L4 参与混合') + '） ===');
console.log('  dpr=' + M.dpr + ' cell=' + M.cell + ' canvas=' + M.canvas + ' builds=' + M.builds + ' texPending=' + M.texPending);
console.log('  buildBackground=' + M.ms + 'ms  meanL=' + M.meanL + ' (旧版 ' + M.oldMeanL + ')  meanHueHSL=' + M.meanHue);

console.log('\n=== §B6 性能预算 ===');
tally(check('buildBackground ≤ 120ms（dpr2 大画布）', M.ms <= 120, M.ms + 'ms'));

/* ---- 一格草叶起点数：把「换贴图/改缩放」最容易犯的错变成一条自动断言 ----
 * 公式：leaves = 贴图笔数 × (cell / k)² / 贴图边长²
 *   一格 44px 在尺度 k 下覆盖 (44/k)² 个纹理像素，贴图里每像素 6400/512² 个叶起点。
 * 实测校核：k=1.5 → 21 根（稀疏）、k=0.75 → 84 根（甜点）、k=0.55 → 156 根（越界）。
 * 阈值来自规范 §B5 的「作者口径」：一个 44px 格内必须能数出 40–90 根可辨细叶。
 * ⚠️ TEX_N / TEX_SIDE 是**贴图侧的物理量**：换贴图（改笔数、改尺寸）必须重算，
 *    否则这条断言会拿旧参数去判新图，反而变成假绿灯。k 则从 index.html 现读，改缩放不用动这里。 */
var TEX_N = 6400, TEX_SIDE = 512, CELL_REF = 44, LEAF_MIN = 40, LEAF_MAX = 90;
var k3match = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').match(/TEX_L3_SCALE\s*=\s*([\d.]+)/);
var k3 = k3match ? parseFloat(k3match[1]) : NaN;
var ratioPerCell = Math.pow(CELL_REF / k3, 2) / (TEX_SIDE * TEX_SIDE);
var leaves = TEX_N * ratioPerCell;
tally(check('一格草叶起点数 ∈ [40,90]（44px 格；贴图笔数 × (44/k)² / 512²）',
  leaves >= LEAF_MIN && leaves <= LEAF_MAX,
  'k=' + k3 + ' → ' + leaves.toFixed(0) + ' 根/格'));

/* ---- C1b 受光层根数：为什么单独立一条 ----
 * 眼睛不数「画了多少笔」，只数「对比度够的那一层」。受光层之外的两层贴在绿色底上
 * 对比度低，读作「底纹」；只有受光层被当成「叶」。v2.3 时受光层只占 0.20，
 * 总笔数 74 达标、但受光层每格仅约 15 根 —— 实拍读作「平滑绿板上撒的浅色亮片」，
 * B8-1~B8-6 六条数值全绿却过不了人眼。所以 C1b 与总笔数是两条独立约束。
 * ⚠️ HL_SHARE 必须与 dev/make_grass_texture.py 的 LAYERS 第三项一致。 */
var HL_SHARE = 0.34, HL_MIN = 25, HL_MAX = 45;
var hlPerCell = TEX_N * HL_SHARE * ratioPerCell;
tally(check('C1b 受光层根数 ∈ [' + HL_MIN + ',' + HL_MAX + ']（总笔数 × 受光层占比 0.34）',
  hlPerCell >= HL_MIN && hlPerCell <= HL_MAX,
  'cell=44 → ' + (TEX_N * HL_SHARE * Math.pow(44 / k3, 2) / (TEX_SIDE * TEX_SIDE)).toFixed(1) +
  ' 根/格；cell=42 → ' + (TEX_N * HL_SHARE * Math.pow(42 / k3, 2) / (TEX_SIDE * TEX_SIDE)).toFixed(1) + ' 根/格'));

console.log('\n=== §B8 六条验收（v2 口径：明度=Lab L*、色相=HSL） ===');
tally(check('B8-1 单格 L* 极差 ≥ 26（已排除格线 ±2px）', M.rangeAvg >= 26, 'avg=' + M.rangeAvg));
tally(check('B8-2 格线 ΔL* ≥ 14（取最小值，最严口径）', M.lineLMin >= 14, 'avg=' + M.lineL + ' min=' + M.lineLMin));
tally(check('B8-2 格线 ΔE76 ≥ 12（取最小值）', M.lineEMin >= 12, 'avg=' + M.lineE + ' min=' + M.lineEMin));
tally(check('B8-2 半场中线 ΔL* ≥ 18', M.midL >= 18, 'ΔL=' + M.midL));
tally(check('B8-3 整盘 L* 均值与旧版相差 ≤ 3', Math.abs(M.meanL - M.oldMeanL) <= 3, 'Δ=' + (M.meanL - M.oldMeanL).toFixed(1)));
tally(check('B8-3 平均色相角 ∈ [100,120]（HSL）', M.meanHue >= 100 && M.meanHue <= 120, M.meanHue + '°'));
tally(check('B8-4 相邻格色相角差 ∈ [15,28]（HSL）', M.adjHue >= 15 && M.adjHue <= 28, 'avg=' + M.adjHue + '°'));
tally(check('B8-4 相邻格明度差 ∈ [7,12] L*（Lab）', M.adjL >= 7 && M.adjL <= 12, 'avg=' + M.adjL));
tally(check('B8-5 单格 L* 标准差 ∈ [4,9]', M.stdAvg >= 4 && M.stdAvg <= 9,
  'avg=' + M.stdAvg + ' min=' + M.stdMin + ' max=' + M.stdMax));

/* ============================================================================
 * B8-9 低频底座哨兵（勘误 17）
 * ----------------------------------------------------------------------------
 * 规格从 v2 起就写着「低频底座：2 组相位正弦叠出的亮度漂移 ±9」，但生成器里
 * **从来没实现过**。三轮复核只核了均值/std/接缝/镜像，没核「每条规格是否都落地」，
 * 于是底色成了无起伏的「平滑绿板」，叶片全像浮在板上。
 *
 * 检测：低频正弦在贴图上留下的痕迹是「沿 y 的 4 周期分量」+「沿 x 的 7 周期分量」
 * （周期必须取 512 的整数分之一才能无缝，所以频点是确定的）。
 * 把贴图投影成一维后取单频点 DFT 幅值，再与相邻频点比 —— 比值无量纲，
 * 不受亮度/对比度影响，换贴图也不会假报警。
 *
 * 实测分离度（同参数 A/B，验证脚本本身有效）：
 *   无低频底座：k4 比值 1.07 · k7 比值 0.65
 *   有低频底座：k4 比值 17.19 · k7 比值 7.88
 * 阈值取 5.0 / 3.0，两侧各留 3 倍以上余量。
 *
 * 为什么不用「8×8 块均值 std」：实测 1.71 vs 2.57，只有 1.5 倍，分不开 ——
 * 64px 的块长与 73px 的周期太接近，块内平均把低频自己抵消掉了。检测器选错尺度
 * 就会得出「有起伏」的错误绿灯，所以这里记下这个失败方案。
 * ========================================================================== */
function readGrayPng(file) {
  var zlib = require('zlib');
  var buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
  var p = 8, w = 0, h = 0, depth = 0, ctype = 0, idat = [];
  while (p < buf.length) {
    var len = buf.readUInt32BE(p);
    var type = buf.toString('ascii', p + 4, p + 8);
    var data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; ctype = data[9];
      if (data[12] !== 0) throw new Error('不支持隔行 PNG');
    } else if (type === 'IDAT') { idat.push(data); }
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || (ctype !== 0 && ctype !== 4)) {
    throw new Error('需要 8bit 灰度/灰度+alpha，实际 depth=' + depth + ' ctype=' + ctype);
  }
  var bpp = ctype === 0 ? 1 : 2;
  var raw = zlib.inflateSync(Buffer.concat(idat));
  var stride = w * bpp;
  var rows = [], prev = new Uint8Array(stride);
  for (var y = 0; y < h; y++) {
    var ft = raw[y * (stride + 1)];
    var line = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    var cur = new Uint8Array(stride);
    for (var i = 0; i < stride; i++) {
      var a = i >= bpp ? cur[i - bpp] : 0;
      var b = prev[i];
      var c = i >= bpp ? prev[i - bpp] : 0;
      var v = line[i];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        var pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 255;
    }
    rows.push(cur);
    prev = cur;
  }
  return { w: w, h: h, rows: rows, bpp: bpp };
}

/* 单频点 DFT 幅值：不需要整张 FFT，只要一个频点的投影就够了 */
function dftAmp(x, k) {
  var re = 0, im = 0, N = x.length;
  for (var n = 0; n < N; n++) {
    var ang = -2 * Math.PI * k * n / N;
    re += x[n] * Math.cos(ang);
    im += x[n] * Math.sin(ang);
  }
  return Math.sqrt(re * re + im * im);
}

var texPath = path.join(root, 'art', 'v9', 'tex_grass.png');
var texLow = (function () {
  if (!fs.existsSync(texPath)) return null;
  var img = readGrayPng(texPath);
  var py = [], px = [];
  var y, x;
  for (y = 0; y < img.h; y++) {
    var s = 0;
    for (x = 0; x < img.w; x++) s += img.rows[y][x * img.bpp];
    py.push(s / img.w);
  }
  for (x = 0; x < img.w; x++) {
    var t = 0;
    for (y = 0; y < img.h; y++) t += img.rows[y][x * img.bpp];
    px.push(t / img.h);
  }
  var my = py.reduce(function (a, b) { return a + b; }, 0) / py.length;
  var mx = px.reduce(function (a, b) { return a + b; }, 0) / px.length;
  py = py.map(function (v) { return v - my; });
  px = px.map(function (v) { return v - mx; });
  return {
    size: img.w + 'x' + img.h,
    ratioY: dftAmp(py, 4) / Math.max(1e-9, Math.max(dftAmp(py, 3), dftAmp(py, 5))),
    ratioX: dftAmp(px, 7) / Math.max(1e-9, Math.max(dftAmp(px, 6), dftAmp(px, 8)))
  };
})();
tally(check('B8-9a 低频底座：沿 y 的 4 周期分量 ≥5× 邻域（无底座实测 1.07）',
  texLow && texLow.ratioY >= 5.0,
  texLow ? 'tex=' + texLow.size + ' ratio=' + texLow.ratioY.toFixed(2) : '贴图缺失'));
tally(check('B8-9b 低频底座：沿 x 的 7 周期分量 ≥3× 邻域（无底座实测 0.65）',
  texLow && texLow.ratioX >= 3.0,
  texLow ? 'ratio=' + texLow.ratioX.toFixed(2) : '贴图缺失'));

console.log('\n草地验收：通过 ' + pass + ' 项，失败 ' + fail + ' 项' + (na ? '，无法判定 ' + na + ' 项' : ''));
console.log('');
console.log('⚠️  B8-7 人眼闸门（脚本判不了，必须人工看 100% 截图）——三条全满足才算过：');
console.log('    ① 一个 44px 格里能数出 ≥40 根可辨细叶（<20 根 = 在画石头；>120 根 = 糊成噪点）');
console.log('    ② 没有 ≥1/4 格的大块明暗「石头」');
console.log('    ③ 格盘仍能一眼数清 10×10');
console.log('    出图：node dev/board-shot.js  →  dev/_gen/board_after.png');
console.log('    （v1 教训：数值 9/10 全绿但肉眼读作鹅卵石 —— 数值是必要条件，不是充分条件）\n');
process.exit(fail === 0 ? 0 : 1);
