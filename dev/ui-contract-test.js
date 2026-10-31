'use strict';
/* ============================================================================
 * UI 契约测试（本轮 UI 改造防回退）
 *   运行： node dev/ui-contract-test.js
 * 对 game/index.html 做静态断言，锁死本轮三块 UI 改动的关键契约：
 *   1. 结束/开始界面：矮屏双模态（≤900px 切 fixed 全屏）+ 基础 absolute 遮棋盘区
 *   2. 响应式恰好三档（900/760/620），不许随手加减档（660 已并入 760）
 *   3. #over 结构：双按钮区（again + tomenu）与 tomenu 事件绑定
 *   4. over 战绩表 kills 修复：双方真实击杀数，恒真 bug 模式不得回潮
 *   5. 兵种带/结果剪影贴图填充：unit_*_blue_idle.png 拼接 + onerror 兜底
 *   6. 大本营契约：drawBuildingTurret 对 base 早退，TURRET_STYLE 无 base 条目
 *   7. 开始界面海报式结构（poster/mast/dock/corner）+ 林绿 palette 关键色值
 *   8. 棋盘背景板预渲染：buildBackground 存在且 render() 里 drawImage(bgCanvas)
 *   9. 卡片贴图四函数：iconHtml / buildingIconFiles / paintBuildingIcon / retryIcons
 * 说明：src/logic.js 本轮未动，故这里只测 index.html 内的 CSS/HTML/JS 契约。
 * ========================================================================== */
var fs = require('fs');
var path = require('path');

var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
/* 与 dom-test.js 同法：取内联 <script>（无 src 属性的那段） */
var script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

