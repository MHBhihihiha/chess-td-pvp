/* 临时探针：中列（5/6）出兵的推进轨迹，验证「绕过大本营能否正常推进」。
 * 用法: node dev/_probe_center.js
 * 不改任何游戏规则，只观察。
 */
var C = require('../src/logic.js');

function trace(team, key, col, secs, seed) {
  var s = C.createState({ seed: seed || 1 });
  s.res[team] = 1e6;
  var r = C.deployUnit(s, team, key, col);
  if (!r.ok) return { err: r.why };
  var u = r.unit;
  var path = ['r' + u.row + 'c' + u.col];
  var rowHist = [], lastRow = u.row, sameRowFrames = 0, maxStill = 0, inGridFrames = 0;
  var entryCols = {}, stayRows = {};
  for (var t = 0; t < 20 * secs; t++) {
    C.update(s, C.DT);
    if (!u || u.hp <= 0) break;
    var p = 'r' + u.row + 'c' + u.col;
    if (path[path.length - 1] !== p) path.push(p);
    if (u.row === lastRow) sameRowFrames++; else { sameRowFrames = 0; lastRow = u.row; }
    if (sameRowFrames > maxStill) maxStill = sameRowFrames;
    if (u.row >= 1 && u.row <= C.ROWS) { inGridFrames++; entryCols[u.col] = (entryCols[u.col] || 0) + 1; stayRows[u.row] = (stayRows[u.row] || 0) + 1; }
  }
  return { u: u, path: path, maxStill: maxStill, inGridFrames: inGridFrames, entryCols: entryCols, stayRows: stayRows, s: s };
}

console.log('=== 中列 5/6 出兵的推进轨迹（单位仍在 = 没卡死；row 越小越接近红方大本营）===');
[['blue', 'infantry', 5], ['blue', 'infantry', 6], ['blue', 'siege', 5], ['blue', 'archer', 6],
 ['blue', 'balloon', 5], ['blue', 'dragon', 6], ['blue', 'airship', 5],
 ['red', 'infantry', 5], ['red', 'infantry', 6], ['red', 'balloon', 5]].forEach(function (t) {
  var res = trace(t[0], t[1], t[2], 40);
  if (res.err) { console.log(t.join(' ') + ' → 派兵失败: ' + res.err); return; }
  var u = res.u;
  var cols = Object.keys(res.entryCols).map(function (c) { return c + ':' + res.entryCols[c]; }).join(' ');
  console.log(t[0] + ' ' + C.DATA.units[t[1]].name + ' 列' + t[2] +
    ' → 终态 r' + u.row + 'c' + u.col + (u.hp <= 0 ? '(已阵亡)' : '(存活 hp' + Math.round(u.hp) + ')') +
    ' | 半场内帧数 ' + res.inGridFrames + ' | 长时间同一行最长 ' + res.maxStill + ' 帧' +
    ' | 列分布 ' + cols);
  console.log('    路径: ' + res.path.slice(0, 26).join(' → ') + (res.path.length > 26 ? ' …共' + res.path.length + '格' : ''));
});
