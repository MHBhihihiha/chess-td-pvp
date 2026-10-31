/* 临时探针2：压力局面下逐列检查「攻城兵/步兵」是否卡在进场行（判断振荡是否与中列有关） */
var C = require('../src/logic.js');

function build(team) {
  var s = C.createState({ seed: 7 });
  s.res[team] = 1e6;
  var rows = (team === 'blue') ? [6, 7, 8, 9] : [5, 4, 3, 2];
  var keepOpen = [2, 3, 8];
  for (var ri = 0; ri < rows.length; ri++) {
    for (var c = 1; c <= 10; c++) {
      if (keepOpen.indexOf(c) >= 0) continue;
      if (c === 5 || c === 6) continue;
      C.placeBuilding(s, team, (rows[ri] + c) % 3 === 0 ? 'cannon' : 'mine', rows[ri], c);
    }
  }
  return s;
}

['blue', 'red'].forEach(function (team) {
  ['infantry', 'siege'].forEach(function (key) {
    var out = [];
    for (var col = 1; col <= 10; col++) {
      var s = build(team);
      var r = C.deployUnit(s, team, key, col);
      if (!r.ok) { out.push(col + ':fail'); continue; }
      var u = r.unit, pos = '', same = 0, maxStill = 0, dist = -1;
      for (var t = 0; t < 20 * 50; t++) {
        C.update(s, C.DT);
        if (!u || u.hp <= 0) break;
        var p = 'r' + u.row + 'c' + u.col;
        if (p === pos) { same++; if (same > maxStill) maxStill = same; } else { same = 0; pos = p; }
      }
      dist = (team === 'blue') ? (10 - u.row) : (u.row - 1);   // 越大 = 推得越远
      var stag = (maxStill >= 400) && dist <= 0;
      out.push(col + ':r' + u.row + 'c' + u.col + (dist >= 3 ? '✓' : (dist <= 0 ? '✗' : '~')) + (stag ? '(滞留' + (maxStill / 20).toFixed(0) + 's)' : ''));
    }
    console.log(team + ' ' + C.DATA.units[key].name + '  → ' + out.join('  '));
  });
});