var pass = 0, fail = 0, failures = [];
function item(name, cond, evidence) {
  if (cond) { pass++; console.log('  ✅ ' + name + (evidence ? '  [' + evidence + ']' : '')); }
  else { fail++; failures.push(name); console.log('  ❌ ' + name + (evidence ? '  [' + evidence + ']' : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }
/* 从「头部关键字」之后取第一个完整 {...} 块的内容（花括号配对，支持嵌套） */
function blockAfter(src, headRe) {
  var m = headRe.exec(src);
  if (!m) return null;
  var i = src.indexOf('{', m.index);
  if (i < 0) return null;
  var depth = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(i + 1, j);
}
function norm(s) { return s.replace(/\s+/g, ' ').trim(); }
/* 取两个锚点之间的 HTML 片段 */
function sliceBetween(from, to) {
  var a = html.indexOf(from), b = html.indexOf(to, a >= 0 ? a : 0);
  return (a >= 0 && b > a) ? html.slice(a, b) : '';
}

/* ========== 1. 矮屏双模态定位切换（UX 规格 §2.1） ========== */
section('1. 双模态定位：≤900px 切 fixed，基础规则 absolute 只遮棋盘区');
var media900 = blockAfter(html, /@media\s*\(max-height:\s*900px\)/);
item('@media (max-height: 900px) 档存在', media900 !== null);
item('900px 档内含 #start, #over { position: fixed; }（矮屏全屏接管）',
  media900 !== null && norm(media900).indexOf('#start, #over { position: fixed; }') >= 0,
  media900 ? norm(media900) : '档位缺失');

var baseOver = blockAfter(html, /#over\s*\{/);
var baseStart = blockAfter(html, /#start\s*\{/);
item('基础规则 #over 为 position:absolute; inset:0; z-index:30',
  baseOver !== null && norm(baseOver).indexOf('position: absolute; inset: 0; z-index: 30') >= 0,
  baseOver ? norm(baseOver).slice(0, 80) : '规则缺失');
item('基础规则 #start 为 position:absolute; inset:0; z-index:30',
  baseStart !== null && norm(baseStart).indexOf('position: absolute; inset: 0; z-index: 30') >= 0,
  baseStart ? norm(baseStart).slice(0, 80) : '规则缺失');

/* ========== 2. 响应式恰好四档 ========== */
section('2. 响应式 @media 恰好 3 档（900 / 760 / 620）');
var mediaHeads = html.match(/@media\s*\([^)]*\)/g) || [];
var maxHeads = mediaHeads.filter(function (h) { return /max-(height|width)/.test(h); });
/* v15 起档位从 4 减到 3，两处都是**合并**而不是新增：
 *   · 660（原来只放「收起兵种展示带」）并进 760 —— 760 高度下那一排本来就被裁；
 *   · 图鉴详情在窄屏改单列，复用了已有的 620 宽度档，没有再新开断点。
 * 仍然锁死「档位集合」，防止后续随手加档。 */
item('响应式（max-height/max-width）档位数 = 3', maxHeads.length === 3,
  '实际 ' + maxHeads.length + ' 档：' + maxHeads.join(' | '));
['max-height: 900px', 'max-height: 760px', 'max-width: 620px'].forEach(function (want) {
  var n = mediaHeads.filter(function (h) { return norm(h).indexOf('(' + want + ')') >= 0; }).length;
  item('存在且唯一：@media (' + want + ')', n === 1, '出现 ' + n + ' 次');
});
item('无多余响应式档（prefers-reduced-motion 无障碍档不计入）',
  mediaHeads.length === 4 && /prefers-reduced-motion/.test(mediaHeads.join('')),
  '共 ' + mediaHeads.length + ' 个 @media');

/* ========== 3. #over 双按钮区 + tomenu 绑定 ========== */
section('3. 结束界面 #over：双按钮区（again + tomenu）与事件绑定');
var overHtml = sliceBetween('<div id="over">', '<div id="start">');
item('#over 区块存在', overHtml.length > 0);
item('#over 含按钮区 .acts', overHtml.indexOf('class="acts"') >= 0);
var iActs = overHtml.indexOf('class="acts"'), iAgain = overHtml.indexOf('id="again"'), iTomenu = overHtml.indexOf('id="tomenu"');
item('#over 含 again 与 tomenu 两个按钮', iAgain >= 0 && iTomenu >= 0);
item('按钮顺序：acts 区 → again（主）→ tomenu（次）', iActs >= 0 && iActs < iAgain && iAgain < iTomenu,
  'acts@' + iActs + ' again@' + iAgain + ' tomenu@' + iTomenu);
item('tomenu 按钮文案为「返回主菜单」', /id="tomenu"[^>]*>返回主菜单</.test(overHtml));
item('JS 中 tomenu 有点击绑定（getElementById(\'tomenu\')）',
  /getElementById\(['"]tomenu['"]\)/.test(script));

/* ========== 4. over 战绩表 kills 修复 ========== */
section('4. 战绩表 kills 修复：双方真实击杀数，恒真 bug 不回潮');
item('填充逻辑含 state.stats[ME].kills', script.indexOf('state.stats[ME].kills') >= 0);
item('填充逻辑含 state.stats[FOE].kills', script.indexOf('state.stats[FOE].kills') >= 0);
/* 恒真 bug：produced ? '—' : '—'（两个分支一样，永远显示 '—'）。
 * 允许在注释里留档说明，但不允许出现在可执行代码行。 */
var BUG_RE = /produced\s*\?\s*'—'\s*:\s*'—'/;
var bugLines = script.split('\n').filter(function (l) { return BUG_RE.test(l); });
var codeBug = bugLines.filter(function (l) { return !/^\s*(\/\/|\*|\/\*)/.test(l); });
item('恒真 bug 模式 produced ? \'—\' : \'—\' 不在可执行代码中',
  codeBug.length === 0,
  codeBug.length ? '代码行残留: ' + codeBug[0].trim() : (bugLines.length ? '仅注释留档 ' + bugLines.length + ' 处' : '0 处'));

/* ========== 5. 兵种带贴图填充 + onerror 兜底 ========== */
section('5. 兵种带/结果剪影：unit_*_blue_idle.png 拼接 + onerror 兜底');
var unitConcat = /art\/v9\/unit_' \+ key \+ '_blue_idle\.png/;
var mUnit = unitConcat.exec(script);
item('兵种贴图拼接存在（art/v9/unit_ + key + _blue_idle.png）', mUnit !== null,
  mUnit ? mUnit[0] : '未找到拼接逻辑');
if (mUnit) {
  var tail = script.slice(mUnit.index, mUnit.index + 220);
  item('拼接处带 onerror 兜底（加载失败移除 img，回落汉字 glyph）', /onerror=/.test(tail),
    (tail.match(/onerror="[^"]*"/) || ['无'])[0]);
}
/* v16：底部的「兵种展示带」已经删掉 —— 海报本身就把步兵/重甲/弓箭手/飞龙/飞艇画在主角周围了，
 * 再摆一排小图标属于重复信息（也违反「不要密密麻麻的信息面板」）。
 * 这里改成反向断言：**不许**再长回来。 */
item('兵种展示带已退役（JS 里不再引用 #roster）',
  !/getElementById\(['"]roster['"]\)/.test(script));

/* ========== 6. 大本营契约：不画矢量炮管 ========== */
section('6. 大本营契约：装置贴图化，矢量炮管早退');
var turretFn = blockAfter(script, /function drawBuildingTurret\s*\(/);
item('drawBuildingTurret 函数存在', turretFn !== null);
item('drawBuildingTurret 内含 if (b.def.isBase) return; 早退（不再画矢量炮管）',
  turretFn !== null && norm(turretFn).indexOf('if (b.def.isBase) return;') >= 0);
var styleBlock = blockAfter(script, /var TURRET_STYLE\s*=\s*\{/);
item('TURRET_STYLE 存在', styleBlock !== null);
item('TURRET_STYLE 无 base 条目（大本营不再有矢量炮管样式）',
  styleBlock !== null && !/(^|[\s,{])base\s*:/.test(styleBlock),
  styleBlock ? '条目: ' + (styleBlock.match(/\w+:\s*\{/g) || []).join(' ') : '缺失');

/* ========== 7. 开始界面结构 + 林绿 palette ========== */
section('7. 开始界面 #start：海报式结构（v16）+ 林绿 palette');
var startHtml = sliceBetween('<div id="start">', '<div id="panel">');
item('#start 区块存在', startHtml.length > 0);
/* v16 改版：从「卡片堆」改成「海报 + 三组漂浮文字」。
 * 这里锁的是**新**结构，并且反向锁死旧的卡片元素不许回潮
 * （玩家明确要求：不要厚重生硬的绿色方框、不要密密麻麻的信息面板）。 */
['poster', 'mast', 'title', 'tag', 'dock', 'cta', 'diffs'].forEach(function (c) {
  item('#start 含 class="' + c + '"', startHtml.indexOf('class="' + c + '"') >= 0);
});
item('#start 含底部两角（.corner-l 难度 / .corner-r 图鉴）',
  startHtml.indexOf('corner corner-l') >= 0 && startHtml.indexOf('corner corner-r') >= 0);
item('海报底图已接入（art/v9/start_poster.jpg 出现在 CSS 里）',
  html.indexOf('start_poster.jpg') >= 0);
item('旧的信息面板元素不再回潮（.rules / .roster / .slabel 都不该出现）',
  startHtml.indexOf('class="rules"') < 0 && startHtml.indexOf('class="roster"') < 0 &&
  startHtml.indexOf('class="slabel"') < 0,
  'rules@' + startHtml.indexOf('class="rules"') + ' roster@' + startHtml.indexOf('class="roster"'));
item('开始按钮与图鉴入口仍在（#startbtn / #codexopen）',
  startHtml.indexOf('id="startbtn"') >= 0 && startHtml.indexOf('id="codexopen"') >= 0);
item('林绿主色出现（#6fb855 或 #4d8b3c 至少一个）',
  html.indexOf('#6fb855') >= 0 || html.indexOf('#4d8b3c') >= 0,
  '#6fb855@' + html.indexOf('#6fb855') + ' #4d8b3c@' + html.indexOf('#4d8b3c'));
item('林绿亮色 #8fe06a 出现', html.indexOf('#8fe06a') >= 0, '出现 ' + (html.match(/#8fe06a/g) || []).length + ' 次');

/* ========== 8. 背景板预渲染 ========== */
section('8. 棋盘背景板预渲染：buildBackground + render() 内 drawImage');
item('buildBackground 函数存在', /function buildBackground\s*\(/.test(script));
var renderFn = blockAfter(script, /function render\s*\(\s*\)/);
item('render() 函数存在', renderFn !== null);
item('render() 内调用 buildBackground()',
  renderFn !== null && /buildBackground\(\);/.test(renderFn));
item('render() 内 drawImage(bgCanvas, …) 贴上背景板',
  renderFn !== null && /drawImage\(bgCanvas/.test(renderFn));

/* ========== 9. 卡片贴图四函数 ========== */
section('9. 放置栏卡片贴图：四函数齐全');
[['iconHtml', '卡片 HTML 拼装（img 渐进增强）'],
 ['buildingIconFiles', '建筑图标文件解析'],
 ['paintBuildingIcon', '建筑图标画布绘制'],
 ['retryIcons', '贴图迟到补画']].forEach(function (p) {
  item('function ' + p[0] + ' 存在（' + p[1] + '）',
    new RegExp('function ' + p[0] + '\\s*\\(').test(script));
});

/* ========== 10. 单位图鉴（Codex）入口 + 覆盖层 + 数据契约（T6-IMPL-CODEX） ========== */
section('10. 单位图鉴 Codex：入口 / 覆盖层 / 函数 / 数据契约');
item('#codex 覆盖层元素存在（id="codex"）', html.indexOf('id="codex"') >= 0,
  'id="codex"@' + html.indexOf('id="codex"'));
item('#codexopen 入口按钮存在（id="codexopen"）', html.indexOf('id="codexopen"') >= 0,
  'id="codexopen"@' + html.indexOf('id="codexopen"'));
item('openCodex 函数存在（图鉴打开逻辑）', /function openCodex\s*\(/.test(script));
item('closeCodex 函数存在（图鉴关闭逻辑）', /function closeCodex\s*\(/.test(script));

/* BUILD_ORDER 含 7 项（mine / cannon / arrow / mage / mortar / tesla / ward） */
var bm = script.match(/var BUILD_ORDER\s*=\s*\[([^\]]*)\]/);
var bcount = bm ? (bm[1].match(/'[^']+'/g) || []).length : -1;
item('BUILD_ORDER 含 7 项建筑', bcount === 7, '实际 ' + bcount + ' 项');

/* 三 Tab 结构含「大本营 / 建筑 / 兵种」文案（限定在 class="cx-tab" 按钮内，避免与别处文案误判） */
function tabHas(label) {
  return new RegExp('<button[^>]*class="cx-tab[^"]*"[^>]*>\\s*' + label).test(html);
}
item('三 Tab 结构含「大本营」文案', tabHas('大本营'));
item('三 Tab 结构含「建筑」文案', tabHas('建筑'));
item('三 Tab 结构含「兵种」文案', tabHas('兵种'));

/* ========== 11. 总体升级卡片图标贴图化（T7-IMPL-GLOBALICONS） ========== */
section('11. 总体升级卡片：up_<key>.png 图标槽（T7-IMPL-GLOBALICONS）');
var gcardsFn = blockAfter(script, /function buildGlobalCards\s*\(/);
var gcfg = gcardsFn || '';
item('buildGlobalCards 用 up_<key>.png 拼接图标（art/v9/up_ + g.key + .png）',
  /art\/v9\/up_'\s*\+\s*g\.key\s*\+\s*'\.png/.test(gcfg),
  (gcfg.match(/art\/v9\/up_[^"']*/) || ['未找到'])[0]);
item('buildGlobalCards 内 gcards 卡使用 .ic 图标槽（innerHTML 含 class="ic"）',
  /class="ic"/.test(gcfg));

/* ========== 12. 放置面板折叠（T8-ENG-PANEL） ========== */
section('12. 放置面板折叠：按钮 / .collapsed 规则 / localStorage 持久化 / canvas 重算');
item('#paneltoggle 折叠按钮存在（id="paneltoggle"）',
  html.indexOf('id="paneltoggle"') >= 0,
  'id="paneltoggle"@' + html.indexOf('id="paneltoggle"'));
item('#paneltoggle 在 .tabs 标签栏内、紧跟 #autodeploy 之后',
  /id="autodeploy"[\s\S]{0,500}?id="paneltoggle"/.test(html),
  'autodeploy@' + html.indexOf('id="autodeploy"') + ' paneltoggle@' + html.indexOf('id="paneltoggle"'));
item('折叠按钮带 aria-expanded 与 aria-controls="paneBuild paneGlobal"（可访问性）',
  /aria-expanded="true"/.test(html) && /aria-controls="paneBuild paneGlobal"/.test(html));
item('CSS 存在 .collapsed 折叠规则：#panel.collapsed #paneBuild / #paneGlobal',
  /#panel\.collapsed\s+#paneBuild/.test(html) && /#panel\.collapsed\s+#paneGlobal/.test(html));
item('折叠状态持久化 key td_panel_collapsed 存在（localStorage）',
  /['"]td_panel_collapsed['"]/.test(script),
  (script.match(/td_panel_collapsed/g) || []).length + ' 处引用');
var refitFn = blockAfter(script, /function refitBoard\s*\(/);
item('折叠/展开后触发 canvas 重算（refitBoard 内 if (state) render();）',
  refitFn !== null && norm(refitFn).indexOf('if (state) render();') >= 0);
item('折叠态下点 tab 自动展开（autoExpandPanel + tab 绑定）',
  /function autoExpandPanel\s*\(/.test(script) &&
  /tabBuild\.onclick = function \(\) \{ autoExpandPanel\(\);/.test(script) &&
  /tabGlobal\.onclick = function \(\) \{ autoExpandPanel\(\);/.test(script));

/* ========== 13. 草地分层 L0–L8 + 图标尺寸（T5-GRASS，美术规范 docs/art/icons-and-grass.md） ========== */
section('13. 草地质感 L0–L8 / 贴图时序 / 总体升级图标尺寸');
var bgFn = blockAfter(script, /function buildBackground\s*\(/);
var bgSrc = bgFn || '';
item('buildBackground 内出现 L0–L8 全部层标记',
  /* L3/L4 共用一个注释头（同一张图两种混合），所以 L4 认「===== L3 / L4」 */
  ['0', '1', '2', '3', '4', '5', '6', '7', '8'].every(function (d) {
    return bgSrc.indexOf('===== L' + d) >= 0 || (d === '4' && /===== L3 \/ L4/.test(bgSrc));
  }),
  '层标记：' + (bgSrc.match(/=====\s+L\d(\s*\/\s*L\d)?/g) || []).join(' | '));
item('L8 雕刻格线在层序列末尾（可读性保险，必须最后画）',
  bgSrc.indexOf('===== L8') > bgSrc.indexOf('===== L7') && bgSrc.indexOf('===== L8') > bgSrc.indexOf('===== L6'),
  'L6@' + bgSrc.indexOf('===== L6') + ' L7@' + bgSrc.indexOf('===== L7') + ' L8@' + bgSrc.indexOf('===== L8'));
item('软斑带平台段色标（v2 口径 0→0.45；只做纯径向衰减时肉眼看不见，实测等于没画）',
  /addColorStop\(0\.45,\s*hex\)/.test(bgSrc) && /addColorStop\(0,\s*hex\)/.test(bgSrc));
item('L2 软斑是「拉长 + 逐斑旋转」的椭圆（圆斑在 44px 格里会读成卵石）',
  /bry\s*=\s*brx\s*\*/.test(bgSrc) && /g\.rotate\(ang\)/.test(bgSrc) && /softBlob\([\s\S]{0,200}?,\s*bang\)/.test(bgSrc));
item('色板是 v2 的 #60A246 / #4C8850（v1 的 #6EA94D/#4C7F4E 把棋盘台阶翻倍成铺装砖）',
  /'#60A246'/.test(bgSrc) && /'#4C8850'/.test(bgSrc) && !/'#6EA94D'/.test(bgSrc) && !/'#4C7F4E'/.test(bgSrc));
item('L3/L4 用 tex_grass.png 且带「贴图没到就延迟重建」的 pending 机制',
  /GRASS_TEX\s*=\s*'tex_grass\.png'/.test(script) && /bgTexPending\s*=\s*true/.test(bgSrc) && /function syncGrassTexture/.test(script));
item('buildBackground 内出现 overlay 与 soft-light 两种混合模式（L3 / L4+L7）',
  /globalCompositeOperation\s*=\s*'overlay'/.test(bgSrc) && /globalCompositeOperation\s*=\s*'soft-light'/.test(bgSrc),
  'overlay×' + (bgSrc.match(/'overlay'/g) || []).length + ' soft-light×' + (bgSrc.match(/'soft-light'/g) || []).length);
item('tex_grass.png 已被资产索引收录（art/v9/assets.js）',
  /tex_grass\.png/.test(fs.readFileSync(path.join(__dirname, '..', 'art', 'v9', 'assets.js'), 'utf8'))
  && fs.existsSync(path.join(__dirname, '..', 'art', 'v9', 'tex_grass.png')));
item('草叶用二次贝塞尔（quadraticCurveTo），不是直线短划（直线=胡茬感）',
  /quadraticCurveTo/.test(bgSrc) && bgSrc.indexOf('quadraticCurveTo') > bgSrc.indexOf('L5 '));
item('render() 内不出现草地绘制（草地只许在 buildBackground 里跑）',
  renderFn !== null && !/softBlob|makeNoiseTile|quadraticCurveTo/.test(renderFn));
/* 图标：.gcards 作用域 58px + drop-shadow + image-rendering 不得变 pixelated */
var gcss = (html.match(/\.gcards \.card \.ic[^}]*\}/g) || []).join(' ');
item('.gcards 图标槽放大到 58px（卡宽 84px，46px 时左右各空 19px）',
  /height:\s*58px/.test(gcss) && /width:\s*58px/.test(gcss) && /height:\s*58px/.test(gcss), norm(gcss).slice(0, 90));
item('.gcards 图标用 CSS drop-shadow（投影不烘进贴图）',
  /drop-shadow\(0 2px 2px rgba\(0,0,0,\.45\)\)/.test(html));
item('未把 image-rendering 改成 pixelated（8~11× 缩小必须让浏览器插值）',
  !/image-rendering:\s*pixelated/.test(html));

console.log('\n===============================================');
console.log('UI 契约测试：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail) console.log('失败项：\n  - ' + failures.join('\n  - '));
console.log('===============================================');
process.exit(fail === 0 ? 0 : 1);
