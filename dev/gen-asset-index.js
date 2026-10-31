/* eslint-disable */
/* =============================================================================
 * 生成 art/v9/assets.js —— 浏览器端资源清单
 *
 * 为什么需要这一步：
 *   浏览器不能读取目录，index.html 必须拿到一份"有哪些文件"的静态清单。
 *   手写清单一定会和 art/ 目录脱节，所以每次产出新素材后重跑本脚本。
 *
 * 用法：node dev/gen-asset-index.js
 * 输出：art/v9/assets.js  （window.ARTV9FILES / window.ARTV9DECO / window.ARTV9DECO_ANCHOR）
 *
 * ★ v18：扫描范围从「只看 .png」放宽到 png/jpg/jpeg ★
 *   开始界面的海报是 art/v9/start_poster.jpg，改成 jpg 之后就一直没进清单
 *   （代码里目前靠 CSS 直接引用 + <link rel=preload>，功能没坏，但清单是残的：
 *    任何"按清单预载/校验资产"的逻辑都会漏掉它）。现在一并纳入。
 * ========================================================================== */
'use strict';
var fs = require('fs');
var path = require('path');

var ART = path.join(__dirname, '..', 'art', 'v9');
var plan = JSON.parse(fs.readFileSync(path.join(ART, 'deco-plan.json'), 'utf8'));

var files = fs.readdirSync(ART)
  .filter(function (f) { return /\.(png|jpe?g)$/i.test(f) && f[0] !== '_'; })
  .sort();

// 等级 → 装饰件列表（把 {team} 占位保留，运行时替换）
var deco = {};
plan.levels.forEach(function (l) { deco[l.level] = l.deco; });

var anchors = plan.anchors;

var out =
  '/* 自动生成，请勿手改。重新生成：node dev/gen-asset-index.js */\n' +
  'window.ARTV9FILES = ' + JSON.stringify(files) + ';\n' +
  'window.ARTV9DECO = ' + JSON.stringify(deco) + ';\n' +
  'window.ARTV9DECO_ANCHOR = ' + JSON.stringify(anchors) + ';\n' +
  'window.ARTV9DECO_STATE = ' + JSON.stringify(plan.state_overlays || []) + ';\n' +
  'window.ARTV9DECO_TEAM = ' + JSON.stringify(plan.team_overrides || []) + ';\n';

fs.writeFileSync(path.join(ART, 'assets.js'), out, 'utf8');
console.log('assets.js 已生成：' + files.length + ' 个文件（png + jpg 全量）');
['cannon', 'arrow', 'mage', 'mortar', 'tesla', 'ward', 'base_', 'mine_', 'unit_', 'spell_', 'dc_']
  .forEach(function (p) {
    var n = files.filter(function (f) { return f.indexOf(p) === 0; }).length;
    console.log('  ' + p.padEnd(8) + n);
  });
var other = files.filter(function (f) {
  return !/^(cannon|arrow|mage|mortar|tesla|ward|base_|mine_|unit_|spell_|dc_)/.test(f);
});
if (other.length) console.log('  其它    ' + other.length + ' （' + other.join(', ') + '）');
